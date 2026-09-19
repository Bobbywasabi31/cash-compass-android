/* Offline interface. The coach explains calculations; it is not a connected AI model. */
'use strict';
const C = CashCore, STORE = 'cash-compass-v2';
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const uid = () => 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
let tab = 'home', dialog = null, hours = 12, reply = '', storageError = '', storageBlocked = false, toastTimer;
let state = C.blank();
try {
  const stored = localStorage.getItem(STORE) || localStorage.getItem('cash-compass-v1');
  if (stored) state = C.normalize(JSON.parse(stored));
} catch (e) { storageError = 'Saved data could not be read. Your original data has been kept. Restore a valid backup from You to continue.'; storageBlocked = true; }
const app = document.getElementById('app');
function persist(next, recovery = false) {
  if (storageBlocked && !recovery) throw Error(storageError);
  try { localStorage.setItem(STORE, JSON.stringify(next)); }
  catch (e) { throw Error('Could not save to this device. No changes were applied. Copy your backup from You before closing.'); }
  state = next; storageError = ''; storageBlocked = false;
}
function update(fn) { const next = JSON.parse(JSON.stringify(state)); fn(next); persist(next); reply = ''; }
function flash(text) { const el = document.getElementById('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500); }
function field(name, title, value = '', type = 'text', extra = '') {
  return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
}
const amountField = (name, title, value = 0, min = 0) => field(name, title, value, 'number', `min="${min}" max="1000000000" step="0.01" inputmode="decimal"`);
function header(title, subtitle) {
  return `<header class="topbar"><div class="brand"><div class="mark">↗</div><div class="brand-name">cash compass<small>cash-flow coach</small></div></div><button class="icon-btn" data-tab="profile" aria-label="Your settings">◌</button></header>${state.demo ? '<div class="notice">Sample plan · these are example numbers. <button class="text-btn" data-action="fresh">Start my own plan</button></div>' : ''}${storageError ? `<div role="alert" class="notice danger">${esc(storageError)}</div>` : ''}<h1 class="page-title">${title}</h1><p class="subhead">${subtitle}</p>`;
}
function nav() { return `<nav class="nav" aria-label="Main navigation">${[['home', '⌂', 'Today'], ['plan', '▦', 'Plan'], ['transactions', '≡', 'Activity'], ['budgets', '◎', 'Budget'], ['profile', '◌', 'You']].map(([key, icon, title]) => `<button data-tab="${key}" ${key === tab ? 'class="active" aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</button>`).join('')}</nav>`; }
function warnings(m) {
  return `${m.overdue.length ? `<div class="notice danger">${m.overdue.length} unpaid overdue bill(s) remain reserved. Mark paid only after payment.</div>` : ''}${m.lateIncome.length ? `<div class="notice">${m.lateIncome.length} expected payment(s) are late. They are excluded from the forecast until you update the date or mark received.</div>` : ''}${m.shortfall ? `<div class="notice danger">Your entered cash is ${money(m.shortfall)} short of bills and reserves${m.next ? ' before the next pay' : ''}.</div>` : ''}`;
}
function entryRow(x, kind, projected) {
  if (x.projected) return `<article class="entry"><div class="entry-head"><h3>${esc(x.label)}</h3><b>${kind === 'incomes' ? '+' : '−'}${money(x.amount)}</b></div><p>${dateText(x.date)} · Repeating estimate</p>${projected === undefined ? '' : '<p>Projected unreserved cash: '+money(projected)+'</p>'}<p class="small">Confirm the earliest unpaid occurrence to advance this schedule.</p></article>`;
  return `<article class="entry"><div class="entry-head"><h3>${esc(x.label)}</h3><strong>${kind === 'incomes' ? '+' : '−'}${money(x.amount)}</strong></div><p>${dateText(x.date)}${x.repeat && x.repeat !== 'none' ? ' · '+esc(x.repeat) : ''} · ${kind === 'incomes' ? (x.gross ? 'Gross income; tax reserve deducted' : 'Take-home income') : 'Unpaid bill'}${x.date < C.localDate() ? ' · overdue' : ''}</p>${projected === undefined ? '' : `<p class="${projected < 0 ? 'danger' : ''}">Projected unreserved cash: ${money(projected)}</p>`}<div class="row-actions"><button data-edit="${x.id}" data-kind="${kind}" aria-label="Edit ${esc(x.label)}">Edit</button><button data-settle="${x.id}" data-kind="${kind}">${kind === 'incomes' ? 'Mark received' : 'Mark paid'}</button><button data-remove="${x.id}" data-kind="${kind}" aria-label="Remove ${esc(x.label)}">Remove</button></div></article>`;
}
function home() {
  const m = C.forecast(state);
  return header(`Hey, ${esc(state.profile.name)}.`, 'A clearer view of the days before payday.') +
    `<section class="hero"><div class="label">Estimated available before next income</div><div class="money">${m.safe === null ? 'Add payday' : money(m.safe)}</div><div class="hero-foot"><span>${m.next ? `${money(Math.floor(m.safe * 100 / m.days) / 100)} / day through ${dateText(m.next.date)}` : 'Set up your cash, income, and bills.'}</span></div></section>${warnings(m)}
    <section class="section card profile-card"><h2 class="section-title">How it adds up</h2><div class="details"><p>Cash entered <b>${money(state.profile.balance)}</b></p><p>Bills ${m.next ? 'through payday' : 'entered'} <b>−${money(m.held)}</b></p><p>Goals, tax reserve, and buffer <b>−${money(m.reserved)}</b></p></div><p class="small">An estimate based only on your entries. Record purchases in Activity; include upcoming essentials as bills. Money is reserved in the calculation; no transfers happen.</p><div class="row-actions"><button data-action="add" data-kind="transactions">Record spending</button><button data-tab="profile">Update cash</button><button data-action="add" data-kind="incomes">Add income</button><button data-action="add" data-kind="bills">Add bill</button></div></section>
    <section class="section"><div class="section-row"><h2 class="section-title">Bills before pay</h2><button class="text-btn" data-tab="plan">Full plan</button></div><div class="card">${m.before.length ? m.before.map(x => entryRow(x, 'bills')).join('') : '<p class="empty">No bills entered for this window.</p>'}</div></section>
    <section class="section card coach-card"><div class="spark">✦</div><div><b>Check your 30-day outlook</b><p>${m.low < 0 ? `Your plan reaches a ${money(-m.low)} shortfall after reserves. Review dates and expected income before spending.` : 'Review expected income and bills whenever your shifts change.'}</p><button class="text-btn" data-tab="plan">See forecast →</button></div></section>${!state.incomes.length && !state.bills.length ? '<section class="section"><button class="secondary" data-action="demo">Explore a sample plan</button></section>' : ''}`;
}
function plan() {
  const m = C.forecast(state), s = C.forecast(state, C.localDate(), hours);
  const late = m.lateIncome;
  const later = state.incomes.concat(state.bills).filter(x => x.date > m.end);
  return header('Your plan', '30 days of entered payments, with bills first on shared paydays.') + warnings(m) +
    `<div class="split-btn"><button class="secondary" data-action="add" data-kind="incomes">+ Income</button><button class="secondary" data-action="add" data-kind="bills">+ Bill</button></div>
    ${paymentCalendar()}<section class="section"><h2 class="section-title">Cash timeline</h2><p class="small">Running amounts exclude your goal, tax, and buffer reserves. Expected income is not guaranteed.</p><div class="card">${m.timeline.length ? m.timeline.map(x => entryRow(x, x.kind, x.available)).join('') : '<p class="empty">Add income and bills to see the forecast.</p>'}</div></section>
    ${late.length ? `<section class="section"><h2 class="section-title">Late income · not counted</h2><div class="card">${late.map(x => entryRow(x, 'incomes')).join('')}</div></section>` : ''}
    ${later.length ? `<section class="section"><h2 class="section-title">Beyond 30 days</h2><div class="card">${later.map(x => entryRow(x, state.incomes.includes(x) ? 'incomes' : 'bills')).join('')}</div></section>` : ''}
    <section class="section card scenario"><h2 class="section-title">What if you work fewer hours?</h2><p>Applied to the next expected payment in this 30-day forecast. Your current cash and saved plan stay unchanged.</p><form id="scenarioForm" class="form-grid">${field('hours', 'Fewer hours on that paycheck', hours, 'number', 'min="0" max="1000" step="0.25"')}<button class="secondary">Calculate</button></form><div class="scenario-result"><span>30-day unreserved ending cash</span><b>${money(s.endBalance)}</b></div><p>Original: ${money(m.endBalance)} · after reduced hours: ${money(s.endBalance)}</p><p>${!m.next || m.next.date > m.end ? 'Add an income date within 30 days to apply this scenario.' : `Estimated take-home reduction: ${money(s.loss)}. Capped at the next payment amount.`}</p><p>Uses ${money(state.profile.hourlyRate)}/hour and your ${state.profile.taxRate}% scenario deduction. ${s.low < 0 ? `Lowest projected amount: ${money(s.low)}.` : ''}</p></section>`;
}
function goals() {
  return header('Your goals', 'Reserve part of the cash you already entered. No automatic transfers.') +
    `<button class="secondary" data-action="add" data-kind="goals">+ Add goal</button><p class="small">Reserved amounts must be included in your cash balance. Extra reserve is counted once in this forecast, capped at the remaining target; it is not a recurring monthly transfer.</p><section class="section card">${state.goals.length ? state.goals.map(g => `<article class="entry"><div class="entry-head"><h3>${esc(g.label)}</h3><b>${money(g.saved)} / ${money(g.target)}</b></div><div class="goal-track"><span style="width:${Math.min(100, g.saved / g.target * 100)}%"></span></div><p>Extra reserve now: ${money(Math.min(g.monthly, Math.max(0, g.target - g.saved)))}</p><div class="row-actions"><button data-edit="${g.id}" data-kind="goals">Edit</button><button data-remove="${g.id}" data-kind="goals">Remove</button></div></article>`).join('') : '<p class="empty">Add an emergency cushion or an upcoming expense.</p>'}</section>`;
}
function answer(q) {
  const m = C.forecast(state), text = q.toLowerCase();
  if (/invest|stock|crypto|portfolio|allocation/.test(text)) return 'I can explain your entered cash flow, bills, and savings reserves. I do not recommend investments.';
  if (/hour|work/.test(text)) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:fewer\s+|less\s+)?hours?/), n = match ? Number(match[1]) : 12;
    if (n > 1000) return 'Use the scenario in Plan with a number of hours from 0 to 1,000.';
    const s = C.forecast(state, C.localDate(), n);
    if (!m.next || m.next.date > m.end) return 'Add your next expected payment within 30 days to model fewer hours.';
    return `${n} fewer hours reduces that payment by an estimated ${money(s.loss)} after your scenario deduction. Your 30-day ending cash after reserves changes from ${money(m.endBalance)} to ${money(s.endBalance)}. Current cash is unchanged. Lowest projected cash: ${money(s.low)}.`;
  }
  if (/bill|hit|due/.test(text)) return m.before.length ? `Unpaid bills ${m.next ? 'through ' + dateText(m.next.date) : 'entered'}: ${m.before.map(x => `${x.label} (${money(x.amount)}, ${dateText(x.date)})`).join('; ')}. Total: ${money(m.held)}. Overdue unpaid bills remain included.` : 'No bills are entered for this window yet.';
  if (/tax/.test(text)) {
    if (!m.next) return 'Add expected income first. Mark it gross only if you need to reserve taxes from that amount.';
    return m.next.gross ? `Your chosen ${state.profile.taxRate}% reserves ${money(m.next.amount - C.dollars(C.netCents(m.next, state.profile)))} from the next gross payment. This is your planning assumption, not a recommended tax rate.` : 'Your next payment is marked take-home, so no additional tax reserve is subtracted. Mark income gross if you still need to set taxes aside.';
  }
  if (/emergency|goal|set aside/.test(text)) return `Your goal, tax, and buffer reserves total ${money(m.reserved)}. Edit them in Goals or You. They must be part of the cash balance you entered; money held outside that balance should not be reserved again.`;
  if (/safe|spend|today|paycheck/.test(text)) return m.safe === null ? 'Enter your next payday before relying on a spending estimate. All entered unpaid bills remain visible in your plan.' : `Your entries leave an estimated ${money(m.safe)} through ${dateText(m.next.date)}, about ${money(Math.floor(m.safe * 100 / m.days) / 100)} per day. Bills: ${money(m.held)}; reserves: ${money(m.reserved)}. ${m.shortfall ? `You are short ${money(m.shortfall)} against those commitments. ` : ''}${m.low < 0 ? `The 30-day forecast also reaches a ${money(-m.low)} shortfall. ` : ''}Include all essentials and update cash as you spend.`;
  return 'I can explain spending estimates, bills before pay, taxes, goals, or fewer work hours. Try “What if I work 8 fewer hours?”';
}
function coach() {
  return header('Your cash-flow coach', 'Offline explanations calculated from your entries.') + `<section class="card chat"><p class="small">This preview uses a rules-based coach, not a connected AI model.</p><div class="bubble" aria-live="polite">${esc(reply || 'Ask about your spending window, bills, or a change in working hours.')}</div><div class="suggestions">${['What can I spend?', 'Which bills are due?', 'What if I work 12 fewer hours?', 'Tax set-aside'].map(q => `<button class="suggestion" data-prompt="${q}">${q}</button>`).join('')}</div><form id="coachForm" class="chat-form"><input name="message" aria-label="Ask about your cash flow" placeholder="Ask about your plan" maxlength="400" required><button class="send" aria-label="Send">↑</button></form><p class="disclaimer">Budgeting estimates from your entries, not investment or tax advice.</p></section>`;
}
function profile() {
  const p = state.profile;
  return header('Make it yours.', 'Update your cash whenever you spend or receive money.') + `<section class="card profile-card"><form id="profileForm" class="form-grid">${field('name', 'Your name', p.name, 'text', 'maxlength="80"')}${amountField('balance', 'Current cash, including your reserves', p.balance, -1000000000)}${amountField('buffer', 'Everyday safety buffer', p.buffer)}${amountField('taxHeld', 'Taxes already reserved within that cash', p.taxHeld)}${amountField('hourlyRate', 'Gross hourly rate for scenarios', p.hourlyRate)}${field('taxRate', 'Your chosen tax / scenario deduction (%)', p.taxRate, 'number', 'min="0" max="100" step="0.01"')}<p class="small">Enter take-home income after payroll deductions. For gross freelance income, this percentage reserves tax. For hourly scenarios, use your estimated deduction rate.</p><button class="primary">Save settings</button></form></section>
    <section class="section card profile-card"><h2 class="section-title">More tools</h2><div class="row-actions"><button data-tab="goals">Savings goals</button><button data-tab="coach">Cash-flow coach</button></div></section><section class="section card profile-card"><h2 class="section-title">Reminders</h2><p class="small">Unpaid and overdue bills appear in Today and Plan. Background phone notifications are not included in this preview.</p></section>
    <section class="section card profile-card"><h2 class="section-title">Your data</h2><p class="small">Stored only on this device. Uninstalling or clearing app data removes your plan. Copy a backup first.</p><div class="row-actions"><button data-action="backup">Backup / restore</button><button data-action="fresh">Clear plan</button><button data-action="demo">Load sample plan</button></div><p class="small">Cash Compass 1.2.0 preview · USD</p></section>`;
}
function modal() {
  if (!dialog) return '';
  const kind = dialog.kind, x = dialog.item || {}, today = C.localDate();
  let title = '', body = '';
  if (dialog.mode === 'edit' && kind === 'transactions') {
    title = x.id ? 'Edit transaction' : 'Record transaction';
    body = `<form id="transactionForm" class="form-grid">${field('label','Merchant or description',x.label || '', 'text','maxlength="80"')}${selectField('type','Transaction type',x.type || 'expense',[['expense','Expense'],['income','Income']])}${amountField('amount','Amount',x.amount || '',0.01)}${field('date','Transaction date',x.date || today,'date', 'max="'+today+'"')}${categoryField(x.category || 'Other')}${selectField('adjust','Cash balance',x.id && x.delta === 0 ? 'false' : 'true',[['true','Apply this transaction to cash'],['false','Already included in my cash balance']])}${amountField('taxDelta','Tax reserve from this income (0 for expenses)',x.taxDelta || 0)}<p class="small">Editing reverses the old cash adjustment and applies the new one. Future payments belong in Plan.</p><button class="primary">Save transaction</button></form>`;
  } else if (dialog.mode === 'edit' && kind === 'budgets') {
    title = x.id ? 'Edit budget category' : 'Add budget category';
    body = `<form id="budgetForm" class="form-grid">${categoryField(x.category || 'Groceries')}${selectField('bucket','Spending bucket',x.bucket || 'flexible',[['fixed','Fixed bills'],['flexible','Flexible spending'],['occasional','Occasional expenses']])}${amountField('amount','Monthly budget',x.amount || '',0)}${field('start','Start month',x.start || budgetMonth,'month')}${selectField('rollover','Unused budget and overspending',x.rollover ? 'true':'false',[['false','Reset each month'],['true','Carry over to next month']])}<p class="small">Category names match transactions regardless of capitalization. Changes recalculate history from the start month.</p><button class="primary">Save budget</button></form>`;
  } else if (dialog.mode === 'edit') {
    title = `${x.id ? 'Edit' : 'Add'} ${kind === 'incomes' ? 'income' : kind === 'bills' ? 'bill' : 'goal'}`;
    body = `<form id="entryForm" class="form-grid">${field('label', 'Name', x.label || '', 'text', 'maxlength="80"')}${kind === 'goals' ? `${amountField('target', 'Goal target', x.target || 0, 0.01)}${amountField('saved', 'Already reserved within current cash', x.saved || 0)}${amountField('monthly', 'Extra reserve for this forecast', x.monthly || 0)}` : `${amountField('amount', 'Amount', x.amount || 0, 0.01)}${field('date', kind === 'incomes' ? 'Expected payday' : 'Due date', x.date || C.addDays(today, 7), 'date')}${selectField('repeat','Repeat',x.repeat || 'none',[['none','One time'],['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['yearly','Yearly']])}${categoryField(x.category || (kind === 'bills' ? 'Other' : 'Income'))}${kind === 'incomes' ? `<label>Income amount type<select name="gross"><option value="false" ${!x.gross ? 'selected' : ''}>Take-home (already after tax)</option><option value="true" ${x.gross ? 'selected' : ''}>Gross (reserve my tax percentage)</option></select></label>` : ''}`}<button class="primary">Save ${kind === 'goals' ? 'goal' : 'entry'}</button></form>`;
  } else if (dialog.mode === 'settle') {
    title = kind === 'incomes' ? 'Confirm received income' : 'Confirm bill payment';
    body = `<p>${esc(x.label)} · ${money(x.amount)}</p><p class="small">Choose whether this payment is already reflected in the cash balance you entered.</p><div class="form-grid"><button class="primary" data-confirm="adjust">${kind === 'incomes' ? 'Add to cash and mark received' : 'Subtract from cash and mark paid'}</button><button class="secondary" data-confirm="included">Already in my cash balance</button></div>`;
  } else if (dialog.mode === 'backup') {
    title = 'Backup / restore';
    body = `<p class="small">Copy all text and save it somewhere private. To restore, paste a Cash Compass backup and tap Restore. Restoring replaces this plan.</p><form id="restoreForm" class="form-grid"><label>Backup JSON<textarea name="backup" spellcheck="false" required>${esc(JSON.stringify(state, null, 2))}</textarea></label><button class="secondary" type="button" data-action="select-backup">Select all for copying</button><button class="primary">Restore this backup</button></form>`;
  } else {
    title = 'Confirm change';
    body = `<p>${dialog.mode === 'remove' ? `${kind === 'transactions' ? 'Delete '+esc(x.label)+'? This reverses its original cash and tax adjustments. Any settled schedule stays advanced.' : 'Remove '+esc(x.label || x.category)+'? This does not change cash. Repeating entries stop after removal.'}` : dialog.mode === 'demo' ? 'Replace this plan with sample data? Copy a backup first if you need to keep your entries.' : 'Clear your plan and start with no entries? Copy a backup first if you need to keep them.'}</p><button class="primary" data-confirm="yes">${dialog.mode === 'remove' ? 'Remove entry' : 'Replace plan'}</button>`;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="modal-head"><h2 id="dialogTitle">${title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>${body}<p id="formError" role="alert" class="danger small"></p></section></div>`;
}
function render() {
  app.innerHTML = ({ home, plan, goals, coach, profile, transactions, budgets })[tab]() + nav() + modal();
  if (dialog) { const el = app.querySelector('.modal input, .modal textarea, .modal .primary'); if (el) el.focus(); }
}
function closeDialog() { dialog = null; render(); }
function back() { if (dialog) { closeDialog(); return true; } if (tab !== 'home') { tab = 'home'; render(); return true; } return false; }
window.cashCompassBack = back;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') back();
  if (e.key === 'Tab' && dialog) {
    const nodes = Array.from(app.querySelectorAll('.modal button, .modal input, .modal select, .modal textarea'));
    if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.tab) { tab = b.dataset.tab; dialog = null; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.day) { planDay=b.dataset.day; render(); return; }
    if (b.dataset.prompt) { reply = answer(b.dataset.prompt); render(); return; }
    const kind = b.dataset.kind;
    if (b.dataset.edit || b.dataset.remove || b.dataset.settle) {
      const id = b.dataset.edit || b.dataset.remove || b.dataset.settle;
      dialog = { mode: b.dataset.edit ? 'edit' : b.dataset.remove ? 'remove' : 'settle', kind, item: state[kind].find(x => x.id === id) };
    } else if (b.dataset.action === 'add') dialog = { mode: 'edit', kind };
    else if (b.dataset.action === 'close') dialog = null;
    else if (b.dataset.action === 'select-backup') { app.querySelector('textarea').select(); flash('Selected. Touch and hold to copy.'); return; }
    else if (['fresh', 'demo', 'backup'].includes(b.dataset.action)) dialog = { mode: b.dataset.action };
    else if (b.dataset.confirm && dialog) {
      if (dialog.mode === 'settle') update(next => C.settle(next, dialog.kind, dialog.item.id, b.dataset.confirm === 'adjust'));
      else if (dialog.mode === 'remove') update(next => { if (dialog.kind === 'transactions') { C.removeTransaction(next,dialog.item.id); return; } next[dialog.kind] = next[dialog.kind].filter(x => x.id !== dialog.item.id); });
      else if (dialog.mode === 'fresh') { persist(C.blank()); tab = 'profile'; }
      else if (dialog.mode === 'demo') persist(C.demo());
      dialog = null; reply = ''; flash('Plan saved');
    } else return;
    render();
  } catch (error) { flash(error.message); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (!e.target.reportValidity()) return;
  const f = new FormData(e.target);
  try {
    if (e.target.id === 'planMonth') { if(!C.validDate(f.get('month')+'-01')) throw Error('Choose a valid month.'); planMonth=f.get('month'); planDay=planMonth+'-01';
    } else if (e.target.id === 'transactionSearch') {
      transactionQuery = String(f.get('query')).trim(); transactionType = f.get('type');
    } else if (e.target.id === 'budgetMonth') {
      if (!C.validDate(f.get('month')+'-01')) throw Error('Choose a valid month.'); budgetMonth=f.get('month');
    } else if (e.target.id === 'transactionForm') {
      if (!C.validDate(f.get('date')) || f.get('date') > C.localDate()) throw Error('Record future payments in Plan.');
      update(next => C.saveTransaction(next,{id:dialog.item ? dialog.item.id : uid(),label:f.get('label'),type:f.get('type'),amount:f.get('amount'),date:f.get('date'),category:f.get('category'),adjust:f.get('adjust') === 'true',taxDelta:f.get('taxDelta')}));
      dialog=null; tab='transactions'; flash('Transaction saved');
    } else if (e.target.id === 'budgetForm') {
      const item=C.budget({id:dialog.item ? dialog.item.id : uid(),category:f.get('category'),amount:f.get('amount'),bucket:f.get('bucket'),start:f.get('start'),rollover:f.get('rollover') === 'true'});
      if(state.budgets.some(b => b.id !== item.id && b.category.toLowerCase() === item.category.toLowerCase())) throw Error('This category already has a budget.');
      update(next => {const i=next.budgets.findIndex(b=>b.id===item.id); if(i<0)next.budgets.push(item);else next.budgets[i]=item;});
      dialog=null; tab='budgets'; flash('Budget saved');
    } else if (e.target.id === 'entryForm') {
      const kind = dialog.kind, item = { id: dialog.item ? dialog.item.id : uid(), label: C.label(f.get('label')) };
      if (kind === 'goals') { item.target = C.number(f.get('target'), 0.01); item.saved = C.number(f.get('saved')); item.monthly = C.number(f.get('monthly')); }
      else { item.amount = C.number(f.get('amount'), 0.01); item.date = f.get('date'); if (!C.validDate(item.date)) throw Error('Enter a valid date.'); item.gross = kind === 'incomes' && f.get('gross') === 'true'; item.repeat=C.repeat(f.get('repeat')); item.category=C.label(f.get('category')); item.anchorDay=dialog.item && dialog.item.date === item.date ? (dialog.item.anchorDay || Number(item.date.slice(8))) : Number(item.date.slice(8)); }
      update(next => { const i = next[kind].findIndex(x => x.id === item.id); if (i < 0) next[kind].push(item); else next[kind][i] = item; });
      dialog = null; tab = kind === 'goals' ? 'goals' : 'plan'; flash('Entry saved');
    } else if (e.target.id === 'profileForm') {
      update(next => { next.profile = { name: C.label(f.get('name')), balance: C.number(f.get('balance'), -1000000000), buffer: C.number(f.get('buffer')), taxHeld: C.number(f.get('taxHeld')), hourlyRate: C.number(f.get('hourlyRate')), taxRate: C.number(f.get('taxRate'), 0, 100) }; }); flash('Settings saved');
    } else if (e.target.id === 'scenarioForm') hours = C.number(f.get('hours'), 0, 1000);
    else if (e.target.id === 'coachForm') reply = answer(f.get('message').trim());
    else if (e.target.id === 'restoreForm') { persist(C.normalize(JSON.parse(f.get('backup'))), true); dialog = null; reply = ''; flash('Backup restored'); }
    render();
  } catch (error) { const el = document.getElementById('formError'); if (el) el.textContent = error.message; else flash(error.message); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dialog && (tab === 'home' || tab === 'plan')) render(); });
let planMonth=C.localDate().slice(0,7), planDay=C.localDate();
let transactionQuery = '', transactionType = 'all', budgetMonth = C.localDate().slice(0,7);
function selectField(name, title, value, options) {
  return `<label>${title}<select name="${name}">${options.map(([v,t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function categoryField(value = 'Other') {
  const categories = [...new Set(['Groceries','Transport','Housing','Utilities','Subscriptions','Health','Fun','Other','Income',...state.budgets.map(b => b.category)])];
  return field('category','Category',value,'text','maxlength="80" list="categories"') + `<datalist id="categories">${categories.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
}
function transactions() {
  const rows = state.transactions.filter(t => (transactionType === 'all' || t.type === transactionType) && `${t.label} ${t.category} ${t.date}`.toLowerCase().includes(transactionQuery.toLowerCase())).sort((a,b) => b.date.localeCompare(a.date));
  const current = state.transactions.filter(t => t.date.slice(0,7) === C.localDate().slice(0,7));
  const total = type => C.dollars(current.filter(t => t.type === type).reduce((a,t) => a+C.cents(t.amount),0));
  return header('Transactions','Everyday spending, all in one place.') + `<div class="summary-grid"><div class="summary"><span>Income this month</span><b>${money(total('income'))}</b></div><div class="summary"><span>Spent this month</span><b>${money(total('expense'))}</b></div></div><button class="primary" data-action="add" data-kind="transactions">+ Record transaction</button><p class="small">Pay a planned bill from Plan to avoid recording it twice. Transactions record money already spent or received.</p><form id="transactionSearch" class="form-grid">${field('query','Search name, category, or date',transactionQuery,'search','') .replace(' required','')}${selectField('type','Show',transactionType,[['all','All transactions'],['expense','Expenses'],['income','Income']])}<button class="secondary">Search</button></form><section class="section card">${rows.length ? rows.map(t => `<article class="entry"><div class="entry-head"><h3>${esc(t.label)}</h3><b class="${t.type === 'income' ? 'positive' : ''}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</b></div><p>${dateText(t.date)} · ${esc(t.category)}</p><p>${t.delta === 0 ? 'Already included in cash when recorded' : 'Applied to cash'}${t.taxDelta ? ' · tax reserve ' + money(t.taxDelta) : ''}</p><div class="row-actions"><button data-edit="${t.id}" data-kind="transactions">Edit</button><button data-remove="${t.id}" data-kind="transactions">Delete</button></div></article>`).join('') : '<p class="empty">No matching transactions. Record your first purchase or income.</p>'}</section>`;
}
function budgets() {
  const report = C.budgetSummary(state,budgetMonth);
  return header('Your budget','A monthly plan for fixed, flexible, and occasional spending.') + `<form id="budgetMonth" class="form-grid">${field('month','Budget month',budgetMonth,'month')}<button class="secondary">View month</button></form><div class="row-actions"><button data-action="add" data-kind="budgets">+ Budget category</button><button data-tab="goals">Savings goals</button></div><p class="small">Budgets track recorded expenses. They do not reserve additional cash in the payday forecast. Add upcoming commitments in Plan. Rollover carries both unused funds and overspending from the start month.</p>${report.unbudgeted ? `<div class="notice">${money(report.unbudgeted)} spent in categories without a budget.</div>` : ''}${['fixed','flexible','occasional'].map(bucket => {const rows=report.rows.filter(b => b.bucket === bucket); const remaining=C.dollars(rows.reduce((a,b)=>a+C.cents(b.remaining),0)); return `<section class="section"><div class="section-row"><h2 class="section-title">${{fixed:'Fixed bills',flexible:'Flexible spending',occasional:'Occasional expenses'}[bucket]}</h2><b class="${remaining < 0 ? 'danger' : ''}">${money(remaining)} left</b></div><div class="card">${rows.length ? rows.map(b => `<article class="entry"><div class="entry-head"><h3>${esc(b.category)}</h3><b>${money(b.spent)} / ${money(b.available)}</b></div><div class="goal-track"><span style="width:${b.available > 0 ? Math.min(100,b.spent/b.available*100) : 100}%"></span></div><p class="${b.remaining < 0 ? 'danger' : ''}">${b.remaining < 0 ? money(-b.remaining)+' over budget' : money(b.remaining)+' remaining'} · ${money(b.amount)} monthly${b.rollover ? ' · rollover '+money(b.carry) : ''}</p><div class="row-actions"><button data-edit="${b.id}" data-kind="budgets">Edit</button><button data-remove="${b.id}" data-kind="budgets">Remove</button></div></article>`).join('') : '<p class="empty">No categories in this bucket.</p>'}</div></section>`;}).join('')}<p class="small">Editing an amount or start month recalculates rollover history. Transactions and cash remain unchanged.</p>${state.budgets.filter(b=>b.start>budgetMonth).map(b=>`<article class="entry"><h3>${esc(b.category)}</h3><p>Starts ${esc(b.start)}</p><div class="row-actions"><button data-edit="${b.id}" data-kind="budgets">Edit</button><button data-remove="${b.id}" data-kind="budgets">Remove</button></div></article>`).join('')}`;
}

function paymentCalendar() {
  const first = planMonth + '-01';
  const [year, month] = planMonth.split('-').map(Number);
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  const end = planMonth + '-' + String(days).padStart(2,'0');
  const events = C.expand(state.bills,end).map(x=>({...x,kind:'bills'})).concat(C.expand(state.incomes,end).map(x=>({...x,kind:'incomes'}))).filter(x=>x.date >= first && x.date <= end);
  const selected = events.filter(x=>x.date === planDay);
  const offset = new Date(first+'T12:00:00Z').getUTCDay();
  return `<section class="section card profile-card"><h2 class="section-title">Payment calendar</h2><form id="planMonth" class="form-grid">${field('month','Calendar month',planMonth,'month')}<button class="secondary">View calendar</button></form><div class="calendar" aria-label="Payment dates">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span class="weekday">${d}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=planMonth+'-'+String(i+1).padStart(2,'0'),items=events.filter(x=>x.date===date);return `<button data-day="${date}" class="calendar-day ${date===planDay ? 'selected':''}" aria-pressed="${date===planDay}" aria-label="${dateText(date)}, ${items.length} payments"><b>${i+1}</b><small>${items.length ? items.length+' due':'·'}</small></button>`;}).join('')}</div><h3>${dateText(planDay)}</h3>${selected.length ? selected.map(x=>entryRow(x,x.kind)).join('') : '<p class="small">No payments scheduled for this day.</p>'}<p class="small">Upcoming occurrences are estimates. Mark the earliest entry paid or received to advance a repeating schedule.</p></section>`;
}

render();
