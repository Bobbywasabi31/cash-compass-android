const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/core.js');
const date = '2026-09-17';
function plan() { const s = C.blank(); s.profile.balance = 1000; s.incomes.push({ id: 'pay', amount: 500, date: '2026-09-24', gross: false }); return s; }
test('overdue and same-payday bills remain reserved; later bills do not consume this window', () => {
  const s = plan(); s.bills = [{ amount: 80, date: '2026-09-16' }, { amount: 20, date: '2026-09-24' }, { amount: 700, date: '2026-09-25' }];
  const m = C.forecast(s, date); assert.equal(m.held, 100); assert.equal(m.safe, 900); assert.equal(m.overdue.length, 1);
});
test('no payday gives no safe-to-spend promise; late pay is excluded', () => {
  const s = plan(); s.incomes[0].date = '2026-09-16';
  const m = C.forecast(s, date); assert.equal(m.safe, null); assert.equal(m.lateIncome.length, 1); assert.equal(m.endBalance, 1000);
});
test('zero safe amount retains size of cash shortfall', () => {
  const s = plan(); s.bills = [{ amount: 1300, date }]; const m = C.forecast(s, date);
  assert.equal(m.safe, 0); assert.equal(m.shortfall, 300); assert.equal(m.low, -300);
});
test('goal money, buffer and existing tax reserve are protected; completed goals reserve no extra', () => {
  const s = plan(); s.profile.buffer = 25; s.profile.taxHeld = 75;
  s.goals = [{ target: 200, saved: 150, monthly: 100 }, { target: 100, saved: 100, monthly: 50 }];
  assert.equal(C.forecast(s, date).reserved, 400); assert.equal(C.forecast(s, date).safe, 600);
});
test('gross tax reserve is applied once; take-home income is not taxed again', () => {
  const s = plan(); s.profile.taxRate = 20; s.incomes[0].gross = true;
  assert.equal(C.forecast(s, date).endBalance, 1400);
  C.settle(s, 'incomes', 'pay'); assert.equal(s.profile.balance, 1500); assert.equal(s.profile.taxHeld, 100);
  assert.equal(C.forecast(s, date).endBalance, 1400);
  const net = plan(); net.profile.taxRate = 20; assert.equal(C.forecast(net, date).endBalance, 1500);
});
test('scenario changes only expected payment, handles requested hours and caps at income', () => {
  const s = plan(); s.profile.hourlyRate = 20; s.profile.taxRate = 25; const before = JSON.stringify(s);
  assert.equal(C.forecast(s, date, 8).loss, 120); assert.equal(C.forecast(s, date, 12).endBalance, 1320);
  assert.equal(C.forecast(s, date, 12).safe, 1000); assert.equal(C.forecast(s, date, 100).loss, 500);
  assert.equal(JSON.stringify(s), before);
});
test('bills precede same-day income and reveal intraday shortfall', () => {
  const s = plan(); s.profile.balance = 50; s.bills = [{ amount: 100, date: s.incomes[0].date }];
  const m = C.forecast(s, date); assert.equal(m.timeline[0].kind, 'bills'); assert.equal(m.low, -50); assert.equal(m.endBalance, 450);
});
test('30-day boundary excludes later income and includes day 30', () => {
  const s = plan(); s.incomes[0].date = C.addDays(date, 31); assert.equal(C.forecast(s, date).endBalance, 1000);
  s.incomes[0].date = C.addDays(date, 30); assert.equal(C.forecast(s, date).endBalance, 1500);
});
test('settlement adjusts balance once, or leaves reconciled cash unchanged', () => {
  const s = plan(); s.bills = [{ id: 'b', amount: 0.3, date }]; C.settle(s, 'bills', 'b'); assert.equal(s.profile.balance, 999.7);
  assert.throws(() => C.settle(s, 'bills', 'b')); C.settle(s, 'incomes', 'pay', false); assert.equal(s.profile.balance, 999.7);
});
test('cent precision and calendar dates do not drift with DST', () => {
  const s = plan(); s.profile.balance = 0.3; s.bills = [{ amount: 0.1, date }, { amount: 0.2, date }];
  assert.equal(C.forecast(s, date).safe, 0); assert.equal(C.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(C.validDate('2026-02-30'), false);
});
test('legacy public and local schemas migrate and bad data fails visibly', () => {
  const s = C.normalize({ name: 'Test', balance: 100, rate: 20, tax: 10, incomes: [], bills: [], goals: [] });
  assert.equal(s.profile.hourlyRate, 20); assert.equal(C.normalize(C.demo(date)).profile.name, 'Jordan');
  assert.throws(() => C.normalize({})); assert.throws(() => C.number(Infinity)); assert.throws(() => C.number(-1));
  assert.throws(() => C.label('  ')); assert.throws(() => C.normalize({ ...s, bills: [{ label: 'Bad', date: '2026-02-30', amount: 1 }] }));
});
