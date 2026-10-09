const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/core.js');

const RATES = { base: 'USD', locale: 'auto', rates: { EUR: 0.92, GBP: 0.8, JPY: 150 } };

test('currencyCode validates and normalizes ISO codes', () => {
  assert.equal(C.currencyCode('usd'), 'USD');
  assert.equal(C.currencyCode(' EUR '), 'EUR');
  assert.equal(C.currencyCode('JPY'), 'JPY');
  assert.throws(() => C.currencyCode('XX'), /supported currency/);
  assert.throws(() => C.currencyCode(''), /supported currency/);
  assert.throws(() => C.currencyCode(null), /supported currency/);
  assert.throws(() => C.currencyCode('USDD'), /supported currency/);
});

test('currencySettings fills defaults and validates', () => {
  assert.deepEqual(C.currencySettings(), { base: 'USD', locale: 'auto', rates: {} });
  assert.deepEqual(C.currencySettings(null), { base: 'USD', locale: 'auto', rates: {} });
  assert.equal(C.currencySettings({ base: 'eur' }).base, 'EUR');
  assert.equal(C.currencySettings({ locale: 'de-DE' }).locale, 'de-DE');
  assert.equal(C.currencySettings({ locale: 'auto' }).locale, 'auto');
  assert.throws(() => C.currencySettings({ base: 'XX' }), /supported currency/);
  assert.throws(() => C.currencySettings({ locale: 'de_DE!' }), /valid locale/);
  assert.throws(() => C.currencySettings({ locale: 'toolonglocale' }), /valid locale/);
  assert.throws(() => C.currencySettings({ rates: { EUR: -1 } }), /valid rate/);
  assert.throws(() => C.currencySettings({ rates: { EUR: 0 } }), /valid rate/);
  assert.throws(() => C.currencySettings({ rates: { EUR: 'abc' } }), /valid rate/);
  assert.throws(() => C.currencySettings({ rates: { EUR: Infinity } }), /valid rate/);
  // rate for the base currency is dropped; keys are uppercased
  assert.deepEqual(C.currencySettings({ rates: { USD: 2, eur: 0.5 } }).rates, { EUR: 0.5 });
});

test('localeTag maps auto to the runtime default', () => {
  assert.equal(C.localeTag(), undefined);
  assert.equal(C.localeTag({ locale: 'auto' }), undefined);
  assert.equal(C.localeTag({ locale: 'fr-FR' }), 'fr-FR');
});

test('convertCents converts cent-based with single rounding', () => {
  assert.equal(C.convertCents(10000, 'USD', 'USD', RATES), 10000);
  assert.equal(C.convertCents(10000, 'USD', 'EUR', RATES), 9200);
  assert.equal(C.convertCents(9200, 'EUR', 'USD', RATES), 10000);
  assert.equal(C.convertCents(199, 'USD', 'EUR', RATES), 183); // 183.08 rounds down
  assert.equal(C.convertCents(1, 'USD', 'EUR', RATES), 1); // 0.92 rounds to 1 cent
  assert.equal(C.convertCents(-5000, 'USD', 'EUR', RATES), -4600); // sign preserved
  assert.equal(C.convertCents(0, 'EUR', 'GBP', RATES), 0);
  // cross conversion goes through the base: 9200 EUR -> 10000 USD -> 8000 GBP
  assert.equal(C.convertCents(9200, 'EUR', 'GBP', RATES), 8000);
  assert.equal(C.convertCents(10000, 'JPY', 'USD', RATES), 67); // 10000/150 = 66.67
  assert.throws(() => C.convertCents(100, 'EUR', 'CHF', RATES), /CHF/);
  assert.throws(() => C.convertCents(100, 'CHF', 'EUR', RATES), /CHF/);
  assert.throws(() => C.convertCents(10.5, 'USD', 'EUR', RATES), /whole cents/);
  assert.throws(() => C.convertCents(100, 'XX', 'EUR', RATES), /supported currency/);
});

test('rebaseRates re-scales rates onto a new base', () => {
  const r = C.rebaseRates(RATES, 'EUR');
  assert.ok(Math.abs(r.USD - 1 / 0.92) < 1e-12);
  assert.ok(Math.abs(r.GBP - 0.8 / 0.92) < 1e-12);
  assert.ok(!('EUR' in r));
  // same base returns a copy
  assert.deepEqual(C.rebaseRates(RATES, 'USD'), RATES.rates);
  assert.notEqual(C.rebaseRates(RATES, 'USD'), RATES.rates);
  // new base without a rate is rejected
  assert.throws(() => C.rebaseRates(RATES, 'CHF'), /CHF/);
  // round trip: USD -> EUR -> USD recovers the original rates
  const back = C.rebaseRates({ base: 'EUR', locale: 'auto', rates: r }, 'USD');
  assert.ok(Math.abs(back.EUR - 0.92) < 1e-12);
  assert.ok(Math.abs(back.GBP - 0.8) < 1e-12);
});

