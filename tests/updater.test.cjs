/* In-app updater tests: release-tag parsing, version comparison, release-asset
   lookup, backup-marker round-trip, and post-update integrity check. Loads
   app.js with stubbed browser globals like wallet-banner.test.cjs does. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadApp(seedStore) {
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.setInterval = () => 0;
  globalThis.CashCore = require('../app/src/main/assets/core.js');
  const store = {};
  if (seedStore) for (const k of Object.keys(seedStore)) store[k] = seedStore[k];
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
    + '\n;globalThis.__u = { parseReleaseTag, isUpdateAvailable, findApkUrl, makeUpdateMarker, parseUpdateMarker, storedDataIntact, APP_VERSION };';
  eval(src);
  return globalThis.__u;
}

test('parseReleaseTag handles preview tags', () => {
  const u = loadApp();
  assert.deepEqual(u.parseReleaseTag('v1.59.0-preview.85'), { major: 1, minor: 59, patch: 0, preview: 85 });
});

test('parseReleaseTag handles plain tags with and without v', () => {
  const u = loadApp();
  assert.deepEqual(u.parseReleaseTag('v1.60.0'), { major: 1, minor: 60, patch: 0, preview: null });
  assert.deepEqual(u.parseReleaseTag('1.2.3'), { major: 1, minor: 2, patch: 3, preview: null });
});

test('parseReleaseTag rejects garbage', () => {
  const u = loadApp();
  assert.equal(u.parseReleaseTag(''), null);
  assert.equal(u.parseReleaseTag('v1.59'), null);
  assert.equal(u.parseReleaseTag('latest'), null);
  assert.equal(u.parseReleaseTag('v1.59.0-preview'), null);
  assert.equal(u.parseReleaseTag(null), null);
});

test('isUpdateAvailable detects newer major/minor/patch', () => {
  const u = loadApp();
  assert.equal(u.isUpdateAvailable('1.59.0', 'v1.60.0-preview.86'), true);
  assert.equal(u.isUpdateAvailable('1.59.0', 'v1.59.1'), true);
  assert.equal(u.isUpdateAvailable('1.59.0', 'v2.0.0'), true);
  assert.equal(u.isUpdateAvailable('1.9.0', 'v1.10.0'), true); // numeric, not lexicographic
});

test('isUpdateAvailable is false for same or older versions', () => {
  const u = loadApp();
  assert.equal(u.isUpdateAvailable('1.59.0', 'v1.59.0-preview.85'), false);
  assert.equal(u.isUpdateAvailable('1.60.0', 'v1.59.0-preview.85'), false);
  assert.equal(u.isUpdateAvailable('1.59.0', 'v1.58.9'), false);
});

test('isUpdateAvailable is false on unparseable input', () => {
  const u = loadApp();
  assert.equal(u.isUpdateAvailable('1.59.0', 'bogus'), false);
  assert.equal(u.isUpdateAvailable('bogus', 'v1.60.0'), false);
});

const releaseJson = tag => ({
  tag_name: tag,
  name: 'OddDough 1.60.0',
  body: 'New stuff.',
  assets: [
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/x/SHA256SUMS.txt' },
    { name: 'OddDough-1.60.0-preview.apk', browser_download_url: 'https://github.com/x/OddDough-1.60.0-preview.apk' },
  ],
});

test('findApkUrl picks the APK asset', () => {
  const u = loadApp();
  assert.equal(u.findApkUrl(releaseJson('v1.60.0-preview.86')), 'https://github.com/x/OddDough-1.60.0-preview.apk');
});

test('findApkUrl returns null when no APK is attached', () => {
  const u = loadApp();
  assert.equal(u.findApkUrl({ tag_name: 'v1.60.0', assets: [{ name: 'notes.txt', browser_download_url: 'https://github.com/x/notes.txt' }] }), null);
  assert.equal(u.findApkUrl({ tag_name: 'v1.60.0' }), null);
  assert.equal(u.findApkUrl(null), null);
});

test('findApkUrl rejects non-https URLs', () => {
  const u = loadApp();
  assert.equal(u.findApkUrl({ assets: [{ name: 'a.apk', browser_download_url: 'http://evil/x.apk' }] }), null);
});

test('backup marker round-trips', () => {
  const u = loadApp();
  const m = u.makeUpdateMarker('v1.60.0-preview.86', '/files/updates/odddough-backup-x.json');
  assert.equal(m.tag, 'v1.60.0-preview.86');
  assert.equal(m.backupPath, '/files/updates/odddough-backup-x.json');
  assert.equal(m.appVersion, u.APP_VERSION);
  const back = u.parseUpdateMarker(JSON.stringify(m));
  assert.deepEqual(back, m);
});

test('parseUpdateMarker rejects bad input', () => {
  const u = loadApp();
  assert.equal(u.parseUpdateMarker('null'), null);
  assert.equal(u.parseUpdateMarker('garbage'), null);
  assert.equal(u.parseUpdateMarker('{}'), null);
  assert.equal(u.parseUpdateMarker(JSON.stringify({ tag: 'v1.60.0' })), null);
});

test('storedDataIntact is false when the store is missing', () => {
  const u = loadApp();
  const r = u.storedDataIntact();
  assert.equal(r.intact, false);
  assert.equal(r.transactions, 0);
});

test('storedDataIntact is true for a valid plan', () => {
  const u = loadApp();
  const C = globalThis.CashCore;
  const s = C.blank();
  s.transactions.push({ id: 't1' }, { id: 't2' }, { id: 't3' });
  globalThis.localStorage.setItem('cash-compass-v2', JSON.stringify(s));
  const r = u.storedDataIntact();
  assert.equal(r.intact, true);
  assert.equal(r.transactions, 3);
});

test('storedDataIntact is false for corrupt or plan-less data', () => {
  const u = loadApp();
  globalThis.localStorage.setItem('cash-compass-v2', '{not json');
  assert.equal(u.storedDataIntact().intact, false);
  globalThis.localStorage.setItem('cash-compass-v2', JSON.stringify({ transactions: [] }));
  assert.equal(u.storedDataIntact().intact, false);
});
