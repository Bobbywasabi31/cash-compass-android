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
    return { version: 6, demo: false, profile: { name: 'there', balance: 0, hourlyRate: 0, taxRate: 0, buffer: 0, taxHeld: 0, sideTaxRate: 25, taxReminder: false }, incomes: [], bills: [], goals: [], transactions: [], budgets: [], budgetMoves: [], accounts: [], reminders: false, holdings: [], balanceHistory: [], lifeEvents: [], merchantMemory: {}, forecastSettings: forecastOptions(), hiddenCards: [], savedFilters: [], rules: [], wallet: walletData() };
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('This is not a Cash Compass backup.');
    const p = raw.profile || { name: raw.name, balance: raw.balance, hourlyRate: raw.rate, taxRate: raw.tax };
    const result = blank();
    result.demo = raw.demo === true; result.reminders=raw.reminders===true;
    result.profile = { name: label(p.name), balance: number(p.balance, -MAX), hourlyRate: number(p.hourlyRate), taxRate: number(p.taxRate, 0, 100), buffer: number(p.buffer || 0), taxHeld: number(p.taxHeld || 0), sideTaxRate: number(p.sideTaxRate == null ? 25 : p.sideTaxRate, 0, 100), taxReminder: p.taxReminder === true };
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
          out.estimate = kind === 'bills' && item.estimate === true;
          // Per-bill reminder settings (roadmap #27): which bills notify and how many days ahead.
          out.reminder = kind !== 'bills' || item.reminder !== false;
          out.reminderDays = kind === 'bills' ? number(item.reminderDays == null ? 3 : item.reminderDays, 0, 60) : 0;
          // Multiple income streams (roadmap #19): hours and rate per stream.
          out.hours = kind === 'incomes' ? number(item.hours || 0, 0, 1000) : 0;
          out.hourlyRate = kind === 'incomes' ? number(item.hourlyRate || 0, 0) : 0;
        }
        return out;
      });
    });
    result.transactions = list(raw.transactions).map((x,i) => transaction({...x, id: 'transactions-' + i}));
    // Refund links (roadmap #36) point at transaction ids, which are rebuilt
    // above; remap them so links survive backup/restore round trips.
    const txIdMap = new Map(list(raw.transactions).map((x,i) => [x && x.id, 'transactions-' + i]));
    result.transactions.forEach(t => { if (t.refundOf) t.refundOf = txIdMap.get(t.refundOf) || ''; });
    result.budgets = list(raw.budgets).map((x,i) => budget({...x, id: 'budgets-' + i}));
    // Budget moves (roadmap #44): mid-month reallocation history.
    result.budgetMoves = list(raw.budgetMoves).map((x,i) => {
      if (!x || typeof x !== 'object') throw Error('Invalid budget move.');
      if (!validDate(x.date)) throw Error('Invalid budget move date.');
      return { id: 'move-' + i, date: x.date, from: label(x.from), to: label(x.to), amount: number(x.amount, 0.01) };
    });
    if (new Set(result.budgets.map(x => x.category.toLowerCase())).size !== result.budgets.length) throw Error('Budget categories must be unique.');
    result.accounts=raw.accounts && raw.accounts.length ? list(raw.accounts).map(account) : [{id:'cash',label:'Cash',type:'cash',balance:result.profile.balance}];
    if(new Set(result.accounts.map(a=>a.id)).size!==result.accounts.length || new Set(result.accounts.map(a=>a.label.toLowerCase())).size!==result.accounts.length)throw Error('Account identifiers and names must be unique.');
    result.transactions.forEach(t=>{if(!t.accountId)t.accountId=result.accounts[0].id;accountById(result,t.accountId);if(t.type==='transfer'){accountById(result,t.toAccountId);if(t.accountId===t.toAccountId)throw Error('Invalid transfer accounts.');}});
    result.bills.concat(result.incomes).forEach(x=>accountById(result,x.accountId));syncBalance(result);
    result.holdings=list(raw.holdings).map((h,i)=>holding({...h,id:'holding-'+i}));portfolio(result);
    result.balanceHistory=list(raw.balanceHistory).map(h=>{if(!validDate(h.date)||h.date>localDate())throw Error('Invalid balance history date.');return {date:h.date,value:number(h.value,-MAX),investments:number(h.investments||0)};}).sort((a,b)=>a.date.localeCompare(b.date));
    if(new Set(result.balanceHistory.map(h=>h.date)).size!==result.balanceHistory.length)throw Error('Duplicate balance history dates.');
    result.lifeEvents=list(raw.lifeEvents).map((e,i)=>lifeEvent({...e,id:'event-'+i}));
    result.merchantMemory={};
    if(raw.merchantMemory!==undefined){
      if(!raw.merchantMemory||typeof raw.merchantMemory!=='object'||Array.isArray(raw.merchantMemory))throw Error('Invalid merchant memory.');
      const keys=Object.keys(raw.merchantMemory);
      if(keys.length>500)throw Error('Merchant memory is too large.');
      keys.forEach(k=>{
        if(typeof k!=='string'||!k||k.length>80)throw Error('Invalid merchant memory.');
        const v=raw.merchantMemory[k];
        if(!v||typeof v!=='object')throw Error('Invalid merchant memory.');
        result.merchantMemory[k]={label:label(v.label||k),category:label(v.category||'Other'),accountId:typeof v.accountId==='string'?v.accountId:'',uses:Number.isInteger(v.uses)&&v.uses>0?v.uses:1};
      });
    }
    result.forecastSettings=forecastOptions(raw.forecastSettings);
    result.hiddenCards=list(raw.hiddenCards).filter(x=>['setup','budget','spending','transactions','worth','goals','recurring','investments','advice'].includes(x));
    // Saved activity filters (roadmap #34).
    result.savedFilters=list(raw.savedFilters).slice(0,50).map((f,i)=>{
      if(!f||typeof f!=='object')throw Error('Invalid saved filter.');
      const name=label(f.name||('Filter '+(i+1))).slice(0,40);
      if(!name)throw Error('Saved filter needs a name.');
      const q=f.filters||{};
      return {id:'filter-'+i,name,filters:{
        query:String(q.query||'').slice(0,80),type:['all','expense','income','transfer'].includes(q.type)?q.type:'all',
        account:String(q.account||'all').slice(0,80),category:String(q.category||'all').slice(0,80),
        tag:String(q.tag||'all').slice(0,30),min:q.min===''||q.min==null?'':number(q.min,0),max:q.max===''||q.max==null?'':number(q.max,0),
        start:q.start||'',end:q.end||''}};
    });
    result.savedFilters.forEach(f=>{if(f.filters.start&&!validDate(f.filters.start))throw Error('Invalid saved filter date.');if(f.filters.end&&!validDate(f.filters.end))throw Error('Invalid saved filter date.');});
    // Rules engine (roadmap #30): "if merchant contains X, set category/tag Y".
    result.rules=list(raw.rules).slice(0,50).map((r,i)=>{
      if(!r||typeof r!=='object')throw Error('Invalid rule.');
      const match=String(r.match||'').toLowerCase().trim().slice(0,80);
      if(!match)throw Error('A rule needs match text.');
      return {id:'rule-'+i,match,category:r.category?label(r.category):'',tag:String(r.tag||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,30)};
    });
    result.wallet=walletData(raw.wallet);
    return result;
  }
  function demo(today = localDate()) {
    if (!validDate(today)) throw Error('Enter a valid sample-plan date.');
    const s = blank(); s.demo = true;
    const [year,month] = today.split('-').map(Number);
    const monthAt = offset => new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);
    const historyDate = (offset,day) => {
      const last = new Date(Date.UTC(year,month+offset,0)).getUTCDate();
      const date = monthAt(offset)+'-'+String(Math.min(day,last)).padStart(2,'0');
      return date>today ? today : date;
    };
    s.profile = { name:'Jordan', balance:1500, hourlyRate:28, taxRate:18, buffer:100, taxHeld:60 };
    s.accounts = [
      {id:'checking',label:'Example Checking',type:'checking',balance:1850},
      {id:'savings',label:'Example Savings',type:'savings',balance:950},
      {id:'cash',label:'Cash wallet',type:'cash',balance:100},
      {id:'card',label:'Example Credit Card',type:'credit',balance:-1387.66}
    ];
    syncBalance(s);
    s.incomes = [
      {id:'pay',label:'Shift pay (after payroll tax)',amount:1176,date:addDays(today,7),gross:false,repeat:'biweekly',accountId:'checking',category:'Paycheck'},
      {id:'side-pay',label:'Weekend project (gross)',amount:180,date:addDays(today,3),gross:true,repeat:'monthly',accountId:'checking',category:'Side work'},
      {id:'extra-shift',label:'Extra shift payment',amount:140,date:addDays(today,12),gross:false,repeat:'none',accountId:'checking',category:'Paycheck'}
    ];
    s.bills = [
      {id:'phone',label:'Phone',amount:58,date:addDays(today,2),repeat:'monthly',accountId:'checking',category:'Phone'},
      {id:'rent',label:'Shared housing',amount:950,date:monthAt(1)+'-01',repeat:'monthly',anchorDay:1,accountId:'checking',category:'Housing'},
      {id:'utility',label:'Last utility bill — overdue example',amount:72,date:addDays(today,-2),repeat:'monthly',accountId:'checking',category:'Utilities'},
      {id:'subscription',label:'Example streaming subscription',amount:14.99,date:addDays(today,9),repeat:'monthly',accountId:'card',category:'Subscriptions'},
      {id:'transit',label:'Weekly transit pass',amount:18,date:addDays(today,4),repeat:'weekly',accountId:'cash',category:'Transportation'},
      {id:'insurance',label:'Annual insurance renewal',amount:240,date:addDays(today,22),repeat:'yearly',accountId:'checking',category:'Insurance'}
    ];
    const contribution = (id,days,amount,note) => ({id,date:addDays(today,-days),amount,note});
    s.goals = [
      {id:'cushion',label:'Emergency cushion',target:1200,saved:435,monthly:60,deadline:addDays(today,180),contributions:[contribution('c1',100,200,'Starting cushion'),contribution('c2',70,150,'Paycheck contribution'),contribution('c3',35,100,'Extra shift'),contribution('c4',14,-15,'Unexpected expense')]},
      {id:'car',label:'Car maintenance',target:600,saved:180,monthly:40,deadline:addDays(today,90),contributions:[contribution('a1',80,120,'Maintenance set-aside'),contribution('a2',45,80,'Paycheck contribution'),contribution('a3',20,-20,'Small repair')]},
      {id:'trip',label:'Weekend trip',target:400,saved:90,monthly:25,deadline:addDays(today,240),contributions:[contribution('t1',60,50,'Trip fund'),contribution('t2',25,40,'Paycheck contribution')]}
    ];
    let sequence=0;
    const record = (offset,day,type,amount,category,label,accountId='checking',extra={}) => {
      saveTransaction(s,{id:'sample-'+sequence++,date:historyDate(offset,day),type,amount,category,label,accountId,adjust:false,...extra});
    };
    // Fictional reconciled history is already included in the displayed balances.
    // Cap this month's example dates at today so charts work even on the first day.
    for(let age=11;age>=0;age--) {
      const offset=-age,lean=age===4,pay=lean?650:1176+(age%3)*28;
      record(offset,5,'income',age===0?1176:pay,'Paycheck','Example shift employer');
      if(age>0)record(offset,19,'income',pay,'Paycheck','Example shift employer');
      record(offset,8,'income',age===0?120:150+(age%2)*30,'Side work','Example weekend client');
      record(offset,1,'expense',950,'Housing','Shared housing');
      record(offset,3,'expense',82.35+(age%3)*4,'Groceries','Example Market');
      record(offset,12,'expense',76.40,'Groceries','Example Market','card');
      record(offset,24,'expense',age===0?54.25:91.25,'Groceries','Neighborhood Grocer','card');
      record(offset,4,'expense',52.80,'Transportation','Example Fuel');
      record(offset,18,'expense',age===0?18:49.60,'Transportation','Transit and fuel');
      if(age>0)record(offset,10,'expense',58,'Phone','Example mobile service');
      if(age>0)record(offset,16,'expense',72+(age%3)*5,'Utilities','Example utility');
      record(offset,6,'expense',14.99,'Subscriptions','Example streaming service','card');
      record(offset,14,'expense',32.50,'Dining','Example Cafe','card');
      record(offset,23,'expense',18.75,'Dining','Neighborhood Lunch');
      record(offset,20,'expense',25,'Entertainment','Example Cinema','card');
      record(offset,25,'expense',6.25,'Other','Small household purchase','cash');
      record(offset,7,'transfer',100,'Transfer','Checking to savings','checking',{toAccountId:'savings'});
      record(offset,21,'transfer',145,'Transfer','Credit card payment','checking',{toAccountId:'card'});
      if(lean)record(offset,20,'expense',1050,'Car repairs','Example Repair Shop','card');
    }
    // One editable purchase demonstrates reversible balance adjustments.
    const receiptId='c'.repeat(64),revision='d'.repeat(64);
    record(0,Number(today.slice(8)),'expense',12.34,'Groceries','Example Corner Market','card',{adjust:true,walletId:receiptId,walletRevision:revision});
    const budgetStart=monthAt(-11);
    s.budgets = [
      ['Paycheck',2352,'income',false],['Side work',150,'income',false],
      ['Housing',950,'fixed',false],['Phone',58,'fixed',false],['Utilities',90,'fixed',false],['Subscriptions',20,'fixed',false],
      ['Groceries',240,'flexible',false],['Transportation',130,'flexible',false],['Dining',40,'flexible',false],['Entertainment',30,'flexible',false],
      ['Car repairs',100,'occasional',true],['Gifts',25,'occasional',true]
    ].map(([category,amount,bucket,rollover],i)=>budget({id:'sample-budget-'+i,category,amount,bucket,rollover,start:budgetStart}));
    s.holdings = [
      holding({id:'sample-fund',label:'Example diversified fund',symbol:'EXMF',quantity:8,price:120,cost:105,assetClass:'fund',updated:today}),
      holding({id:'sample-bond',label:'Example bond holding',symbol:'EXBD',quantity:12,price:98,cost:100,assetClass:'bond',updated:today}),
      holding({id:'sample-stock',label:'Example company shares',symbol:'EXST',quantity:10,price:22,cost:18,assetClass:'stock',updated:today})
    ];
    s.forecastSettings = forecastOptions({years:10,monthlyIncome:2502,monthlyExpense:1750,growth:4});
    s.lifeEvents = [
      lifeEvent({id:'sample-repair',label:'Planned major repair',month:monthAt(3),amount:-800,repeat:'once'}),
      lifeEvent({id:'sample-hours',label:'Lower-hours season',month:monthAt(6),amount:-250,repeat:'monthly'}),
      lifeEvent({id:'sample-extra',label:'New weekend client',month:monthAt(9),amount:175,repeat:'monthly'})
    ];
    for(let age=11;age>0;age--)s.balanceHistory.push({date:historyDate(-age,28),value:2400+(11-age)*125,investments:1750+(11-age)*45});
    snapshot(s,today);
    const postedAt=new Date(today+'T12:00:00').getTime();
    s.wallet = walletData({accountId:'card',adjust:true,auto:false,receipts:[{id:receiptId,revision}],inbox:[
      {id:'a'.repeat(64),revision:'b'.repeat(64),postedAt,title:'Example Cafe',text:'$21.80 with Example Bank\nDebit Card ••0000',reason:'Fictional sample purchase. Try reviewing its account and category.'},
      {id:'e'.repeat(64),revision:'f'.repeat(64),postedAt:postedAt-60000,title:'Example Store',text:'Refund of $15.00 pending',reason:'Fictional pending-refund notice. Confirm the details or dismiss it.'}
    ]});
    return s;
  }
  function netCents(item, profile) { return cents(item.amount) - (item.gross ? Math.round(cents(item.amount) * profile.taxRate / 100) : 0); }
  function reservesCents(state) {
    return cents(state.profile.buffer) + cents(state.profile.taxHeld) + state.goals.reduce((total, g) => total + cents(g.saved) + Math.min(cents(g.monthly), Math.max(0, cents(g.target) - cents(g.saved))), 0);
  }
  function forecast(state, today = localDate(), fewerHours = 0, slipDays = 0) {
    number(fewerHours, 0, 1000); number(slipDays, 0, 365); slipDays = Math.round(slipDays);
    const end = addDays(today, 30);
    // Include each schedule's next income even when it falls beyond the 30-day timeline.
    const expandedIncomes = expand(state.incomes, end, today);
    const incomes = expandedIncomes.filter(x => x.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const next = incomes[0] || null;
    // Late-paycheck scenario (roadmap #18): model payday arriving slipDays late.
    const slipDate = next ? addDays(next.date, slipDays) : null;
    const horizon = next && slipDate > end ? slipDate : end;
    state = {...state, incomes: expandedIncomes, bills: expand(state.bills.map(b => {
      if (!b.estimate) return b;
      const est = estimateBillAmount(state, b.label, today);
      return est == null ? b : {...b, amount: est, estimated: true};
    }), horizon)};
    const before = state.bills.filter(x => !next || x.date <= slipDate);
    const held = before.reduce((sum, x) => sum + cents(x.amount), 0);
    const reserved = reservesCents(state);
    const available = cents(state.profile.balance) - reserved - held;
    const lossEstimate = Math.round(fewerHours * cents(state.profile.hourlyRate) * (1 - state.profile.taxRate / 100));
    const loss = next ? Math.min(netCents(next, state.profile), lossEstimate) : 0;
    const events = state.bills.filter(x => x.date <= end).map(x => ({ ...x, kind: 'bills', effective: x.date < today ? today : x.date }))
      .concat(incomes.map(x => ({ ...x, kind: 'incomes', effective: next && x.id === next.id ? slipDate : x.date })).filter(x => x.effective <= end));
    // Bills precede income on the same date; deposit time is unknown.
    events.sort((a, b) => a.effective.localeCompare(b.effective) || (a.kind === b.kind ? 0 : a.kind === 'bills' ? -1 : 1));
    let running = cents(state.profile.balance) - reserved;
    let low = running, endBalance = running;
    const timeline = events.map(event => {
      running += event.kind === 'incomes' ? netCents(event, state.profile) - (next && event.id === next.id ? loss : 0) : -cents(event.amount);
      low = Math.min(low, running); endBalance = running;
      return { ...event, available: dollars(running) };
    });
    // Cash-crunch warnings (roadmap #11): dates in the 30-day window where the
    // running unreserved cash drops below the everyday safety buffer. Only
    // computed when a buffer is set, so it never duplicates the shortfall warning.
    const bufferCents = cents(state.profile.buffer);
    const crunchByDay = new Map();
    if (bufferCents > 0) timeline.forEach(event => {
      if (cents(event.available) < bufferCents) {
        const prior = crunchByDay.get(event.effective);
        if (!prior || cents(event.available) < cents(prior.available)) crunchByDay.set(event.effective, { date: event.effective, available: event.available });
      }
    });
    const crunchDays = [...crunchByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { next, before, held: dollars(held), reserved: dollars(reserved), safe: next ? dollars(Math.max(0, available)) : null,
      shortfall: dollars(Math.max(0, -available)), days: next ? Math.max(1, daysBetween(today, slipDate)) : null,
      overdue: state.bills.filter(x => x.date < today), lateIncome: state.incomes.filter(x => x.date < today),
      loss: dollars(loss), lossEstimate: dollars(lossEstimate), low: dollars(low), endBalance: dollars(endBalance), timeline, end,
      buffer: dollars(bufferCents), crunchDays, slipDays, slipDate };
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
    const walletId=/^[a-f0-9]{64}$/.test(x.walletId||'')?x.walletId:'',walletRevision=/^[a-f0-9]{64}$/.test(x.walletRevision||'')?x.walletRevision:'';
    // Tags and notes (roadmap #29): free-form tags across categories.
    const tags = Array.isArray(x.tags) ? [...new Set(x.tags.map(t => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)).filter(Boolean))].slice(0, 10).sort() : [];
    const note = String(x.note || '').trim().slice(0, 280);
    // Refund linking (roadmap #36): an income can point at the expense it refunds.
    const refundOf = typeof x.refundOf === 'string' ? x.refundOf.trim().slice(0, 80) : '';
    // Reimbursable tracking (roadmap #37): expenses you expect to be paid back.
    const reimbursable = x.reimbursable === true && x.type === 'expense';
    const reimbursed = reimbursable ? number(x.reimbursed || 0, 0, amount) : 0;
    // Tax set-aside tracker (roadmap #23): untaxed side income.
    const untaxed = x.untaxed === true && x.type === 'income';
    return {walletId,walletRevision,id:x.id, accountId:x.accountId||'', toAccountId:x.type==='transfer' ? x.toAccountId||'' : '', label:label(x.label), amount, date:x.date, type:x.type, category:label(x.category || (x.type === 'income' ? 'Income' : 'Other')), delta, taxDelta, tags, note, refundOf, reimbursable, reimbursed, untaxed};
  }
  function saveTransaction(state, input) {
    const t = transaction(input);
    const old = state.transactions.find(x => x.id === t.id);
    if (t.refundOf) {
      if (t.type !== 'income') throw Error('Only income can be linked as a refund.');
      if (t.refundOf === t.id) throw Error('A transaction cannot refund itself.');
      const orig = state.transactions.find(x => x.id === t.refundOf);
      if (!orig || orig.type !== 'expense') throw Error('Linked purchase not found.');
    }
    // Rules engine (roadmap #30): new transactions get every matching rule's
    // tag; the first matching rule also sets the category when none is set.
    if (!old) applyRules(state, t, false);
    t.accountId=accountById(state,t.accountId).id;
    if(old && old.walletId){t.walletId=old.walletId;t.walletRevision=t.walletRevision||old.walletRevision;}
    applyLedger(state,old,t);
    if (old) state.transactions[state.transactions.indexOf(old)] = t; else state.transactions.push(t);
    learnMerchant(state, t);
    return state;
  }
  function removeTransaction(state, id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) throw Error('Transaction not found.');
    applyLedger(state,t,null);
    state.transactions = state.transactions.filter(x => x.id !== id);
  }
  // Split transactions (roadmap #28): divide one purchase across categories.
  // Parts must sum to the original amount to the cent; the original's cash
  // adjustment is reversed and each part applies its own proportionally.
  function splitTransaction(state, id, parts) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) throw Error('Transaction not found.');
    if (t.type === 'transfer') throw Error('Transfers cannot be split.');
    if (t.taxDelta) throw Error('Transactions with a tax reserve cannot be split.');
    if (!Array.isArray(parts) || parts.length < 2) throw Error('Split into at least 2 parts.');
    const clean = parts.map(p => {
      if (!p || typeof p !== 'object') throw Error('Invalid split part.');
      return { category: label(p.category || 'Other'), amount: number(p.amount, 0.01) };
    });
    if (clean.reduce((s, p) => s + cents(p.amount), 0) !== cents(t.amount))
      throw Error('Split parts must add up to ' + dollars(t.amount) + '.');
    removeTransaction(state, id);
    const stamp = Date.now().toString(36);
    return clean.map((p, i) => {
      saveTransaction(state, { id: t.id + '-split-' + i + '-' + stamp, label: t.label, type: t.type,
        amount: p.amount, date: t.date, category: p.category, accountId: t.accountId,
        adjust: t.delta !== 0, tags: i === 0 ? t.tags : [], note: i === 0 ? t.note : '' });
      return state.transactions[state.transactions.length - 1];
    });
  }
  // Duplicate cleanup (roadmap #33): group recorded transactions by date,
  // merchant, amount, type, and accounts; merge unions tags and keeps the
  // longest note. Only merge true double-records — two legitimate same-day
  // purchases can match, and merging those would remove real spending.
  function findDuplicates(state) {
    const groups = new Map();
    (state.transactions || []).forEach(t => {
      const key = [t.date, merchantKey(t.label), cents(t.amount), t.type, t.accountId, t.toAccountId || ''].join('|');
      const g = groups.get(key) || [];
      g.push(t);
      groups.set(key, g);
    });
    return [...groups.values()].filter(g => g.length > 1)
      .map(g => [...g].sort((a, b) => a.id.localeCompare(b.id)));
  }
  function mergeDuplicates(state, ids) {
    if (!Array.isArray(ids) || ids.length < 2) throw Error('Choose at least 2 duplicates to merge.');
    const kept = state.transactions.find(t => t.id === ids[0]);
    if (!kept) throw Error('Transaction not found.');
    const tags = new Set(kept.tags || []);
    let note = kept.note || '';
    ids.slice(1).forEach(id => {
      const t = state.transactions.find(x => x.id === id);
      if (!t) throw Error('Transaction not found.');
      (t.tags || []).forEach(tag => tags.add(tag));
      if ((t.note || '').length > note.length) note = t.note;
      removeTransaction(state, id);
    });
    kept.tags = [...tags].sort().slice(0, 10);
    kept.note = note;
    return kept;
  }
  // Rules engine (roadmap #30): "if merchant contains X, set category/tag Y".
  // Rules run top to bottom. The first matching rule sets the category on
  // uncategorized transactions; every matching rule adds its tag.
  function makeRule(input) {
    if (!input || typeof input !== 'object') throw Error('Invalid rule.');
    const match = String(input.match || '').toLowerCase().trim().slice(0, 80);
    if (!match) throw Error('Enter text to match, e.g. a merchant name.');
    const category = input.category ? label(input.category) : '';
    const tag = String(input.tag || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!category && !tag) throw Error('Set a category, a tag, or both.');
    return { id: 'rule-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), match, category, tag };
  }
  function matchRule(rule, t) {
    if (!rule || !rule.match || !t || t.type === 'transfer') return false;
    return (t.label + ' ' + merchantKey(t.label)).toLowerCase().includes(rule.match);
  }
  function applyRules(state, t, force) {
    const matches = (state.rules || []).filter(r => matchRule(r, t));
    if (!matches.length) return t;
    if ((force || t.category === 'Other' || (t.type === 'income' && t.category === 'Income')) && matches[0].category)
      t.category = matches[0].category;
    matches.forEach(r => { if (r.tag) t.tags = [...new Set([...(t.tags || []), r.tag])].slice(0, 10).sort(); });
    return t;
  }
  function previewRule(state, rule) {
    return (state.transactions || []).filter(t => matchRule(rule, t));
  }
  function applyRule(state, ruleId) {
    const rule = (state.rules || []).find(r => r.id === ruleId);
    if (!rule) throw Error('Rule not found.');
    let count = 0;
    (state.transactions || []).forEach(t => {
      if (!matchRule(rule, t)) return;
      if (rule.category) t.category = rule.category;
      if (rule.tag) t.tags = [...new Set([...(t.tags || []), rule.tag])].slice(0, 10).sort();
      count++;
    });
    return count;
  }
  // Refund linking (roadmap #36): find the original purchase a refund points at.
  function refundTarget(state, t) {
    return (state.transactions || []).find(x => x.id === t.refundOf) || null;
  }
  // Emergency fund tracker (roadmap #25): months of essential spending
  // covered by spendable cash — the same pool runway() draws on.
  function emergencyFund(state, monthlyEssential, targetMonths = 3) {
    monthlyEssential = number(monthlyEssential, 0);
    targetMonths = number(targetMonths, 1, 60);
    const cash = dollars(Math.max(0, cents(state.profile.balance) - reservesCents(state)));
    const target = dollars(cents(monthlyEssential) * targetMonths);
    const monthsCovered = monthlyEssential > 0 ? cash / monthlyEssential : 0;
    return { cash, monthlyEssential, targetMonths, target, monthsCovered,
      funded: monthlyEssential > 0 && monthsCovered >= targetMonths,
      gap: dollars(Math.max(0, cents(target) - cents(cash))) };
  }
  // Reimbursable tracking (roadmap #37): what's still owed on expenses
  // marked reimbursable. Pure tracking — the actual payback deposit is
  // recorded as income separately.
  function reimbursableSummary(state) {
    const items = (state.transactions || [])
      .filter(t => t.type === 'expense' && t.reimbursable)
      .sort((a, b) => b.date.localeCompare(a.date));
    const total = items.reduce((s, t) => s + cents(t.amount), 0);
    const reimbursed = items.reduce((s, t) => s + cents(t.reimbursed || 0), 0);
    return { items, count: items.length, total: dollars(total), reimbursed: dollars(reimbursed), owed: dollars(total - reimbursed) };
  }
  function markReimbursed(state, id, amount) {
    const t = (state.transactions || []).find(x => x.id === id);
    if (!t || t.type !== 'expense' || !t.reimbursable) throw Error('Reimbursable expense not found.');
    t.reimbursed = dollars(Math.min(cents(t.amount), Math.max(0, cents(number(amount)))));
    return t;
  }
  // Hours and paycheck estimator (roadmap #16): gross and take-home from
  // hourly rate × hours, using the user's deduction rate.
  // Overtime and holiday pay (roadmap #17): overtime at 1.5×, holiday at 2×.
  function paycheckEstimate(hourlyRate, hours, taxRate, overtimeHours = 0, holidayHours = 0) {
    hourlyRate = number(hourlyRate, 0);
    hours = number(hours, 0, 1000);
    overtimeHours = number(overtimeHours, 0, 1000);
    holidayHours = number(holidayHours, 0, 1000);
    taxRate = number(taxRate, 0, 100);
    const regularCents = Math.round(cents(hourlyRate) * hours);
    const overtimeCents = Math.round(cents(hourlyRate) * 1.5 * overtimeHours);
    const holidayCents = Math.round(cents(hourlyRate) * 2 * holidayHours);
    const grossCents = regularCents + overtimeCents + holidayCents;
    const taxCents = Math.round(grossCents * taxRate / 100);
    return { hourlyRate, hours, overtimeHours, holidayHours, taxRate,
      regularPay: dollars(regularCents), overtimePay: dollars(overtimeCents), holidayPay: dollars(holidayCents),
      gross: dollars(grossCents), tax: dollars(taxCents), takeHome: dollars(grossCents - taxCents) };
  }
  // Gig income variability (roadmap #18): monthly income range plus a
  // consistency score (100 minus the coefficient of variation, 0–100).
  function gigIncomeStats(state, monthsBack = 12) {
    const incomes = monthlyTotals(state, localDate(), monthsBack).map(r => r.income).filter(v => v > 0);
    if (incomes.length < 2) return null;
    const min = Math.min(...incomes), max = Math.max(...incomes);
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const variance = incomes.reduce((s, v) => s + (v - mean) * (v - mean), 0) / incomes.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    return { min, max, avg: dollars(incomes.reduce((s, v) => s + cents(v), 0) / incomes.length),
      months: incomes.length, consistency: Math.max(0, Math.min(100, Math.round(100 - cv * 100))) };
  }
  // Income smoothing (roadmap #15): pick a steady target paycheck; see how
  // much to reserve in high months and draw in lean months, from recorded
  // monthly income. Months with no recorded income are excluded.
  function incomeSmoothing(state, targetMonthly, monthsBack = 12) {
    targetMonthly = number(targetMonthly, 0.01);
    const targetCents = cents(targetMonthly);
    let balanceCents = 0;
    const months = monthlyTotals(state, localDate(), monthsBack)
      .filter(r => r.income > 0)
      .map(r => {
        const reserveCents = Math.max(0, cents(r.income) - targetCents);
        const drawCents = Math.max(0, targetCents - cents(r.income));
        balanceCents += reserveCents - drawCents;
        return { month: r.month, income: r.income, reserve: dollars(reserveCents), draw: dollars(drawCents), balance: dollars(balanceCents) };
      });
    const totalReserve = dollars(months.reduce((s, m) => s + cents(m.reserve), 0));
    const totalDraw = dollars(months.reduce((s, m) => s + cents(m.draw), 0));
    return { targetMonthly, months, count: months.length, totalReserve, totalDraw, balance: dollars(balanceCents) };
  }
  // Budget alerts (roadmap #20): categories at 80%+ (warn) or 100%+ (over)
  // of their available budget, refunds netted like the budget summary.
  function budgetAlerts(state, month = localDate().slice(0, 7)) {
    return budgetSummary(state, month).rows
      .filter(r => r.available > 0)
      .map(r => ({ category: r.category, bucket: r.bucket, spent: r.spent, available: r.available, pct: r.spent / r.available, level: r.spent >= r.available ? 'over' : r.spent >= r.available * 0.8 ? 'warn' : null }))
      .filter(a => a.level);
  }
  // Pay-period budgets (roadmap #14): weekly/bi-weekly cycles slice the
  // monthly budget (52/26 periods per year); unspent amounts roll forward
  // into the current period for categories that allow rollover. Weeks
  // start Monday; bi-weekly periods anchor to Monday 2020-01-06.
  const PAY_PERIODS = { weekly: 7, biweekly: 14 };
  function payPeriod(date, cycle) {
    if (!PAY_PERIODS[cycle]) throw Error('Choose a weekly or bi-weekly cycle.');
    if (!validDate(date)) throw Error('Choose a valid date.');
    const day = new Date(date + 'T12:00:00');
    const monday = new Date(day);
    monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    if (cycle === 'biweekly') {
      const utcDay = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      const days = Math.round((utcDay(monday) - Date.UTC(2020, 0, 6)) / 86400000);
      if (Math.floor(days / 7) % 2) monday.setDate(monday.getDate() - 7);
    }
    const start = monday.toISOString().slice(0, 10);
    return { start, end: addDays(start, PAY_PERIODS[cycle] - 1) };
  }
  function periodSpent(state, cat, from, to) {
    let s = 0;
    (state.transactions || []).forEach(t => {
      if (t.date < from || t.date > to) return;
      if (t.type === 'expense' && t.category.toLowerCase() === cat) s += cents(t.amount);
      else if (t.type === 'income' && t.refundOf) {
        const o = (state.transactions || []).find(x => x.id === t.refundOf);
        if (o && o.category.toLowerCase() === cat) s -= cents(t.amount);
      }
    });
    return dollars(s);
  }
  function payPeriodBudget(state, cycle, date = localDate()) {
    const period = payPeriod(date, cycle);
    const prev = payPeriod(addDays(period.start, -1), cycle);
    const perYear = cycle === 'weekly' ? 52 : 26;
    const share = monthly => dollars(Math.round(cents(monthly) * 12 / perYear));
    const rows = (state.budgets || []).filter(b => b.bucket !== 'income').map(b => {
      const cat = b.category.toLowerCase();
      const periodBudget = share(b.amount);
      const spent = periodSpent(state, cat, period.start, period.end);
      const rollover = b.rollover ? dollars(Math.max(0, cents(share(b.amount)) - cents(periodSpent(state, cat, prev.start, prev.end)))) : 0;
      const available = dollars(cents(periodBudget) + cents(rollover));
      return { category: b.category, bucket: b.bucket, periodBudget, rollover, spent, available, remaining: dollars(cents(available) - cents(spent)) };
    });
    return { cycle, period, prev, rows };
  }
  // Multiple income streams (roadmap #19): group expected income by source
  // over the coming months; each stream tracks hours and rate, and the
  // summary shows combined and per-stream monthly equivalents.
  function incomeStreams(state, monthsAhead = 12) {
    monthsAhead = Math.max(1, Math.min(60, Math.round(number(monthsAhead, 1))));
    const today = localDate();
    const [y, m] = today.split('-').map(Number);
    const endDate = new Date(Date.UTC(y, m - 1 + monthsAhead, 0)).toISOString().slice(0, 10);
    const byLabel = {};
    expand(state.incomes || [], endDate).forEach(x => {
      if (x.date < today) return;
      const key = x.label.toLowerCase();
      if (!byLabel[key]) byLabel[key] = { label: x.label, amount: 0, paydays: 0, nextDate: x.date, hours: x.hours || 0, hourlyRate: x.hourlyRate || 0 };
      const s = byLabel[key];
      s.amount = dollars(cents(s.amount) + cents(x.amount));
      s.paydays++;
      if (x.date < s.nextDate) s.nextDate = x.date;
    });
    const rows = Object.values(byLabel).sort((a, b) => cents(b.amount) - cents(a.amount));
    rows.forEach(r => { r.monthly = dollars(Math.round(cents(r.amount) / monthsAhead)); });
    const combined = dollars(rows.reduce((sum, r) => sum + cents(r.amount), 0));
    return { rows, combined, monthly: dollars(Math.round(cents(combined) / monthsAhead)), monthsAhead };
  }
  // Proactive insights feed (roadmap #77): dashboard cards derived from the
  // user's own data — spending spikes, budget pressure, upcoming bills,
  // runway warnings, and savings trends.
  function insights(state, today = localDate()) {
    const cards = [];
    const mom = monthOverMonth(state);
    mom.rows.slice(0, 3).forEach(r => {
      if (r.change <= 0 || r.pct < 20) return;
      cards.push({ kind: 'spike', title: `${r.category} is ${r.pct}% over last month`,
        detail: { previous: r.previous, current: r.current }, tone: 'warn' });
    });
    const month = today.slice(0, 7);
    budgetSummary(state, month).rows.forEach(b => {
      const pct = b.amount > 0 ? Math.round(cents(b.spent) / cents(b.amount) * 100) : 0;
      if (pct >= 100) cards.push({ kind: 'budget', title: `${b.category} budget exceeded`, detail: { spent: b.spent, budget: b.amount }, tone: 'bad' });
      else if (pct >= 80) cards.push({ kind: 'budget', title: `${b.category} is ${pct}% of budget`, detail: { spent: b.spent, budget: b.amount }, tone: 'warn' });
    });
    const upcoming = (state.bills || []).filter(b => b.date >= today && b.date <= addDays(today, 7));
    if (upcoming.length) cards.push({ kind: 'bills', title: `${upcoming.length} bill${upcoming.length === 1 ? '' : 's'} due this week`,
      detail: { bills: upcoming.slice(0, 3).map(b => ({ label: b.label, amount: b.amount })) }, tone: 'info' });
    const rw = runway(state, avgMonthly(state, 'income', today, 3), avgMonthly(state, 'expense', today, 3));
    if (!rw.indefinite && rw.weeks < 4) cards.push({ kind: 'runway', title: `Cash covers about ${Math.max(1, Math.round(rw.weeks * 7))} days`,
      detail: {}, tone: rw.weeks < 2 ? 'bad' : 'warn' });
    const sr = savingsRate(state, 3);
    if (sr.overall !== null && sr.rows.length >= 2) {
      const rates = sr.rows.filter(r => r.rate !== null).map(r => r.rate);
      if (rates.length >= 2 && rates[rates.length - 1] > rates[0] + 5)
        cards.push({ kind: 'savings', title: 'Savings rate is climbing', detail: { from: rates[0], to: rates[rates.length - 1] }, tone: 'good' });
    }
    return cards.slice(0, 8);
  }
  // Auto-drafted monthly review (roadmap #80): structured data for a
  // data-derived summary of what changed this month.
  function monthlyReview(state, today = localDate()) {
    const mom = monthOverMonth(state);
    const up = mom.rows.filter(r => r.change > 0), down = mom.rows.filter(r => r.change < 0);
    const sr = savingsRate(state, 2);
    const cur = sr.rows.find(r => r.month === mom.cur), prev = sr.rows.find(r => r.month === mom.prev);
    const bills = (state.bills || []).filter(b => b.date.slice(0, 7) === mom.cur);
    return { month: mom.cur, prev: mom.prev,
      rose: { count: up.length, total: dollars(up.reduce((s, r) => s + cents(r.change), 0)), top: up[0] || null },
      fell: { count: down.length, total: dollars(down.reduce((s, r) => s + cents(-r.change), 0)), top: down[0] || null },
      savings: cur && prev && cur.rate !== null && prev.rate !== null ? { cur: cur.rate, prev: prev.rate, saved: cur.saved, prevSaved: prev.saved } : null,
      bills: { count: bills.length, total: dollars(bills.reduce((s, b) => s + cents(b.amount), 0)) } };
  }
  // Top merchants (roadmap #63): expense transactions grouped by merchant,
  // ranked by total spend, with a period filter.
  function topMerchants(state, monthsBack = 12, limit = 10) {
    monthsBack = Math.max(1, Math.min(60, Math.round(number(monthsBack, 1))));
    limit = Math.max(1, Math.min(50, Math.round(number(limit, 1))));
    const today = localDate();
    const [y, m] = today.split('-').map(Number);
    const cutoff = new Date(Date.UTC(y, m - monthsBack, 1)).toISOString().slice(0, 10);
    const byMerchant = {};
    (state.transactions || []).forEach(t => {
      if (t.type !== 'expense' || t.date < cutoff || t.date > today) return;
      const key = merchantKey(t.label);
      if (!byMerchant[key]) byMerchant[key] = { label: t.label, total: 0, count: 0 };
      byMerchant[key].total = dollars(cents(byMerchant[key].total) + cents(t.amount));
      byMerchant[key].count++;
    });
    return Object.values(byMerchant).sort((a, b) => cents(b.total) - cents(a.total)).slice(0, limit);
  }
  // Spending trends (roadmap #59): per-category expense totals for each of
  // the last N months.
  function spendingTrends(state, monthsBack = 12) {
    monthsBack = Math.max(2, Math.min(60, Math.round(number(monthsBack, 1))));
    const today = localDate();
    const [y, m] = today.split('-').map(Number);
    const out = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      out.push({ month: new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7), categories: {} });
    }
    const byMonth = Object.fromEntries(out.map(o => [o.month, o]));
    (state.transactions || []).forEach(t => {
      if (t.type !== 'expense') return;
      const row = byMonth[t.date.slice(0, 7)];
      if (!row) return;
      const cat = t.category || 'Other';
      row.categories[cat] = dollars(cents(row.categories[cat] || 0) + cents(t.amount));
    });
    return out;
  }
  // Month-over-month insights (roadmap #60): where spending rose or fell
  // versus last month, ranked by dollar change.
  function monthOverMonth(state) {
    const today = localDate();
    const [y, m] = today.split('-').map(Number);
    const cur = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 7);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    const totals = { [cur]: {}, [prev]: {} };
    (state.transactions || []).forEach(t => {
      if (t.type !== 'expense') return;
      const bucket = totals[t.date.slice(0, 7)];
      if (!bucket) return;
      const cat = t.category || 'Other';
      bucket[cat] = dollars(cents(bucket[cat] || 0) + cents(t.amount));
    });
    const cats = new Set([...Object.keys(totals[cur]), ...Object.keys(totals[prev])]);
    return { cur, prev, rows: [...cats].map(cat => {
      const current = totals[cur][cat] || 0, previous = totals[prev][cat] || 0;
      const changeCents = cents(current) - cents(previous);
      return { category: cat, current, previous, change: dollars(changeCents),
        pct: previous > 0 ? Math.round(changeCents / cents(previous) * 1000) / 10 : (current > 0 ? 100 : 0) };
    }).sort((a, b) => Math.abs(cents(b.change)) - Math.abs(cents(a.change))) };
  }
  // Savings rate (roadmap #68): percent of income saved per month with trend.
  function savingsRate(state, monthsBack = 12) {
    const rows = monthlyTotals(state, localDate(), monthsBack).map(r => {
      const savedCents = cents(r.income) - cents(r.expense);
      return { month: r.month, income: r.income, expense: r.expense, saved: dollars(savedCents),
        rate: r.income > 0 ? Math.round(savedCents / cents(r.income) * 1000) / 10 : null };
    });
    const incomeCents = rows.reduce((s, r) => s + cents(r.income), 0);
    const savedCents = rows.reduce((s, r) => s + cents(r.saved), 0);
    return { rows, totalIncome: dollars(incomeCents), totalSaved: dollars(savedCents),
      overall: incomeCents > 0 ? Math.round(savedCents / incomeCents * 1000) / 10 : null };
  }
  // Tax set-aside tracker (roadmap #23): untaxed side income, the set-aside
  // target at the user's rate, what's reserved via tax reserves, and the
  // next quarterly estimated-tax deadline.
  function taxSetAside(state, year = localDate().slice(0, 4)) {
    if (!/^\d{4}$/.test(year)) throw Error('Enter a valid year.');
    const rate = number(state.profile.sideTaxRate == null ? 25 : state.profile.sideTaxRate, 0, 100);
    const untaxed = (state.transactions || []).filter(t => t.type === 'income' && t.untaxed && t.date.slice(0, 4) === year);
    const incomeCents = untaxed.reduce((s, t) => s + cents(t.amount), 0);
    const reservedCents = untaxed.reduce((s, t) => s + cents(t.taxDelta || 0), 0);
    const owedCents = Math.round(incomeCents * rate / 100);
    const deadlines = [`${year}-01-15`, `${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${Number(year) + 1}-01-15`];
    const today = localDate();
    const nextDeadline = deadlines.find(d => d >= today) || null;
    return { year, rate, income: dollars(incomeCents), reserved: dollars(reservedCents), owed: dollars(owedCents),
      remaining: dollars(Math.max(0, owedCents - reservedCents)),
      nextDeadline, daysUntil: nextDeadline ? daysBetween(today, nextDeadline) : null };
  }
  // Merchant-to-category memory (roadmap #3): remember the category and account
  // used for each merchant so future transactions can pre-fill them. Learned
  // automatically on save; transfers are skipped because their category is structural.
  // Merchant name cleanup (roadmap #31): strip payment-processor noise
  // ("SQ *", "TST*", "SP *", trailing store numbers) so the same merchant
  // always maps to one key.
  function merchantKey(value) {
    let s = String(value == null ? '' : value).toLowerCase();
    s = s.replace(/^(sq|sp|tst|pp|int)\s*\*\s*/i, '');   // processor prefixes
    s = s.replace(/\s*\*\s*/g, ' ');
    s = s.replace(/\s#?\d{2,}\s*$/,'');                  // trailing store/terminal ids
    s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80);
    return s;
  }
  function learnMerchant(state, t) {
    if (!t || t.type === 'transfer') return;
    const key = merchantKey(t.label);
    if (!key) return;
    const mem = state.merchantMemory || (state.merchantMemory = {});
    const prior = mem[key];
    mem[key] = { label: String(t.label).trim().slice(0, 80), category: t.category, accountId: t.accountId, uses: ((prior && prior.uses) || 0) + 1 };
    const keys = Object.keys(mem);
    if (keys.length > 500) delete mem[keys[0]];
  }
  function suggestMerchant(state, value) {
    const key = merchantKey(value);
    const hit = key && state.merchantMemory && state.merchantMemory[key];
    if (!hit) return null;
    let accountId = hit.accountId;
    try { accountId = accountById(state, accountId).id; } catch (e) { accountId = state.accounts && state.accounts.length ? state.accounts[0].id : ''; }
    return { category: hit.category, accountId };
  }
  function clearMerchantMemory(state) { state.merchantMemory = {}; }
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
    if (!x || !['income','fixed','flexible','occasional'].includes(x.bucket) || !validDate(x.start + '-01')) throw Error('Choose a valid budget bucket and start month.');
    return {id:x.id, category:label(x.category), amount:number(x.amount), bucket:x.bucket, start:x.start, rollover:x.rollover === true};
  }
  function budgetSummary(state, month = localDate().slice(0,7)) {
    if (!validDate(month + '-01')) throw Error('Choose a valid month.');
    // Refund linking (roadmap #36): linked refunds net against the original
    // purchase's category in the month the refund is recorded.
    const refundCategory = t => { const o = refundTarget(state, t); return (o ? o.category : t.category).toLowerCase(); };
    const netSpent = (cat, when) => {
      let s = 0;
      (state.transactions || []).forEach(t => {
        if (!when(t)) return;
        if (t.type === 'expense' && t.category.toLowerCase() === cat) s += cents(t.amount);
        else if (t.type === 'income' && t.refundOf && refundCategory(t) === cat) s -= cents(t.amount);
      });
      return s;
    };
    const rows = (state.budgets || []).filter(b => b.start <= month && b.bucket !== 'income').map(b => {
      const cat = b.category.toLowerCase();
      const spent = netSpent(cat, t => t.date.slice(0,7) === month);
      const months = (Number(month.slice(0,4))-Number(b.start.slice(0,4)))*12 + Number(month.slice(5))-Number(b.start.slice(5));
      const prior = netSpent(cat, t => { const m = t.date.slice(0,7); return m >= b.start && m < month; });
      const carry = b.rollover ? months*cents(b.amount)-prior : 0;
      return {...b, spent:dollars(spent), carry:dollars(carry), available:dollars(cents(b.amount)+carry), remaining:dollars(cents(b.amount)+carry-spent)};
    });
    const budgeted = new Set(rows.map(b => b.category.toLowerCase()));
    let unbudgeted = 0;
    (state.transactions || []).forEach(t => {
      if (t.date.slice(0,7) !== month) return;
      const cat = t.type === 'income' && t.refundOf ? refundCategory(t) : t.category.toLowerCase();
      if (budgeted.has(cat)) return;
      if (t.type === 'expense') unbudgeted += cents(t.amount);
      else if (t.type === 'income' && t.refundOf) unbudgeted -= cents(t.amount);
    });
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
  // Auto-detect transfers on import (roadmap #32): an expense row and an
  // income row for the same amount across different accounts within 3 days
  // is usually one transfer recorded twice.
  function detectTransferPairs(rows) {
    const used = new Set(), pairs = [];
    rows.forEach((r, i) => {
      if (used.has(i) || r.transaction.type !== 'expense') return;
      const amt = cents(r.transaction.amount);
      const j = rows.findIndex((s, k) => k !== i && !used.has(k) && s.transaction.type === 'income' &&
        cents(s.transaction.amount) === amt && s.transaction.accountId !== r.transaction.accountId &&
        Math.abs(daysBetween(r.transaction.date, s.transaction.date)) <= 3);
      if (j < 0) return;
      used.add(i); used.add(j);
      const id = 'pair-' + pairs.length;
      r.transferPair = id; rows[j].transferPair = id;
      pairs.push({ id, expense: i, income: j, amount: r.transaction.amount,
        date: r.transaction.date <= rows[j].transaction.date ? r.transaction.date : rows[j].transaction.date,
        fromAccount: r.transaction.accountId, toAccount: rows[j].transaction.accountId,
        label: r.transaction.label || 'Transfer' });
    });
    return pairs;
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
    const out = rows.map((r,i)=>{
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
    out.transferPairs = detectTransferPairs(out);
    return out;
  }
  function exportCSV(state) {
    const quote=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,match=>"'"+match).replace(/"/g,'""')+'"';
    const rows=[['date','description','amount','type','category','account','to_account']];
    state.transactions.forEach(t=>rows.push([t.date,t.label,t.amount.toFixed(2),t.type,t.category,accountById(state,t.accountId).label,t.type==='transfer'?accountById(state,t.toAccountId).label:'']));
    return rows.map(r=>r.map(quote).join(',')).join('\r\n');
  }

  function holding(x) {
    const quantity=Number(x.quantity);
    if(!Number.isFinite(quantity)||quantity<0.000001||quantity>1000000)throw Error('Enter a quantity above zero, up to 1,000,000.');
    if(!['stock','bond','fund','crypto','other'].includes(x.assetClass))throw Error('Choose an asset class.');
    const price=number(x.price),cost=number(x.cost);
    number(quantity*price);number(quantity*cost);
    return {id:x.id,label:label(x.label),symbol:label(x.symbol).toUpperCase(),assetClass:x.assetClass,quantity:Math.round(quantity*1000000)/1000000,price,cost,updated:validDate(x.updated)?x.updated:localDate()};
  }
  function portfolio(state) {
    const rows=(state.holdings||[]).map(h=>({...h,value:number(h.quantity*h.price),basis:number(h.quantity*h.cost)}));
    const value=number(dollars(rows.reduce((s,h)=>s+cents(h.value),0))),basis=number(dollars(rows.reduce((s,h)=>s+cents(h.basis),0)));
    return {value,basis,gain:dollars(cents(value)-cents(basis)),rows:rows.map(h=>({...h,gain:dollars(cents(h.value)-cents(h.basis)),weight:value?h.value/value*100:0}))};
  }
  function saveHolding(state,input) {
    const h=holding(input),next=[...(state.holdings||[])],i=next.findIndex(x=>x.id===h.id);if(i<0)next.push(h);else next[i]=h;
    portfolio({...state,holdings:next});state.holdings=next;
  }
  function netWorth(state) {return number(dollars(cents(state.profile.balance)+cents(portfolio(state).value)),-MAX);}
  function snapshot(state,date=localDate()) {
    if(!validDate(date))throw Error('Invalid snapshot date.');
    const entry={date,value:netWorth(state),investments:portfolio(state).value};
    const history=state.balanceHistory||[],last=history[history.length-1];
    if(last && last.date!==date && last.value===entry.value && last.investments===entry.investments)return;
    state.balanceHistory=history.filter(x=>x.date!==date).concat(entry).sort((a,b)=>a.date.localeCompare(b.date)).slice(-10000);
  }
  // Subscription detector (roadmap #22): find charges that repeat on a
  // weekly/biweekly/monthly/yearly rhythm in the last 12 months of recorded
  // expenses, flag price increases, and suggest the next bill date.
  function detectSubscriptions(state, today = localDate()) {
    if (!validDate(today)) throw Error('Enter a valid calendar date.');
    const since = addDays(today, -365);
    const groups = new Map();
    (state.transactions || []).filter(t => t.type === 'expense' && t.date >= since && t.date <= today).forEach(t => {
      const key = merchantKey(t.label);
      if (!key) return;
      const g = groups.get(key) || { key, label: t.label, category: t.category, entries: [] };
      g.entries.push({ date: t.date, amount: t.amount });
      groups.set(key, g);
    });
    const planned = new Set((state.bills || []).map(b => merchantKey(b.label)));
    const cycles = [[7, 'weekly'], [14, 'biweekly'], [30, 'monthly'], [365, 'yearly']];
    const out = [];
    groups.forEach(g => {
      if (g.entries.length < 3) return;
      const entries = [...g.entries].sort((a, b) => a.date.localeCompare(b.date));
      const gaps = [];
      for (let i = 1; i < entries.length; i++) gaps.push(daysBetween(entries[i - 1].date, entries[i].date));
      const sorted = [...gaps].sort((a, b) => a - b), mid = sorted.length >> 1;
      const med = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      const cycle = cycles.find(([days]) => Math.abs(med - days) <= Math.max(2, Math.round(days * 0.12)));
      if (!cycle) return;
      const tol = Math.max(2, Math.round(cycle[0] * 0.2));
      if (gaps.filter(gp => Math.abs(gp - cycle[0]) <= tol).length < gaps.length * 0.6) return;
      const amounts = entries.map(e => e.amount).sort((a, b) => a - b);
      const typical = amounts[amounts.length >> 1];
      const first = entries[0].amount, last = entries[entries.length - 1].amount;
      out.push({
        label: g.label, category: g.category, count: entries.length,
        cycle: cycle[1], intervalDays: cycle[0], amount: typical,
        lastDate: entries[entries.length - 1].date,
        nextDate: addDays(entries[entries.length - 1].date, cycle[0]),
        priceUp: last > first * 1.05,
        alreadyPlanned: planned.has(g.key),
      });
    });
    return out.sort((a, b) => b.amount - a.amount);
  }
  // Variable bill estimates (roadmap #26): average the last 3 recorded
  // expenses for the same merchant (last 12 months). Returns null when
  // there is no history to learn from.
  function estimateBillAmount(state, label, today = localDate()) {
    const key = merchantKey(label);
    if (!key || !validDate(today)) return null;
    const since = addDays(today, -365);
    const amounts = (state.transactions || [])
      .filter(t => t.type === 'expense' && t.date >= since && t.date <= today && merchantKey(t.label) === key)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map(t => cents(t.amount));
    if (!amounts.length) return null;
    return dollars(amounts.reduce((s, a) => s + a, 0) / amounts.length);
  }
  // Monthly history helpers (roadmap #13, #66): recorded income/expense
  // totals per full calendar month, most recent last.
  function monthlyTotals(state, today = localDate(), monthsBack = 6) {
    if (!validDate(today)) throw Error('Enter a valid calendar date.');
    number(monthsBack, 1, 60);
    const [y, m] = today.split('-').map(Number);
    const out = [];
    for (let i = monthsBack; i >= 1; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      out.push({ month: d.toISOString().slice(0, 7), income: 0, expense: 0 });
    }
    const byMonth = Object.fromEntries(out.map(o => [o.month, o]));
    (state.transactions || []).forEach(t => {
      if (t.type === 'transfer') return;
      const row = byMonth[t.date.slice(0, 7)];
      if (!row) return;
      if (t.type === 'income') row.income = dollars(cents(row.income) + cents(t.amount));
      else row.expense = dollars(cents(row.expense) + cents(t.amount));
    });
    return out;
  }
  function avgMonthly(state, kind, today = localDate(), monthsBack = 3) {
    const vals = monthlyTotals(state, today, monthsBack).map(r => r[kind]).filter(v => v > 0);
    if (!vals.length) return 0;
    return dollars(vals.reduce((s, v) => s + cents(v), 0) / vals.length);
  }
  // Income variability (roadmap #66): min/avg/max recorded monthly income.
  // Null until at least 2 months of income history exist.
  function incomeVariability(state, today = localDate(), monthsBack = 6) {
    const incomes = monthlyTotals(state, today, monthsBack).map(r => r.income).filter(v => v > 0);
    if (incomes.length < 2) return null;
    const min = Math.min(...incomes), max = Math.max(...incomes);
    return { min, max, avg: dollars(incomes.reduce((s, v) => s + cents(v), 0) / incomes.length), months: incomes.length };
  }
  // Forecast range (roadmap #66): what the 30-day ending cash looks like if
  // the next 30 days earn like your worst/best recorded month instead of
  // the plan. Null range until incomeVariability() has data.
  function forecastRange(state, today = localDate()) {
    const m = forecast(state, today);
    const v = incomeVariability(state, today);
    if (!v) return {...m, range: null};
    const income30 = m.timeline.filter(e => e.kind === 'incomes').reduce((s, e) => s + cents(e.amount), 0);
    const base = cents(m.endBalance);
    return {...m, range: {
      worst: dollars(base - income30 + cents(v.min)),
      expected: m.endBalance,
      best: dollars(base - income30 + cents(v.max)),
      variability: v,
    }};
  }
  // Low-season runway (roadmap #13): how long spendable cash lasts at a
  // chosen monthly income vs spending. `months: null` means indefinite.
  function runway(state, monthlyIncome, monthlySpending) {
    monthlyIncome = number(monthlyIncome, 0); monthlySpending = number(monthlySpending, 0);
    const cash = dollars(cents(state.profile.balance) - reservesCents(state));
    const burn = dollars(cents(monthlySpending) - cents(monthlyIncome));
    if (burn <= 0) return { cash, monthlyIncome, monthlySpending, burn: 0, months: null, weeks: null, indefinite: true };
    const months = Math.max(0, cash) / burn;
    return { cash, monthlyIncome, monthlySpending, burn, months, weeks: months * 4.345, indefinite: false };
  }
  function cashFlow(state,start,end,accountId='all',groupBy='category') {
    if(!validDate(start)||!validDate(end)||end<start)throw Error('Choose a valid date range.');
    if(!['category','merchant'].includes(groupBy))throw Error('Choose a valid grouping.');
    const rows=state.transactions.filter(t=>t.type!=='transfer'&&t.date>=start&&t.date<=end&&(accountId==='all'||t.accountId===accountId));
    // Refund linking (roadmap #36): linked refunds are excluded from income
    // and netted against the original purchase's category or merchant, so
    // category spending shows what you actually kept.
    const refunds=rows.filter(t=>t.type==='income'&&t.refundOf);
    const refundName=t=>{const o=refundTarget(state,t);return groupBy==='merchant'?(o?o.label:t.label):(o?o.category:t.category);};
    const groups=type=>{const m=new Map();
      rows.filter(t=>t.type===type&&!t.refundOf).forEach(t=>{const name=groupBy==='merchant'?t.label:t.category,key=name.toLowerCase(),g=m.get(key)||{label:name,amount:0};g.amount+=cents(t.amount);m.set(key,g);});
      if(type==='expense')refunds.forEach(t=>{const name=refundName(t),key=name.toLowerCase(),g=m.get(key);if(g)g.amount-=cents(t.amount);else m.set(key,{label:name,amount:-cents(t.amount)});});
      return [...m.values()].map(g=>({...g,amount:dollars(g.amount)})).sort((a,b)=>b.amount-a.amount);};
    const incomes=groups('income'),expenses=groups('expense'),total=items=>dollars(items.reduce((s,x)=>s+cents(x.amount),0)),income=total(incomes),expense=total(expenses),net=dollars(cents(income)-cents(expense));
    return {rows,incomes,expenses,income,expense,net,rate:income?net/income*100:null};
  }
  // Read-only view model: both sides of the Sankey balance to the cent.
  function cashFlowSankey(report) {
    const sum = items => items.reduce((total, item) => total + item.cents, 0);
    const entries = items => items.map(item => ({label:item.label,cents:cents(item.amount)})).filter(item => item.cents > 0);
    const incomes = entries(report.incomes), expenses = entries(report.expenses);
    const incomeCents = sum(incomes), expenseCents = sum(expenses);
    const group = (items, total, limit, kind) => {
      const visible = [], other = [];
      // A named Other category shares one bucket with small/overflow groups.
      [...items].sort((a,b) => b.cents-a.cents || a.label.localeCompare(b.label)).forEach(item => {
        if (item.label.trim().toLowerCase() === 'other' || item.cents * 100 < total * 3 || visible.length >= limit) other.push(item);
        else visible.push({label:item.label,cents:item.cents,kind,members:[item],grouped:false});
      });
      if (other.length) visible.push({label:'Other',cents:sum(other),kind,members:other,grouped:true});
      return visible;
    };
    const incoming = group(incomes,incomeCents,5,'income');
    const outgoing = group(expenses,expenseCents,6,'expense');
    const savedCents = Math.max(0,incomeCents-expenseCents), gapCents = Math.max(0,expenseCents-incomeCents);
    if (gapCents) incoming.push({label:'Funding gap',cents:gapCents,kind:'gap',members:[],grouped:false});
    if (savedCents) outgoing.push({label:'Saved',cents:savedCents,kind:'saved',members:[],grouped:false});
    return {incoming,outgoing,incomeCents,expenseCents,savedCents,gapCents,totalCents:Math.max(incomeCents,expenseCents)};
  }
  function forecastOptions(x={}) {
    const years=Number(x.years===undefined?10:x.years);
    if(!Number.isInteger(years)||years<1||years>40)throw Error('Choose 1–40 years.');
    return {years,monthlyIncome:number(x.monthlyIncome||0),monthlyExpense:number(x.monthlyExpense||0),growth:number(x.growth||0,-20,20)};
  }
  function lifeEvent(x) {
    if(!validDate(x.month+'-01')||!['once','monthly'].includes(x.repeat))throw Error('Choose a valid event month and frequency.');
    const amount=number(x.amount,-MAX);if(!amount)throw Error('Enter a nonzero change.');
    return {id:x.id,label:label(x.label),month:x.month,amount,repeat:x.repeat};
  }
  function projectWealth(state,options=state.forecastSettings,today=localDate()) {
    const o=forecastOptions(options),start=netWorth(state),[year,month]=today.split('-').map(Number),rate=Math.pow(1+o.growth/100,1/12)-1;
    let value=start,base=start;const rows=[{month:today.slice(0,7),value:base,baseline:base}];
    for(let i=1;i<=o.years*12;i++) {
      const m=new Date(Date.UTC(year,month-1+i,1)).toISOString().slice(0,7);
      const change=dollars((state.lifeEvents||[]).filter(e=>e.month===m||(e.repeat==='monthly'&&e.month<m)).reduce((s,e)=>s+cents(e.amount),0));
      base=number(base+Math.max(0,base)*rate+o.monthlyIncome-o.monthlyExpense,-MAX);
      value=number(value+Math.max(0,value)*rate+o.monthlyIncome-o.monthlyExpense+change,-MAX);
      rows.push({month:m,value,baseline:base});
    }
    return rows;
  }

  function walletData(raw={}) {
    if(!raw || typeof raw!=='object')throw Error('Invalid Wallet settings.');
    const clean=x=>{if(!x||!/^[a-f0-9]{64}$/.test(x.id)||!/^[a-f0-9]{64}$/.test(x.revision)||!Number.isFinite(x.postedAt)||x.postedAt<=0)throw Error('Invalid Wallet notification.');return {id:x.id,revision:x.revision,postedAt:x.postedAt,title:String(x.title||'').slice(0,2000),text:String(x.text||'').slice(0,2000),reason:String(x.reason||'').slice(0,200)};};
    const inbox=list(raw.inbox).map(clean);if(inbox.length>200)throw Error('Wallet review inbox is full.');
    const receipts=list(raw.receipts).map(x=>{if(!x||!/^[a-f0-9]{64}$/.test(x.id)||!/^[a-f0-9]{64}$/.test(x.revision))throw Error('Invalid Wallet receipt.');return {id:x.id,revision:x.revision};});
    return {accountId:typeof raw.accountId==='string'?raw.accountId:'',adjust:raw.adjust!==false,auto:raw.auto!==false,inbox,receipts};
  }
  function parseWallet(item) {
    const title=String(item.title||'').trim(),body=String(item.text||'').trim(),text=[title,body].filter(Boolean).join('\n');
    const date=localDate(new Date(item.postedAt));
    const result={date,label:'',amount:null,type:'expense',reason:'',safe:false,ignore:false};
    if(!text || (!/[\$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD|paid|payment|purchase|transaction|charged|spent|refund|declined)\b/i.test(text)))return {...result,ignore:true};
    if(/[€£¥₹]|\b(?:EUR|GBP|CAD|AUD|NZD|SGD|HKD|INR|JPY|CNY|CHF|MXN|BRL|KRW)\b|(?:CA?|AU?|NZ|SG|HK)\$/i.test(text))return {...result,reason:'Currency is not clearly USD. Enter the USD amount yourself.'};
    const hits=[...text.matchAll(/(?:US\$|USD\s*\$?|\$)\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*USD\b/gi)];
    const amounts=hits.map(m=>{const s=(m[1]||m[2]).replace(/[.,]$/,'');return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s)?Number(s.replace(/,/g,'')):NaN;});
    const unique=[...new Set(amounts)];
    if(unique.length!==1||!Number.isFinite(unique[0])||unique[0]<=0||unique[0]>1000000000)return {...result,reason:'Could not identify one positive USD purchase amount.'};
    result.amount=number(unique[0]);
    if(/\b(refund|refunded|reversed|reversal|declined|failed|cancelled|canceled|unsuccessful|pending|request|verification|verify|cashback|reward|offer|discount|save up to|balance|bill due|coupon|gift card)\b|[-−]\s*(?:US\$|USD\s*\$?|\$)|(?:US\$|USD\s*\$?|\$)\s*[-−]/i.test(text))return {...result,type:/\brefund(?:ed)?\b/i.test(text)?'income':'expense',reason:'This may be a refund, pending payment, failed purchase, or non-purchase notice.'};
    const amountPattern='(?:US\\$|USD\\s*\\$?|\\$)\\s*[0-9][0-9.,]*(?:\\s*USD)?';
    const explicit=new RegExp('(?:you\\s+)?(?:paid|spent|purchase(?:d)?(?:\\s+of)?|payment(?:\\s+of)?)?\\s*'+amountPattern+'\\s+(?:at|to)\\s+([^\\n]+)','i').exec(text);
    if(explicit)result.label=explicit[1].replace(/\s+(?:with|using|on)\s+(?:your\s+)?(?:Visa|Mastercard|Amex|American Express|Discover|card)\b.*$/i,'').trim().replace(/[.!]$/,'');
    // A merchant title plus a currency-led card payment body is another common Wallet layout.
    else if(title && /[a-z]/i.test(title) && !/[$€£¥₹]|\b(?:google|wallet|pay|payment|purchase|transaction|notification|card)\b/i.test(title)
      && new RegExp('^(?:you\\s+(?:paid|spent)\\s+)?'+amountPattern+'(?:\\s|$)','i').test(body)
      && /\b(?:paid|spent|with|using|Visa|Mastercard|Amex|Discover)\b/i.test(body))result.label=title;
    if(!result.label||result.label.length>80)return {...result,label:'',reason:'Confirm the merchant from the notification.'};
    const purchaseWords=/\b(?:paid|spent|purchased?|payment|charged)\b/i.test(text),currencyLed=new RegExp('^(?:(?:Google Wallet|Google Pay)\\n)?'+amountPattern+'\\s+(?:at|to)\\s+','i').test(text);
    if(explicit&&!purchaseWords&&!currencyLed)return {...result,reason:'Confirm this is a completed purchase.'};
    if(!validDate(date)||date>localDate())return {...result,reason:'Confirm the transaction date.'};
    return {...result,safe:true};
  }
  function receiveWallet(state,items,allowAuto=true) {
    state.wallet=walletData(state.wallet);const w=state.wallet,ack=[];let added=0,reviewed=0;
    for(const raw of items.slice(0,200)) {
      const item=walletData({inbox:[raw]}).inbox[0];
      if(w.receipts.some(r=>r.id===item.id&&r.revision===item.revision)){ack.push(item);continue;}
      if(w.inbox.some(r=>r.id===item.id&&r.revision===item.revision)){ack.push(item);continue;}
      const existing=state.transactions.find(t=>t.walletId===item.id),seen=w.receipts.some(r=>r.id===item.id);
      const parsed=parseWallet(item);
      if(parsed.ignore&&!existing&&!seen) {if(w.receipts.length>=10000)break;w.receipts.push({id:item.id,revision:item.revision});ack.push(item);continue;}
      let reason=parsed.reason;
      const matching=state.transactions.some(t=>t.type===parsed.type&&t.date===parsed.date&&cents(t.amount)===cents(parsed.amount)&&t.label.toLowerCase()===parsed.label.toLowerCase());
      if(existing||seen)reason='An earlier version of this notification was already handled. Confirm any change.';
      else if(matching)reason='A matching merchant, amount, and date is already in transactions. Check for a duplicate.';
      else if(!state.accounts.some(a=>a.id===w.accountId))reason='Choose an account for this purchase.';
      else if(Date.now()-item.postedAt>7*86400000)reason='This notification is over a week old. Check its date and balance adjustment.';
      else if(!allowAuto||!w.auto)reason=reason||'Automatic insertion is off. Review this purchase.';
      if(w.receipts.length>=10000)break;
      if(parsed.safe&&!reason&&!state.demo) {
        try {saveTransaction(state,{id:'wallet-'+item.id,walletId:item.id,walletRevision:item.revision,label:parsed.label,amount:parsed.amount,type:'expense',date:parsed.date,accountId:w.accountId,category:'Other',adjust:w.adjust});w.receipts.push({id:item.id,revision:item.revision});added++;}
        catch(e){reason='Could not apply this purchase: '+e.message;}
      }
      if(reason||!parsed.safe||state.demo) {
        if(w.inbox.length>=200&&!w.inbox.some(x=>x.id===item.id))break;
        w.inbox=w.inbox.filter(x=>x.id!==item.id);w.inbox.push({...item,reason:reason||'Review purchase details.'});reviewed++;
      }
      ack.push(item);
    }
    return {ack:ack.map(x=>({id:x.id,revision:x.revision})),added,reviewed};
  }
  function resolveWallet(state,id,input) {
    const w=state.wallet,item=w.inbox.find(x=>x.id===id);if(!item)throw Error('This notification is no longer pending.');
    if(w.receipts.length>=10000)throw Error('Wallet receipt history is full. Export your backup before clearing your plan.');
    if(input){const old=state.transactions.find(t=>t.walletId===id);if(!validDate(input.date)||input.date>localDate())throw Error('Choose a valid transaction date.');if(!['expense','income'].includes(input.type))throw Error('Choose purchase or refund.');saveTransaction(state,{...input,id:old?old.id:'wallet-'+id,walletId:id,walletRevision:item.revision});}
    w.receipts.push({id:item.id,revision:item.revision});w.inbox=w.inbox.filter(x=>x.id!==id);
  }

  // CSV + notification merge/reconcile (roadmap #4): match CSV rows against
  // wallet notification inbox by amount, then date within ±3 days, then
  // fuzzy merchant. Returns [{row, match}] where match is the inbox item.
  function reconcileCSV(state, csvRows) {
    const inbox = (state.wallet && state.wallet.inbox) || [];
    const used = new Set();
    return csvRows.map(row => {
      const t = row.transaction;
      let best = null;
      for (const item of inbox) {
        if (used.has(item.id)) continue;
        const parsed = parseWallet(item);
        if (!parsed.amount || parsed.ignore) continue;
        if (cents(parsed.amount) !== cents(t.amount)) continue;
        if (Math.abs(daysBetween(parsed.date, t.date)) > 3) continue;
        const pk = merchantKey(parsed.label || ''), tk = merchantKey(t.label || '');
        if (pk && tk && (pk === tk || pk.includes(tk) || tk.includes(pk))) { best = item; break; }
      }
      if (best) used.add(best.id);
      return { row, match: best };
    });
  }
  function csvInboxId(t) {
    const s = [t.date, t.label, t.amount, t.type, t.accountId].join('|');
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < s.length; i++) { a = (a * 31 + s.charCodeAt(i)) >>> 0; b = (b * 37 + s.charCodeAt(i)) >>> 0; }
    let out = '';
    while (out.length < 64) {
      a = (a * 1103515245 + 12345) >>> 0; b = (b * 1103515245 + 12345) >>> 0;
      out += a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
    }
    return out.slice(0, 64);
  }
  // Apply reconciliation: matched rows merge (CSV wins on amount/name,
  // user's existing category preserved); unmatched rows go to the inbox
  // as "missed by notifications". Returns {matched, missed}.
  function applyReconciliation(state, reconciled) {
    let matched = 0, missed = 0;
    const w = state.wallet;
    reconciled.forEach(({ row, match }) => {
      const t = row.transaction;
      if (match) {
        matched++;
        const existing = state.transactions.find(x => x.walletId === match.id);
        const category = existing ? existing.category : t.category;
        w.inbox = w.inbox.filter(x => x.id !== match.id);
        w.receipts.push({ id: match.id, revision: match.revision });
        saveTransaction(state, { ...t, id: 'wallet-' + match.id.slice(0, 16), category, walletId: match.id, walletRevision: match.revision });
      } else {
        missed++;
        const id = csvInboxId(t);
        if (!w.inbox.some(x => x.id === id) && w.inbox.length < 200) {
          w.inbox.push({ id, revision: id, postedAt: Date.now(), title: t.label,
            text: `${t.type === 'income' ? '+' : '-'}$${t.amount} on ${t.date} · ${t.label}`,
            reason: 'Missed by notifications — from CSV import.' });
        }
      }
    });
    return { matched, missed };
  }
  // Move money between budget categories (roadmap #44): reallocate
  // budget amounts mid-month with visible history.
  function moveBudget(state, fromCategory, toCategory, amount) {
    amount = number(amount, 0.01);
    fromCategory = label(fromCategory); toCategory = label(toCategory);
    if (fromCategory.toLowerCase() === toCategory.toLowerCase()) throw Error('Choose two different categories.');
    const from = state.budgets.find(b => b.category.toLowerCase() === fromCategory.toLowerCase() && b.bucket !== 'income');
    const to = state.budgets.find(b => b.category.toLowerCase() === toCategory.toLowerCase() && b.bucket !== 'income');
    if (!from || !to) throw Error('Both categories need budgets.');
    if (cents(from.amount) < cents(amount)) throw Error(`${from.category} only has ${from.amount} budgeted.`);
    from.amount = dollars(cents(from.amount) - cents(amount));
    to.amount = dollars(cents(to.amount) + cents(amount));
    state.budgetMoves = state.budgetMoves || [];
    state.budgetMoves.push({ id: 'move-' + Date.now(), date: localDate(), from: from.category, to: to.category, amount });
    return state;
  }
  const api = { walletData, parseWallet, receiveWallet, resolveWallet, reconcileCSV, applyReconciliation, moveBudget, number, cents, dollars, localDate, validDate, daysBetween, addDays, label, blank, normalize, demo, forecast, settle, netCents, reservesCents, repeat, nextDate, expand, transaction, saveTransaction, removeTransaction, splitTransaction, findDuplicates, mergeDuplicates,
  makeRule, matchRule, applyRules, previewRule, applyRule, refundTarget,
  emergencyFund, reimbursableSummary, markReimbursed, detectTransferPairs, taxSetAside,
  paycheckEstimate, incomeSmoothing, gigIncomeStats, topMerchants, savingsRate,
  spendingTrends, monthOverMonth, insights, monthlyReview,
  budgetAlerts, payPeriod, periodSpent, payPeriodBudget, incomeStreams, merchantKey, learnMerchant, suggestMerchant, clearMerchantMemory, detectSubscriptions, estimateBillAmount,
    monthlyTotals, avgMonthly, incomeVariability, forecastRange, runway, budget, budgetSummary, ensureAccounts, accountById, syncBalance, saveAccount, removeAccount, contribute, spendingReport, parseCSV, previewCSV, exportCSV, holding, portfolio, saveHolding, netWorth, snapshot, cashFlow, cashFlowSankey, forecastOptions, lifeEvent, projectWealth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CashCore = api;
})(typeof window === 'undefined' ? globalThis : window);