test('account() defaults currency to USD and validates codes', () => {
  const s = C.blank();
  const a = C.normalize({ ...s, accounts: [{ id: 'a', label: 'A', type: 'checking', balance: 10 }] }).accounts[0];
  assert.equal(a.currency, 'USD');
  const withRate = { ...s, currency: { base: 'USD', locale: 'auto', rates: { EUR: 0.92 } } };
  const b = C.normalize({ ...withRate, accounts: [{ id: 'b', label: 'B', type: 'savings', balance: 10, currency: 'eur' }] }).accounts[0];
  assert.equal(b.currency, 'EUR');
  assert.throws(() => C.normalize({ ...s, accounts: [{ id: 'c', label: 'C', type: 'cash', balance: 1, currency: 'XX' }] }), /supported currency/);
  // foreign account without a rate fails visibly on load, never silently mis-totals
  assert.throws(() => C.normalize({ ...s, accounts: [{ id: 'd', label: 'D', type: 'cash', balance: 1, currency: 'EUR' }] }), /EUR/);
});

test('normalize defaults currency settings on old plans', () => {
  const s = C.normalize({ ...C.blank(), currency: undefined });
  assert.deepEqual(s.currency, { base: 'USD', locale: 'auto', rates: {} });
  const kept = C.normalize({ ...C.blank(), currency: { base: 'EUR', locale: 'de-DE', rates: { USD: 1.08 } } });
  assert.deepEqual(kept.currency, { base: 'EUR', locale: 'de-DE', rates: { USD: 1.08 } });
});

test('saveAccount converts foreign balances into the base total', () => {
  const s = C.blank();
  s.currency = { ...RATES };
  C.saveAccount(s, { id: 'usd', label: 'US', type: 'checking', balance: 1000, currency: 'USD' });
  C.saveAccount(s, { id: 'eur', label: 'EU', type: 'savings', balance: 920, currency: 'EUR' });
  assert.equal(s.profile.balance, 2000); // 1000 + 920/0.92
  assert.equal(C.totalInBase(s), 2000);
  // a foreign account without a rate fails visibly instead of corrupting the total
  assert.throws(() => C.saveAccount(s, { id: 'chf', label: 'CH', type: 'cash', balance: 50, currency: 'CHF' }), /CHF/);
  assert.equal(s.accounts.length, 3); // failed save left state untouched (blank() seeds a cash account)
  assert.equal(s.profile.balance, 2000);
  // adding the rate then works
  s.currency = { ...RATES, rates: { ...RATES.rates, CHF: 0.88 } };
  C.saveAccount(s, { id: 'chf', label: 'CH', type: 'cash', balance: 88, currency: 'CHF' });
  assert.equal(s.profile.balance, 2100);
});

test('all-USD plans keep the old exact totals', () => {
  const s = C.normalize(C.demo());
  const raw = s.accounts.reduce((sum, a) => sum + a.balance, 0);
  assert.equal(s.profile.balance, Math.round(raw * 100) / 100);
  assert.equal(C.totalInBase(s), s.profile.balance);
});

test('formatMoney renders locale-aware currency', () => {
  assert.equal(C.formatMoney(1234.56, 'USD', 'en-US'), '$1,234.56');
  const de = C.formatMoney(1234.5, 'EUR', 'de-DE');
  assert.ok(de.includes('€'), 'has euro sign: ' + de);
  assert.ok(de.includes('1.234'), 'has German grouping: ' + de);
  assert.ok(de.includes(',50'), 'has German decimals: ' + de);
  // invalid currency falls back to a readable code form, never throws
  assert.equal(C.formatMoney(1.234, 'USDD'), 'USDD 1.23');
  // auto locale never throws
  assert.ok(typeof C.formatMoney(5, 'USD', undefined) === 'string');
});

test('formatDate renders locale-aware dates with ISO fallback', () => {
  const us = C.formatDate('2026-09-17', 'en-US');
  assert.ok(us.includes('2026') && us.includes('Sep'), 'US short date: ' + us);
  const de = C.formatDate('2026-09-17', 'de-DE');
  assert.ok(de.includes('2026'), 'German date keeps year: ' + de);
  assert.notEqual(us, de);
  assert.equal(C.formatDate('not-a-date', 'en-US'), 'not-a-date');
  assert.equal(C.formatDate('2026-13-99', 'en-US'), '2026-13-99');
  assert.equal(C.formatDate('2026-09-17', 'de_DE!!'), '2026-09-17'); // malformed locale falls back to ISO
});

test('rateFor reports the missing currency clearly', () => {
  assert.equal(C.rateFor(RATES, 'USD'), 1);
  assert.equal(C.rateFor(RATES, 'EUR'), 0.92);
  assert.throws(() => C.rateFor(RATES, 'CHF'), /Set the CHF rate/);
});
