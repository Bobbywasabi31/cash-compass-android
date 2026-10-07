const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/core.js');
const date = '2026-09-17';
function plan() { const s = C.blank(); s.profile.balance = 1000; s.incomes.push({ id: 'pay', amount: 500, date: '2026-09-24', gross: false }); return s; }

test('widget payload carries safe-to-spend and days until payday', () => {
  const p = C.widgetPayload(plan(), date);
  assert.equal(p.safe, 1000);
  assert.equal(p.paydayDate, '2026-09-24');
  assert.equal(p.daysUntilPayday, 7);
});

test('no payday gives null safe and null days until payday', () => {
  const s = plan(); s.incomes = [];
  const p = C.widgetPayload(s, date);
  assert.equal(p.safe, null);
  assert.equal(p.paydayDate, null);
  assert.equal(p.daysUntilPayday, null);
});

test('bills sorted ascending, capped at three, overdue counted', () => {
  const s = plan();
  s.bills = [
    { amount: 10, date: '2026-09-20', label: 'D' },
    { amount: 30, date: '2026-09-10', label: 'Overdue' },
    { amount: 20, date: '2026-09-18', label: 'B' },
    { amount: 40, date: '2026-09-19', label: 'C' },
    { amount: 50, date: '2026-09-21', label: 'E' },
  ];
  const p = C.widgetPayload(s, date);
  assert.deepEqual(p.bills.map(b => b.label), ['B', 'C', 'D']);
  assert.equal(p.bills[0].daysOut, 1);
  assert.equal(p.bills[0].amount, 20);
  assert.equal(p.overdue, 1);
});

test('empty state gives empty bills, zero overdue, null safe', () => {
  const p = C.widgetPayload(C.blank(), date);
  assert.deepEqual(p.bills, []);
  assert.equal(p.overdue, 0);
  assert.equal(p.safe, null);
});
