/* Offline interface. The coach explains calculations; it is not a connected AI model. */
'use strict';
const C = CashCore, STORE = 'cash-compass-v2', APP_VERSION = '1.41.0';
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const uid = () => 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
let tab = 'home', dialog = null, hours = 12, debtPayment = '', loanPrincipal = '', loanRate = '', loanPayment = '', loanExtra = '', dripYield = '2', dripGrowth = '7', dripYears = '10', dripMonthly = '', slipDays = 0, runwayIncome = '', runwaySpending = '', emergencyMonths = '', paycheckHours = '', paycheckOvertime = '', paycheckHoliday = '', smoothingTarget = '', splitCount = 2, reply = '', storageError = '', storageBlocked = false, toastTimer;
let state = C.blank();
try {
  const stored = localStorage.getItem(STORE) || localStorage.getItem('cash-compass-v1');
  if (stored) state = C.normalize(JSON.parse(stored));
} catch (e) { storageError = 'Saved data could not be read. Your original data has been kept. Restore a valid backup from You to continue.'; storageBlocked = true; }
C.ensureAccounts(state);
const app = document.getElementById('app');
// Automatic backups + data-loss guards (roadmap #6, #9): rotating slots in
// localStorage, written before destructive actions and once daily. Never
// throws — a failed backup must not block the action it guards.
const AUTO_KEY = 'cash-compass-auto', AUTO_SLOTS = 5;
let lastAutoCheck = 0;
function autoBackups() {
  try {
    const meta = JSON.parse(localStorage.getItem(AUTO_KEY + '-meta') || '{"slots":[]}');
    return Array.isArray(meta.slots) ? meta.slots : [];
  } catch (e) { return []; }
}
function autoBackup(reason) {
  try {
    const data = localStorage.getItem(STORE);
    if (!data) return;
    const slots = autoBackups();
    if (slots.length >= AUTO_SLOTS) { try { localStorage.removeItem(AUTO_KEY + '-' + slots[slots.length - 1].id); } catch (e) {} }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(AUTO_KEY + '-' + id, data);
    localStorage.setItem(AUTO_KEY + '-meta', JSON.stringify({ slots: [{ id, when: new Date().toISOString(), reason }, ...slots].slice(0, AUTO_SLOTS) }));
  } catch (e) {}
}
function maybeDailyBackup() {
  if (Date.now() - lastAutoCheck < 3600 * 1000) return;
  lastAutoCheck = Date.now();
  const day = 24 * 3600 * 1000;
  if (!autoBackups().some(s => s.reason === 'daily' && Date.now() - new Date(s.when).getTime() < day)) autoBackup('daily');
}
function persist(next, recovery = false) {
  if (storageBlocked && !recovery) throw Error(storageError);
  C.ensureAccounts(next); C.syncBalance(next); C.snapshot(next);
  try { localStorage.setItem(STORE, JSON.stringify(next)); }
  catch (e) { throw Error('Could not save to this device. No changes were applied. Copy your backup from You before closing.'); }
  state = next; storageError = ''; storageBlocked = false; syncReminders();
  maybeDailyBackup();
}
function update(fn) { const next = JSON.parse(JSON.stringify(state)); fn(next); persist(next); reply = ''; }
function flash(text) { const el = document.getElementById('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500); }
// Undo for bulk edits and deletes (roadmap #42): short-lived undo.
function setUndo(label, undoFn) {
  clearTimeout(pendingUndo && pendingUndo.timer);
  pendingUndo = { label, undoFn, timer: setTimeout(() => { pendingUndo = null; render(); }, 60000) };
  render();
  flash(label + ' — Undo available for 60 seconds.');
}
function doUndo() {
  if (!pendingUndo) return;
  clearTimeout(pendingUndo.timer);
  const { label, undoFn } = pendingUndo;
  pendingUndo = null;
  update(undoFn);
  render();
  flash('Undid: ' + label);
}
function field(name, title, value = '', type = 'text', extra = '') {
  return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
}
const amountField = (name, title, value = 0, min = 0) => field(name, title, value, 'number', `min="${min}" max="1000000000" step="0.01" inputmode="decimal"`);
function legacyHeader(title, subtitle) {
  return `<header class="topbar"><div class="brand"><div class="mark">↗</div><div class="brand-name">cash compass<small>cash-flow coach</small></div></div><button class="icon-btn" data-tab="profile" aria-label="Your settings">◌</button></header>${state.demo ? '<div class="notice">Sample plan · these are example numbers. <button class="text-btn" data-action="fresh">Start my own plan</button></div>' : ''}${storageError ? `<div role="alert" class="notice danger">${esc(storageError)}</div>` : ''}<h1 class="page-title">${title}</h1><p class="subhead">${subtitle}</p>`;
}
function legacyNav() { return `<nav class="nav" aria-label="Main navigation">${[['home', '⌂', 'Today'], ['plan', '▦', 'Plan'], ['transactions', '≡', 'Activity'], ['budgets', '◎', 'Budget'], ['profile', '◌', 'You']].map(([key, icon, title]) => `<button data-tab="${key}" ${key === tab ? 'class="active" aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</button>`).join('')}</nav>`; }
function warnings(m) {
  const tax = taxDeadlineNotice();
  return `${m.overdue.length ? `<div class="notice danger">${m.overdue.length} unpaid overdue bill(s) remain reserved. Mark paid only after payment.</div>` : ''}${m.lateIncome.length ? `<div class="notice">${m.lateIncome.length} expected payment(s) are late. They are excluded from the forecast until you update the date or mark received.</div>` : ''}${m.shortfall ? `<div class="notice danger">Your entered cash is ${money(m.shortfall)} short of bills and reserves${m.next ? ' before the next pay' : ''}.</div>` : ''}${m.crunchDays.length ? `<div class="notice">Cash drops below your ${money(m.buffer)} safety buffer on ${dateText(m.crunchDays[0].date)}${m.crunchDays.length > 1 ? ` · ${m.crunchDays.length} days in the next 30` : ''}. Review upcoming bills before spending.</div>` : ''}${tax}`;
}
// Tax set-aside tracker (roadmap #23): optional quarterly deadline reminder.
function taxDeadlineNotice() {
  if (!state.profile.taxReminder) return '';
  try {
    const t = C.taxSetAside(state);
    if (t.nextDeadline && t.daysUntil <= 14) return `<div class="notice">Quarterly estimated-tax deadline ${dateText(t.nextDeadline)} (${t.daysUntil} day${t.daysUntil === 1 ? '' : 's'}). ${t.remaining > 0 ? `You still need to set aside ${money(t.remaining)}.` : 'Your set-aside target is covered.'} <button class="text-btn" data-tab="reports">Review</button></div>`;
  } catch (e) { /* no untaxed income yet */ }
  return '';
}
function entryRow(x, kind, projected) {
  const amt = (x.estimated ? '~' : '') + money(x.amount);
  if (x.projected) return `<article class="entry"><div class="entry-head"><h3>${esc(x.label)}</h3><b>${kind === 'incomes' ? '+' : '−'}${amt}</b></div><p>${dateText(x.date)} · Repeating estimate${x.estimated ? ' · amount estimated from recent history' : ''}</p>${projected === undefined ? '' : '<p>Projected unreserved cash: '+money(projected)+'</p>'}<p class="small">Confirm the earliest unpaid occurrence to advance this schedule.</p></article>`;
  return `<article class="entry"><div class="entry-head"><h3>${esc(x.label)}</h3><strong>${kind === 'incomes' ? '+' : '−'}${amt}</strong></div><p>${dateText(x.date)}${x.repeat && x.repeat !== 'none' ? ' · '+esc(x.repeat) : ''} · ${kind === 'incomes' ? (x.gross ? 'Gross income; tax reserve deducted' : 'Take-home income') : 'Unpaid bill'}${x.estimate ? ' · amount estimated from recent history' : ''}${x.date < C.localDate() ? ' · overdue' : ''}</p>${projected === undefined ? '' : `<p class="${projected < 0 ? 'danger' : ''}">Projected unreserved cash: ${money(projected)}</p>`}<div class="row-actions"><button data-edit="${x.id}" data-kind="${kind}" aria-label="Edit ${esc(x.label)}">Edit</button><button data-settle="${x.id}" data-kind="${kind}">${kind === 'incomes' ? 'Mark received' : 'Mark paid'}</button><button data-remove="${x.id}" data-kind="${kind}" aria-label="Remove ${esc(x.label)}">Remove</button></div></article>`;
}
function legacyHome() {
  const m = C.forecast(state);
  return header(`Hey, ${esc(state.profile.name)}.`, 'A clearer view of the days before payday.') +
    `<section class="hero"><div class="label">Estimated available before next income</div><div class="money">${m.safe === null ? 'Add payday' : money(m.safe)}</div><div class="hero-foot"><span>${m.next ? `${money(Math.floor(m.safe * 100 / m.days) / 100)} / day through ${dateText(m.next.date)}` : 'Set up your cash, income, and bills.'}</span></div></section>${warnings(m)}
    <section class="section card profile-card"><h2 class="section-title">How it adds up</h2><div class="details"><p>Net account balance <b>${money(state.profile.balance)}</b></p><p>Bills ${m.next ? 'through payday' : 'entered'} <b>−${money(m.held)}</b></p><p>Goals, tax reserve, and buffer <b>−${money(m.reserved)}</b></p></div><p class="small">An estimate based only on your entries. Record purchases in Activity; include upcoming essentials as bills. Money is reserved in the calculation; no transfers happen.</p><div class="row-actions"><button data-action="add" data-kind="transactions">Record spending</button><button data-tab="accounts">Accounts</button><button data-tab="reports">Reports</button><button data-action="add" data-kind="incomes">Add income</button><button data-action="add" data-kind="bills">Add bill</button></div></section>
    <section class="section"><div class="section-row"><h2 class="section-title">Bills before pay</h2><button class="text-btn" data-tab="plan">Full plan</button></div><div class="card">${m.before.length ? m.before.map(x => entryRow(x, 'bills')).join('') : '<p class="empty">No bills entered for this window.</p>'}</div></section>
    <section class="section card coach-card"><div class="spark">✦</div><div><b>Check your 30-day outlook</b><p>${m.low < 0 ? `Your plan reaches a ${money(-m.low)} shortfall after reserves. Review dates and expected income before spending.` : 'Review expected income and bills whenever your shifts change.'}</p><button class="text-btn" data-tab="plan">See forecast →</button></div></section>${!state.incomes.length && !state.bills.length ? '<section class="section"><button class="secondary" data-action="demo">Explore a sample plan</button></section>' : ''}`;
}
function legacyPlan() {
  const m = C.forecast(state), s = C.forecast(state, C.localDate(), hours, slipDays);
  const late = m.lateIncome;
  const later = state.incomes.concat(state.bills).filter(x => x.date > m.end);
  return header('Your plan', '30 days of entered payments, with bills first on shared paydays.') + warnings(m) +
    `<div class="split-btn"><button class="secondary" data-action="add" data-kind="incomes">+ Income</button><button class="secondary" data-action="add" data-kind="bills">+ Bill</button></div>
    ${paymentCalendar()}<section class="section"><h2 class="section-title">Cash timeline</h2><p class="small">Running amounts exclude your goal, tax, and buffer reserves. Expected income is not guaranteed.</p><div class="card">${m.timeline.length ? m.timeline.map(x => entryRow(x, x.kind, x.available)).join('') : '<p class="empty">Add income and bills to see the forecast.</p>'}</div></section>
    ${late.length ? `<section class="section"><h2 class="section-title">Late income · not counted</h2><div class="card">${late.map(x => entryRow(x, 'incomes')).join('')}</div></section>` : ''}
    ${later.length ? `<section class="section"><h2 class="section-title">Beyond 30 days</h2><div class="card">${later.map(x => entryRow(x, state.incomes.includes(x) ? 'incomes' : 'bills')).join('')}</div></section>` : ''}
    <section class="section card scenario"><h2 class="section-title">What if pay changes?</h2><p>Applied to the next expected payment in this 30-day forecast. Your current cash and saved plan stay unchanged.</p><form id="scenarioForm" class="form-grid">${field('hours', 'Fewer hours on that paycheck', hours, 'number', 'min="0" max="1000" step="0.25"')}${field('slip', 'Payday slips by this many days', slipDays, 'number', 'min="0" max="365" step="1"')}<button class="secondary">Calculate</button></form><div class="scenario-result"><span>30-day unreserved ending cash</span><b>${money(s.endBalance)}</b></div><p>Original: ${money(m.endBalance)} · with changes: ${money(s.endBalance)}</p><p>${!m.next ? 'Add income to apply this scenario.' : m.next.date > m.end && !slipDays ? 'Next payday is beyond 30 days, so only the late-paycheck option applies.' : `Payday moves to ${dateText(s.slipDate)} (${s.days} days out). Estimated take-home reduction: ${money(s.loss)}, capped at the next payment amount.`}</p><p>Uses ${money(state.profile.hourlyRate)}/hour and your ${state.profile.taxRate}% scenario deduction. ${s.low < 0 ? `Lowest projected amount: ${money(s.low)}.` : ''}</p></section>
    ${forecastRangeSection()}${runwaySection()}${emergencyFundSection()}`;
}
function forecastRangeSection() {
  const fr = C.forecastRange(state);
  if (!fr.range) return `<section class="section card"><h2 class="section-title">Forecast range</h2><p class="empty">Record at least 2 months of income to see best and worst cases.</p></section>`;
  const r = fr.range, v = r.variability;
  return `<section class="section card"><h2 class="section-title">Forecast range</h2><p class="small">If the next 30 days earn like your recorded months instead of the plan — ${v.months} months on record (worst ${money(v.min)}, average ${money(v.avg)}, best ${money(v.max)}).</p><div class="summary-grid"><div class="summary"><span>Worst case</span><b class="${r.worst < 0 ? 'danger' : ''}">${money(r.worst)}</b></div><div class="summary"><span>Expected (plan)</span><b>${money(r.expected)}</b></div><div class="summary"><span>Best case</span><b class="positive">${money(r.best)}</b></div></div><p class="small">30-day unreserved ending cash in each case.</p></section>`;
}
function runwaySection() {
  const today = C.localDate();
  const defIncome = C.avgMonthly(state, 'income', today, 3), defSpend = C.avgMonthly(state, 'expense', today, 3);
  const inc = runwayIncome === '' ? defIncome : C.number(runwayIncome, 0);
  const sp = runwaySpending === '' ? defSpend : C.number(runwaySpending, 0);
  const r = C.runway(state, inc, sp);
  const sliderMax = Math.max(5000, Math.ceil(Math.max(defIncome, inc) * 1.5 / 100) * 100);
  return `<section class="section card"><h2 class="section-title">Low-season runway</h2><p class="small">How long your spendable cash lasts if income drops. Cash counted: ${money(r.cash)} (balance minus goal, tax, and buffer reserves).</p><form id="runwayForm" class="form-grid"><label>Monthly income if work slows: <b>${money(inc)}</b><input name="income" type="range" min="0" max="${sliderMax}" step="50" value="${inc}"></label>${field('spending', 'Monthly essential spending', sp, 'number', 'min="0" step="10"')}<button class="secondary">Calculate</button></form>${r.indefinite ? `<p><b>Covered indefinitely.</b> ${money(inc)}/mo income meets ${money(sp)}/mo spending.</p>` : `<p>Your cash lasts <b>${r.months < 1 ? Math.round(r.weeks) + ' weeks' : r.months.toFixed(1) + ' months'}</b> (${Math.round(r.weeks)} weeks) at a ${money(r.burn)}/mo shortfall.</p>`}</section>`;
}
// Emergency fund tracker (roadmap #25): months of essential spending
// covered by spendable cash — the same pool the runway above draws on.
function emergencyFundSection() {
  const today = C.localDate();
  const defSpend = C.avgMonthly(state, 'expense', today, 3);
  const sp = runwaySpending === '' ? defSpend : C.number(runwaySpending, 0);
  const months = emergencyMonths === '' ? 3 : C.number(emergencyMonths, 1, 60);
  if (sp <= 0) return `<section class="section card"><h2 class="section-title">Emergency fund</h2><p class="empty">Enter your monthly essential spending to see how many months your cash covers.</p><form id="emergencyForm" class="form-grid">${field('spending', 'Monthly essential spending', '', 'number', 'min="0" step="10"')}${field('months', 'Target months', months, 'number', 'min="1" max="60" step="1"')}<button class="secondary">Calculate</button></form></section>`;
  const f = C.emergencyFund(state, sp, months);
  const pct = f.target > 0 ? Math.min(100, f.cash / f.target * 100) : 0;
  return `<section class="section card"><h2 class="section-title">Emergency fund</h2><p class="small">Months of essential spending covered by your spendable cash (${money(f.cash)} — the same pool as the runway above).</p><form id="emergencyForm" class="form-grid">${field('spending', 'Monthly essential spending', sp, 'number', 'min="0" step="10"')}${field('months', 'Target months', months, 'number', 'min="1" max="60" step="1"')}<button class="secondary">Calculate</button></form><div class="goal-track"><span style="width:${pct}%"></span></div><p>You have <b>${f.monthsCovered.toFixed(1)} months</b> of your ${months}-month target${f.funded ? ' — <b class="positive">fully funded.</b>' : ` — <b>${money(f.gap)} to go</b>`}.</p></section>`;
}
function legacyGoals() {
  return header('Your goals', 'Reserve part of the cash you already entered. No automatic transfers.') +
    `<button class="secondary" data-action="add" data-kind="goals">+ Add goal</button><p class="small">Reserved amounts must be included in your cash balance. Extra reserve is counted once in this forecast, capped at the remaining target; it is not a recurring monthly transfer.</p><section class="section card">${state.goals.length ? state.goals.map(g => `<article class="entry"><div class="entry-head"><h3>${esc(g.label)}</h3><b>${money(g.saved)} / ${money(g.target)}</b></div><div class="goal-track"><span style="width:${Math.min(100, g.saved / g.target * 100)}%"></span></div><p>${g.deadline ? 'Target: '+dateText(g.deadline)+(g.saved>=g.target?' · Complete':g.deadline<C.localDate()?' · Past target date':' · About '+money(Math.ceil(Math.max(0,g.target-g.saved)*100/Math.max(1,Math.ceil(C.daysBetween(C.localDate(),g.deadline)/7)))/100)+' / week needed') : 'No target date set'}</p><details><summary>Contribution history (${(g.contributions||[]).length})</summary>${(g.contributions||[]).map(c=>`<p>${dateText(c.date)} · ${money(c.amount)} · ${esc(c.note)}</p>`).join('') || '<p>No contributions recorded yet.</p>'}</details><p>Extra reserve now: ${money(Math.min(g.monthly, Math.max(0, g.target - g.saved)))}</p>${(()=>{const pa=C.goalPaycheckAmount(g,'monthly');return pa.perPaycheck>0?`<p class="small">Need ${money(pa.perPaycheck)}/mo to hit ${g.deadline?dateText(g.deadline):'target'} ${pa.onTrack?'· on track':'· <b class="danger">behind</b>'}.</p>`:'';})()}<div class="row-actions"><button data-contribute="${g.id}">Contribute / withdraw</button><button data-edit="${g.id}" data-kind="goals">Edit</button><button data-remove="${g.id}" data-kind="goals">Remove</button></div></article>`).join('') : '<p class="empty">Add an emergency cushion or an upcoming expense.</p>'}</section>`;
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
  if (/savings rate|save/.test(text)) { const sr = C.savingsRate(state, 3); return sr.overall === null ? 'Not enough data for a savings rate yet. Add income and expenses.' : `Your 3-month savings rate is ${sr.overall}%. ${sr.overall >= 20 ? 'Strong saving.' : sr.overall >= 10 ? 'A solid start.' : 'Room to grow — review your biggest categories.'}`; }
  if (/net worth|worth/.test(text)) { const w = C.netWorth(state); return `Your entered net worth is ${money(w.total)}: ${money(w.cash)} cash, ${money(w.investments)} investments, plus ${money(w.manualNet || 0)} in manual assets, minus debts.`; }
  if (/budget/.test(text)) { const b = C.budget(state, C.localDate().slice(0, 7)); const spent = b.rows.reduce((s, r) => s + r.spent, 0), planned = b.rows.reduce((s, r) => s + r.available, 0); return planned ? `This month you've spent ${money(spent)} of ${money(planned)} budgeted (${Math.round(spent / planned * 100)}%). ${b.unbudgeted ? `${money(b.unbudgeted)} is unbudgeted. ` : ''}See Budget for details.` : 'No budget set for this month yet. Add categories in Budget.'; }
  if (/debt|loan|owe/.test(text)) { const d = C.debtPayoff(state); return d.length ? `You have ${d.length} debt${d.length === 1 ? '' : 's'}. The snowball plan clears them in about ${d[d.length - 1].month}. See Recurring → Debt payoff for the schedule.` : 'No debts entered. Add them in Recurring to plan payoff.'; }
  if (/trend|spending/.test(text)) { const tr = C.spendingTrends(state, 6); const rows = tr.rows.filter(r => r.total > 0); return rows.length < 2 ? 'Not enough months for a trend yet.' : `Spending ${rows[rows.length - 1].total >= rows[0].total ? 'rose' : 'fell'} from ${money(rows[0].total)} to ${money(rows[rows.length - 1].total)} over ${rows.length} months. See Reports → Trends.`; }
  return 'I can explain spending estimates, bills, taxes, goals, work hours, savings rate, net worth, budget, debt, or trends. Try "What is my savings rate?"';
}
function coach() {
  return header('Your cash-flow coach', 'Offline explanations calculated from your entries.') + `<section class="card chat"><p class="small">This preview uses a rules-based coach, not a connected AI model.</p><div class="bubble" aria-live="polite">${esc(reply || 'Ask about your spending window, bills, or a change in working hours.')}</div><div class="suggestions">${['What can I spend?', 'What is my savings rate?', 'What is my net worth?', 'How is my budget?', 'What if I work 12 fewer hours?'].map(q => `<button class="suggestion" data-prompt="${q}">${q}</button>`).join('')}</div><form id="coachForm" class="chat-form"><input name="message" aria-label="Ask about your cash flow" placeholder="Ask about your plan" maxlength="400" required><button class="send" aria-label="Send">↑</button></form><p class="disclaimer">Budgeting estimates from your entries, not investment or tax advice.</p></section>`;
}
// Automatic backups (roadmap #6): rotating local slots with one-tap restore.
function autoBackupSection() {
  const slots = autoBackups();
  return `<section class="section card profile-card"><h2 class="section-title">Automatic backups</h2><p class="small">Saved automatically before restores, resets, and sample data — plus once daily. Last ${AUTO_SLOTS} kept, newest first.</p>${slots.length ? slots.map(s => `<div class="report-row"><div class="entry-head"><span>${esc(s.reason)}</span><b>${new Date(s.when).toLocaleString()}</b></div><div class="row-actions"><button class="secondary" data-action="restore-auto" data-slot="${s.id}">Restore this backup</button></div></div>`).join('') : '<p class="empty">No automatic backups yet.</p>'}</section>`;
}
function profile() {
  const p = state.profile;
  return header('Make it yours.', 'Update your cash whenever you spend or receive money.') + `<section class="card profile-card"><form id="profileForm" class="form-grid">${field('name', 'Your name', p.name, 'text', 'maxlength="80"')}${amountField('balance', 'Net account balance (edit accounts separately)', p.balance, -1000000000).replace('<input','<input readonly')}${amountField('buffer', 'Everyday safety buffer', p.buffer)}${amountField('taxHeld', 'Taxes already reserved within that cash', p.taxHeld)}${amountField('hourlyRate', 'Gross hourly rate for scenarios', p.hourlyRate)}${field('taxRate', 'Your chosen tax / scenario deduction (%)', p.taxRate, 'number', 'min="0" max="100" step="0.01"')}<p class="small">Enter take-home income after payroll deductions. For gross freelance income, this percentage reserves tax. For hourly scenarios, use your estimated deduction rate.</p>${field('sideTaxRate', 'Side-income tax set-aside rate (%)', p.sideTaxRate == null ? 25 : p.sideTaxRate, 'number', 'min="0" max="100" step="0.01"')}<p class="small">Untaxed freelance/gig income is tracked separately in Reports; this rate sets the quarterly set-aside target.</p><label class="check-label"><input type="checkbox" name="taxReminder"${p.taxReminder ? ' checked' : ''}> Remind me about quarterly estimated-tax deadlines</label><button class="primary">Save settings</button></form></section>
    <section class="section card profile-card"><h2 class="section-title">More tools</h2><p><button class="primary" data-tab="wallet">Google Wallet purchase import</button></p><div class="row-actions"><button data-tab="accounts">Accounts</button><button data-tab="reports">Reports</button><button data-action="csv">Import / export CSV</button><button data-tab="goals">Savings goals</button><button data-tab="coach">Cash-flow coach</button></div></section><section class="section card profile-card"><h2 class="section-title">Appearance</h2><form id="themeForm" class="form-grid">${selectField('theme','Theme',localStorage.getItem('cc-theme')||'system',[['system','System'],['light','Light'],['dark','Dark'],['high-contrast','High contrast']])}<button class="primary">Save theme</button></form></section><section class="section card profile-card"><h2 class="section-title">Connected AI coach (optional)</h2><p class="small">Bring your own API key for a connected AI coach. Off by default. Only summarized totals are sent — never individual transactions. Your key is stored only on this device.</p><form id="aiCoachForm" class="form-grid">${field('aiKey','API key',localStorage.getItem('cc-ai-key')||'','password','maxlength="200"').replace(' required','')}${selectField('aiEnabled','Enable connected coach',localStorage.getItem('cc-ai-enabled')==='1'?'yes':'no',[['no','Off'],['yes','On']])}<button class="primary">Save</button></form></section><section class="section card profile-card"><h2 class="section-title">Reminders</h2><p class="small">Daily reminders at about 9 AM for bills due within three days or overdue. Android may delay delivery during battery saving. No amounts appear on the lock screen.</p><button class="secondary" data-action="reminders">${state.reminders ? 'Turn off reminders' : 'Enable phone reminders'}</button><p class="small">${hasNative() ? (NativeBridge.notificationsAllowed() ? 'Notifications allowed by Android.' : 'Android notification permission is off.') : 'Phone reminders are available in the Android app.'}</p></section>
    <section class="section card profile-card"><h2 class="section-title">Your data</h2><p class="small">Stored only on this device. Clearing or replacing the plan also pauses Wallet capture and clears its pending native queue. Uninstalling or clearing app data removes your plan. Copy a backup first.</p><p class="small">Merchant memory: ${Object.keys(state.merchantMemory || {}).length} merchant(s) remembered to pre-fill category and account.</p><div class="row-actions"><button data-action="backup">Backup / restore</button><button class="quiet" data-action="export-all">Export all data</button><button data-action="clear-memory">Clear merchant memory</button><button data-action="fresh">Clear plan</button><button data-action="demo">Load sample plan</button></div><p class="small">Cash Compass ${APP_VERSION} preview · USD</p></section>${autoBackupSection()}`;
}
function modal() {
  if (!dialog) return '';
  const kind = dialog.kind, x = dialog.item || {}, today = C.localDate();
  const extended=walletModal()||redesignModal(kind,x,today)||extendedModal(kind,x,today);if(extended)return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="modal-head"><h2 id="dialogTitle">${extended.title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>${extended.body}<p id="formError" class="danger" role="alert"></p></section></div>`;
  let title = '', body = '';
  if (dialog.mode === 'edit' && kind === 'transactions') {
    title = x.id ? 'Edit transaction' : 'Record transaction';
    body = `<form id="transactionForm" class="form-grid">${field('label','Merchant or description',x.label || '', 'text','maxlength="80"')}${selectField('type','Transaction type',x.type || 'expense',[['expense','Expense'],['income','Income'],['transfer','Transfer between accounts']])}${amountField('amount','Amount',x.amount || '',0.01)}${field('date','Transaction date',x.date || today,'date', 'max="'+today+'"')}${categoryField(x.category || 'Other')}${field('tags','Tags (comma-separated)',(x.tags||[]).join(', '),'text','maxlength="120"').replace(' required','')}${field('note','Note',(x.note||''),'text','maxlength="280"').replace(' required','')}${(x.type || 'expense') !== 'transfer' ? `<label>Refund for purchase (income only)<select name="refundOf"><option value="">Not a refund</option>${refundOptions(x.refundOf)}</select></label><p class="small">Link a refund to the original purchase and it nets against that category in budgets and reports.</p>` : ''}${(x.type || 'expense') === 'expense' ? `<label class="check-label"><input type="checkbox" name="reimbursable"${x.reimbursable ? ' checked' : ''}> Reimbursable — I expect to be paid back</label>` : ''}${(x.type || 'expense') === 'income' ? `<label class="check-label"><input type="checkbox" name="untaxed"${x.untaxed ? ' checked' : ''}> Untaxed income — freelance/gig, I'll set aside tax myself</label>` : ''}${accountSelect('accountId',x.accountId,'From / transaction account')}${accountSelect('toAccountId',x.toAccountId || (state.accounts[1]||state.accounts[0]).id,'To account (transfers only)')}${selectField('adjust','Cash balance',x.id && x.delta === 0 ? 'false' : 'true',[['true','Apply this transaction to cash'],['false','Already included in my cash balance']])}${amountField('taxDelta','Tax reserve from this income (0 for expenses)',x.taxDelta || 0)}${x.id && x.type !== 'transfer' ? `<button class="secondary" type="button" data-action="split-tx" data-id="${x.id}">Split across categories</button>` : ''}<p class="small">Editing reverses the old cash adjustment and applies the new one. Future payments belong in Plan.</p><p class="small">Known merchants fill in category and account as you type the name.</p><div id="categorySuggestion"></div><button class="primary">Save transaction</button></form>`;
  } else if (dialog.mode === 'edit' && kind === 'budgets') {
    title = x.id ? 'Edit budget category' : 'Add budget category';
    body = `<form id="budgetForm" class="form-grid">${categoryField(x.category || 'Groceries')}${selectField('bucket','Spending bucket',x.bucket || 'flexible',[['income','Income'],['fixed','Fixed bills'],['flexible','Flexible spending'],['occasional','Occasional expenses']])}${amountField('amount','Monthly budget',x.amount || '',0)}${field('start','Start month',x.start || budgetMonth,'month')}${selectField('rollover','Unused budget and overspending',x.rollover ? 'true':'false',[['false','Reset each month'],['true','Carry over to next month']])}<p class="small">Category names match transactions regardless of capitalization. Changes recalculate history from the start month.</p><button class="primary">Save budget</button></form>`;
  } else if (dialog.mode === 'edit') {
    title = `${x.id ? 'Edit' : 'Add'} ${kind === 'incomes' ? 'income' : kind === 'bills' ? 'bill' : 'goal'}`;
    body = `<form id="entryForm" class="form-grid">${field('label', 'Name', x.label || '', 'text', 'maxlength="80"')}${kind === 'goals' ? `${amountField('target', 'Goal target', x.target || 0, 0.01)}${amountField('saved', 'Already reserved within current cash', x.saved || 0)}${amountField('monthly', 'Extra reserve for this forecast', x.monthly || 0)}${field('deadline','Target date (optional)',x.deadline||'','date').replace(' required','')}` : `${amountField('amount', 'Amount', x.amount || 0, 0.01)}${field('date', kind === 'incomes' ? 'Expected payday' : 'Due date', x.date || C.addDays(today, 7), 'date')}${accountSelect('accountId',x.accountId)}${selectField('repeat','Repeat',x.repeat || 'none',[['none','One time'],['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['yearly','Yearly']])}${categoryField(x.category || (kind === 'bills' ? 'Other' : 'Income'))}${kind === 'incomes' ? `<label>Income amount type<select name="gross"><option value="false" ${!x.gross ? 'selected' : ''}>Take-home (already after tax)</option><option value="true" ${x.gross ? 'selected' : ''}>Gross (reserve my tax percentage)</option></select></label>${field('hours','Hours per period (optional)', x.hours || '', 'number', 'min="0" max="1000" step="0.25"').replace(' required','')}${field('hourlyRate','Hourly rate for this stream (optional)', x.hourlyRate || '', 'number', 'min="0" step="0.01"').replace(' required','')}` : ''}${kind === 'bills' ? `<label class="check-label"><input type="checkbox" name="estimate" ${x.estimate ? 'checked' : ''}>Estimate from my recent history (average of last 3)</label><label class="check-label"><input type="checkbox" name="reminder" ${x.reminder !== false ? 'checked' : ''}>Phone reminder for this bill</label>${field('reminderDays','Remind me this many days before it is due', x.reminderDays == null ? 3 : x.reminderDays, 'number', 'min="0" max="60" step="1"')}` : ''}`}<button class="primary">Save ${kind === 'goals' ? 'goal' : 'entry'}</button></form>`;
  } else if (dialog.mode === 'settle') {
    title = kind === 'incomes' ? 'Confirm received income' : 'Confirm bill payment';
    body = `<p>${esc(x.label)} · ${money(x.amount)}</p><p class="small">Choose whether this payment is already reflected in the cash balance you entered.</p><div class="form-grid"><button class="primary" data-confirm="adjust">${kind === 'incomes' ? 'Add to cash and mark received' : 'Subtract from cash and mark paid'}</button><button class="secondary" data-confirm="included">Already in my cash balance</button></div>`;
  } else if (dialog.mode === 'backup') {
    title = 'Backup / restore';
    body = `<p class="small">Copy all text and save it somewhere private. Wallet review text may contain purchase details. Restoring pauses capture and clears unprocessed native notifications. To restore, paste a Cash Compass backup and tap Restore. Restoring replaces this plan — an automatic backup is saved first.</p><form id="restoreForm" class="form-grid"><label>Backup JSON<textarea name="backup" spellcheck="false" required>${esc(JSON.stringify(state, null, 2))}</textarea></label><button class="secondary" type="button" data-action="select-backup">Select all for copying</button><button class="primary">Restore this backup</button></form>`;
  } else {
    title = 'Confirm change';
    body = `<p>${dialog.mode === 'remove' ? `${kind === 'holdings' ? 'Remove this holding from your portfolio and net worth?' : kind === 'lifeEvents' ? 'Remove this scenario event?' : kind === 'transactions' ? 'Delete '+esc(x.label)+'? This reverses its original cash and tax adjustments. Any settled schedule stays advanced.' : 'Remove '+esc(x.label || x.category)+'? This does not change cash. Repeating entries stop after removal.'}` : dialog.mode === 'demo' ? 'Replace this plan with sample data? An automatic backup of your current plan is saved first — restore it anytime from You → Automatic backups.' : dialog.mode === 'clear-memory' ? 'Forget all remembered merchants? Category and account suggestions start over; your transactions stay unchanged.' : dialog.mode === 'restore-auto' ? 'Restore this automatic backup? Your current plan is backed up first, so nothing is lost.' : 'Clear your plan and start with no entries? An automatic backup is saved first — restore it anytime from You → Automatic backups.'}</p><button class="primary" data-confirm="yes">${dialog.mode === 'remove' ? 'Remove entry' : dialog.mode === 'clear-memory' ? 'Clear merchant memory' : dialog.mode === 'restore-auto' ? 'Restore backup' : 'Replace plan'}</button>`;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="modal-head"><h2 id="dialogTitle">${title}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>${body}<p id="formError" role="alert" class="danger small"></p></section></div>`;
}
function applyTheme(){
 const theme = localStorage.getItem('cc-theme') || 'system';
 document.documentElement.setAttribute('data-theme', theme);
}
function startVoice(){
 const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
 if(!SR){flash('Voice entry is not supported in this browser.');return;}
 const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
 flash('Listening... speak like "twelve fifty chipotle".');
 rec.onresult = e => {
   const text = e.results[0][0].transcript;
   const input = document.getElementById('quickInput');
   if(input) input.value = text;
   flash(`Heard: "${text}". Review and tap Add to save.`);
 };
 rec.onerror = () => flash('Could not hear you. Try typing instead.');
 rec.start();
}
// Smart category suggestion as user types (roadmap #79)
document.addEventListener('input', e => {
  if (e.target.name === 'label' && e.target.closest('#transactionForm')) {
    const label = e.target.value;
    const sugDiv = document.getElementById('categorySuggestion');
    if (!sugDiv || label.length < 3) { if (sugDiv) sugDiv.innerHTML = ''; return; }
    const sug = C.suggestCategory(state, label);
    // Only show if no exact merchant memory match
    const mem = (state.merchantMemory || {})[label.toLowerCase().trim()];
    if (sug && !mem && sug.confidence >= 50) {
      sugDiv.innerHTML = `<p class="suggestion-hint">💡 Suggest: <b>${sug.category}</b> (${sug.confidence}% confidence) <button type="button" class="quiet" data-suggest="${sug.category}">Use</button></p>`;
    } else {
      sugDiv.innerHTML = '';
    }
  }
});
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-suggest]');
  if (btn) {
    const form = btn.closest('form');
    const catField = form.querySelector('[name=category]');
    if (catField) catField.value = btn.dataset.suggest;
    document.getElementById('categorySuggestion').innerHTML = '';
  }
});
function download(filename, content, type){
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function shareSummary(){
  const text = C.shareSummary(state);
  if (navigator.share) {
    try { await navigator.share({ title: 'Cash Compass summary', text }); }
    catch(e) { /* user cancelled */ }
  } else {
    download('cash-compass-summary.txt', text, 'text/plain');
    flash('Summary downloaded. Share it from your files.');
  }
}
function render() {
  app.innerHTML = ({ home, plan, goals, coach, profile, transactions, budgets, accounts, reports, cashflow, investments, forecasting, wallet })[tab]() + nav() + modal();
  if (dialog) { const el = app.querySelector('.modal input, .modal textarea, .modal .primary'); if (el) el.focus(); }
}
function closeDialog() { dialog = null; render(); }
function back() { if(menuOpen){menuOpen=false;render();return true;} if (dialog) { closeDialog(); return true; } if (tab !== 'home') { tab = 'home'; render(); return true; } return false; }
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
    if(walletClick(b)||redesignClick(b))return;
    if (b.dataset.tab) { menuOpen=false;tab = b.dataset.tab; dialog = null; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.day) { planDay=b.dataset.day; render(); return; }
    if (b.dataset.prompt) { reply = answer(b.dataset.prompt); render(); return; }
    if(b.dataset.contribute){dialog={mode:'contribute',item:state.goals.find(g=>g.id===b.dataset.contribute)};render();return;}
    if(b.dataset.action==='transfer'){dialog={mode:'edit',kind:'transactions',item:{type:'transfer'}};render();return;}
    if(b.dataset.action==='csv'){csvPreview=null;dialog={mode:'csv'};render();return;}
    if(b.dataset.action==='csv-open'){if(hasNative())NativeBridge.openCSV();else flash('Paste CSV text below in the browser.');return;}
    if(b.dataset.action==='csv-export'){const text=C.exportCSV(state);if(hasNative())NativeBridge.saveCSV(text);else{csvDraft=text;dialog={mode:'csv'};render();}return;}
if(b.dataset.action==='csv-import' && csvPreview){const keep=app.querySelector('[name=duplicates]').value==='keep';const rcBox=app.querySelector('[name=reconcile]');const doReconcile=rcBox&&rcBox.checked&&csvReconcile;const asTransfer=new Set([...app.querySelectorAll('input[name^="transfer-"]')].filter(c=>c.checked).map(c=>c.name.slice('transfer-'.length)));let count=0,matched=0,missed=0;update(next=>{const paired=new Set();(csvPreview.transferPairs||[]).forEach(p=>{if(!asTransfer.has(p.id))return;const a=csvPreview[p.expense],b=csvPreview[p.income];if(!keep&&(a.duplicate||b.duplicate))return;paired.add(p.expense);paired.add(p.income);C.saveTransaction(next,{id:uid(),label:a.transaction.label||'Transfer',type:'transfer',amount:p.amount,date:p.date,accountId:p.fromAccount,toAccountId:p.toAccount,adjust:dialog.adjust==='true'});count++;});if(doReconcile){const rec=csvReconcile.filter((x,i)=>!paired.has(i)&&(keep||!x.row.duplicate));const res=C.applyReconciliation(next,rec);matched=res.matched;missed=res.missed;count+=matched;}else{csvPreview.forEach((r,i)=>{if(paired.has(i))return;if(!(keep||!r.duplicate))return;C.saveTransaction(next,{...r.transaction,id:uid()});count++;});}});csvPreview=null;csvReconcile=null;dialog=null;tab='transactions';render();flash(count+' transactions imported'+(doReconcile?' ('+matched+' matched notifications, '+missed+' missed → inbox)':'')+'.');return;}
    if(b.dataset.action==='reminders'){if(!hasNative()){flash('Available in the Android app.');return;}update(next=>{next.reminders=!next.reminders;});if(state.reminders)NativeBridge.requestNotifications();render();return;}
    const kind = b.dataset.kind;
    if (b.dataset.edit || b.dataset.remove || b.dataset.settle) {
      const id = b.dataset.edit || b.dataset.remove || b.dataset.settle;
      dialog = { mode: b.dataset.edit ? 'edit' : b.dataset.remove ? 'remove' : 'settle', kind, item: state[kind].find(x => x.id === id) };
    } else if (b.dataset.action === 'add') dialog = { mode: 'edit', kind };
    else if (b.dataset.action === 'sub-bill') {
      const s = C.detectSubscriptions(state)[Number(b.dataset.sub)];
      if (s) dialog = { mode: 'edit', kind: 'bills', item: { label: s.label, amount: s.amount, category: s.category, date: s.nextDate >= C.localDate() ? s.nextDate : C.localDate(), repeat: s.cycle } };
    }
    else if (b.dataset.action === 'close') dialog = null;
    else if (b.dataset.action === 'select-backup') { app.querySelector('textarea').select(); flash('Selected. Touch and hold to copy.'); return; }
    else if (['fresh', 'demo', 'backup', 'clear-memory'].includes(b.dataset.action)) dialog = { mode: b.dataset.action };
    else if (b.dataset.action === 'restore-auto') { dialog = { mode: 'restore-auto', id: b.dataset.slot }; }
    else if (b.dataset.confirm && dialog) {
      if (dialog.mode === 'settle') update(next => C.settle(next, dialog.kind, dialog.item.id, b.dataset.confirm === 'adjust'));
      else if (dialog.mode === 'remove') update(next => { if(dialog.kind==='accounts'){C.removeAccount(next,dialog.item.id);return;} if (dialog.kind === 'transactions') { C.removeTransaction(next,dialog.item.id); return; } next[dialog.kind] = next[dialog.kind].filter(x => x.id !== dialog.item.id); });
      else if (dialog.mode === 'fresh') { autoBackup('before clear'); pauseWallet(); persist(C.blank()); pauseWallet(true); tab = 'profile'; }
      else if (dialog.mode === 'demo') { autoBackup('before sample data'); pauseWallet();persist(C.demo());pauseWallet(true);}
      else if (dialog.mode === 'restore-auto') { const raw = localStorage.getItem(AUTO_KEY + '-' + dialog.id); if (!raw) throw Error('Automatic backup not found.'); autoBackup('before auto-restore'); pauseWallet(); persist(C.normalize(JSON.parse(raw)), true); pauseWallet(true); tab = 'profile'; }
      else if (dialog.mode === 'clear-memory') { update(next => C.clearMerchantMemory(next)); }
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
    if(walletSubmit(e.target.id,f)||redesignSubmit(e.target.id,f))return;
    if(e.target.dataset.reimburse){update(next=>C.markReimbursed(next,e.target.dataset.reimburse,f.get('amount')));render();flash('Reimbursement logged');return;}
    if(e.target.id==='accountForm'){update(next=>C.saveAccount(next,{id:dialog.item?dialog.item.id:uid(),label:f.get('label'),type:f.get('type'),balance:f.get('balance')}));dialog=null;tab='accounts';flash('Account saved');
    }else if(e.target.id==='reportForm'){reportMonth=f.get('month');reportAccount=f.get('accountId');C.spendingReport(state,reportMonth,reportAccount);
    }else if(e.target.id==='contributionForm'){update(next=>C.contribute(next,dialog.item.id,{id:uid(),date:f.get('date'),amount:f.get('amount'),note:f.get('note')}));dialog=null;tab='goals';flash('Savings updated');
    }else if(e.target.id==='csvForm'){csvDraft=String(f.get('csv'));dialog.adjust=f.get('adjust');csvPreview=C.previewCSV(state,csvDraft,f.get('accountId'),f.get('adjust')==='true');csvReconcile=C.reconcileCSV(state,csvPreview);
    }else if (e.target.id === 'planMonth') { if(!C.validDate(f.get('month')+'-01')) throw Error('Choose a valid month.'); planMonth=f.get('month'); planDay=planMonth+'-01';
    } else if (e.target.id === 'transactionSearch') {
      if(f.get('start')&&f.get('end')&&f.get('start')>f.get('end'))throw Error('Start date must be before end date.');
      transactionQuery = String(f.get('query')).trim(); transactionType = f.get('type');txAccount=f.get('account')||'all';txCategory=String(f.get('filterCategory')||'');txTag=f.get('tag')||'all';txMin=f.get('min')||'';txMax=f.get('max')||'';txStart=f.get('start')||'';txEnd=f.get('end')||'';txSort=f.get('sort')||'newest';txLimit=100;selectedTransactions.clear();
    } else if (e.target.id === 'budgetMonth') {
      if (!C.validDate(f.get('month')+'-01')) throw Error('Choose a valid month.'); budgetMonth=f.get('month');
    } else if (e.target.id === 'transactionForm') {
      if (!C.validDate(f.get('date')) || f.get('date') > C.localDate()) throw Error('Record future payments in Plan.');
      const refundOf = f.get('type') === 'income' ? String(f.get('refundOf') || '') : '';
      let category = f.get('category');
      if (refundOf) {
        const orig = state.transactions.find(t => t.id === refundOf);
        if (orig && (!category || category === 'Income' || category === 'Other')) category = orig.category;
      }
      update(next => C.saveTransaction(next,{id:dialog.item && dialog.item.id ? dialog.item.id : uid(),label:f.get('label'),type:f.get('type'),amount:f.get('amount'),date:f.get('date'),category,tags:String(f.get('tags')||'').split(','),note:f.get('note'),accountId:f.get('accountId'),toAccountId:f.get('toAccountId'),adjust:f.get('adjust') === 'true',taxDelta:f.get('taxDelta'),refundOf,reimbursable:f.has('reimbursable'),reimbursed:dialog.item?dialog.item.reimbursed||0:0,untaxed:f.has('untaxed')}));
      dialog=null; tab='transactions'; flash('Transaction saved');
    } else if (e.target.id === 'budgetForm') {
      const item=C.budget({id:dialog.item ? dialog.item.id : uid(),category:f.get('category'),amount:f.get('amount'),bucket:f.get('bucket'),start:f.get('start'),rollover:f.get('rollover') === 'true'});
      if(state.budgets.some(b => b.id !== item.id && b.category.toLowerCase() === item.category.toLowerCase())) throw Error('This category already has a budget.');
      update(next => {const i=next.budgets.findIndex(b=>b.id===item.id); if(i<0)next.budgets.push(item);else next.budgets[i]=item;});
      dialog=null; tab='budgets'; flash('Budget saved');
    } else if (e.target.id === 'entryForm') {
      const kind = dialog.kind, item = { id: dialog.item ? dialog.item.id : uid(), label: C.label(f.get('label')) };
      if (kind === 'goals') { item.target = C.number(f.get('target'), 0.01); item.saved = C.number(f.get('saved')); item.monthly = C.number(f.get('monthly')); item.deadline=f.get('deadline')||'';if(item.deadline&&!C.validDate(item.deadline))throw Error('Invalid target date.');item.contributions=dialog.item ? dialog.item.contributions||[]:[]; }
      else { item.amount = C.number(f.get('amount'), 0.01); item.date = f.get('date'); if (!C.validDate(item.date)) throw Error('Enter a valid date.'); item.gross = kind === 'incomes' && f.get('gross') === 'true'; item.estimate = kind === 'bills' && f.has('estimate'); item.reminder = kind !== 'bills' || f.has('reminder'); item.reminderDays = kind === 'bills' ? C.number(f.get('reminderDays'), 0, 60) : 0; item.hours = kind === 'incomes' ? C.number(f.get('hours') || 0, 0, 1000) : 0; item.hourlyRate = kind === 'incomes' ? C.number(f.get('hourlyRate') || 0, 0) : 0; item.accountId=C.accountById(state,f.get('accountId')).id;item.repeat=C.repeat(f.get('repeat')); item.category=C.label(f.get('category')); item.anchorDay=dialog.item && dialog.item.date === item.date ? (dialog.item.anchorDay || Number(item.date.slice(8))) : Number(item.date.slice(8)); }
      update(next => { const i = next[kind].findIndex(x => x.id === item.id); if (i < 0) next[kind].push(item); else next[kind][i] = item; });
      dialog = null; tab = kind === 'goals' ? 'goals' : 'plan'; flash('Entry saved');
    } else if (e.target.id === 'profileForm') {
      update(next => { next.profile = { name: C.label(f.get('name')), balance: C.number(f.get('balance'), -1000000000), buffer: C.number(f.get('buffer')), taxHeld: C.number(f.get('taxHeld')), hourlyRate: C.number(f.get('hourlyRate')), taxRate: C.number(f.get('taxRate'), 0, 100), sideTaxRate: C.number(f.get('sideTaxRate'), 0, 100), taxReminder: f.has('taxReminder') }; }); flash('Settings saved');
    } else if (e.target.id === 'scenarioForm') { hours = C.number(f.get('hours'), 0, 1000); slipDays = Math.round(C.number(f.get('slip'), 0, 365)); }
    else if (e.target.id === 'runwayForm') { runwayIncome = f.get('income'); runwaySpending = f.get('spending'); }
    else if (e.target.id === 'emergencyForm') { runwaySpending = f.get('spending'); emergencyMonths = f.get('months'); }
    else if (e.target.id === 'paycheckForm') { paycheckHours = f.get('hours'); paycheckOvertime = f.get('overtime'); paycheckHoliday = f.get('holiday'); }
    else if (e.target.id === 'smoothingForm') { smoothingTarget = f.get('target'); }
    else if (e.target.id === 'coachForm') reply = answer(f.get('message').trim());
    else if (e.target.id === 'restoreForm') { autoBackup('before restore'); const restored=C.normalize(JSON.parse(f.get('backup')));pauseWallet();persist(restored, true);pauseWallet(true); dialog = null; reply = ''; flash('Backup restored'); }
    render();
  } catch (error) { const el = document.getElementById('formError'); if (el) el.textContent = error.message; else flash(error.message); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dialog && (tab === 'home' || tab === 'plan')) render(); });
// Merchant memory auto-suggest (roadmap #3): when typing a merchant name in a new
// transaction, pre-fill category and account from memory unless already changed.
document.addEventListener('input', e => {
  const t = e.target;
  if (!t || t.name !== 'label' || !t.form || t.form.id !== 'transactionForm') return;
  if (!dialog || dialog.mode !== 'edit' || (dialog.item && dialog.item.id)) return;
  const s = C.suggestMerchant(state, t.value);
  if (!s) return;
  const cat = t.form.querySelector('[name="category"]'), acc = t.form.querySelector('[name="accountId"]');
  if (cat && !cat.dataset.touched) cat.value = s.category;
  if (acc && !acc.dataset.touched && [...acc.options].some(o => o.value === s.accountId)) acc.value = s.accountId;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t && (t.name === 'category' || t.name === 'accountId') && t.form && t.form.id === 'transactionForm') t.dataset.touched = '1';
});
let planMonth=C.localDate().slice(0,7), planDay=C.localDate();
let transactionQuery = '', transactionType = 'all', budgetMonth = C.localDate().slice(0,7);
function selectField(name, title, value, options) {
  return `<label>${title}<select name="${name}">${options.map(([v,t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function categoryField(value = 'Other') {
  const categories = [...new Set(['Groceries','Transport','Housing','Utilities','Subscriptions','Health','Fun','Other','Income',...state.budgets.map(b => b.category)])];
  return field('category','Category',value,'text','maxlength="80" list="categories"') + `<datalist id="categories">${categories.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
}
// Refund linking (roadmap #36): candidate original purchases for a refund.
function refundOptions(selected) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 120);
  const cut = cutoff.toISOString().slice(0, 10);
  return state.transactions.filter(t => t.type === 'expense' && t.date >= cut)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200)
    .map(t => `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${esc(t.label)} · ${money(t.amount)} · ${dateText(t.date)}</option>`).join('');
}
function legacyTransactions() {
  const rows = state.transactions.filter(t => (transactionType === 'all' || t.type === transactionType) && `${t.label} ${t.category} ${t.date}`.toLowerCase().includes(transactionQuery.toLowerCase())).sort((a,b) => b.date.localeCompare(a.date));
  const current = state.transactions.filter(t => t.date.slice(0,7) === C.localDate().slice(0,7));
  const total = type => C.dollars(current.filter(t => t.type === type).reduce((a,t) => a+C.cents(t.amount),0));
  return header('Transactions','Everyday spending, all in one place.') + `<div class="summary-grid"><div class="summary"><span>Income this month</span><b>${money(total('income'))}</b></div><div class="summary"><span>Spent this month</span><b>${money(total('expense'))}</b></div></div><button class="primary" data-action="add" data-kind="transactions">+ Record transaction</button><p class="small">Pay a planned bill from Plan to avoid recording it twice. Transactions record money already spent or received.</p><form id="transactionSearch" class="form-grid">${field('query','Search name, category, or date',transactionQuery,'search','') .replace(' required','')}${selectField('type','Show',transactionType,[['all','All transactions'],['expense','Expenses'],['income','Income'],['transfer','Transfers']])}<button class="secondary">Search</button></form><section class="section card">${rows.length ? rows.map(t => `<article class="entry"><div class="entry-head"><h3>${esc(t.label)}</h3><b class="${t.type === 'income' ? 'positive' : ''}">${t.type === 'transfer' ? '↔' : t.type === 'income' ? '+' : '−'}${money(t.amount)}</b></div><p>${dateText(t.date)} · ${esc(t.category)} · ${esc(accountName(t.accountId))}${t.type==='transfer'?' → '+esc(accountName(t.toAccountId)):''}</p><p>${t.delta === 0 ? 'Already included in cash when recorded' : 'Applied to cash'}${t.taxDelta ? ' · tax reserve ' + money(t.taxDelta) : ''}</p><div class="row-actions"><button data-edit="${t.id}" data-kind="transactions">Edit</button><button data-remove="${t.id}" data-kind="transactions">Delete</button></div></article>`).join('') : '<p class="empty">No matching transactions. Record your first purchase or income.</p>'}</section>`;
}
function legacyBudgets() {
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

let reportMonth=C.localDate().slice(0,7), reportAccount='all', csvPreview=null, csvDraft='', csvReconcile=null;
const hasNative=()=>typeof NativeBridge!=='undefined';
function accountSelect(name='accountId', value='', title='Account') {return selectField(name,title,value||state.accounts[0].id,state.accounts.map(a=>[a.id,a.label]));}
function accountName(id) {return C.accountById(state,id).label;}
function legacyAccounts() {
  const assets=C.dollars(state.accounts.filter(a=>a.balance>0).reduce((s,a)=>s+C.cents(a.balance),0));
  const debts=C.dollars(-state.accounts.filter(a=>a.balance<0).reduce((s,a)=>s+C.cents(a.balance),0));
  return header('Your accounts','Checking, savings, cash, and cards in one place.')+`<div class="summary-grid"><div class="summary"><span>Assets</span><b>${money(assets)}</b></div><div class="summary"><span>Debts / overdrafts</span><b>${money(debts)}</b></div></div><section class="hero"><div class="label">Net balance across tracked accounts</div><div class="money">${money(state.profile.balance)}</div></section><div class="row-actions"><button data-action="add" data-kind="accounts">+ Add account</button><button data-action="transfer">Record transfer</button></div><p class="small">Your old cash balance is preserved in Cash. Rename or reconcile that account when splitting it into real accounts to avoid counting the same money twice. Forecasts use the net balance after card debt. Record card repayments as transfers, not another expense.</p><section class="section card">${state.accounts.map(a=>`<article class="entry"><div class="entry-head"><h3>${esc(a.label)}</h3><b>${money(a.balance)}</b></div><p>${esc(a.type)}${a.type==='credit'?' · negative means money owed':''}</p><div class="row-actions"><button data-edit="${a.id}" data-kind="accounts">Edit / reconcile</button><button data-remove="${a.id}" data-kind="accounts">Remove</button></div></article>`).join('')}</section>`;
}
function legacyReports() {
  const r=C.spendingReport(state,reportMonth,reportAccount),max=Math.max(1,...r.trends.map(x=>Math.max(x.income,x.expense)));
  const diff=C.dollars(C.cents(r.expense)-C.cents(r.previous.expense));
  const subs=C.detectSubscriptions(state);
  const today=C.localDate();
  return header('Spending reports','See where your money went. Transfers are excluded.')+`<form id="reportForm" class="form-grid">${field('month','Month',reportMonth,'month')}${selectField('accountId','Account',reportAccount,[['all','All accounts'],...state.accounts.map(a=>[a.id,a.label])])}<button class="secondary">View report</button></form><div class="summary-grid section"><div class="summary"><span>Income</span><b>${money(r.income)}</b></div><div class="summary"><span>Expenses</span><b>${money(r.expense)}</b></div></div><p><b>${money(r.net)}</b> income minus expenses</p><p class="small">Spending is ${money(Math.abs(diff))} ${diff>=0?'higher':'lower'} than ${r.previous.month}. Based on recorded transactions; missing history affects comparisons.</p><section class="section"><h2 class="section-title">Recurring charges</h2><p class="small">Found in your last 12 months of recorded expenses. Add one as a bill so the forecast reserves for it.</p><div class="card">${subs.length?subs.map((s,i)=>`<div class="report-row"><div class="entry-head"><span>${esc(s.label)}</span><b>~${money(s.amount)}/${s.cycle==='yearly'?'year':s.cycle==='weekly'?'week':s.cycle==='biweekly'?'2 weeks':'month'}</b></div><p class="small">${s.count} payments · last ${dateText(s.lastDate)}${s.priceUp?' · <b>price went up</b>':''}${s.alreadyPlanned?' · already in Plan':''}</p>${s.alreadyPlanned?'':`<button class="secondary" data-action="sub-bill" data-sub="${i}">Add as bill</button>`}</div>`).join(''):'<p class="empty">No repeating charges found yet. Record a few months of expenses to spot them.</p>'}</div></section><section class="section card profile-card"><h2 class="section-title">Spending by category</h2>${r.categories.length?r.categories.map(c=>`<div class="report-row"><div class="entry-head"><span>${esc(c.label)}</span><b>${money(c.amount)}</b></div><div class="goal-track"><span style="width:${r.expense?c.amount/r.expense*100:0}%"></span></div><p class="small">${r.expense?Math.round(c.amount/r.expense*100):0}% of spending</p></div>`).join(''):'<p class="empty">Record expenses to see your categories.</p>'}</section><section class="section"><h2 class="section-title">Six-month comparison</h2><p class="small">Green: income · orange: expenses</p>${r.trends.map(t=>`<div class="report-row"><b>${t.month}</b><div class="report-bar" aria-label="Income ${money(t.income)}"><span style="width:${t.income/max*100}%"></span></div><div class="report-bar expense" aria-label="Expenses ${money(t.expense)}"><span style="width:${t.expense/max*100}%"></span></div><p class="small">Income ${money(t.income)} · expenses ${money(t.expense)}</p></div>`).join('')}</section>`;
}
function extendedModal(kind,x,today) {
  if(dialog.mode==='edit'&&kind==='accounts')return {title:x.id?'Edit account':'Add account',body:`<form id="accountForm" class="form-grid">${field('label','Account name',x.label||'','text','maxlength="80"')}${selectField('type','Account type',x.type||'checking',[['checking','Checking'],['savings','Savings'],['cash','Cash'],['credit','Credit card']])}${amountField('balance','Current balance (negative for debt)',x.balance||0,-1000000000)}<p class="small">Reconciliation sets the current balance without creating income or spending.</p><button class="primary">Save account</button></form>`};
  if(dialog.mode==='edit'&&kind==='creditCards'){const c=x||{};return {title:c.id?'Edit card':'Add credit card',body:`<form id="ccForm" class="form-grid">${field('label','Card name',c.label||'','text','maxlength="80"')}${field('last4','Last 4 digits',c.last4||'','text','maxlength="4"').replace(' required','')}${field('statementDay','Statement closes (day of month)',c.statementDay||1,'number','min="1" max="28"')}${field('dueDay','Payment due (day of month)',c.dueDay||15,'number','min="1" max="28"')}${amountField('balance','Current balance',c.balance||0)}${amountField('minimumDue','Minimum due',c.minimumDue||0)}${field('apr','APR %',c.apr||0,'number','min="0" max="100" step="0.01"').replace(' required','')}<button class="primary">Save card</button></form>`};}
  if(dialog.mode==='contribute')return {title:'Update savings progress',body:`<p>${esc(x.label)} · ${money(x.saved)} reserved</p><form id="contributionForm" class="form-grid">${amountField('amount','Contribution (negative to withdraw)',0,-1000000000)}${field('date','Date',today,'date','max="'+today+'"')}${field('note','Note','Contribution','text','maxlength="80"')}<p class="small">This reserves money already in your accounts; it does not move money or count as spending.</p><button class="primary">Save contribution</button></form>`};
  if(dialog.mode==='csv')return {title:'Import / export CSV',body:`<p class="small">Use date, description, amount headers. Optional: type, category, account, to_account. Dates: YYYY-MM-DD. Without type, negative amounts are expenses. Match account names or choose a default below. Export includes all transactions.</p><div class="row-actions"><button data-action="csv-open">Choose CSV file</button><button data-action="csv-export">Export CSV file</button></div><form id="csvForm" class="form-grid"><label>CSV text<textarea name="csv" required>${esc(csvDraft)}</textarea></label>${accountSelect()}${selectField('adjust','Imported amounts',['false','true'].includes(dialog.adjust)?dialog.adjust:'false',[['false','Already included in account balances'],['true','Apply amounts to account balances']])}<button class="secondary">Preview import</button></form>${csvPreview&&csvReconcile?`<p class="small">${csvReconcile.filter(x=>x.match).length} match notification inbox · ${csvReconcile.filter(x=>!x.match).length} missed by notifications</p><label class="check-label"><input type="checkbox" name="reconcile" checked> Reconcile with notification inbox (CSV wins on amount/name; your categories preserved; misses go to inbox)</label>`:''}${csvPreview?`<section class="section"><h3>${csvPreview.length} rows · ${csvPreview.filter(r=>r.duplicate).length} possible duplicates</h3><p class="small">Possible duplicates match date, description, amount, type, and accounts. Two legitimate same-day purchases may match; review before skipping.</p>${selectField('duplicates','Possible duplicates','skip',[['skip','Skip matching rows'],['keep','Keep every row']])}${csvPreview.transferPairs&&csvPreview.transferPairs.length?`<h3>Possible transfers</h3><p class="small">These pairs look like one transfer recorded twice (same amount, different accounts, within 3 days). Tick to import a pair as a single transfer instead of two transactions.</p>${csvPreview.transferPairs.map(p=>`<label class="check-label"><input type="checkbox" name="transfer-${p.id}" checked> ${money(p.amount)} · ${esc(accountName(p.fromAccount))} → ${esc(accountName(p.toAccount))} · ${dateText(p.date)}</label>`).join('')}`:''}<div class="csv-preview">${csvPreview.slice(0,50).map(r=>`<p>${esc(r.transaction.date)} · ${esc(r.transaction.label)} · ${money(r.transaction.amount)} ${r.duplicate?'(possible duplicate)':''}${r.transferPair?' (in transfer pair)':''}</p>`).join('')}</div>${csvPreview.length>50?'<p class="small">Showing first 50 rows.</p>':''}<button class="primary" data-action="csv-import">Import previewed transactions</button></section>`:''}`};
  if(dialog.mode==='save-filter')return {title:'Save current view',body:`<form id="saveFilterForm" class="form-grid">${field('name','View name','','text','maxlength="40"')}<p class="small">Saves your current search, filters, and sort as a one-tap view.</p><button class="primary">Save view</button></form>`};
  if(dialog.mode==='split'){
    const t=state.transactions.find(x=>x.id===dialog.id);
    if(!t)return{title:'Split transaction',body:'<p class="empty">Transaction not found.</p>'};
    return{title:'Split '+t.label,body:`<p class="small">${money(t.amount)} on ${dateText(t.date)}. Parts must add up to the total. The original is replaced; each part keeps the same cash adjustment.</p><form id="splitForm" class="form-grid">${Array.from({length:splitCount},(_,i)=>`${amountField('amt'+i,'Part '+(i+1)+' amount',i===0?t.amount:'',0.01)}<label>Part ${i+1} category<input name="cat${i}" value="${esc(i===0?t.category:'Other')}" maxlength="80"></label>`).join('')}<div class="row-actions"><button class="quiet" type="button" data-action="split-add">Add part</button></div><button class="primary">Split transaction</button></form>`};
  }
  if(dialog.mode==='duplicates'){
    const groups=C.findDuplicates(state);
    return{title:'Duplicate cleanup',body:`<p class="small">Transactions matching on date, merchant, amount, type, and accounts. Only merge true double-records — two legitimate same-day purchases can look identical, and merging those removes real spending.</p>${groups.length?groups.map(g=>`<div class="report-row"><div class="entry-head"><span>${esc(g[0].label)} · ${dateText(g[0].date)}</span><b>${money(g[0].amount)} × ${g.length}</b></div><button class="secondary" data-action="merge-dup" data-ids="${g.map(t=>t.id).join(',')}">Merge into one (keep earliest)</button></div>`).join(''):'<p class="empty">No duplicates found.</p>'}`};
  }
  if(dialog.mode==='rules'){
    return{title:'Transaction rules',body:`<p class="small">“If the merchant name contains this text, set the category or add the tag.” Rules run top to bottom on new transactions that don't have a category yet — the first match sets the category, every match adds its tag. “Apply to existing” recategorizes past matches.</p>${state.rules.length?state.rules.map(r=>{const n=C.previewRule(state,r).length;return `<div class="report-row"><div class="entry-head"><span>Contains “${esc(r.match)}”</span><b>${n} match${n===1?'':'es'}</b></div><p class="small">→ ${r.category?esc(r.category):'no category change'}${r.tag?' · adds tag #'+esc(r.tag):''}</p><div class="row-actions"><button class="secondary" data-action="rule-apply" data-rule="${r.id}">Apply to existing</button><button class="quiet" data-action="rule-delete" data-rule="${r.id}">Delete</button></div></div>`;}).join(''):'<p class="empty">No rules yet. Add your first below.</p>'}<form id="ruleForm" class="form-grid"><h3 class="section-title">New rule</h3>${field('match','Merchant text to match','','text','maxlength="80"')}${field('category','Set category','','text','maxlength="80" list="categories"').replace(' required','')}${field('tag','Add tag','','text','maxlength="30"').replace(' required','')}<p class="small">Set a category, a tag, or both. Matching ignores case and payment-processor noise like “SQ *”.</p><button class="primary">Add rule</button></form>`};
  }
  if(dialog.mode==='reimbursements'){
    const r=C.reimbursableSummary(state);
    return{title:'Reimbursements',body:`<p class="small">Expenses you expect to be paid back. Logging a reimbursement only tracks what you're owed — record the actual deposit as income separately.</p><div class="summary-grid"><div class="summary"><span>Reimbursable total</span><b>${money(r.total)}</b></div><div class="summary"><span>Paid back</span><b class="positive">${money(r.reimbursed)}</b></div><div class="summary"><span>Still owed</span><b class="${r.owed>0?'danger':''}">${money(r.owed)}</b></div></div>${r.items.length?r.items.map(t=>{const left=C.dollars(C.cents(t.amount)-C.cents(t.reimbursed||0));return `<div class="report-row"><div class="entry-head"><span>${esc(t.label)} · ${dateText(t.date)}</span><b>${left>0?money(left)+' owed':'Paid back ✓'}</b></div><p class="small">${money(t.amount)} total · ${money(t.reimbursed||0)} reimbursed</p>${left>0?`<form data-reimburse="${t.id}" class="form-grid"><label>Log reimbursement ($)<input name="amount" type="number" min="0" max="${left}" step="0.01" value="${left}" required></label><button class="secondary">Log reimbursement</button></form>`:''}</div>`;}).join(''):'<p class="empty">No reimbursable expenses yet. Tick “Reimbursable” when recording an expense.</p>'}`};
  }
  return null;
}
function syncReminders() {
  if(!hasNative())return;
  try {NativeBridge.syncBills(JSON.stringify({enabled:state.reminders===true,bills:state.bills.filter(b=>b.reminder!==false).map(b=>({date:b.date,repeat:b.repeat||'none',anchorDay:b.anchorDay||Number(b.date.slice(8)),reminderDays:b.reminderDays==null?3:b.reminderDays}))}));}catch(e){flash('Could not update phone reminders. Open You and try again.');}
}
window.cashCompassCSV = text => {csvDraft=String(text);csvPreview=null;dialog={mode:'csv'};render();};
window.cashCompassNotice = text => {flash(String(text));if(tab==='profile'&&!dialog)render();};

// Screenshot-inspired workspace. All charts use entered records.
let menuOpen=false, recurringView='list', recurringScope='month', flowPeriod='monthly', flowMonth=C.localDate().slice(0,7), flowGroup='category', flowAccount='all', budgetCycle='month';
let reportStart=C.localDate().slice(0,7)+'-01',reportEnd=C.localDate(),reportView='flow';
let txAccount='all',txCategory='',txStart='',txEnd='',txSort='newest',txLimit=100,txTag='all',txMin='',txMax='',selectedTransactions=new Set(),pendingUndo=null;
function allTags(){const s=new Set();state.transactions.forEach(t=>(t.tags||[]).forEach(tag=>s.add(tag)));return [...s].sort();}
let investmentView='value',goalView='save',forecastView='long';
const destinations=[['home','⌂','Dashboard'],['accounts','▤','Accounts'],['transactions','▣','Transactions'],['cashflow','▥','Cash Flow'],['reports','◴','Reports'],['budgets','▧','Budget'],['plan','▦','Recurring'],['goals','◎','Goals'],['investments','↗','Investments'],['forecasting','◈','Forecasting'],['coach','✧','Advice'],['profile','⚙','You']];
const monthEnd=m=>{const [y,n]=m.split('-').map(Number);return C.localDate(new Date(y,n,0));};
const shiftMonth=(m,n)=>{const [y,a]=m.split('-').map(Number);return C.localDate(new Date(y,a-1+n,1)).slice(0,7);};
const totalAmounts=items=>C.dollars(items.reduce((s,x)=>s+C.cents(x.amount),0));
const badge=(text,positive=true)=>`<span class="badge ${positive?'gain':'loss'}">${esc(text)}</span>`;
function stat(label,value,cls='',explain=null){const btn=explain?` data-action="explain" data-kind="${explain}" role="button" tabindex="0" aria-label="Explain ${esc(label)}" title="Tap to see calculation"`:'';return `<div class="stat ${cls}${explain?' clickable':''}"${btn}><strong>${value}</strong><span>${label}</span></div>`;}
function panel(title,body,actions='',cls=''){return `<section class="panel ${cls}"><div class="panel-head"><h2>${title}</h2>${actions}</div><div class="panel-body">${body}</div></section>`;}
function routeButton(key,title){return `<button class="quiet" data-tab="${key}">${title||destinations.find(d=>d[0]===key)[2]} <span aria-hidden="true">→</span></button>`;}
function header(title,subtitle){return `<header class="workspace-top"><button class="menu-button" data-action="menu" aria-label="Open navigation" aria-expanded="${menuOpen}">☰</button><span class="mobile-brand">Cash Compass</span><button class="icon-btn" data-tab="profile" aria-label="Your settings">⚙</button></header>${state.demo?'<div class="notice">Sample plan · fictional entries <button data-action="fresh" class="text-btn">Start my own plan</button></div>':''}${storageError?`<div class="notice danger" role="alert">${esc(storageError)}</div>`:''}<div class="page-heading"><h1>${title}</h1></div><p class="subhead">${subtitle}</p>`;}
function nav(){const links=destinations.map(([key,icon,title])=>`<button data-tab="${key}" ${tab===key?'class="active" aria-current="page"':''}><span aria-hidden="true">${icon}</span>${title}${key==='plan'&&state.bills.length?`<small>${state.bills.length}</small>`:''}</button>`).join('');return `<div class="drawer-shade ${menuOpen?'open':''}" data-dismiss-menu="true"></div><aside class="sidebar ${menuOpen?'open':''}"><div class="side-brand"><b>◈</b> Cash Compass<button class="menu-button" data-action="menu" aria-label="Close navigation">×</button></div><nav aria-label="All sections">${links}</nav><div class="side-footer"><span class="offline-dot"></span> Offline · your device<br><small>Version ${APP_VERSION} preview</small></div></aside><nav class="nav" aria-label="Main navigation">${[['home','⌂','Dashboard'],['transactions','▣','Activity'],['budgets','▧','Budget']].map(([key,icon,title])=>`<button data-tab="${key}" ${tab===key?'class="active" aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</button>`).join('')}<button data-action="menu" aria-expanded="${menuOpen}"><span class="nav-icon" aria-hidden="true">☰</span>More</button></nav>`;}
function lineChart(series,labels,title,colors=['#00a2bd','#ff692f']) {
  if(!labels.length)return '<p class="empty">History starts when you save a balance or holding. No earlier values are assumed.</p>';
  const values=series.flatMap(s=>s.values),low=Math.min(0,...values),high=Math.max(1,...values),span=high-low;
  const x=i=>60+(labels.length===1?300:i/(labels.length-1)*620),y=v=>190-(v-low)/span*155;
  return `<div class="chart-scroll"><svg class="line-chart" viewBox="0 0 720 235" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${[0,1,2,3].map(i=>{const v=low+span*i/3;return `<line x1="60" x2="680" y1="${y(v)}" y2="${y(v)}" stroke="#eceae7"/><text x="52" y="${y(v)+4}" text-anchor="end">${esc(new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v))}</text>`;}).join('')}${series.map((s,j)=>`<polyline fill="none" stroke="${colors[j%colors.length]}" stroke-width="3" points="${s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>${s.values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${colors[j%colors.length]}"><title>${esc(labels[i])} · ${esc(s.name)}: ${money(v)}</title></circle>`).join('')}`).join('')}${[...new Set([0,Math.floor((labels.length-1)/2),labels.length-1])].map(i=>`<text x="${x(i)}" y="215" text-anchor="middle">${esc(labels[i])}</text>`).join('')}</svg></div><div class="chart-legend">${series.map((s,j)=>`<span><i style="background:${colors[j%colors.length]}"></i>${esc(s.name)}</span>`).join('')}</div><details class="chart-data"><summary>View chart data</summary><div class="table-scroll"><table><thead><tr><th>Date</th>${series.map(s=>`<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${labels.map((l,i)=>`<tr><td>${esc(l)}</td>${series.map(s=>`<td>${money(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function progressRow(label,used,planned){return `<div class="budget-progress"><div class="entry-head"><b>${esc(label)}</b><span>${money(planned)} planned</span></div><div class="goal-track"><span class="${used>planned?'over':''}" style="width:${planned>0?Math.min(100,Math.max(0,used/planned*100)):used?100:0}%"></span></div><div class="entry-head small"><span>${money(used)} spent</span><b class="${used>planned?'danger':'positive'}">${money(planned-used)} remaining</b></div></div>`;}
function recentRows(rows){return rows.length?`<div class="compact-list">${rows.map(t=>`<button class="compact-row" data-edit="${t.id}" data-kind="transactions"><span class="merchant-mark">${esc(t.label.slice(0,1).toUpperCase())}</span><span>${esc(t.label)}<small>${esc(t.category)}</small></span><strong class="${t.type==='income'?'positive':''}">${t.type==='income'?'+':t.type==='transfer'?'↔':''}${money(t.amount)}</strong><span aria-hidden="true">›</span></button>`).join('')}</div>`:'<p class="empty">No transactions yet. Record or import your history to get started.</p>';}
function home(){
 const month=C.localDate().slice(0,7),r=C.cashFlow(state,month+'-01',monthEnd(month)),b=C.budgetSummary(state,month),p=C.portfolio(state),f=C.forecast(state),history=state.balanceHistory||[];
 const checks=[['Add an account balance',state.accounts.some(a=>a.balance!==0),'accounts'],['Record a transaction',!!state.transactions.length,'transactions'],['Plan a category budget',!!state.budgets.length,'budgets'],['Add recurring payments',!!state.bills.length||!!state.incomes.length,'plan'],['Set a savings goal',!!state.goals.length,'goals']];
 const previous=shiftMonth(month,-1),count=Number(monthEnd(month).slice(8)),cumulative=m=>Array.from({length:count},(_,i)=>C.dollars(state.transactions.filter(t=>t.type==='expense'&&t.date.slice(0,7)===m&&Number(t.date.slice(8))<=i+1).reduce((s,t)=>s+C.cents(t.amount),0)));
 const spending=lineChart([{name:'This month',values:cumulative(month)},{name:'Last month',values:cumulative(previous)}],Array.from({length:count},(_,i)=>'Day '+(i+1)),'Cumulative recorded spending',['#ff692f','#99958f']);
 const cards={
 setup:panel('Getting started',`<div class="setup-status"><strong>${checks.filter(x=>x[1]).length}/5 complete</strong><span>Your financial picture, one step at a time.</span></div>${checks.map(([label,done,key])=>`<button class="check-row" data-tab="${key}"><span class="${done?'positive':''}">${done?'✓':'○'}</span>${label}<span>→</span></button>`).join('')}`),
 budget:panel('Budget <small>'+month+'</small>',['fixed','flexible','occasional'].map(bucket=>{const rows=b.rows.filter(x=>x.bucket===bucket);return progressRow({fixed:'Fixed',flexible:'Flexible',occasional:'Non-monthly'}[bucket],totalAmounts(rows.map(x=>({amount:x.spent}))),totalAmounts(rows.map(x=>({amount:x.available}))));}).join('')+`<details><summary>Per-category progress</summary>${b.rows.filter(x=>x.bucket!=='income').slice(0,8).map(x=>progressRow(x.category,x.spent,x.available)).join('')||'<p class="small">No categories yet.</p>'}</details>`+(b.unbudgeted?`<p class="small danger">${money(b.unbudgeted)} of spending is unbudgeted.</p>`:''),routeButton('budgets')),
 spending:panel('Spending <small>'+money(r.expense)+' this month</small>',spending,routeButton('cashflow')),
 transactions:panel('Transactions <small>Most recent</small>',recentRows([...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)),routeButton('transactions')),
 worth:panel(money(C.netWorth(state))+' <small>net worth</small>',lineChart([{name:'Recorded net worth',values:history.map(h=>h.value)}],history.map(h=>h.date),'Net worth history'),routeButton('accounts')),
 goals:panel('Goals',state.goals.length?state.goals.slice(0,3).map(g=>`<div class="goal"><div class="entry-head"><b>${esc(g.label)}</b><strong>${money(g.saved)}</strong></div><p class="small">${g.deadline?dateText(g.deadline):'No target date'} · ${money(g.target)} target</p><div class="goal-track"><span style="width:${Math.min(100,g.saved/g.target*100)}%"></span></div></div>`).join(''):'<p class="empty">Build an emergency fund or save for what comes next.</p>',routeButton('goals')),
 recurring:panel('Recurring',state.bills.length?state.bills.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4).map(x=>`<div class="compact-row"><span class="merchant-mark">▦</span><span>${esc(x.label)}<small>${dateText(x.date)}</small></span><b>${money(x.amount)}</b></div>`).join(''):'<div class="empty"><span class="empty-icon">▦</span><h3>Stay on top of your bills</h3><p>Add payments and track what is coming up.</p></div>',routeButton('plan','See recurring')),
 investments:panel(money(p.value)+' <small>investments</small>',p.rows.length?p.rows.slice(0,5).map(h=>`<div class="compact-row"><b>${esc(h.symbol)}</b><span>${esc(h.label)}</span><strong>${money(h.value)}</strong>${badge(money(h.gain),h.gain>=0)}</div>`).join(''):'<p class="empty">Add your holdings to track value, allocation, and gain versus cost.</p>',routeButton('investments')),
 advice:panel('Cash outlook',`<div class="stats-grid">${stat('Available before payday',f.safe===null?'Add payday':money(f.safe),'','safe')}${stat('30-day low after reserves',money(f.low),f.low<0?'danger':'')}</div><p class="small">Based on entered cash, unpaid bills, and reserves. Investment holdings are excluded from spendable cash.</p><div class="row-actions"><button data-action="add" data-kind="incomes">Add income</button><button data-action="add" data-kind="bills">Add bill</button>${routeButton('forecasting','Forecast')}${routeButton('coach','Explain my plan')}</div>`)
 };
 return header(`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${esc(state.profile.name)}.`, 'Your money at a glance.')+`<div class="page-actions"><button class="quiet" data-action="customize">▦ Customize dashboard</button><button class="primary" data-action="add" data-kind="transactions">+ Add transaction</button></div><div class="dashboard-grid">${['setup','spending','budget','transactions','worth','recurring','goals','investments','advice'].filter(k=>!(state.hiddenCards||[]).includes(k)).map(k=>cards[k]).join('')}</div>${!state.transactions.length?'<button class="quiet" data-action="demo">Explore a sample plan</button>':''}`+insightsFeed();
}
// Proactive insights feed (roadmap #77): dashboard cards from the user's data.
function insightsFeed() {
  const cards = C.insights(state);
  if (!cards.length) return '';
  const detail = c => {
    if (c.kind === 'spike') return `${money(c.detail.previous)} → ${money(c.detail.current)}`;
    if (c.kind === 'budget') return `${money(c.detail.spent)} of ${money(c.detail.budget)}`;
    if (c.kind === 'bills') return c.detail.bills.map(b => `${esc(b.label)} ${money(b.amount)}`).join(' · ');
    if (c.kind === 'savings') return `${c.detail.from}% → ${c.detail.to}% over 3 months`;
    if (c.kind === 'anomaly') return c.detail.amount ? `${money(c.detail.amount)} · ${esc(c.detail.reason)}` : 'Review in Transactions → Find duplicates.';
    return 'At your recent spending pace';
  };
  return `<section class="section"><h2 class="section-title">Insights</h2><div class="insights-grid">${cards.map(c => `<div class="insight tone-${c.tone}"><b>${esc(c.title)}</b><span>${detail(c)}</span></div>`).join('')}</div></section>`;
}
function accounts(){const p=C.portfolio(state),history=state.balanceHistory||[],cash=state.accounts.filter(a=>a.balance>=0).reduce((s,a)=>s+C.cents(a.balance),0)/100,debt=state.accounts.filter(a=>a.balance<0).reduce((s,a)=>s-C.cents(a.balance),0)/100;
 return header('Accounts','Balances, assets, and liabilities in one place.')+`<div class="page-actions"><button class="quiet" data-action="snapshot">Record today’s balances</button><button class="quiet" data-action="transfer">Record transfer</button><button class="primary" data-action="add" data-kind="accounts">+ Add account</button></div>`+panel('Net worth <strong>'+money(C.netWorth(state))+'</strong>',lineChart([{name:'Net worth',values:history.map(h=>h.value)}],history.map(h=>h.date),'Recorded net worth')+annotationsSection())+creditCardsSection()+`<div class="content-with-aside"><div>${[['Cash',state.accounts.filter(a=>a.type!=='credit')],['Credit cards',state.accounts.filter(a=>a.type==='credit')]].map(([name,items])=>panel(name,items.length?items.map(a=>`<article class="account-row"><span class="merchant-mark">${a.type==='credit'?'▣':'▤'}</span><div><b>${esc(a.label)}</b><small>${esc(a.type)} · manually tracked</small></div><strong>${money(a.balance)}</strong><div class="row-actions"><button data-edit="${a.id}" data-kind="accounts">Edit / reconcile</button><button data-remove="${a.id}" data-kind="accounts">Remove</button></div></article>`).join(''):'<p class="empty">No accounts in this group.</p>')).join('')}${panel('Investments',`<div class="compact-row"><span>Manually tracked holdings</span><strong>${money(p.value)}</strong></div>`,routeButton('investments'))}</div>${panel('Summary',`<dl class="summary-list"><dt>Assets</dt><dd>${money(cash+p.value)}</dd><dt>Cash balances</dt><dd>${money(cash)}</dd><dt>Investments</dt><dd>${money(p.value)}</dd><dt>Liabilities / overdrafts</dt><dd>${money(debt)}</dd><dt>Net worth</dt><dd>${money(C.netWorth(state))}</dd></dl><p class="small">Holdings are separate assets. Do not also enter their value as a cash balance. History records saved values from this version onward.</p>`)}</div>`;
}
// Net worth chart annotations (roadmap #69).
function annotationsSection(){
 const anns = state.annotations || [];
 return `<div class="annotations"><h3 class="subsection">Chart annotations</h3>${anns.length?`<ul class="annotation-list">${anns.map(a=>`<li><b>${dateText(a.date)}</b>: ${esc(a.label)} <button class="quiet" data-action="ann-delete" data-id="${a.id}" aria-label="Delete annotation">×</button></li>`).join('')}</ul>`:'<p class="small">Mark major events (job change, home purchase, etc.) on your net worth chart.</p>'}<form id="annotationForm" class="filter-bar">${field('label','Event','', 'text','maxlength="80"').replace(' required','')}${field('date','Date',C.localDate(),'date').replace(' required','')}<button class="quiet">Add</button></form></div>`;
}
// Credit card tracker (roadmap #46) and payment planner (roadmap #47).
function creditCardsSection(){
 const cards = (state.creditCards || []).map(c => C.creditCardStatus(state, c));
 return panel('Credit cards', `${cards.length?cards.map(c=>`<article class="account-row"><span class="merchant-mark">▣</span><div><b>${esc(c.label)}</b><small>${c.last4?'•••• '+c.last4+' · ':''}Statement ${dateText(c.statementDate)} · Due ${dateText(c.dueDate)}${c.overdue?' · <b class="danger">OVERDUE</b>':c.dueSoon?` · <b class="danger">${c.daysUntilDue}d left</b>`:''}</small></div><strong>${money(c.balance)}</strong><div class="row-actions"><button class="quiet" data-action="cc-plan" data-id="${c.id}">Plan payment</button><button data-edit="${c.id}" data-kind="creditCards">Edit</button><button class="quiet" data-remove="${c.id}" data-kind="creditCards">×</button></div></article>`).join(''):'<p class="small">Track statement dates, due dates, and minimums.</p>'}<button class="primary" data-action="add" data-kind="creditCards">+ Add card</button><div id="ccPlan"></div>`);
}
function transactionRows(){const min=txMin===''?null:Number(txMin),max=txMax===''?null:Number(txMax);return state.transactions.filter(t=>(transactionType==='all'||t.type===transactionType)&&(txAccount==='all'||t.accountId===txAccount||t.toAccountId===txAccount)&&(!txCategory||t.category.toLowerCase().includes(txCategory.toLowerCase()))&&(txTag==='all'||(t.tags||[]).includes(txTag))&&(!txStart||t.date>=txStart)&&(!txEnd||t.date<=txEnd)&&(min===null||t.amount>=min)&&(max===null||t.amount<=max)&&`${t.label} ${t.category} ${t.date} ${(t.tags||[]).join(' ')} ${t.note||''}`.toLowerCase().includes(transactionQuery.toLowerCase())).sort((a,b)=>txSort==='oldest'?a.date.localeCompare(b.date):txSort==='amount'?b.amount-a.amount:b.date.localeCompare(a.date));}
function currentTxFilter(){return {query:transactionQuery,type:transactionType,account:txAccount,category:txCategory,tag:txTag,min:txMin,max:txMax,start:txStart,end:txEnd};}
function applyTxFilter(f){transactionQuery=String(f.query||'');transactionType=f.type||'all';txAccount=f.account||'all';txCategory=String(f.category||'');txTag=String(f.tag||'all');txMin=f.min==null?'':String(f.min);txMax=f.max==null?'':String(f.max);txStart=f.start||'';txEnd=f.end||'';txLimit=100;selectedTransactions.clear();}
function transactionSummary(rows){const refunds=rows.filter(t=>t.type==='income'&&t.refundOf),refundTotal=totalAmounts(refunds),incomes=rows.filter(t=>t.type==='income'&&!t.refundOf),expenses=rows.filter(t=>t.type==='expense'),sum=totalAmounts,spent=sum(expenses)-refundTotal;return `<dl class="summary-list"><dt>Total transactions</dt><dd>${rows.length}</dd><dt>Total income</dt><dd class="positive">${money(sum(incomes))}</dd><dt>Total spending</dt><dd>${money(spent)}${refunds.length?` <span class="small">(net of ${money(refundTotal)} refunds)</span>`:''}</dd><dt>Net income</dt><dd>${money(sum(incomes)-spent)}</dd><dt>Largest expense</dt><dd>${money(Math.max(0,...expenses.map(t=>t.amount)))}</dd><dt>Average expense</dt><dd>${money(expenses.length?sum(expenses)/expenses.length:0)}</dd><dt>First transaction</dt><dd>${rows.length?[...rows].sort((a,b)=>a.date.localeCompare(b.date))[0].date:'—'}</dd><dt>Last transaction</dt><dd>${rows.length?[...rows].sort((a,b)=>b.date.localeCompare(a.date))[0].date:'—'}</dd></dl>`;}
function transactions(){const rows=transactionRows(),visible=rows.slice(0,txLimit),reimb=C.reimbursableSummary(state);let date='';return header('Transactions','Search and organize your recorded activity.')+`<div class="notice"><button class="text-btn" data-tab="wallet">Google Wallet · ${state.wallet.inbox.length} to review →</button></div>`+`<div class="page-actions"><button class="primary" data-action="add" data-kind="transactions">+ Add transaction</button><form id="quickEntryForm" class="quick-entry"><input name="quick" id="quickInput" placeholder="12.50 chipotle" aria-label="Quick entry"><button type="button" class="quiet" data-action="voice" aria-label="Voice entry">🎤</button><button class="quiet">Add</button></form><button class="quiet" data-action="csv">Import / export CSV</button><button class="quiet" data-action="duplicates">Find duplicates</button><button class="quiet" data-action="rules">Rules</button><button class="quiet" data-action="reimbursements">Reimbursements${reimb.owed > 0 ? ` · ${money(reimb.owed)} owed` : ''}</button></div><form id="transactionSearch" class="filter-bar">${field('query','Search',transactionQuery,'search').replace(' required','')}${selectField('type','Type',transactionType,[['all','All transactions'],['expense','Expenses'],['income','Income'],['transfer','Transfers']])}${selectField('account','Account',txAccount,[['all','All accounts'],...state.accounts.map(a=>[a.id,a.label])])}${field('filterCategory','Category',txCategory).replace(' required','')}${field('start','From',txStart,'date').replace(' required','')}${field('end','Through',txEnd,'date').replace(' required','')}${selectField('sort','Sort',txSort,[['newest','Newest first'],['oldest','Oldest first'],['amount','Largest amount']])}${selectField('tag','Tag',txTag,[['all','All tags'],...allTags().map(t=>[t,'#'+t])])}${field('min','Min amount',txMin,'number','min="0" step="0.01"').replace(' required','')}${field('max','Max amount',txMax,'number','min="0" step="0.01"').replace(' required','')}<button class="quiet">Apply filters</button><button class="quiet" type="button" data-action="tx-clear">Clear filters</button><button class="quiet" type="button" data-action="tx-save-view">Save view</button></form>${state.savedFilters.length?`<div class="row-actions"><span class="small">Saved views:</span>${state.savedFilters.map(sf=>`<button class="quiet" data-action="tx-apply-filter" data-filter="${sf.id}">${esc(sf.name)}</button><button class="quiet" data-action="tx-delete-filter" data-filter="${sf.id}" aria-label="Delete saved view ${esc(sf.name)}">×</button>`).join('')}</div>`:''}<div class="content-with-aside"><section class="panel"><div class="panel-head"><h2>${rows.length} transactions</h2><button class="quiet" data-action="bulk">Edit selected (${selectedTransactions.size})</button>${pendingUndo?`<button class="quiet" data-action="undo">↩ Undo: ${esc(pendingUndo.label)}</button>`:``}</div><div class="transaction-list">${visible.map(t=>{const group=date!==t.date?`<div class="date-group">${dateText(t.date)}</div>`:'';date=t.date;return group+`<div class="transaction-row"><input type="checkbox" data-select-tx="${t.id}" aria-label="Select ${esc(t.label)}" ${selectedTransactions.has(t.id)?'checked':''}><span class="merchant-mark">${esc(t.label.slice(0,1))}</span><button class="tx-name" data-edit="${t.id}" data-kind="transactions">${esc(t.label)}<small>${esc(accountName(t.accountId))}${t.walletId?' · Google Wallet':''}${t.refundOf?' · ↩ refund':''}${t.reimbursable?' · reimbursable':''}</small></button><span class="tx-category">${esc(t.category)}${(t.tags||[]).map(tag=>` <span class="tag-chip">#${esc(tag)}</span>`).join('')}</span>${t.note?`<small class="tx-note">${esc(t.note)}</small>`:''}<b class="${t.type==='income'?'positive':''}">${t.type==='income'?'+':t.type==='transfer'?'↔':''}${money(t.amount)}</b><button class="quiet" data-remove="${t.id}" data-kind="transactions" aria-label="Delete ${esc(t.label)}">×</button></div>`;}).join('')||'<p class="empty">No matching transactions.</p>'}</div>${rows.length>txLimit?'<button class="quiet" data-action="more-tx">Show 100 more</button>':''}</section>${panel('Summary',transactionSummary(rows)+'<p class="small">Transfers are excluded from income and spending.</p>')}</div>`;}
function periodRange(){const year=flowMonth.slice(0,4),month=Number(flowMonth.slice(5)),first=flowPeriod==='yearly'?year+'-01':flowPeriod==='quarterly'?year+'-'+String(Math.floor((month-1)/3)*3+1).padStart(2,'0'):flowMonth;return {start:first+'-01',end:monthEnd(shiftMonth(first,flowPeriod==='yearly'?11:flowPeriod==='quarterly'?2:0))};}
function breakdown(items,total,kind){return items.length?items.map(g=>`<div class="breakdown-row"><span class="breakdown-fill ${kind}" style="width:${total?g.amount/total*100:0}%"></span><span>${esc(g.label)}</span><b>${money(g.amount)} <small>(${total?(g.amount/total*100).toFixed(1):0}%)</small></b></div>`).join(''):'<p class="empty">No recorded '+kind+' for this period.</p>';}
function cashStats(r){return `<div class="stats-grid four">${stat('Income',money(r.income),'positive')}${stat('Expenses',money(r.expense),'danger')}${stat('Net savings',money(r.net),r.net<0?'danger':'')}${stat('Savings rate',r.rate===null?'—':r.rate.toFixed(1)+'%')}</div>`;}
function cashflow(){const range=periodRange(),r=C.cashFlow(state,range.start,range.end,flowAccount,flowGroup),months=Array.from({length:12},(_,i)=>shiftMonth(flowMonth,i-11)),trends=months.map(m=>C.cashFlow(state,m+'-01',monthEnd(m),flowAccount));
 return header('Cash Flow','Income, spending, and savings from recorded transactions.')+`<form id="cashFlowForm" class="filter-bar">${field('month','Period ending',flowMonth,'month')}${selectField('period','View',flowPeriod,[['monthly','Monthly'],['quarterly','Quarterly'],['yearly','Yearly']])}${selectField('account','Account',flowAccount,[['all','All accounts'],...state.accounts.map(a=>[a.id,a.label])])}${selectField('group','Group by',flowGroup,[['category','Category'],['merchant','Merchant']])}<button class="quiet">View cash flow</button></form>`+panel('Monthly history',lineChart([{name:'Income',values:trends.map(r=>r.income)},{name:'Expenses',values:trends.map(r=>r.expense)},{name:'Net savings',values:trends.map(r=>r.net)}],months,'Monthly cash flow',['#2c9d70','#e55965','#30302d']))+`<h2 class="period-heading">${range.start} — ${range.end}</h2>`+cashStats(r)+panel('Income → spending & saved',flowDiagram(r))+panel('Income',breakdown(r.incomes,r.income,'income'))+panel('Expenses',breakdown(r.expenses,r.expense,'expenses'));
}
function flowDiagram(r) {
 const flow=C.cashFlowSankey(r),cash=value=>money(C.dollars(value));
 if(!flow.totalCents)return '<div class="empty flow-empty"><h3>No cash flow in this period</h3><p>Add income or expenses, or choose another date range or account. Transfers do not count as income or spending.</p></div>';
 const palette=['#5275c5','#b57832','#9561b3','#327f9b','#c96555','#63833d'];
 const color=g=>g.kind==='income'?'#27845d':g.kind==='saved'?'#27845d':g.kind==='gap'?'#ba4050':g.grouped?'#7c8491':palette[Array.from(g.label.toLowerCase()).reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,0)%palette.length];
 const scale=300/flow.totalCents,gap=18,minSlot=46;
 const stackHeight=items=>items.reduce((n,g)=>n+Math.max(minSlot,g.cents*scale),0)+Math.max(0,items.length-1)*gap;
 const bodyHeight=Math.max(stackHeight(flow.incoming),stackHeight(flow.outgoing)),top=64,poolY=top+(bodyHeight-300)/2;
 const layout=(items,left)=>{
   let y=top+(bodyHeight-stackHeight(items))/2,offset=0;
   return items.map(g=>{
     const h=g.cents*scale,slot=Math.max(minSlot,h),node={...g,left,x:left?160:586,y:y+(slot-h)/2,h,center:y+slot/2,poolY:poolY+offset,color:color(g)};
     y+=slot+gap;offset+=h;return node;
   });
 };
 const incoming=layout(flow.incoming,true),outgoing=layout(flow.outgoing,false),nodes=incoming.concat(outgoing);
 const fullLabel=g=>`${g.label}${g.kind==='expense'?' · Expense':g.kind==='income'?' · Income':''}`;
 const description=`Recorded income ${cash(flow.incomeCents)}; expenses ${cash(flow.expenseCents)}; ${flow.gapCents?'funding gap '+cash(flow.gapCents):'saved '+cash(flow.savedCents)}. Band widths are proportional to amounts. Transfers are excluded. Exact values follow the chart.`;
 const ribbon=g=>{
   const x1=g.left?174:387,x2=g.left?373:586,y1=g.left?g.y:g.poolY,y2=g.left?g.poolY:g.y,mid=(x1+x2)/2;
   return `<path class="flow-band" data-kind="${g.kind}" data-cents="${g.cents}" fill="${g.color}" fill-opacity=".26" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2} L ${x2} ${y2+g.h} C ${mid} ${y2+g.h}, ${mid} ${y1+g.h}, ${x1} ${y1+g.h} Z"><title>${esc(fullLabel(g))}: ${cash(g.cents)}</title></path>`;
 };
 const shortLabel=text=>Array.from(text).length>19?Array.from(text).slice(0,18).join('')+'…':text;
 const graphic=`<div class="chart-scroll flow-scroll" tabindex="0" role="region" aria-label="Cash flow diagram; scroll horizontally to see all labels"><svg viewBox="0 0 760 ${top+bodyHeight+16}" class="flow-chart" role="img" aria-labelledby="sankey-title sankey-description"><title id="sankey-title">Cash flow Sankey</title><desc id="sankey-description">${esc(description)}</desc><text x="152" y="22" text-anchor="end" class="flow-heading">Income${flow.gapCents?' + gap':''}</text><text x="380" y="22" text-anchor="middle" class="flow-heading">Cash flow</text><text x="380" y="41" text-anchor="middle">${cash(flow.totalCents)}</text><text x="608" y="22" class="flow-heading">Spending + saved</text>${nodes.map(ribbon).join('')}<rect x="373" y="${poolY}" width="14" height="300" rx="3" fill="#525b62"/>${nodes.map(g=>`<g class="flow-node" data-kind="${g.kind}"><title>${esc(fullLabel(g))}: ${cash(g.cents)}</title><rect x="${g.x}" y="${g.y}" width="14" height="${g.h}" fill="${g.color}"/><text x="${g.left?152:608}" y="${g.center-5}" text-anchor="${g.left?'end':'start'}">${esc(shortLabel(g.label))}<tspan x="${g.left?152:608}" dy="19">${cash(g.cents)}</tspan></text></g>`).join('')}</svg></div>`;
 const rows=items=>items.map(g=>`<tr><th scope="row"><span class="flow-key" style="background:${g.color}"></span>${esc(fullLabel(g))}${g.grouped?`<details class="flow-members"><summary>${g.members.length} included group${g.members.length===1?'':'s'}</summary><ul>${g.members.map(m=>`<li><span>${esc(m.label)}</span><b>${cash(m.cents)}</b></li>`).join('')}</ul></details>`:''}</th><td>${cash(g.cents)}</td></tr>`).join('');
 const table=(items,title)=>`<table class="flow-values"><caption>${title}</caption><thead><tr><th scope="col">Group</th><th scope="col">Amount</th></tr></thead><tbody>${rows(items)}</tbody><tfoot><tr><th scope="row">Total</th><td>${cash(flow.totalCents)}</td></tr></tfoot></table>`;
 return `<section class="sankey" aria-label="Cash flow Sankey"><div class="flow-summary"><span>${flow.gapCents?'Spending exceeds income':'Income left after spending'}</span><strong class="${flow.gapCents?'danger':'positive'}">${cash(flow.gapCents||flow.savedCents)} ${flow.gapCents?'gap':'saved'}</strong></div>${graphic}<p class="small flow-scroll-hint">Swipe the diagram to see all labels, or open the exact values below.</p><p class="small">${flow.gapCents?'Funding gap is spending above recorded income. It does not identify borrowing or where the extra money came from.':'Saved means recorded income minus expenses, not a transfer to a savings account or your safe-to-spend amount.'} Transfers are excluded.</p><p class="small">Groups below 3% of their income or expense total are combined into Other. Up to five named income groups and six spending groups are shown; remaining groups join Other.</p><details class="chart-data flow-data"><summary>View exact amounts and Other details</summary><div class="flow-tables">${table(incoming,'Income and funding')}${table(outgoing,'Spending and saved')}</div></details></section>`;
}
function reports(){const r=C.cashFlow(state,reportStart,reportEnd,reportAccount,flowGroup);return header('Reports','Explore cash flow, income, and spending over any date range.')+`<div class="page-actions"><button class="quiet" data-action="export-csv">Export CSV</button><button class="quiet" data-action="export-print">Print / PDF</button><button class="quiet" data-action="share">Share summary</button></div><div class="tabs">${[['flow','Cash Flow'],['spending','Spending'],['income','Income']].map(([v,l])=>`<button data-report-view="${v}" class="${reportView===v?'active':''}">${l}</button>`).join('')}</div><form id="detailReportForm" class="filter-bar">${field('start','From',reportStart,'date')}${field('end','Through',reportEnd,'date')}${selectField('account','Account',reportAccount,[['all','All accounts'],...state.accounts.map(a=>[a.id,a.label])])}${selectField('group','Group by',flowGroup,[['category','Category'],['merchant','Merchant']])}<button class="quiet">Update report</button></form>`+cashStats(r)+panel(reportView==='flow'?'Income → spending & savings':reportView==='income'?'Income breakdown':'Spending breakdown',reportView==='flow'?flowDiagram(r):breakdown(reportView==='income'?r.incomes:r.expenses,reportView==='income'?r.income:r.expense,reportView==='income'?'income':'expenses'))+`<div class="content-with-aside"><div>${panel('Income',breakdown(r.incomes,r.income,'income'))}${panel('Expenses',breakdown(r.expenses,r.expense,'expenses'))}</div>${panel('Summary',transactionSummary(r.rows))}</div>`+taxSetAsideSection()+topMerchantsSection()+savingsRateSection()+spendingTrendsSection()+monthOverMonthSection()+monthlyReviewSection()+yearReviewSection()+seasonalSection()+calendarSection();}
// Auto-drafted monthly review (roadmap #80).
function monthlyReviewSection() {
  const r = C.monthlyReview(state);
  const lines = [];
  if (r.rose.count) lines.push(`Spending rose in ${r.rose.count} categor${r.rose.count === 1 ? 'y' : 'ies'} by ${money(r.rose.total)} total, led by ${esc(r.rose.top.category)} (+${money(r.rose.top.change)}).`);
  if (r.fell.count) lines.push(`Spending fell in ${r.fell.count} categor${r.fell.count === 1 ? 'y' : 'ies'} by ${money(r.fell.total)} total, led by ${esc(r.fell.top.category)} (${money(r.fell.top.change)}).`);
  if (!r.rose.count && !r.fell.count) lines.push('Spending was flat across categories.');
  if (r.savings) lines.push(`You saved ${r.savings.cur}% of income (${money(r.savings.saved)}) vs ${r.savings.prev}% (${money(r.savings.prevSaved)}) last month.`);
  if (r.bills.count) lines.push(`${r.bills.count} bill${r.bills.count === 1 ? '' : 's'} scheduled for ${r.month} totaling ${money(r.bills.total)}.`);
  return `<section class="section card"><h2 class="section-title">Monthly review</h2><p class="small">${r.month} vs ${r.prev} · drafted from your data.</p><ul class="review-lines">${lines.map(l => `<li>${l}</li>`).join('')}</ul></section>`;
}
let merchantMonths = 12, reviewYear = C.localDate().slice(0, 4), calendarMonth = C.localDate().slice(0, 7);
// Spending calendar heatmap (#64) and projected balance (#65).
function calendarSection() {
  const heat = C.spendHeatmap(state, calendarMonth);
  const bal = C.dailyBalanceForecast(state, calendarMonth);
  const form = `<form id="calendarForm" class="filter-bar">${field('month','Month',calendarMonth,'month')}<button class="quiet">View</button></form>`;
  const [y, m] = calendarMonth.split('-').map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<span class="cal-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = calendarMonth + '-' + String(d).padStart(2, '0');
    const spent = heat.days[date] || 0;
    const intensity = heat.intensity[date] || 0;
    const balance = bal.days[date];
    const bg = spent > 0 ? `background:rgba(214,69,69,${0.1 + intensity / 100 * 0.5})` : '';
    cells += `<span class="cal-day" style="${bg}" title="${date}: spent ${money(spent)}${balance !== undefined ? ', balance ' + money(balance) : ''}"><b>${d}</b>${spent > 0 ? `<small>${money(spent)}</small>` : ''}${balance !== undefined && balance < 0 ? '<small class="danger">low</small>' : ''}</span>`;
  }
  return `<section class="section card"><h2 class="section-title">Calendar</h2>${form}<p class="small">Spending intensity (red) and projected daily balance for ${calendarMonth}.</p><div class="calendar-grid"><span class="cal-head">S</span><span class="cal-head">M</span><span class="cal-head">T</span><span class="cal-head">W</span><span class="cal-head">T</span><span class="cal-head">F</span><span class="cal-head">S</span>${cells}</div></section>`;
}
// Year-in-review (roadmap #61).
function yearReviewSection() {
  const y = C.yearInReview(state, reviewYear);
  const form = `<form id="yearReviewForm" class="filter-bar">${field('year','Year',reviewYear,'number','min="2000" max="2100" step="1"')}<button class="quiet">View</button></form>`;
  return `<section class="section card"><h2 class="section-title">Year in review</h2>${form}<div class="summary-grid"><div class="summary"><span>Income</span><b class="positive">${money(y.income)}</b></div><div class="summary"><span>Spending</span><b>${money(y.expense)}</b></div><div class="summary"><span>Saved</span><b class="${y.saved >= 0 ? 'positive' : 'danger'}">${money(y.saved)}</b></div><div class="summary"><span>Savings rate</span><b>${y.savingsRate === null ? '—' : y.savingsRate + '%'}</b></div></div>${y.worthChange !== null ? `<p class="small">Net worth: ${money(y.startWorth)} → ${money(y.endWorth)} (${y.worthChange >= 0 ? '+' : ''}${money(y.worthChange)}).</p>` : ''}${y.topCategories.length ? `<h3 class="subsection">Top spending categories</h3><div class="table-scroll"><table><tbody>${y.topCategories.map(c => `<tr><td><b>${esc(c.category)}</b></td><td>${money(c.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
}
// Seasonal income vs expense view (roadmap #62).
function seasonalSection() {
  const s = C.seasonalView(state, 12);
  if (!s.rows.length) return '';
  const col = (title, rows) => `<div><h3 class="subsection">${title}</h3><div class="table-scroll"><table><thead><tr><th>Month</th><th>Income</th><th>Spent</th><th>Net</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.month}</td><td>${money(r.income)}</td><td>${money(r.expense)}</td><td class="${r.net >= 0 ? 'positive' : 'danger'}">${money(r.net)}</td></tr>`).join('')}</tbody></table></div></div>`;
  return `<section class="section card"><h2 class="section-title">Seasonal view</h2><p class="small">Average monthly net: ${money(s.avgNet)}. Your best and toughest months side by side.</p><div class="two-col">${col('Best months', s.good)}${col('Lean months', s.lean)}</div></section>`;
}
// Top merchants (roadmap #63): ranked by total spend with a period filter.
function topMerchantsSection() {
  const rows = C.topMerchants(state, merchantMonths, 10);
  const opts = [[3,'Last 3 months'],[6,'Last 6 months'],[12,'Last 12 months']];
  const form = `<form id="merchantPeriodForm" class="filter-bar">${selectField('months','Period',String(merchantMonths),opts)}<button class="quiet">Update</button></form>`;
  if (!rows.length) return `<section class="section card"><h2 class="section-title">Top merchants</h2>${form}<p class="empty">No spending in this period yet.</p></section>`;
  const max = rows[0].total;
  return `<section class="section card"><h2 class="section-title">Top merchants</h2>${form}<div class="table-scroll"><table><thead><tr><th>Merchant</th><th>Spent</th><th>Share</th><th>Transactions</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.label)}</b></td><td>${money(r.total)}</td><td><div class="bar"><span style="width:${Math.round(C.cents(r.total)/C.cents(max)*100)}%"></span></div></td><td>${r.count}</td></tr>`).join('')}</tbody></table></div></section>`;
}
// Spending trends (roadmap #59): 12-month per-category totals.
function spendingTrendsSection() {
  const data = C.spendingTrends(state, 12);
  const cats = [...new Set(data.flatMap(d => Object.keys(d.categories)))].sort();
  if (!cats.length) return '';
  const totals = Object.fromEntries(cats.map(c => [c, data.reduce((s, d) => s + C.cents(d.categories[c] || 0), 0)]));
  const top = cats.sort((a, b) => totals[b] - totals[a]).slice(0, 8);
  const max = Math.max(...data.map(d => top.reduce((s, c) => s + C.cents(d.categories[c] || 0), 0)), 1);
  return `<section class="section card"><h2 class="section-title">Spending trends</h2><p class="small">Monthly totals for your top ${top.length} categories over the last 12 months.</p><div class="table-scroll"><table><thead><tr><th>Month</th>${top.map(c => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${data.map(d => {
    const total = top.reduce((s, c) => s + C.cents(d.categories[c] || 0), 0);
    return `<tr><td>${d.month}</td>${top.map(c => `<td>${d.categories[c] ? money(d.categories[c]) : '—'}</td>`).join('')}<td><b>${money(total / 100)}</b><div class="bar"><span style="width:${Math.round(total / max * 100)}%"></span></div></td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}
// Month-over-month insights (roadmap #60): where spending rose or fell.
function monthOverMonthSection() {
  const m = C.monthOverMonth(state);
  if (!m.rows.length) return '';
  const up = m.rows.filter(r => r.change > 0).slice(0, 5), down = m.rows.filter(r => r.change < 0).slice(0, 5);
  const row = r => `<tr><td><b>${esc(r.category)}</b></td><td>${money(r.previous)}</td><td>${money(r.current)}</td><td class="${r.change > 0 ? 'danger' : 'positive'}">${r.change > 0 ? '+' : ''}${money(r.change)} (${r.pct > 0 ? '+' : ''}${r.pct}%)</td></tr>`;
  return `<section class="section card"><h2 class="section-title">Month over month</h2><p class="small">${m.prev} → ${m.cur}: where your spending changed the most.</p>${up.length ? `<h3 class="subsection">Biggest increases</h3><div class="table-scroll"><table><thead><tr><th>Category</th><th>${m.prev}</th><th>${m.cur}</th><th>Change</th></tr></thead><tbody>${up.map(row).join('')}</tbody></table></div>` : ''}${down.length ? `<h3 class="subsection">Biggest decreases</h3><div class="table-scroll"><table><thead><tr><th>Category</th><th>${m.prev}</th><th>${m.cur}</th><th>Change</th></tr></thead><tbody>${down.map(row).join('')}</tbody></table></div>` : ''}${!up.length && !down.length ? '<p class="empty">No change between the last two months.</p>' : ''}</section>`;
}
// Savings rate (roadmap #68): percent of income saved per month with trend.
function savingsRateSection() {
  const s = C.savingsRate(state, 12);
  if (s.totalIncome <= 0) return '';
  const trend = s.rows.filter(r => r.rate !== null).map(r => r.rate);
  const first = trend[0], last = trend[trend.length - 1];
  const dir = last > first + 1 ? 'rising' : last < first - 1 ? 'falling' : 'steady';
  return `<section class="section card"><h2 class="section-title">Savings rate</h2><p class="small">Overall ${s.overall}% of income saved over the last 12 months · trend ${dir}.</p><div class="summary-grid"><div class="summary"><span>Income</span><b>${money(s.totalIncome)}</b></div><div class="summary"><span>Saved</span><b class="positive">${money(s.totalSaved)}</b></div><div class="summary"><span>Savings rate</span><b class="${s.overall >= 20 ? 'positive' : s.overall >= 0 ? '' : 'danger'}">${s.overall}%</b></div></div><div class="table-scroll"><table><thead><tr><th>Month</th><th>Income</th><th>Spent</th><th>Saved</th><th>Rate</th></tr></thead><tbody>${s.rows.map(r => `<tr><td>${r.month}</td><td>${money(r.income)}</td><td>${money(r.expense)}</td><td class="${r.saved >= 0 ? 'positive' : 'danger'}">${money(r.saved)}</td><td>${r.rate === null ? '—' : r.rate + '%'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function taxSetAsideSection(){
  const t=C.taxSetAside(state);
  const pct=t.owed>0?Math.min(100,t.reserved/t.owed*100):0;
  return `<section class="section card"><h2 class="section-title">Tax set-aside · ${t.year}</h2><p class="small">Untaxed freelance/gig income and the tax you should set aside at your ${t.rate}% rate. Add a “Tax reserve” when recording untaxed income to count it as reserved.</p><form id="taxRateForm" class="form-grid">${field('sideTaxRate','Set-aside rate (%)',t.rate,'number','min="0" max="100" step="0.01"')}<button class="secondary">Update rate</button></form><div class="summary-grid"><div class="summary"><span>Untaxed income</span><b>${money(t.income)}</b></div><div class="summary"><span>Should set aside</span><b>${money(t.owed)}</b></div><div class="summary"><span>Reserved</span><b class="positive">${money(t.reserved)}</b></div><div class="summary"><span>Still to set aside</span><b class="${t.remaining>0?'danger':''}">${money(t.remaining)}</b></div></div><div class="goal-track"><span style="width:${pct}%"></span></div><p class="small">${t.nextDeadline?`Next quarterly estimated-tax deadline: <b>${dateText(t.nextDeadline)}</b> (${t.daysUntil} day${t.daysUntil===1?'':'s'}).`:''} ${state.profile.taxReminder?'Reminder on — you’ll see a notice here as it approaches.':'Turn on the reminder in You → settings.'}</p></section>`;
}
function budgets(){const b=C.budgetSummary(state,budgetMonth),r=C.cashFlow(state,budgetMonth+'-01',monthEnd(budgetMonth)),incomes=state.budgets.filter(b=>b.bucket==='income'&&b.start<=budgetMonth),plannedIncome=totalAmounts(incomes),plannedExpense=totalAmounts(b.rows),contributions=state.goals.reduce((s,g)=>s+g.monthly,0),left=plannedIncome-plannedExpense-contributions;
 const budgetTable=(rows,income=false)=>`<div class="table-scroll"><table class="budget-table"><thead><tr><th>Category</th><th>Planned</th><th>Actual</th><th>Remaining</th><th></th></tr></thead><tbody>${rows.map(x=>{const spent=income?totalAmounts(state.transactions.filter(t=>t.type==='income'&&t.date.slice(0,7)===budgetMonth&&t.category.toLowerCase()===x.category.toLowerCase())):x.spent,remaining=income?x.amount-spent:x.remaining;return `<tr><td><b>${esc(x.category)}</b></td><td>${money(x.amount)}</td><td>${money(spent)}</td><td><span class="${remaining<0?'danger':'positive'}">${money(remaining)} remaining</span>${x.rollover?`<small>Rollover ${money(x.carry)}</small>`:''}</td><td><button class="quiet" data-edit="${x.id}" data-kind="budgets">Edit</button><button class="quiet" data-action="budget-move" data-category="${esc(x.category)}">Move</button><button class="quiet" data-remove="${x.id}" data-kind="budgets" aria-label="Remove ${esc(x.category)}">×</button></td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">No planned categories.</td></tr>'}</tbody></table></div>`;
 return header('Budget','Planned, actual, and remaining amounts for each category.')+`<div class="tabs"><button data-budget-cycle="month" class="${budgetCycle==='month'?'active':''}">Monthly</button><button data-budget-cycle="weekly" class="${budgetCycle==='weekly'?'active':''}">Weekly</button><button data-budget-cycle="biweekly" class="${budgetCycle==='biweekly'?'active':''}">Bi-weekly</button></div>`+budgetAlertBanner()+(budgetCycle==='month'?monthlyBudgetView(budgetTable):payPeriodSection())+customCategoriesSection();
}
// Paycheck auto-detection (roadmap #43).
function paycheckDetectionSection(){
 const detected = C.detectPaychecks(state);
 if (!detected.length) return '';
 return panel('Detected paychecks', `<p class="small">Found ${detected.length} recurring deposit pattern${detected.length===1?'':'s'} in your history.</p><div class="table-scroll"><table><thead><tr><th>Description</th><th>Amount</th><th>Frequency</th><th></th></tr></thead><tbody>${detected.map((d,i)=>`<tr><td><b>${esc(d.label)}</b><small>${d.count} deposits, last ${d.lastDate}</small></td><td>${money(d.amount)}</td><td>${d.repeat}</td><td><button class="quiet" data-action="paycheck-add" data-index="${i}">Add as income</button></td></tr>`).join('')}</tbody></table></div>`);
}
// Custom categories (roadmap #41).
function customCategoriesSection(){
 const cats = state.customCategories || [];
 return panel('Custom categories', `${cats.length?`<div class="table-scroll"><table><thead><tr><th>Name</th><th>Group</th><th>Color</th><th></th></tr></thead><tbody>${cats.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.group)}</td><td><span class="color-dot" style="background:${esc(c.color)}"></span></td><td><button class="quiet" data-action="cat-delete" data-id="${c.id}">×</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="small">Create custom categories with groups and colors.</p>'}<form id="categoryForm" class="filter-bar">${field('name','Name','','text','maxlength="40"').replace(' required','')}${field('group','Group','Other','text','maxlength="40"').replace(' required','')}${field('color','Color','#888888','color').replace(' required','')}<button class="quiet">Add</button></form>`);
}
// Budget move history (roadmap #44).
function budgetMoveHistory() {
  const moves = (state.budgetMoves || []).slice().reverse().slice(0, 20);
  if (!moves.length) return '';
  return `<section class="section card"><h2 class="section-title">Budget moves</h2><div class="table-scroll"><table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th></tr></thead><tbody>${moves.map(m => `<tr><td>${dateText(m.date)}</td><td>${esc(m.from)}</td><td>${esc(m.to)}</td><td>${money(m.amount)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
// Budget alerts (roadmap #20): 80%+ warn, 100%+ over.
function budgetAlertBanner() {
  const alerts = C.budgetAlerts(state, budgetMonth);
  if (!alerts.length) return '';
  return `<section class="card"><h2 class="section-title">Budget alerts</h2>${alerts.map(a => `<p class="${a.level === 'over' ? 'danger' : 'warn'}">${a.level === 'over' ? 'Over budget' : 'Near budget'}: ${esc(a.category)} — ${money(a.spent)} of ${money(a.available)} (${Math.round(a.pct * 100)}%)</p>`).join('')}</section>`;
}
// Pay-period budgets (roadmap #14): weekly/bi-weekly view.
function payPeriodSection() {
  const p = C.payPeriodBudget(state, budgetCycle);
  const label = dateText(p.period.start) + ' – ' + dateText(p.period.end);
  return `<section class="section card"><h2 class="section-title">${budgetCycle === 'weekly' ? 'Weekly' : 'Bi-weekly'} budget · ${label}</h2><p class="small">Monthly budgets split into ${budgetCycle === 'weekly' ? '52' : '26'} periods. Unspent amounts roll forward where the category allows rollover.</p><div class="table-scroll"><table><thead><tr><th>Category</th><th>Period budget</th><th>Rollover</th><th>Spent</th><th>Remaining</th></tr></thead><tbody>${p.rows.map(r => `<tr><td><b>${esc(r.category)}</b></td><td>${money(r.periodBudget)}</td><td class="positive">${money(r.rollover)}</td><td>${money(r.spent)}</td><td><span class="${r.remaining < 0 ? 'danger' : 'positive'}">${money(r.remaining)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Add budget categories first.</td></tr>'}</tbody></table></div></section>`;
}
function monthlyBudgetView(budgetTable){const b=C.budgetSummary(state,budgetMonth),r=C.cashFlow(state,budgetMonth+'-01',monthEnd(budgetMonth)),incomes=state.budgets.filter(b=>b.bucket==='income'&&b.start<=budgetMonth),plannedIncome=totalAmounts(incomes),plannedExpense=totalAmounts(b.rows),contributions=state.goals.reduce((s,g)=>s+g.monthly,0),left=plannedIncome-plannedExpense-contributions;
return `<div class="page-actions"><button class="primary" data-action="add" data-kind="budgets">+ Budget category</button></div><form id="budgetMonth" class="filter-bar">${field('month','Budget month',budgetMonth,'month')}<button class="quiet">View month</button></form><div class="content-with-aside"><div>${panel('Income',budgetTable(incomes,true))}${['fixed','flexible','occasional'].map(bucket=>panel({fixed:'Fixed',flexible:'Flexible',occasional:'Non-monthly'}[bucket],budgetTable(b.rows.filter(x=>x.bucket===bucket)))).join('')}${panel('Contributions',`<div class="compact-row"><span>Savings goal extra reserves</span><b>${money(contributions)}</b></div><p class="small">Planning amounts, not automatic transfers. Actual contributions are tracked in Goals.</p>`,routeButton('goals'))}${state.budgets.filter(x=>x.start>budgetMonth).map(x=>panel(esc(x.category),`<p>Starts ${esc(x.start)}</p><button class="quiet" data-edit="${x.id}" data-kind="budgets">Edit</button><button class="quiet" data-action="budget-move" data-category="${esc(x.category)}">Move</button>`)).join('')}</div>${panel('Left to budget',`<div class="budget-left ${left<0?'danger':''}">${money(left)}</div><p class="small">Planned income minus expense budgets and goal extra reserves. This is not your spendable balance.</p><dl class="summary-list"><dt>Actual income</dt><dd>${money(r.income)}</dd><dt>Actual expenses</dt><dd>${money(r.expense)}</dd><dt>Unbudgeted spending</dt><dd class="danger">${money(b.unbudgeted)}</dd></dl>${['fixed','flexible','occasional'].map(bucket=>{const rows=b.rows.filter(x=>x.bucket===bucket);return progressRow(bucket,totalAmounts(rows.map(x=>({amount:x.spent}))),totalAmounts(rows));}).join('')}<p class="small">Rollover carries underspending and overspending. Changing amounts or start dates recalculates history.</p>`)}</div>`;
}
function plan(){const first=planMonth+'-01',end=monthEnd(planMonth),items=C.expand(state.bills,end).map(x=>({...x,kind:'bills'})).concat(C.expand(state.incomes,end).map(x=>({...x,kind:'incomes'}))).filter(x=>x.date>=first&&x.date<=end).sort((a,b)=>a.date.localeCompare(b.date)),all=state.bills.map(x=>({...x,kind:'bills'})).concat(state.incomes.map(x=>({...x,kind:'incomes'}))).sort((a,b)=>a.date.localeCompare(b.date)),rows=recurringScope==='all'?all:items;
 return header('Recurring','Upcoming bills and income. Confirm payments to advance their schedules.')+`<div class="tabs"><button data-recurring-scope="month" class="${recurringScope==='month'?'active':''}">Monthly</button><button data-recurring-scope="all" class="${recurringScope==='all'?'active':''}">All scheduled</button></div><div class="page-actions"><button class="quiet" data-action="add" data-kind="incomes">+ Income</button><button class="primary" data-action="add" data-kind="bills">+ Bill</button><button class="quiet" data-recurring-view="list">List</button><button class="quiet" data-recurring-view="calendar">Calendar</button></div><form id="planMonth" class="filter-bar">${field('month','Month',planMonth,'month')}<button class="quiet">View month</button></form><div class="stats-grid">${stat('Expected income',money(totalAmounts(items.filter(x=>x.kind==='incomes'))),'positive')}${stat('Planned expenses',money(totalAmounts(items.filter(x=>x.kind==='bills'))),'danger')}${stat('Unpaid overdue bills',String(state.bills.filter(x=>x.date<C.localDate()).length))}</div>${recurringView==='calendar'?paymentCalendar():panel(recurringScope==='all'?'All scheduled payments':planMonth,rows.length?rows.map(x=>entryRow(x,x.kind)).join(''):'<p class="empty">No scheduled payments in this month. Use All scheduled to view other dates.</p>')}<p class="small">Schedules are entered manually. Paying a bill here records a transaction; do not enter the same payment twice.</p>${incomeStreamsSection()}${paycheckDetectionSection()}${paycheckSection()}${gigStatsSection()}${smoothingSection()}${debtPayoffSection()}${sinkingFundsSection()}${loanAmortizationSection()}`;
}
// Loan amortization tracker (roadmap #51).
function loanAmortizationSection() {
  const form = `<form id="loanForm" class="form-grid">${field('principal','Loan balance',loanPrincipal,'number','min="0.01" step="100"')}${field('rate','Annual rate %',loanRate,'number','min="0" max="100" step="0.01"')}${field('payment','Monthly payment',loanPayment,'number','min="0.01" step="10"')}${field('extra','Extra monthly payment',loanExtra,'number','min="0" step="10"').replace(' required','')}<button class="secondary">Calculate</button></form>`;
  let result = '';
  if (loanPrincipal !== '' && loanRate !== '' && loanPayment !== '') {
    try {
      const r = C.loanAmortization(loanPrincipal, loanRate, loanPayment, loanExtra === '' ? 0 : loanExtra);
      result = `<div class="summary-grid"><div class="summary"><span>Payoff in</span><b>${r.base.months} months</b></div><div class="summary"><span>Total interest</span><b>${money(r.base.totalInterest)}</b></div>${r.withExtra ? `<div class="summary"><span>With extra</span><b class="positive">${r.withExtra.months} months · saves ${money(r.interestSaved)}</b></div>` : ''}</div>${r.base.schedule.length ? `<div class="table-scroll"><table><thead><tr><th>Month</th><th>Balance</th><th>Interest paid</th></tr></thead><tbody>${r.base.schedule.map(s => `<tr><td>${s.month}</td><td>${money(s.balance)}</td><td>${money(s.interestPaid)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    } catch (e) { result = `<p class="small danger">${esc(e.message)}</p>`; }
  }
  return `<section class="section card"><h2 class="section-title">Loan amortization</h2><p class="small">See payoff schedule and how extra payments save interest.</p>${form}${result}</section>`;
}
// Debt payoff planner (roadmap #45).
function debtPayoffSection() {
  const debts = (state.debts || []);
  const form = `<form id="debtPayoffForm" class="form-grid">${field('payment', 'Total monthly payment', debtPayment, 'number', 'min="0.01" step="10"')}<button class="secondary">Compare strategies</button></form>`;
  let result = '';
  if (debtPayment !== '' && debts.length) {
    try {
      const r = C.debtPayoff(debts, debtPayment);
      const row = (label, d) => `<tr><td><b>${label}</b></td><td>${d.months} months</td><td>${d.payoffDate}</td><td>${money(d.totalInterest)}</td></tr>`;
      const save = r.avalanche.totalInterest < r.snowball.totalInterest ? money(r.snowball.totalInterest - r.avalanche.totalInterest) : null;
      result = `<div class="table-scroll"><table><thead><tr><th>Strategy</th><th>Payoff time</th><th>Payoff date</th><th>Total interest</th></tr></thead><tbody>${row('Snowball (smallest first)', r.snowball)}${row('Avalanche (highest rate first)', r.avalanche)}</tbody></table></div>${save ? `<p class="small positive">Avalanche saves ${save} in interest.</p>` : '<p class="small">Both strategies cost the same here.</p>'}`;
    } catch (e) { result = `<p class="small danger">${esc(e.message)}</p>`; }
  }
  const debtRows = debts.length ? `<div class="table-scroll"><table><thead><tr><th>Debt</th><th>Balance</th><th>APR</th><th>Min payment</th><th></th></tr></thead><tbody>${debts.map(d => `<tr><td><b>${esc(d.label)}</b></td><td>${money(d.balance)}</td><td>${d.rate}%</td><td>${money(d.minPayment)}</td><td><button class="quiet" data-action="debt-edit" data-id="${d.id}">Edit</button><button class="quiet" data-action="debt-delete" data-id="${d.id}" aria-label="Delete ${esc(d.label)}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No debts yet.</p>';
  return `<section class="section card"><h2 class="section-title">Debt payoff planner</h2><div class="row-actions"><button class="quiet" data-action="debt-add">+ Add debt</button></div>${debtRows}${form}${result}</section>`;
}
// Sinking funds (roadmap #48).
function sinkingFundsSection() {
  const funds = C.sinkingFunds(state);
  const totalMonthly = funds.reduce((s, f) => s + C.cents(f.monthlyNeeded), 0) / 100;
  return `<section class="section card"><h2 class="section-title">Sinking funds</h2><p class="small">Spread annual/irregular expenses into monthly set-asides.${totalMonthly > 0 ? ` Set aside ${money(totalMonthly)}/mo total.` : ''}</p><div class="row-actions"><button class="quiet" data-action="sinking-add">+ Add sinking fund</button></div>${funds.length ? `<div class="table-scroll"><table><thead><tr><th>Fund</th><th>Target</th><th>Saved</th><th>Due</th><th>Monthly needed</th><th></th></tr></thead><tbody>${funds.map(f => `<tr><td><b>${esc(f.label)}</b><div class="bar"><span style="width:${f.progress}%"></span></div></td><td>${money(f.target)}</td><td>${money(f.saved)}</td><td>${f.dueDate ? dateText(f.dueDate) : '—'}</td><td>${f.monthlyNeeded > 0 ? money(f.monthlyNeeded) + '/mo' : '—'}</td><td><button class="quiet" data-action="sinking-edit" data-id="${f.id}">Edit</button><button class="quiet" data-action="sinking-delete" data-id="${f.id}" aria-label="Delete ${esc(f.label)}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No sinking funds yet. Add one for annual bills, car maintenance, holidays.</p>'}</section>`;
}
// Multiple income streams (roadmap #19): per-stream hours, rate, paydays,
// and monthly equivalents with a combined total.
function incomeStreamsSection() {
  const s = C.incomeStreams(state, 12);
  if (!s.rows.length) return '';
  return `<section class="section card"><h2 class="section-title">Income streams</h2><p class="small">Expected over the next ${s.monthsAhead} months · combined ${money(s.monthly)}/mo.</p><div class="table-scroll"><table><thead><tr><th>Stream</th><th>Next payday</th><th>Paydays</th><th>Expected</th><th>Per month</th></tr></thead><tbody>${s.rows.map(r => `<tr><td><b>${esc(r.label)}</b>${r.hours || r.hourlyRate ? `<small>${r.hours ? r.hours + ' h' : ''}${r.hours && r.hourlyRate ? ' × ' : ''}${r.hourlyRate ? money(r.hourlyRate) + '/h' : ''}</small>` : ''}</td><td>${dateText(r.nextDate)}</td><td>${r.paydays}</td><td>${money(r.amount)}</td><td>${money(r.monthly)}</td></tr>`).join('')}</tbody></table></div><div class="summary-grid"><div class="summary"><span>Combined expected</span><b class="positive">${money(s.combined)}</b></div><div class="summary"><span>Combined per month</span><b>${money(s.monthly)}</b></div></div></section>`;
}
// Hours and paycheck estimator (roadmap #16): estimate gross/take-home and
// feed the forecast by adding it as planned income.
function paycheckSection() {
  const rate = state.profile.hourlyRate, taxRate = state.profile.taxRate;
  const hrs = paycheckHours === '' ? 0 : C.number(paycheckHours, 0, 1000), ot = paycheckOvertime === '' ? 0 : C.number(paycheckOvertime, 0, 1000), hol = paycheckHoliday === '' ? 0 : C.number(paycheckHoliday, 0, 1000);
  const est = hrs <= 0 && ot <= 0 && hol <= 0 ? null : C.paycheckEstimate(rate, hrs, taxRate, ot, hol);
  const breakdown = est && (est.overtimePay > 0 || est.holidayPay > 0) ? `<p class="small">Regular ${money(est.regularPay)}${est.overtimePay > 0 ? ` · overtime ${money(est.overtimePay)} (1.5×)` : ''}${est.holidayPay > 0 ? ` · holiday ${money(est.holidayPay)} (2×)` : ''}</p>` : '';
  return `<section class="section card"><h2 class="section-title">Paycheck estimator</h2><p class="small">Hourly rate ${money(rate)}/h · deduction ${taxRate}% (from You → settings). Overtime at 1.5×, holiday at 2×.</p><form id="paycheckForm" class="form-grid">${field('hours', 'Expected regular hours', paycheckHours, 'number', 'min="0" max="1000" step="0.25"')}${field('overtime', 'Overtime hours', paycheckOvertime, 'number', 'min="0" max="1000" step="0.25"').replace(' required','')}${field('holiday', 'Holiday hours', paycheckHoliday, 'number', 'min="0" max="1000" step="0.25"').replace(' required','')}<button class="secondary">Estimate</button></form>${est ? `<div class="summary-grid"><div class="summary"><span>Gross</span><b>${money(est.gross)}</b></div><div class="summary"><span>Est. tax</span><b>${money(est.tax)}</b></div><div class="summary"><span>Take-home</span><b class="positive">${money(est.takeHome)}</b></div></div>${breakdown}<div class="row-actions"><button class="secondary" data-action="add-estimated-income">Add take-home as planned income</button></div>` : '<p class="small">Enter hours to estimate this paycheck.</p>'}</section>`;
}
// Gig income variability (roadmap #18): range and consistency score.
function gigStatsSection() {
  const s = C.gigIncomeStats(state, 12);
  if (!s) return '';
  const label = s.consistency >= 80 ? 'Very steady' : s.consistency >= 60 ? 'Fairly steady' : s.consistency >= 40 ? 'Variable' : 'Highly variable';
  return `<section class="section card"><h2 class="section-title">Gig income variability</h2><p class="small">Based on ${s.months} recorded month(s). Range shows your worst and best months; the consistency score is 100 for perfectly steady income.</p><div class="summary-grid"><div class="summary"><span>Worst month</span><b>${money(s.min)}</b></div><div class="summary"><span>Best month</span><b>${money(s.max)}</b></div><div class="summary"><span>Average</span><b>${money(s.avg)}</b></div><div class="summary"><span>Consistency</span><b class="${s.consistency >= 60 ? 'positive' : s.consistency >= 40 ? '' : 'danger'}">${s.consistency} · ${label}</b></div></div></section>`;
}
// Income smoothing (roadmap #15): reserve in high months, draw in lean ones.
function smoothingSection() {
  const defTarget = C.avgMonthly(state, 'income', C.localDate(), 12);
  const target = smoothingTarget === '' ? defTarget : C.number(smoothingTarget, 0.01);
  const form = `<form id="smoothingForm" class="form-grid">${field('target', 'Steady target paycheck (monthly)', smoothingTarget === '' ? '' : target, 'number', 'min="0.01" step="10"')}<button class="secondary">Calculate</button></form>`;
  if (target <= 0) return `<section class="section card"><h2 class="section-title">Income smoothing</h2><p class="small">Pick a steady target paycheck; see how much to reserve in high months and draw in lean months.</p>${form}</section>`;
  const s = C.incomeSmoothing(state, target, 12);
  if (!s.count) return `<section class="section card"><h2 class="section-title">Income smoothing</h2><p class="empty">No recorded income months yet.</p>${form}</section>`;
  return `<section class="section card"><h2 class="section-title">Income smoothing</h2><p class="small">Steady target ${money(target)}/mo · based on ${s.count} recorded month(s). Reserve the excess in high months, draw in lean months.</p>${form}<div class="summary-grid"><div class="summary"><span>Should have reserved</span><b>${money(s.totalReserve)}</b></div><div class="summary"><span>Drawn in lean months</span><b>${money(s.totalDraw)}</b></div><div class="summary"><span>Smoothing balance</span><b class="${s.balance < 0 ? 'danger' : 'positive'}">${money(s.balance)}</b></div></div><div class="table-scroll"><table><thead><tr><th>Month</th><th>Income</th><th>Reserve</th><th>Draw</th></tr></thead><tbody>${s.months.map(m => `<tr><td>${m.month}</td><td>${money(m.income)}</td><td class="positive">${money(m.reserve)}</td><td class="${m.draw > 0 ? 'danger' : ''}">${money(m.draw)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function goals(){if(goalView==='debt'){const cards=state.accounts.filter(a=>a.balance<0);return header('Goals','Save up for what matters or track balances to pay down.')+goalTabs()+panel('Pay down',cards.length?cards.map(a=>`<div class="account-row"><span class="merchant-mark">▣</span><div><b>${esc(a.label)}</b><small>Current amount owed</small></div><strong>${money(-a.balance)}</strong></div>`).join(''):'<p class="empty">No negative account balances entered.</p>',routeButton('accounts'))+panel('Record a repayment','<p class="small">Transfer from a cash account to the card account to record a repayment without counting the purchase twice. These records do not send money.</p><button class="primary" data-action="transfer">Record transfer</button>');}
 const original=legacyGoals();return original.replace('<button class="secondary" data-action="add" data-kind="goals">',goalTabs()+`<div class="stats-grid">${stat('Unreserved cash before bills',money(Math.max(0,state.profile.balance-C.reservesCents(state)/100)))}${stat('Reserved for goals',money(state.goals.reduce((s,g)=>s+g.saved,0)))}</div><button class="secondary" data-action="add" data-kind="goals">`)+milestonesSection();}
// Net worth milestones (roadmap #50).
function milestonesSection() {
  const miles = (state.milestones || []).map(m => ({ ...m, ...C.milestoneProgress(state, m) }));
  return `<section class="section card"><h2 class="section-title">Net worth milestones</h2><p class="small">Current net worth: ${money(C.netWorth(state))}.</p><div class="row-actions"><button class="quiet" data-action="milestone-add">+ Add milestone</button></div>${miles.length ? `<div class="table-scroll"><table><thead><tr><th>Milestone</th><th>Target</th><th>Progress</th><th>Projected</th><th></th></tr></thead><tbody>${miles.map(m => `<tr><td><b>${esc(m.label)}</b>${m.reached ? ' ✓' : ''}</td><td>${money(m.target)}</td><td><div class="bar"><span style="width:${m.progress}%"></span></div><small>${m.progress}%</small></td><td>${m.projectedDate || (m.reached ? 'Reached!' : '—')}</td><td><button class="quiet" data-action="milestone-delete" data-id="${m.id}" aria-label="Delete ${esc(m.label)}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No milestones yet. Add one like "$100k net worth".</p>'}</section>`;
}
function goalTabs(){return `<div class="tabs"><button data-goal-view="save" class="${goalView==='save'?'active':''}">Save up</button><button data-goal-view="debt" class="${goalView==='debt'?'active':''}">Pay down</button></div>`;}
// Contribution log (roadmap #57).
function contributionsSection() {
  const s = C.contributionStats(state);
  return `<section class="section card"><h2 class="section-title">Contributions</h2><p class="small">Total contributed: ${money(s.total)}.</p><div class="row-actions"><button class="quiet" data-action="contribution-add">+ Log contribution</button></div>${s.contributions.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Label</th><th>Amount</th><th></th></tr></thead><tbody>${s.contributions.slice(0, 20).map(c => `<tr><td>${dateText(c.date)}</td><td>${esc(c.label)}</td><td>${money(c.amount)}</td><td><button class="quiet" data-action="contribution-delete" data-id="${c.id}" aria-label="Delete contribution">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No contributions logged yet.</p>'}</section>`;
}
// Manual assets and liabilities (roadmap #58).
function manualAssetsSection() {
  const m = C.manualNetWorth(state);
  const rows = [...m.assets.map(a => ({...a, kindLabel: 'Asset'})), ...m.liabilities.map(a => ({...a, kindLabel: 'Liability'}))];
  return `<section class="section card"><h2 class="section-title">Other assets & liabilities</h2><p class="small">Cars, home, loans, etc. Included in net worth. Net: ${money(m.net)}.</p><div class="row-actions"><button class="quiet" data-action="asset-add">+ Add asset/liability</button></div>${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Type</th><th>Value</th><th></th></tr></thead><tbody>${rows.map(a => `<tr><td><b>${esc(a.label)}</b></td><td>${a.kindLabel}</td><td class="${a.kind === 'liability' ? 'danger' : 'positive'}">${money(a.value)}</td><td><button class="quiet" data-action="asset-delete" data-id="${a.id}" aria-label="Delete ${esc(a.label)}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No manual assets yet.</p>'}</section>`;
}
// Dividend tracker (roadmap #53).
function dividendsSection() {
  const s = C.dividendStats(state);
  return `<section class="section card"><h2 class="section-title">Dividends</h2><div class="summary-grid"><div class="summary"><span>Total received</span><b>${money(s.total)}</b></div><div class="summary"><span>Projected monthly</span><b>${money(s.projectedMonthly)}</b></div></div><div class="row-actions"><button class="quiet" data-action="dividend-add">+ Log dividend</button></div>${s.dividends.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Symbol</th><th>Amount</th><th></th></tr></thead><tbody>${s.dividends.slice(0, 20).map(d => `<tr><td>${dateText(d.date)}</td><td><b>${esc(d.symbol)}</b></td><td>${money(d.amount)}</td><td><button class="quiet" data-action="dividend-delete" data-id="${d.id}" aria-label="Delete dividend">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No dividends logged yet.</p>'}</section>`;
}
// DRIP/compound growth projection (roadmap #54).
function dripSection() {
  const form = `<form id="dripForm" class="form-grid">${field('yield','Annual dividend yield %',dripYield,'number','min="0" max="100" step="0.1"')}${field('growth','Annual growth %',dripGrowth,'number','min="-100" max="100" step="0.1"')}${field('years','Years',dripYears,'number','min="1" max="50" step="1"')}${field('monthly','Monthly contribution',dripMonthly,'number','min="0" step="10"').replace(' required','')}<button class="secondary">Project</button></form>`;
  let result = '';
  try {
    const r = C.dripProjection(state, dripYield, dripGrowth, dripYears, dripMonthly === '' ? 0 : dripMonthly);
    result = `<div class="summary-grid"><div class="summary"><span>Current value</span><b>${money(r.current)}</b></div><div class="summary"><span>Projected in ${r.years}y</span><b class="positive">${money(r.projected)}</b></div><div class="summary"><span>Contributions</span><b>${money(r.totalContributions)}</b></div></div><div class="table-scroll"><table><thead><tr><th>Year</th><th>Projected value</th></tr></thead><tbody>${r.schedule.filter(s => s.year % 2 === 0 || s.year === r.years).map(s => `<tr><td>${s.year}</td><td>${money(s.value)}</td></tr>`).join('')}</tbody></table></div><p class="small">Assumes ${(Number(dripYield) + Number(dripGrowth)).toFixed(1)}% total annual return with dividends reinvested. Hypothetical only.</p>`;
  } catch (e) { result = `<p class="small danger">${esc(e.message)}</p>`; }
  return `<section class="section card"><h2 class="section-title">Growth projection</h2><p class="small">DRIP/compound projection with editable assumptions.</p>${form}${result}</section>`;
}
function investments(){const p=C.portfolio(state),history=(state.balanceHistory||[]).filter(x=>x.investments!==undefined),classes=['stock','bond','fund','crypto','other'];return header('Investments','Manually entered holdings and prices. No live market connection.')+`<div class="page-actions"><button class="primary" data-action="add" data-kind="holdings">+ Add holding</button></div><div class="stats-grid">${stat('Portfolio value',money(p.value))}${stat('Cost basis',money(p.basis))}${stat('Unrealized gain / loss',money(p.gain),p.gain<0?'danger':'positive')}</div><div class="tabs"><button data-investment-view="value" class="${investmentView==='value'?'active':''}">Value history</button><button data-investment-view="allocation" class="${investmentView==='allocation'?'active':''}">Allocation</button></div>`+panel(investmentView==='value'?'Recorded portfolio value':'Allocation by asset class',investmentView==='value'?lineChart([{name:'Entered portfolio value',values:history.map(x=>x.investments)}],history.map(x=>x.date),'Portfolio value history',['#ff692f']):breakdown(classes.map(c=>({label:c,amount:p.rows.filter(h=>h.assetClass===c).reduce((s,h)=>s+h.value,0)})).filter(x=>x.amount),p.value,'income'))+panel('Holdings',`<div class="table-scroll"><table><thead><tr><th>Security</th><th>Price</th><th>Quantity</th><th>Value</th><th>Weight</th><th>Gain vs. cost</th><th></th></tr></thead><tbody>${classes.map(c=>{const rows=p.rows.filter(h=>h.assetClass===c);return rows.length?`<tr class="group-row"><th colspan="7">${c}</th></tr>`+rows.map(h=>`<tr><td><b>${esc(h.symbol)}</b><small>${esc(h.label)} · ${h.updated}</small></td><td>${money(h.price)}</td><td>${h.quantity}</td><td>${money(h.value)}</td><td>${h.weight.toFixed(1)}%</td><td>${badge(money(h.gain),h.gain>=0)}</td><td><button class="quiet" data-edit="${h.id}" data-kind="holdings">Edit</button><button class="quiet" data-action="holding-lots" data-id="${h.id}">Lots</button><button class="quiet" data-remove="${h.id}" data-kind="holdings" aria-label="Remove ${esc(h.symbol)}">×</button></td></tr>`).join(''):'';}).join('')||'<tr><td colspan="7" class="empty">Add a holding to begin tracking your portfolio.</td></tr>'}</tbody></table></div><p class="small">Value history includes additions and removals, so it is not an investment-return or benchmark chart. Holdings add to net worth but never to spendable cash.</p>`);+dividendsSection()+dripSection()+contributionsSection()+manualAssetsSection();
}
function forecasting(){if(forecastView==='short')return legacyPlan().replace('<div class="split-btn">',`<div class="tabs"><button data-forecast-view="long">Long-term scenarios</button><button data-forecast-view="short" class="active">30-day cash outlook</button></div><div class="split-btn">`);
 const settings=state.forecastSettings||C.forecastOptions();let rows=[],error='';try{rows=C.projectWealth(state);}catch(e){error=e.message;}
 const years=rows.filter((r,i)=>i%12===0),last=rows[rows.length-1];return header('Forecasting','See how changes to income and expenses could shape your future.')+`<div class="tabs"><button data-forecast-view="long" class="active">Long-term scenarios</button><button data-forecast-view="short">30-day cash outlook</button></div>`+panel('Your future, with your assumptions',error?`<p class="danger">${esc(error)} Reduce the horizon or amounts.</p>`:lineChart([{name:'With life events',values:years.map(r=>r.value)},{name:'Without life events',values:years.map(r=>r.baseline)}],years.map(r=>r.month),'Net worth scenario',['#ff692f','#92918d']))+`<div class="content-with-aside"><div>${panel('Assumptions',`<form id="forecastForm" class="form-grid two-columns">${field('years','Years ahead',settings.years,'number','min="1" max="40" step="1"')}${amountField('monthlyIncome','Monthly take-home income',settings.monthlyIncome)}${amountField('monthlyExpense','Monthly expenses',settings.monthlyExpense)}${field('growth','Assumed annual net growth (%)',settings.growth,'number','min="-20" max="20" step="0.1"')}<button class="primary">Save and calculate</button></form><p class="small">Starts with ${money(C.netWorth(state))} entered net worth. Fixed monthly cash flow and your growth assumption apply at each month-end. Growth applies only to positive balances. Taxes, inflation, debt interest, market volatility, and investment fees are not modeled separately.</p>`)}${panel('Life events',(state.lifeEvents||[]).map(e=>`<div class="account-row"><span class="merchant-mark">◈</span><div><b>${esc(e.label)}</b><small>${e.month} · ${e.repeat==='once'?'One time':'Monthly from this date'}</small></div><strong class="${e.amount<0?'danger':'positive'}">${money(e.amount)}</strong><div class="row-actions"><button data-edit="${e.id}" data-kind="lifeEvents">Edit</button><button data-remove="${e.id}" data-kind="lifeEvents">Remove</button></div></div>`).join('')||'<p class="empty">Model a home purchase, income change, or other future event.</p>','<button class="primary" data-action="add" data-kind="lifeEvents">+ Add event</button>')}</div>${panel('Scenario summary',last?`${stat('Projected net worth in '+last.month,money(last.value))}${stat('Difference from baseline',money(last.value-last.baseline))}<p class="small">A mathematical scenario, not a prediction or a recommendation. Changing assumptions never changes your account balances or transactions.</p>`:'<p>Update your assumptions.</p>')}</div>`;
}
function redesignModal(kind,x,today){
 if(dialog.mode==='customize')return {title:'Customize dashboard',body:`<form id="customizeForm" class="form-grid">${['setup','spending','budget','transactions','worth','recurring','goals','investments','advice'].map(k=>`<label class="check-label"><input type="checkbox" name="${k}" ${(state.hiddenCards||[]).includes(k)?'':'checked'}>${{setup:'Getting started',worth:'Net worth',advice:'Cash outlook'}[k]||k}</label>`).join('')}<button class="primary">Save dashboard</button></form>`};
 if(dialog.mode==='bulk')return {title:'Bulk edit selected transactions',body:`<p>${selectedTransactions.size} selected.</p><form id="bulkForm" class="form-grid">${categoryField()}<button class="primary">Apply category</button></form><div class="row-actions"><button class="danger" data-action="bulk-delete">Delete selected</button></div><p class="small">Bulk changes can be undone for 60 seconds.</p>`};
 if(dialog.mode==='budget-move'){const cats=state.budgets.filter(b=>b.bucket!=='income').map(b=>b.category);return {title:'Move budget money',body:`<p class="small">Reallocate planned amounts between categories. History is kept below.</p><form id="budgetMoveForm" class="form-grid">${selectField('from','From category',dialog.from||cats[0],cats.map(c=>[c,c]))}${selectField('to','To category',cats.find(c=>c!==dialog.from)||cats[1]||cats[0],cats.map(c=>[c,c]))}${amountField('amount','Amount to move',0,0.01)}<button class="primary">Move</button></form>`};}
 if(dialog.mode==='debt'){const d=dialog.item||{};return {title:(d.id?'Edit':'Add')+' debt',body:`<form id="debtForm" class="form-grid">${field('label','Name',d.label||'','text','maxlength="80"')}${amountField('balance','Balance owed',d.balance||0,0.01)}${field('rate','APR %',d.rate||0,'number','min="0" max="100" step="0.01"').replace(' required','')}${amountField('minPayment','Minimum payment',d.minPayment||0).replace(' required','')}<button class="primary">Save debt</button></form>`};}
 if(dialog.mode==='sinking'){const f=dialog.item||{};return {title:(f.id?'Edit':'Add')+' sinking fund',body:`<form id="sinkingForm" class="form-grid">${field('label','Name',f.label||'','text','maxlength="80"')}${amountField('target','Target amount',f.target||0,0.01)}${amountField('saved','Already saved',f.saved||0).replace(' required','')}${field('dueDate','Due date',f.dueDate||'','date').replace(' required','')}<button class="primary">Save fund</button></form>`};}
 if(dialog.mode==='milestone'){return {title:'Add milestone',body:`<form id="milestoneForm" class="form-grid">${field('label','Name (e.g., $100k net worth)','','text','maxlength="80"')}${amountField('target','Target net worth',0,0.01)}<button class="primary">Add milestone</button></form>`};}
 if(dialog.mode==='edit'&&kind==='holdings')return {title:x.id?'Edit holding':'Add holding',body:`<form id="holdingForm" class="form-grid">${field('symbol','Symbol',x.symbol||'','text','maxlength="80"')}${field('label','Security name',x.label||'','text','maxlength="80"')}${selectField('assetClass','Asset class',x.assetClass||'stock',[['stock','Stocks'],['bond','Bonds'],['fund','Funds'],['crypto','Crypto'],['other','Other']])}${field('quantity','Quantity',x.quantity||'','number','min="0.000001" max="1000000" step="0.000001"')}${amountField('price','Current price per unit',x.price||0)}${amountField('cost','Cost per unit',x.cost||0)}<p class="small">Enter prices manually. This records an asset, not a trade. Do not include the same investment value in a cash account.</p><button class="primary">Save holding</button></form>`};
 if(dialog.mode==='explain'){const e=C.explainNumber(state,dialog.kind);if(!e)return {title:'Explain',body:'<p>No explanation available.</p>'};return {title:e.title,body:`<p><b>${e.value}</b></p><ol class="explain-steps">${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`};}
 if(dialog.mode==='dividend'){return {title:'Log dividend',body:`<form id="dividendForm" class="form-grid">${field('symbol','Symbol','','text','maxlength="20"')}${amountField('amount','Amount',0,0.01)}${field('date','Date',C.localDate(),'date')}<button class="primary">Save dividend</button></form>`};}
 if(dialog.mode==='contribution'){return {title:'Log contribution',body:`<form id="contributionForm" class="form-grid">${field('label','Label','','text','maxlength="80"')}${amountField('amount','Amount',0,0.01)}${field('date','Date',C.localDate(),'date')}<button class="primary">Save contribution</button></form>`};}
 if(dialog.mode==='asset'){return {title:'Add asset/liability',body:`<form id="assetForm" class="form-grid">${field('label','Name (e.g., Car, Mortgage)','','text','maxlength="80"')}${selectField('kind','Type','asset',[['asset','Asset'],['liability','Liability']])}${amountField('value','Value',0)}<button class="primary">Save</button></form>`};}
 if(dialog.mode==='holding-lots'){const h=(state.holdings||[]).find(x=>x.id===dialog.id);if(!h)return {title:'Lots',body:'<p>Holding not found.</p>'};const lots=h.lots||[];return {title:`Lots: ${esc(h.symbol)}`,body:`<p class="small">Track purchase lots for cost basis. Weighted average cost: ${money(lots.length?lots.reduce((s,l)=>s+l.quantity*l.cost,0)/lots.reduce((s,l)=>s+l.quantity,0):h.cost)}.</p>${lots.length?`<div class="table-scroll"><table><thead><tr><th>Date</th><th>Quantity</th><th>Cost/unit</th><th></th></tr></thead><tbody>${lots.map((l,i)=>`<tr><td>${dateText(l.date)}</td><td>${l.quantity}</td><td>${money(l.cost)}</td><td><button class="quiet" data-action="lot-delete" data-holding="${h.id}" data-index="${i}" aria-label="Delete lot">×</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No lots yet. Add lots to track cost basis by purchase.</p>'}<form id="lotForm" class="form-grid"><input type="hidden" name="holding" value="${h.id}">${field('date','Purchase date',C.localDate(),'date')}${field('quantity','Quantity','','number','min="0.000001" step="0.000001"')}${amountField('cost','Cost per unit',0)}<button class="secondary">Add lot</button></form>`};}
 if(dialog.mode==='edit'&&kind==='lifeEvents')return {title:x.id?'Edit life event':'Add life event',body:`<form id="lifeEventForm" class="form-grid">${field('label','Event name',x.label||'','text','maxlength="80"')}${field('month','Starts',x.month||shiftMonth(today.slice(0,7),1),'month','min="'+shiftMonth(today.slice(0,7),1)+'"')}${amountField('amount','Change (negative for expense)',x.amount||0,-1000000000)}${selectField('repeat','Frequency',x.repeat||'once',[['once','One time'],['monthly','Monthly from this date']])}<button class="primary">Save event</button></form>`};
 return null;
}
function redesignClick(b){
 if(b.dataset.action==='menu'){menuOpen=!menuOpen;render();return true;}
 if(b.dataset.action==='export-all'){download('cash-compass-full-export.json',C.fullExport(state),'application/json');flash('Full export downloaded.');return true;}
 if(b.dataset.action==='voice'){startVoice();return true;}
 if(b.dataset.action==='export-csv'){const csv=C.reportCSV(state,reportMonth);download('cash-compass-report-'+reportMonth+'.csv',csv,'text/csv');return true;}
 if(b.dataset.action==='export-print'){window.print();return true;}
 if(b.dataset.action==='share'){shareSummary();return true;}
 if(b.dataset.action==='ann-delete'){update(next=>{next.annotations=(next.annotations||[]).filter(a=>a.id!==b.dataset.id);});render();flash('Annotation removed.');return true;}
 if(b.dataset.action==='cat-delete'){update(next=>{next.customCategories=(next.customCategories||[]).filter(c=>c.id!==b.dataset.id);});render();flash('Category removed.');return true;}
 if(b.dataset.action==='paycheck-add'){const detected=C.detectPaychecks(state),d=detected[Number(b.dataset.index)];if(d){update(next=>{next.incomes.push({id:uid(),label:d.label,amount:d.amount,date:d.lastDate,repeat:d.repeat,category:'Income',accountId:next.accounts[0]?next.accounts[0].id:'cash'});});render();flash('Income schedule added.');}return true;}
 if(b.dataset.action==='cc-plan'){const plan=C.planCardPayment(state,b.dataset.id,state.profile.buffer||0);const el=document.getElementById('ccPlan');if(el)el.innerHTML=`<div class="plan-result"><h4>Payment plan: ${esc(plan.card)}</h4><p><b>${money(plan.amount)}</b> by ${dateText(plan.dueDate)} (${plan.daysUntilDue}d)</p><p>${esc(plan.strategy)}</p>${plan.remaining>0?`<p class="small">Remaining: ${money(plan.remaining)} · Est. monthly interest: ${money(plan.monthlyInterest)}</p>`:''}</div>`;return true;}
 if(b.dataset.action==='customize'){dialog={mode:'customize'};render();return true;}
 if(b.dataset.action==='snapshot'){update(next=>C.snapshot(next));render();flash('Today’s balances recorded');return true;}
 if(b.dataset.action==='tx-clear'){transactionQuery='';transactionType='all';txAccount='all';txCategory='';txTag='all';txMin='';txMax='';txStart='';txEnd='';txLimit=100;selectedTransactions.clear();render();return true;}
 if(b.dataset.action==='tx-save-view'){dialog={mode:'save-filter'};render();return true;}
 if(b.dataset.action==='tx-apply-filter'){const sf=state.savedFilters.find(f=>f.id===b.dataset.filter);if(sf){applyTxFilter(sf.filters);render();}return true;}
 if(b.dataset.action==='tx-delete-filter'){update(next=>{next.savedFilters=next.savedFilters.filter(f=>f.id!==b.dataset.filter);});render();flash('Saved view deleted');return true;}
 if(b.dataset.action==='split-tx'){splitCount=2;dialog={mode:'split',id:b.dataset.id};render();return true;}
 if(b.dataset.action==='split-add'){splitCount=Math.min(10,splitCount+1);render();return true;}
 if(b.dataset.action==='duplicates'){dialog={mode:'duplicates'};render();return true;}
 if(b.dataset.action==='merge-dup'){update(next=>C.mergeDuplicates(next,b.dataset.ids.split(',')));render();flash('Duplicates merged');return true;}
 if(b.dataset.action==='rules'){dialog={mode:'rules'};render();return true;}
 if(b.dataset.action==='rule-delete'){update(next=>{next.rules=next.rules.filter(r=>r.id!==b.dataset.rule);});render();flash('Rule deleted');return true;}
 if(b.dataset.action==='rule-apply'){let n=0;update(next=>{n=C.applyRule(next,b.dataset.rule);});render();flash(n+' transaction'+(n===1?'':'s')+' updated');return true;}
 if(b.dataset.action==='reimbursements'){dialog={mode:'reimbursements'};render();return true;}
 if(b.dataset.action==='add-estimated-income'){
   const num = v => v === '' ? 0 : C.number(v, 0, 1000);
   const est = C.paycheckEstimate(state.profile.hourlyRate, num(paycheckHours), state.profile.taxRate, num(paycheckOvertime), num(paycheckHoliday));
   if (est.takeHome <= 0) throw Error('Estimate a paycheck first.');
   dialog = { mode: 'edit', kind: 'incomes', item: { label: 'Estimated paycheck', amount: est.takeHome, date: C.localDate(), repeat: 'none', category: 'Income' } };
   render(); return true;
 }
 if(b.dataset.action==='more-tx'){txLimit+=100;render();return true;}
 if(b.dataset.action==='bulk'){if(!selectedTransactions.size)throw Error('Select transactions first.');dialog={mode:'bulk'};render();return true;}
 if(b.dataset.action==='undo'){doUndo();return true;}
 if(b.dataset.action==='budget-move'){dialog={mode:'budget-move',from:b.dataset.category};render();return true;}
 if(b.dataset.action==='debt-add'){dialog={mode:'debt',item:null};render();return true;}
 if(b.dataset.action==='debt-edit'){const d=(state.debts||[]).find(x=>x.id===b.dataset.id);dialog={mode:'debt',item:d||null};render();return true;}
 if(b.dataset.action==='debt-delete'){update(next=>{next.debts=(next.debts||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Debt removed.');return true;}
 if(b.dataset.action==='sinking-add'){dialog={mode:'sinking',item:null};render();return true;}
 if(b.dataset.action==='sinking-edit'){const f=(state.sinkingFunds||[]).find(x=>x.id===b.dataset.id);dialog={mode:'sinking',item:f||null};render();return true;}
 if(b.dataset.action==='sinking-delete'){update(next=>{next.sinkingFunds=(next.sinkingFunds||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Sinking fund removed.');return true;}
 if(b.dataset.action==='milestone-add'){dialog={mode:'milestone'};render();return true;}
 if(b.dataset.action==='milestone-delete'){update(next=>{next.milestones=(next.milestones||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Milestone removed.');return true;}
 if(b.dataset.action==='holding-lots'){dialog={mode:'holding-lots',id:b.dataset.id};render();return true;}
 if(b.dataset.action==='lot-delete'){update(next=>{const h=next.holdings.find(x=>x.id===b.dataset.holding);if(h&&h.lots)h.lots.splice(Number(b.dataset.index),1);});dialog={mode:'holding-lots',id:b.dataset.holding};render();return true;}
 if(b.dataset.action==='dividend-add'){dialog={mode:'dividend'};render();return true;}
 if(b.dataset.action==='explain'){dialog={mode:'explain',kind:b.dataset.kind};render();return true;}
 if(b.dataset.action==='dividend-delete'){update(next=>{next.dividends=(next.dividends||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Dividend removed.');return true;}
 if(b.dataset.action==='contribution-add'){dialog={mode:'contribution'};render();return true;}
 if(b.dataset.action==='contribution-delete'){update(next=>{next.contributions=(next.contributions||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Contribution removed.');return true;}
 if(b.dataset.action==='asset-add'){dialog={mode:'asset'};render();return true;}
 if(b.dataset.action==='asset-delete'){update(next=>{next.manualAssets=(next.manualAssets||[]).filter(x=>x.id!==b.dataset.id);});render();flash('Removed.');return true;}
 if(b.dataset.action==='bulk-delete'){if(!selectedTransactions.size)throw Error('Select transactions first.');const snapshot=state.transactions.filter(t=>selectedTransactions.has(t.id));const count=snapshot.length;update(next=>{next.transactions=next.transactions.filter(t=>!selectedTransactions.has(t.id));});selectedTransactions.clear();dialog=null;setUndo('Bulk delete ('+count+')',next=>{next.transactions.push(...snapshot);});return true;}
 const changes=[['recurringView',v=>recurringView=v],['recurringScope',v=>recurringScope=v],['budgetCycle',v=>budgetCycle=v],['reportView',v=>reportView=v],['investmentView',v=>investmentView=v],['goalView',v=>goalView=v],['forecastView',v=>forecastView=v]];
 for(const [key,set]of changes)if(b.dataset[key]){set(b.dataset[key]);render();return true;}return false;
}
function redesignSubmit(id,f){
 if(id==='holdingForm'){update(next=>C.saveHolding(next,{id:dialog.item?dialog.item.id:uid(),symbol:f.get('symbol'),label:f.get('label'),quantity:f.get('quantity'),price:f.get('price'),cost:f.get('cost'),assetClass:f.get('assetClass'),updated:C.localDate()}));dialog=null;tab='investments';}
 else if(id==='quickEntryForm'){try{const parsed=C.parseQuickEntry(f.get('quick'));update(next=>{C.saveTransaction(next,{id:uid(),label:parsed.label,amount:parsed.amount,date:parsed.date,type:parsed.type,category:parsed.category,accountId:next.accounts[0]?next.accounts[0].id:'cash'});});render();flash('Added '+parsed.label+'.');}catch(e){flash(e.message);}}
else if(id==='annotationForm'){update(next=>{next.annotations=C.addAnnotation(next,f.get('label'),f.get('date'));});render();flash('Annotation added.');}
else if(id==='categoryForm'){update(next=>{next.customCategories=C.saveCustomCategory(next,f.get('name'),f.get('group'),f.get('color'));});render();flash('Category saved.');}
else if(id==='ccForm'){const item={id:dialog.item?dialog.item.id:undefined,label:f.get('label'),last4:f.get('last4'),statementDay:f.get('statementDay'),dueDay:f.get('dueDay'),balance:f.get('balance'),minimumDue:f.get('minimumDue'),apr:f.get('apr')};update(next=>{next.creditCards=C.saveCreditCard(next,item);});dialog=null;render();flash('Card saved.');}
else if(id==='aiCoachForm'){const key=String(f.get('aiKey')||'').trim();if(key)localStorage.setItem('cc-ai-key',key);else localStorage.removeItem('cc-ai-key');localStorage.setItem('cc-ai-enabled',f.get('aiEnabled')==='yes'?'1':'0');render();flash('AI coach settings saved.');}
else if(id==='themeForm'){localStorage.setItem('cc-theme',f.get('theme'));applyTheme();render();flash('Theme saved.');}
else if(id==='lifeEventForm'){const item=C.lifeEvent({id:dialog.item?dialog.item.id:uid(),label:f.get('label'),month:f.get('month'),amount:f.get('amount'),repeat:f.get('repeat')});if(item.month<=C.localDate().slice(0,7))throw Error('Choose a future month.');update(next=>{const i=next.lifeEvents.findIndex(e=>e.id===item.id);if(i<0)next.lifeEvents.push(item);else next.lifeEvents[i]=item;});dialog=null;}
 else if(id==='forecastForm'){const settings=C.forecastOptions(Object.fromEntries(f));C.projectWealth(state,settings);update(next=>next.forecastSettings=settings);flash('Scenario updated');}
 else if(id==='customizeForm'){const keys=['setup','spending','budget','transactions','worth','recurring','goals','investments','advice'];update(next=>next.hiddenCards=keys.filter(k=>!f.has(k)));dialog=null;}
 else if(id==='budgetMoveForm'){update(next=>C.moveBudget(next,f.get('from'),f.get('to'),f.get('amount')));dialog=null;}
 else if(id==='debtPayoffForm'){debtPayment=f.get('payment');}
 else if(id==='loanForm'){loanPrincipal=f.get('principal');loanRate=f.get('rate');loanPayment=f.get('payment');loanExtra=f.get('extra');}
 else if(id==='debtForm'){const item={label:C.label(f.get('label')),balance:C.number(f.get('balance'),0.01),rate:C.number(f.get('rate')||0,0,100),minPayment:C.number(f.get('minPayment')||0,0)};update(next=>{next.debts=next.debts||[];if(dialog.item&&dialog.item.id){const d=next.debts.find(x=>x.id===dialog.item.id);if(d)Object.assign(d,item);}else{next.debts.push({id:'debt-'+Date.now(),...item});}});dialog=null;}
 else if(id==='sinkingForm'){const item={label:C.label(f.get('label')),target:C.number(f.get('target'),0.01),saved:C.number(f.get('saved')||0,0),dueDate:f.get('dueDate')||''};if(item.dueDate&&!C.validDate(item.dueDate))throw Error('Enter a valid date.');update(next=>{next.sinkingFunds=next.sinkingFunds||[];if(dialog.item&&dialog.item.id){const s=next.sinkingFunds.find(x=>x.id===dialog.item.id);if(s)Object.assign(s,item);}else{next.sinkingFunds.push({id:'sink-'+Date.now(),...item});}});dialog=null;}
 else if(id==='milestoneForm'){const item={label:C.label(f.get('label')),target:C.number(f.get('target'),0.01)};update(next=>{next.milestones=next.milestones||[];next.milestones.push({id:'mile-'+Date.now(),...item});});dialog=null;}
 else if(id==='lotForm'){const hid=f.get('holding');const lot={date:f.get('date'),quantity:Number(f.get('quantity')),cost:C.number(f.get('cost'),0)};if(!C.validDate(lot.date))throw Error('Enter a valid date.');update(next=>{const h=next.holdings.find(x=>x.id===hid);if(!h)throw Error('Holding not found.');h.lots=h.lots||[];h.lots.push({id:'lot-'+Date.now(),...lot});});dialog={mode:'holding-lots',id:hid};}
 else if(id==='dividendForm'){const item={symbol:C.label(f.get('symbol')).toUpperCase(),amount:C.number(f.get('amount'),0.01),date:f.get('date')};if(!C.validDate(item.date))throw Error('Enter a valid date.');update(next=>{next.dividends=next.dividends||[];next.dividends.push({id:'div-'+Date.now(),...item});});dialog=null;}
 else if(id==='contributionForm'){const item={label:C.label(f.get('label')),amount:C.number(f.get('amount'),0.01),date:f.get('date')};if(!C.validDate(item.date))throw Error('Enter a valid date.');update(next=>{next.contributions=next.contributions||[];next.contributions.push({id:'contrib-'+Date.now(),...item});});dialog=null;}
 else if(id==='assetForm'){const item={label:C.label(f.get('label')),kind:f.get('kind')==='liability'?'liability':'asset',value:C.number(f.get('value'),0)};update(next=>{next.manualAssets=next.manualAssets||[];next.manualAssets.push({id:'asset-'+Date.now(),...item});});dialog=null;}
 else if(id==='dripForm'){dripYield=f.get('yield');dripGrowth=f.get('growth');dripYears=f.get('years');dripMonthly=f.get('monthly');}
 else if(id==='bulkForm'){const category=C.label(f.get('category'));const snapshot=state.transactions.filter(t=>selectedTransactions.has(t.id)).map(t=>({id:t.id,category:t.category}));update(next=>next.transactions.forEach(t=>{if(selectedTransactions.has(t.id))t.category=category;}));const count=selectedTransactions.size;selectedTransactions.clear();dialog=null;setUndo('Bulk categorize ('+count+')',next=>{snapshot.forEach(s=>{const t=next.transactions.find(x=>x.id===s.id);if(t)t.category=s.category;});});}
 else if(id==='cashFlowForm'){const month=f.get('month');if(!C.validDate(month+'-01'))throw Error('Choose a valid month.');flowMonth=month;flowPeriod=f.get('period');flowAccount=f.get('account');flowGroup=f.get('group');}
 else if(id==='detailReportForm'){C.cashFlow(state,f.get('start'),f.get('end'),f.get('account'),f.get('group'));reportStart=f.get('start');reportEnd=f.get('end');reportAccount=f.get('account');flowGroup=f.get('group');}
 else if(id==='merchantPeriodForm'){merchantMonths=C.number(f.get('months'),1,60);}
 else if(id==='yearReviewForm'){reviewYear=String(C.number(f.get('year'),2000,2100));}
 else if(id==='calendarForm'){const m=f.get('month');if(!C.validDate(m+'-01'))throw Error('Choose a valid month.');calendarMonth=m;}
 else if(id==='saveFilterForm'){const name=C.label(f.get('name')).slice(0,40);if(!name)throw Error('Give the view a name.');update(next=>{if(next.savedFilters.length>=50)throw Error('Saved view limit reached (50). Delete one first.');next.savedFilters.push({id:'filter-'+Date.now(),name,filters:currentTxFilter()});});dialog=null;flash('View saved');}
 else if(id==='splitForm'){const parts=[];for(let i=0;i<splitCount;i++)parts.push({category:f.get('cat'+i),amount:f.get('amt'+i)});update(next=>C.splitTransaction(next,dialog.id,parts));dialog=null;splitCount=2;tab='transactions';flash('Transaction split');}
 else if(id==='ruleForm'){const rule=C.makeRule({match:f.get('match'),category:f.get('category'),tag:f.get('tag')});update(next=>{if(next.rules.length>=50)throw Error('Rule limit reached (50). Delete one first.');next.rules.push(rule);});render();flash('Rule added');}
 else if(id==='taxRateForm'){update(next=>{next.profile.sideTaxRate=C.number(f.get('sideTaxRate'),0,100);});render();flash('Set-aside rate updated');}
 else return false;render();return true;
}
document.addEventListener('change',e=>{if(e.target.dataset.selectTx){const id=e.target.dataset.selectTx;e.target.checked?selectedTransactions.add(id):selectedTransactions.delete(id);const button=app.querySelector('[data-action=bulk]');if(button)button.textContent='Edit selected ('+selectedTransactions.size+')';}});
document.addEventListener('click',e=>{if(e.target.dataset.dismissMenu){menuOpen=false;render();}});

let walletStatus={enabled:false,granted:false,queue:[]},walletBusy=false;
const walletNative=()=>typeof NativeBridge!=='undefined'&&typeof NativeBridge.walletStatus==='function';
function walletRefresh(force=false){
 if(!walletNative()||walletBusy||storageBlocked||state.demo)return;
 if(!force&&(dialog||app.contains(document.activeElement)&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)))return;
 walletBusy=true;
 try{
  walletStatus=JSON.parse(NativeBridge.walletStatus());
  
  const items=walletStatus.queue||[];
  if(items.length){let result;update(next=>{result=C.receiveWallet(next,items,walletStatus.enabled&&walletStatus.granted);});
   if(!NativeBridge.walletAck(JSON.stringify(result.ack)))flash('Purchases saved; notification acknowledgment will retry.');
   if(result.added||result.reviewed){if(!dialog)render();flash(result.added+' Wallet purchase(s) added · '+state.wallet.inbox.length+' to review');}
  }
  if(tab==='wallet'&&!dialog)render();
 }catch(e){flash(e.message);}finally{walletBusy=false;}
}
function pauseWallet(clear=false){if(walletNative()){const ok=clear?NativeBridge.walletReset():NativeBridge.walletEnable(false);if(!ok)throw Error('Could not pause Wallet capture. Try again before replacing your plan.');}walletStatus={enabled:false,granted:false,queue:[]};}
function wallet(){const w=state.wallet||C.walletData();return header('Google Wallet','Turn purchase notifications into transactions on this phone.')+
 panel('Connection',`<p><b>${walletNative()?(walletStatus.enabled?(walletStatus.granted?'Capturing new Wallet notifications':'Waiting for Android notification access'):'Capture is paused'):'Available in the Android app'}</b></p><p>Android notification access can expose notifications from all apps. Cash Compass filters for Google Wallet before saving content. Google Play services notices are accepted only when explicitly labeled Google Wallet or Google Pay. Nothing is uploaded, and other apps’ notifications are not saved.</p><p class="small">Captures new notices while Cash Compass is closed; transactions update when you open it. Only clear English USD purchase formats insert automatically. Dollar signs are treated as USD. Refunds, unclear notices, old purchases, and possible duplicates need review. No past Wallet history is retrieved.</p>${state.demo?'<p class="notice">Start your own plan before enabling Wallet.</p>':`<form id="walletSettingsForm" class="form-grid">${accountSelect('walletAccount',''+w.accountId,'Account used for Wallet purchases')}${selectField('walletAdjust','Balance handling',String(w.adjust),[['true','Subtract purchases from this account'],['false','Already included in this account balance']])}${selectField('walletAuto','Import mode',String(w.auto),[['true','Automatically insert clear purchases'],['false','Review every purchase first']])}<p class="small">All automatic purchases use this account. If you pay with multiple cards, choose review mode to select the correct account each time. Categories start as Other.</p><button class="primary" ${walletNative()?'':'disabled'}>Save and enable capture</button></form><div class="row-actions"><button data-action="wallet-access" ${walletNative()?'':'disabled'}>Open Android notification access</button><button data-action="wallet-pause" ${walletNative()?'':'disabled'}>Pause capture</button><button data-action="wallet-refresh" ${walletNative()?'':'disabled'}>Check captured purchases</button></div>`}<p class="small">To fully revoke access, turn off Cash Compass in Android notification access. If Android shows “Restricted setting” for this preview, it may require Allow restricted settings under App info before you can grant access. You control that choice in Android.</p>${walletStatus.error?'<p class="notice danger">Wallet capture reported a storage error. Check your free space; saved purchases remain available below.</p>':''}${walletStatus.dropped?`<p class="notice danger">${walletStatus.dropped} notification(s) could not be retained because the inbox was full or older than 30 days. Compare against Wallet history.</p>`:''}${w.receipts.length>=10000?'<p class="notice danger">Receipt history is full. No further automatic imports will be acknowledged. Export a backup before clearing your plan.</p>':''}`)+
 panel('Needs review · '+w.inbox.length,w.inbox.map(item=>{const p=C.parseWallet(item),old=state.transactions.find(t=>t.walletId===item.id);return `<article class="entry"><h3>${esc(p.label||item.title||'Wallet notification')}</h3><p>${p.amount===null?'Amount needs review':money(p.amount)} · ${esc(p.date)}</p><p class="notice">${esc(item.reason)}</p><details><summary>Notification details</summary><p class="wallet-notice">${esc(item.title)}<br>${esc(item.text)}</p></details><div class="row-actions"><button data-wallet-review="${item.id}">${old?'Review update':'Review purchase'}</button><button data-wallet-dismiss="${item.id}">Already recorded / dismiss</button></div></article>`;}).join('')||'<p class="empty">No purchases need review. New clear purchases appear directly in Transactions.</p>')+
 panel('Imported purchases',`<p>${state.transactions.filter(t=>t.walletId).length} Wallet-linked transaction(s). Open Transactions to edit the merchant, account, category, or amount. Deleting an import reverses its original balance adjustment and will not re-import the same notification.</p><button class="quiet" data-tab="transactions">View transactions</button><p class="small">A notification is a purchase alert, not a settled bank statement. Tips, exchange rates, and final totals can change. Reconcile those amounts when needed.</p>`);
}
function walletModal(){if(dialog.mode!=='wallet-review')return null;const item=state.wallet.inbox.find(x=>x.id===dialog.id);if(!item)throw Error('Notification no longer pending.');const p=C.parseWallet(item),old=state.transactions.find(t=>t.walletId===item.id),w=state.wallet;
 return {title:old?'Update imported transaction':'Review Wallet purchase',body:`<p>${esc(item.reason)}</p><form id="walletReviewForm" class="form-grid">${field('label','Merchant',p.label||old?.label||'','text','maxlength="80"')}${amountField('amount','Amount in USD',p.amount??old?.amount??'',0.01)}${field('date','Transaction date',p.date,'date','max="'+C.localDate()+'"')}${selectField('type','Type',p.type,[['expense','Purchase'],['income','Refund / income']])}${categoryField(old?.category||'Other')}${accountSelect('accountId',old?.accountId||w.accountId,'Account')}${selectField('adjust','Balance handling',String(old?old.delta!==0:w.adjust),[['true','Apply to account balance'],['false','Already included in balance']])}<p class="small">${old?'Saving replaces the linked transaction and reverses its previous balance adjustment first.':'Check for an existing manual or CSV transaction before adding this purchase.'}</p><button class="primary">${old?'Update transaction':'Add transaction'}</button></form>`};
}
function walletClick(b){
 if(b.dataset.action==='wallet-access'){if(walletNative())NativeBridge.walletSettings();return true;}
 if(b.dataset.action==='wallet-pause'){pauseWallet();render();flash('Capture paused. Existing purchases are kept.');return true;}
 if(b.dataset.action==='wallet-refresh'){walletRefresh(true);return true;}
 if(b.dataset.walletReview){dialog={mode:'wallet-review',id:b.dataset.walletReview};render();return true;}
 if(b.dataset.walletDismiss){update(next=>C.resolveWallet(next,b.dataset.walletDismiss,null));render();return true;}
 return false;
}
function walletSubmit(id,f){
 if(id==='walletSettingsForm'){
  if(!walletNative())throw Error('Available in the Android app.');if(state.demo)throw Error('Start your own plan first.');
  update(next=>{next.wallet.accountId=C.accountById(next,f.get('walletAccount')).id;next.wallet.adjust=f.get('walletAdjust')==='true';next.wallet.auto=f.get('walletAuto')==='true';});
  if(!NativeBridge.walletEnable(true))throw Error('Could not enable capture.');walletStatus=JSON.parse(NativeBridge.walletStatus());render();flash(walletStatus.granted?'Wallet capture enabled.':'Saved. Open Android notification access and enable Cash Compass.');return true;
 }
 if(id==='walletReviewForm'){update(next=>C.resolveWallet(next,dialog.id,{label:f.get('label'),amount:f.get('amount'),date:f.get('date'),type:f.get('type'),category:f.get('category'),accountId:f.get('accountId'),adjust:f.get('adjust')==='true'}));dialog=null;render();flash('Wallet transaction saved');return true;}return false;
}
window.cashCompassWalletRefresh=()=>walletRefresh();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)walletRefresh();});
setInterval(()=>{if(!document.hidden)walletRefresh();},15000);

applyTheme();
render();
syncReminders();
walletRefresh();
