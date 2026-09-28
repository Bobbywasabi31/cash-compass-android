/* Cash calculations use integer cents. No network or model calls. */
(function (root) {
  'use strict';
  const MAX = 1000000000;
  const cents = n => Math.round(Number(n) * 100);
  const dollars = n => n / 100;
  function number(value, min = 0, max = MAX) {
    if (value === '' || value === null || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) throw Error('Enter a valid number between ' + min + ' and ' + max + '.');
    return dollars(cents(value));
  }
  function localDate(date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function dayNumber(value) {
    if (!validDate(value)) throw Error('Enter a valid calendar date.');
    return Math.floor(Date.parse(value + 'T12:00:00Z') / 86400000);
  }
  const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
  function addDays(date, n) { return new Date((dayNumber(date) + n) * 86400000).toISOString().slice(0, 10); }
  function label(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw Error('Enter a name of 1–80 characters.');
    return value.trim();
  }
  function blank() {
    return { version: 4, demo: false, profile: { name: 'there', balance: 0, hourlyRate: 0, taxRate: 0, buffer: 0, taxHeld: 0 }, incomes: [], bills: [], goals: [], transactions: [], budgets: [], accounts: [], reminders: false };
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('This is not a Cash Compass backup.');
    const p = raw.profile || { name: raw.name, balance: raw.balance, hourlyRate: raw.rate, taxRate: raw.tax };
    const result = blank();
    result.demo = raw.demo === true; result.reminders=raw.reminders===true;
    result.profile = { name: label(p.name), balance: number(p.balance, -MAX), hourlyRate: number(p.hourlyRate), taxRate: number(p.taxRate, 0, 100), buffer: number(p.buffer || 0), taxHeld: number(p.taxHeld || 0) };
    ['incomes', 'bills', 'goals'].forEach(kind => {
      if (!Array.isArray(raw[kind]) || raw[kind].length > 10000) throw Error('Invalid ' + kind + ' list.');
      result[kind] = raw[kind].map((item, index) => {
        if (!item || typeof item !== 'object') throw Error('Invalid plan item.');
        // Rebuild IDs when importing; never interpolate untrusted identifiers into HTML.
        const out = { id: kind + '-' + index, label: label(item.label) };
        if (kind === 'goals') {
          out.deadline=item.deadline||'';if(out.deadline&&!validDate(out.deadline))throw Error('Invalid goal deadline.');
          out.contributions=list(item.contributions).map((c,i)=>{if(!validDate(c.date))throw Error('Invalid contribution date.');return {id:'contribution-'+i,date:c.date,amount:number(c.amount,-MAX),note:label(c.note||'Contribution')};});
          out.target = number(item.target, 0.01); out.saved = number(item.saved); out.monthly = number(item.monthly || 0);
        } else {
          if (!validDate(item.date)) throw Error('A plan item has an invalid date.');
          out.accountId=item.accountId||'cash';
          out.repeat = repeat(item.repeat);
          out.anchorDay = Number.isInteger(item.anchorDay) && item.anchorDay >= 1 && item.anchorDay <= 31 ? item.anchorDay : Number(item.date.slice(8));
          out.category = label(item.category || (kind === 'bills' ? 'Other' : 'Income'));
          out.date = item.date; out.amount = number(item.amount, 0.01); out.gross = kind === 'incomes' && item.gross === true;
        }
        return out;
      });
    });
    result.transactions = list(raw.transactions).map((x,i) => transaction({...x, id: 'transactions-' + i}));
    result.budgets = list(raw.budgets).map((x,i) => budget({...x, id: 'budgets-' + i}));
    if (new Set(result.budgets.map(x => x.category.toLowerCase())).size !== result.budgets.length) throw Error('Budget categories must be unique.');
    result.accounts=raw.accounts && raw.accounts.length ? list(raw.accounts).map(account) : [{id:'cash',label:'Cash',type:'cash',balance:result.profile.balance}];
    if(new Set(result.accounts.map(a=>a.id)).size!==result.accounts.length || new Set(result.accounts.map(a=>a.label.toLowerCase())).size!==result.accounts.length)throw Error('Account identifiers and names must be unique.');
    result.transactions.forEach(t=>{if(!t.accountId)t.accountId=result.accounts[0].id;accountById(result,t.accountId);if(t.type==='transfer'){accountById(result,t.toAccountId);if(t.accountId===t.toAccountId)throw Error('Invalid transfer accounts.');}});
    result.bills.concat(result.incomes).forEach(x=>accountById(result,x.accountId));syncBalance(result);
    return result;
  }
  function demo(today = localDate()) {
    const s = blank(); s.demo = true;
    s.profile = { name: 'Jordan', balance: 1500, hourlyRate: 28, taxRate: 18, buffer: 100, taxHeld: 0 };
    s.incomes = [{ id: 'pay', label: 'Shift pay (after payroll tax)', amount: 1176, date: addDays(today, 7), gross: false }];
    s.bills = [{ id: 'phone', label: 'Phone', amount: 58, date: addDays(today, 2) }, { id: 'rent', label: 'Rent', amount: 1150, date: addDays(today, 11) }];
    s.goals = [{ id: 'cushion', label: 'Emergency cushion', target: 1200, saved: 435, monthly: 60 }];
    return s;
  }
  function netCents(item, profile) { return cents(item.amount) - (item.gross ? Math.round(cents(item.amount) * profile.taxRate / 100) : 0); }
  function reservesCents(state) {
    return cents(state.profile.buffer) + cents(state.profile.taxHeld) + state.goals.reduce((total, g) => total + cents(g.saved) + Math.min(cents(g.monthly), Math.max(0, cents(g.target) - cents(g.saved))), 0);
  }
  function forecast(state, today = localDate(), fewerHours = 0) {
    number(fewerHours, 0, 1000);
    const end = addDays(today, 30);
    // Include each schedule's next income even when it falls beyond the 30-day timeline.
    const expandedIncomes = expand(state.incomes, end, today);
    const incomes = expandedIncomes.filter(x => x.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const next = incomes[0] || null;
    const horizon = next && next.date > end ? next.date : end;
    state = {...state, incomes: expandedIncomes, bills: expand(state.bills, horizon)};
    const before = state.bills.filter(x => !next || x.date <= next.date);
    const held = before.reduce((sum, x) => sum + cents(x.amount), 0);
    const reserved = reservesCents(state);
    const available = cents(state.profile.balance) - reserved - held;
    const lossEstimate = Math.round(fewerHours * cents(state.profile.hourlyRate) * (1 - state.profile.taxRate / 100));
    const loss = next ? Math.min(netCents(next, state.profile), lossEstimate) : 0;
    const events = state.bills.filter(x => x.date <= end).map(x => ({ ...x, kind: 'bills', effective: x.date < today ? today : x.date }))
      .concat(incomes.filter(x => x.date <= end).map(x => ({ ...x, kind: 'incomes', effective: x.date })));
    // Bills precede income on the same date; deposit time is unknown.
    events.sort((a, b) => a.effective.localeCompare(b.effective) || (a.kind === b.kind ? 0 : a.kind === 'bills' ? -1 : 1));
    let running = cents(state.profile.balance) - reserved;
    let low = running, endBalance = running;
    const timeline = events.map(event => {
      running += event.kind === 'incomes' ? netCents(event, state.profile) - (next && event.id === next.id ? loss : 0) : -cents(event.amount);
      low = Math.min(low, running); endBalance = running;
      return { ...event, available: dollars(running) };
    });
    return { next, before, held: dollars(held), reserved: dollars(reserved), safe: next ? dollars(Math.max(0, available)) : null,
      shortfall: dollars(Math.max(0, -available)), days: next ? Math.max(1, daysBetween(today, next.date)) : null,
      overdue: state.bills.filter(x => x.date < today), lateIncome: state.incomes.filter(x => x.date < today),
      loss: dollars(loss), lossEstimate: dollars(lossEstimate), low: dollars(low), endBalance: dollars(endBalance), timeline, end };
  }
  const frequencies = ['none', 'weekly', 'biweekly', 'monthly', 'yearly'];
  function repeat(value) {
    value = value || 'none';
    if (!frequencies.includes(value)) throw Error('Choose a supported repeat schedule.');
    return value;
  }
  function list(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 10000) throw Error('Invalid or oversized list.');
    return value;
  }
  function nextDate(item) {
    const r = repeat(item.repeat);
    if (r === 'none') return null;
    if (r === 'weekly' || r === 'biweekly') return addDays(item.date, r === 'weekly' ? 7 : 14);
    const [y,m,d] = item.date.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1 + (r === 'monthly' ? 1 : 12), 1));
    const last = new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
    base.setUTCDate(Math.min(item.anchorDay || d,last));
    const out = base.toISOString().slice(0,10);
    if (!validDate(out)) throw Error('Schedule exceeds supported dates.');
    return out;
  }
  function expand(items, end, includeNextFrom = null) {
    const result = [];
    items.forEach(item => {
      let current = {...item, anchorDay: item.anchorDay || Number(item.date.slice(8))};
      result.push(current);
      let date = nextDate(current), count = 0;
      while (date && (date <= end || (includeNextFrom && current.date < includeNextFrom))) {
        if (++count > 10000 || result.length > 20000) throw Error('Schedule is too long. Update its next unpaid date.');
        current = {...current, id: item.id + '@' + date, date, projected: true};
        result.push(current); date = nextDate(current);
      }
    });
    return result;
  }
  function transaction(x) {
    if (!x || !['expense','income','transfer'].includes(x.type) || !validDate(x.date)) throw Error('Enter a valid transaction type and date.');
    const amount = number(x.amount, 0.01);
    const delta = x.delta === undefined ? (x.adjust === false ? 0 : (x.type === 'income' ? amount : -amount)) : number(x.delta, -MAX);
    if (delta !== 0 && cents(delta) !== cents(x.type === 'income' ? amount : -amount)) throw Error('Invalid cash adjustment.');
    const taxDelta = number(x.taxDelta || 0);
    if (taxDelta > amount || (taxDelta && (x.type !== 'income' || !delta))) throw Error('Invalid tax reserve adjustment.');
    return {id:x.id, accountId:x.accountId||'', toAccountId:x.type==='transfer' ? x.toAccountId||'' : '', label:label(x.label), amount, date:x.date, type:x.type, category:label(x.category || (x.type === 'income' ? 'Income' : 'Other')), delta, taxDelta};
  }
  function saveTransaction(state, input) {
    const t = transaction(input);
    const old = state.transactions.find(x => x.id === t.id);
    t.accountId=accountById(state,t.accountId).id;
    applyLedger(state,old,t);
    if (old) state.transactions[state.transactions.indexOf(old)] = t; else state.transactions.push(t);
    return state;
  }
  function removeTransaction(state, id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) throw Error('Transaction not found.');
    applyLedger(state,t,null);
    state.transactions = state.transactions.filter(x => x.id !== id);
  }
  function settle(state, kind, id, adjustBalance = true, today = localDate()) {
    if (kind !== 'incomes' && kind !== 'bills') throw Error('Invalid entry type.');
    const index = state[kind].findIndex(x => x.id === id);
    if (index < 0) throw Error('That entry no longer exists.');
    const item = state[kind][index];
    const date = nextDate(item);
    state.transactions = state.transactions || [];
    saveTransaction(state, {id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2), label:item.label || 'Payment', amount:item.amount, date:today, type:kind === 'bills' ? 'expense' : 'income', category:item.category, accountId:item.accountId, adjust:adjustBalance,
      taxDelta: adjustBalance && kind === 'incomes' && item.gross ? dollars(cents(item.amount) - netCents(item,state.profile)) : 0});
    if (date) state[kind][index] = {...item, date, anchorDay:item.anchorDay || Number(item.date.slice(8))};
    else state[kind].splice(index,1);
    return state;
  }
  function budget(x) {
    if (!x || !['fixed','flexible','occasional'].includes(x.bucket) || !validDate(x.start + '-01')) throw Error('Choose a valid budget bucket and start month.');
    return {id:x.id, category:label(x.category), amount:number(x.amount), bucket:x.bucket, start:x.start, rollover:x.rollover === true};
  }
  function budgetSummary(state, month = localDate().slice(0,7)) {
    if (!validDate(month + '-01')) throw Error('Choose a valid month.');
    const expenses = (state.transactions || []).filter(t => t.type === 'expense');
    const rows = (state.budgets || []).filter(b => b.start <= month).map(b => {
      const matches = expenses.filter(t => t.category.toLowerCase() === b.category.toLowerCase());
      const spent = matches.filter(t => t.date.slice(0,7) === month).reduce((a,t) => a+cents(t.amount),0);
      const months = (Number(month.slice(0,4))-Number(b.start.slice(0,4)))*12 + Number(month.slice(5))-Number(b.start.slice(5));
      const prior = matches.filter(t => t.date.slice(0,7) >= b.start && t.date.slice(0,7) < month).reduce((a,t) => a+cents(t.amount),0);
      const carry = b.rollover ? months*cents(b.amount)-prior : 0;
      return {...b, spent:dollars(spent), carry:dollars(carry), available:dollars(cents(b.amount)+carry), remaining:dollars(cents(b.amount)+carry-spent)};
    });
    const unbudgeted = expenses.filter(t => t.date.slice(0,7) === month && !rows.some(b => b.category.toLowerCase() === t.category.toLowerCase())).reduce((a,t) => a+cents(t.amount),0);
    return {rows, unbudgeted:dollars(unbudgeted)};
  }

  function ensureAccounts(state) {
    if (!state.accounts || !state.accounts.length) state.accounts = [{id:'cash',label:'Cash',type:'cash',balance:state.profile.balance}];
    return state.accounts;
  }
  function account(x) {
    if (!x || !/^[a-zA-Z0-9_-]{1,100}$/.test(x.id) || !['cash','checking','savings','credit'].includes(x.type)) throw Error('Choose a valid account type.');
    return {id:x.id,label:label(x.label),type:x.type,balance:number(x.balance,-MAX)};
  }
  function syncBalance(state) {
    state.profile.balance=number(dollars(ensureAccounts(state).reduce((sum,a)=>sum+cents(a.balance),0)),-MAX);
  }
  function accountById(state,id) {
    const a=ensureAccounts(state).find(a=>a.id === (id || state.accounts[0].id));
    if(!a) throw Error('The selected account no longer exists.'); return a;
  }
  function saveAccount(state,input) {
    const a=account(input), accounts=ensureAccounts(state).map(x=>({...x}));
    const i=accounts.findIndex(x=>x.id===a.id);
    if(accounts.some(x=>x.id!==a.id && x.label.toLowerCase()===a.label.toLowerCase())) throw Error('Use a unique account name.');
    if(i<0) accounts.push(a);else accounts[i]=a;
    const balance=number(dollars(accounts.reduce((sum,x)=>sum+cents(x.balance),0)),-MAX);
    state.accounts=accounts;state.profile.balance=balance;
  }
  function removeAccount(state,id) {
    const a=accountById(state,id);
    if(state.accounts.length===1 || cents(a.balance)!==0) throw Error('Keep at least one account and transfer or reconcile its balance to zero first.');
    if(state.transactions.some(t=>t.accountId===id || t.toAccountId===id) || state.bills.concat(state.incomes).some(x=>x.accountId===id)) throw Error('This account is used by history or planned payments. Keep it to preserve those records.');
    state.accounts=state.accounts.filter(x=>x.id!==id);syncBalance(state);
  }
  function applyLedger(state, old, replacement) {
    const accounts=ensureAccounts(state).map(a=>({...a}));
    function apply(t, sign) {
      if(!t)return;
      const source=accounts.find(a=>a.id===(t.accountId||accounts[0].id));
      if(!source)throw Error('Account not found.');
      source.balance=number(dollars(cents(source.balance)+sign*cents(t.delta)),-MAX);
      if(t.type==='transfer') {
        const destination=accounts.find(a=>a.id===t.toAccountId);
        if(!destination || destination.id===source.id)throw Error('Choose two different accounts for a transfer.');
        destination.balance=number(dollars(cents(destination.balance)-sign*cents(t.delta)),-MAX);
      }
    }
    apply(old,-1);apply(replacement,1);
    const balance=number(dollars(accounts.reduce((sum,a)=>sum+cents(a.balance),0)),-MAX);
    const tax=number(dollars(cents(state.profile.taxHeld)-cents(old?old.taxDelta:0)+cents(replacement?replacement.taxDelta:0)));
    state.accounts=accounts;state.profile.balance=balance;state.profile.taxHeld=tax;
  }
  function contribute(state,id,input) {
    const g=state.goals.find(g=>g.id===id);if(!g)throw Error('Goal not found.');
    const amount=number(input.amount,-MAX);
    if(!amount || !validDate(input.date) || input.date>localDate())throw Error('Enter a nonzero contribution and a date on or before today.');
    const saved=number(dollars(cents(g.saved)+cents(amount)));
    const entry={id:input.id,date:input.date,amount,note:label(input.note||'Contribution')};
    g.saved=saved;g.contributions=[...(g.contributions||[]),entry];
  }
  function spendingReport(state,month,accountId='all') {
    if(!validDate(month+'-01'))throw Error('Choose a valid month.');
    const rows=state.transactions.filter(t=>t.type!=='transfer' && (accountId==='all'||t.accountId===accountId));
    const summary=m=>{
      const entries=rows.filter(t=>t.date.slice(0,7)===m), groups=new Map();let income=0,expense=0;
      entries.forEach(t=>{if(t.type==='income')income+=cents(t.amount);else {expense+=cents(t.amount);const key=t.category.toLowerCase();const g=groups.get(key)||{label:t.category,amount:0};g.amount+=cents(t.amount);groups.set(key,g);}});
      return {month:m,income:dollars(income),expense:dollars(expense),net:dollars(income-expense),categories:[...groups.values()].map(g=>({...g,amount:dollars(g.amount)})).sort((a,b)=>b.amount-a.amount)};
    };
    const [y,m]=month.split('-').map(Number);
    const trends=Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(y,m-6+i,1));return summary(d.toISOString().slice(0,7));});
    return {...summary(month),previous:trends[4],trends};
  }
  function parseCSV(text) {
    if(typeof text!=='string'||text.length>2000000)throw Error('CSV must be smaller than 2 MB.');
    text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
      if(c==='"' && !cell && !closed){quoted=true;continue;}
      if(c===','||c==='\r'||c==='\n'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>10001)throw Error('Import at most 10,000 transactions.');}continue;}
      if(closed)throw Error('Unexpected text after a quoted CSV field.');cell+=c;
    }
    if(quoted)throw Error('Unclosed quoted CSV field.');
    row.push(cell);if(row.some(x=>x!==''))rows.push(row);
    if(rows.length>10001)throw Error('Import at most 10,000 transactions.');
    return rows;
  }
  function previewCSV(state,text,defaultAccountId,adjust=false) {
    const rows=parseCSV(text);if(rows.length<2)throw Error('Include a header and at least one transaction.');
    const headers=rows.shift().map(x=>x.trim().toLowerCase());
    const locate=(...names)=>headers.findIndex(h=>names.includes(h));
    const dateCol=locate('date','transaction date'),labelCol=locate('description','merchant','label','name'),amountCol=locate('amount'),typeCol=locate('type');
    if(dateCol<0||labelCol<0||amountCol<0)throw Error('Required headers: date, description, amount. Optional: type, category, account, to_account. Dates must be YYYY-MM-DD; signed amounts use negative for expenses.');
    const get=(r,...names)=>{const i=locate(...names);return i<0?'':(r[i]||'').trim();};
    const signature=t=>JSON.stringify([t.date,t.label.toLowerCase(),t.type,cents(t.amount),t.accountId,t.toAccountId||'']);
    const seen=new Set(state.transactions.map(signature));
    return rows.map((r,i)=>{
      try {
        if(r.length!==headers.length)throw Error('Column count does not match the header.');
        const signed=Number(r[amountCol].trim());if(!r[amountCol].trim()||!Number.isFinite(signed)||signed===0)throw Error('Use a nonzero numeric amount without currency symbols.');
        const type=typeCol>=0?r[typeCol].trim().toLowerCase():(signed<0?'expense':'income');
        const name=get(r,'account'),destName=get(r,'to_account');
        const source=name?ensureAccounts(state).find(a=>a.label.toLowerCase()===name.toLowerCase()):accountById(state,defaultAccountId);
        const dest=destName?state.accounts.find(a=>a.label.toLowerCase()===destName.toLowerCase()):null;
        if(!source||(type==='transfer'&&!dest))throw Error('Create the named accounts before importing.');
        const t=transaction({id:'import-'+i,date:r[dateCol].trim(),label:r[labelCol].trim(),amount:Math.abs(signed),type,category:get(r,'category')||'Other',accountId:source.id,toAccountId:dest?dest.id:'',adjust});
        if(t.date>localDate())throw Error('Future payments belong in Plan.');
        if(type==='transfer'&&source.id===dest.id)throw Error('A transfer needs two different accounts.');
        const key=signature(t),duplicate=seen.has(key);seen.add(key);return {transaction:t,duplicate};
      } catch(e){throw Error('CSV row '+(i+2)+': '+e.message);}
    });
  }
  function exportCSV(state) {
    const quote=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,match=>"'"+match).replace(/"/g,'""')+'"';
    const rows=[['date','description','amount','type','category','account','to_account']];
    state.transactions.forEach(t=>rows.push([t.date,t.label,t.amount.toFixed(2),t.type,t.category,accountById(state,t.accountId).label,t.type==='transfer'?accountById(state,t.toAccountId).label:'']));
    return rows.map(r=>r.map(quote).join(',')).join('\r\n');
  }

  const api = { number, cents, dollars, localDate, validDate, daysBetween, addDays, label, blank, normalize, demo, forecast, settle, netCents, reservesCents, repeat, nextDate, expand, transaction, saveTransaction, removeTransaction, budget, budgetSummary, ensureAccounts, accountById, syncBalance, saveAccount, removeAccount, contribute, spendingReport, parseCSV, previewCSV, exportCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CashCore = api;
})(typeof window === 'undefined' ? globalThis : window);
