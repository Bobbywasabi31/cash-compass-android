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
    return { version: 3, demo: false, profile: { name: 'there', balance: 0, hourlyRate: 0, taxRate: 0, buffer: 0, taxHeld: 0 }, incomes: [], bills: [], goals: [], transactions: [], budgets: [] };
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('This is not a Cash Compass backup.');
    const p = raw.profile || { name: raw.name, balance: raw.balance, hourlyRate: raw.rate, taxRate: raw.tax };
    const result = blank();
    result.demo = raw.demo === true;
    result.profile = { name: label(p.name), balance: number(p.balance, -MAX), hourlyRate: number(p.hourlyRate), taxRate: number(p.taxRate, 0, 100), buffer: number(p.buffer || 0), taxHeld: number(p.taxHeld || 0) };
    ['incomes', 'bills', 'goals'].forEach(kind => {
      if (!Array.isArray(raw[kind]) || raw[kind].length > 10000) throw Error('Invalid ' + kind + ' list.');
      result[kind] = raw[kind].map((item, index) => {
        if (!item || typeof item !== 'object') throw Error('Invalid plan item.');
        // Rebuild IDs when importing; never interpolate untrusted identifiers into HTML.
        const out = { id: kind + '-' + index, label: label(item.label) };
        if (kind === 'goals') {
          out.target = number(item.target, 0.01); out.saved = number(item.saved); out.monthly = number(item.monthly || 0);
        } else {
          if (!validDate(item.date)) throw Error('A plan item has an invalid date.');
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
    if (!x || !['expense','income'].includes(x.type) || !validDate(x.date)) throw Error('Enter a valid transaction type and date.');
    const amount = number(x.amount, 0.01);
    const delta = x.delta === undefined ? (x.adjust === false ? 0 : (x.type === 'expense' ? -amount : amount)) : number(x.delta, -MAX);
    if (delta !== 0 && cents(delta) !== cents(x.type === 'expense' ? -amount : amount)) throw Error('Invalid cash adjustment.');
    const taxDelta = number(x.taxDelta || 0);
    if (taxDelta > amount || (taxDelta && (x.type !== 'income' || !delta))) throw Error('Invalid tax reserve adjustment.');
    return {id:x.id, label:label(x.label), amount, date:x.date, type:x.type, category:label(x.category || (x.type === 'income' ? 'Income' : 'Other')), delta, taxDelta};
  }
  function saveTransaction(state, input) {
    const t = transaction(input);
    const old = state.transactions.find(x => x.id === t.id);
    const balance = number(dollars(cents(state.profile.balance) - cents(old ? old.delta : 0) + cents(t.delta)), -MAX);
    const tax = dollars(cents(state.profile.taxHeld) - cents(old ? old.taxDelta : 0) + cents(t.taxDelta));
    if (tax < 0) throw Error('This entry reserved taxes that were since changed. Reconcile your tax reserve first.');
    state.profile.balance = balance; state.profile.taxHeld = number(tax);
    if (old) state.transactions[state.transactions.indexOf(old)] = t; else state.transactions.push(t);
    return state;
  }
  function removeTransaction(state, id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) throw Error('Transaction not found.');
    const balance = number(dollars(cents(state.profile.balance) - cents(t.delta)), -MAX);
    const tax = dollars(cents(state.profile.taxHeld) - cents(t.taxDelta));
    if (tax < 0) throw Error('Reconcile your tax reserve before removing this income.');
    state.profile.balance = balance; state.profile.taxHeld = number(tax);
    state.transactions = state.transactions.filter(x => x.id !== id);
  }
  function settle(state, kind, id, adjustBalance = true, today = localDate()) {
    if (kind !== 'incomes' && kind !== 'bills') throw Error('Invalid entry type.');
    const index = state[kind].findIndex(x => x.id === id);
    if (index < 0) throw Error('That entry no longer exists.');
    const item = state[kind][index];
    const date = nextDate(item);
    state.transactions = state.transactions || [];
    saveTransaction(state, {id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2), label:item.label || 'Payment', amount:item.amount, date:today, type:kind === 'bills' ? 'expense' : 'income', category:item.category, adjust:adjustBalance,
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

  const api = { number, cents, dollars, localDate, validDate, daysBetween, addDays, label, blank, normalize, demo, forecast, settle, netCents, reservesCents, repeat, nextDate, expand, transaction, saveTransaction, removeTransaction, budget, budgetSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CashCore = api;
})(typeof window === 'undefined' ? globalThis : window);
