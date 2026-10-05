/* Review-banner smoke test: loads app.js with stubbed browser globals and checks
   that the wallet-inbox "N transaction(s) need review" banner renders in warnings(). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadApp() {
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.setInterval = () => 0;
  globalThis.CashCore = require('../app/src/main/assets/core.js');
  const store = {};
  globalThis.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const cls = { toggle: () => {}, add: () => {}, remove: () => {} };
  globalThis.document = {
    getElementById: () => ({ innerHTML: '', textContent: '', classList: cls }),
    addEventListener: () => {},
    documentElement: { setAttribute: () => {} },
    body: { classList: cls },
  };
  const src = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8')
    + '\n;globalThis.__t = { warnings, setState: s => { state = s; } };';
  eval(src);
  return globalThis.__t;
}

const item = id => ({
  id: id.repeat(64), revision: 'r'.repeat(64), postedAt: Date.now(),
  title: 'Store', text: '$5.00', reason: 'Review purchase details.',
});

test('no banner when the wallet inbox is empty', () => {
  const t = loadApp();
  const C = globalThis.CashCore;
  const s = C.blank();
  t.setState(s);
  assert.doesNotMatch(t.warnings(C.forecast(s)), /need(s)? review/);
});

test('banner reads "1 transaction needs review" for a single item', () => {
  const t = loadApp();
  const C = globalThis.CashCore;
  const s = C.blank();
  s.wallet.inbox.push(item('a'));
  t.setState(s);
  const html = t.warnings(C.forecast(s));
  assert.match(html, /1 transaction needs review/);
  assert.match(html, /data-tab="wallet"/);
});

test('banner pluralizes for multiple items', () => {
  const t = loadApp();
  const C = globalThis.CashCore;
  const s = C.blank();
  s.wallet.inbox.push(item('a'), item('b'), item('c'));
  t.setState(s);
  const html = t.warnings(C.forecast(s));
  assert.match(html, /3 transactions need review/);
});

test('banner renders before other warnings', () => {
  const t = loadApp();
  const C = globalThis.CashCore;
  const s = C.blank();
  s.bills.push({ id: 'b1', label: 'Rent', amount: 100, date: '2020-01-01', repeat: 'none' });
  s.wallet.inbox.push(item('a'));
  t.setState(s);
  const html = t.warnings(C.forecast(s));
  assert.ok(html.indexOf('needs review') < html.indexOf('overdue'), 'review banner comes first');
});
