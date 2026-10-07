/* App-lock section smoke test: loads app.js with stubbed browser globals and
   checks that the App lock settings section renders the right state. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadApp(nativeStatus) {
  delete globalThis.NativeBridge;
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
    + '\n;globalThis.__t = { appLockSection, refreshAppLock };';
  eval(src);
  if (nativeStatus !== undefined) {
    globalThis.NativeBridge = {
      appLockStatus: () => JSON.stringify(nativeStatus),
      setAppLock: () => true,
    };
  }
  return globalThis.__t;
}

test('says app lock is Android-only without the bridge', () => {
  const t = loadApp();
  assert.match(t.appLockSection(), /Available in the Android app/);
});

test('biometric mode offers to turn the lock on', () => {
  const t = loadApp({ enabled: false, mode: 'biometric' });
  const html = t.appLockSection();
  assert.match(html, /Turn on app lock/);
  assert.match(html, /fingerprint or face/);
  assert.doesNotMatch(html, /disabled/);
});

test('device mode names the phone PIN', () => {
  const t = loadApp({ enabled: false, mode: 'device' });
  const html = t.appLockSection();
  assert.match(html, /phone PIN, pattern, or password/);
  assert.doesNotMatch(html, /disabled/);
});

test('no screen lock disables the toggle and explains', () => {
  const t = loadApp({ enabled: false, mode: 'none' });
  const html = t.appLockSection();
  assert.match(html, /disabled/);
  assert.match(html, /Set a screen lock in Android Settings first/);
});

test('enabled lock offers to turn it off', () => {
  const t = loadApp({ enabled: true, mode: 'biometric' });
  const html = t.appLockSection();
  assert.match(html, /Turn off app lock/);
  assert.match(html, /locks itself when you leave it/);
});

test('malformed bridge status falls back to off', () => {
  const t = loadApp();
  globalThis.NativeBridge = { appLockStatus: () => 'not-json', setAppLock: () => true };
  const html = t.appLockSection();
  assert.match(html, /Turn on app lock/);
  assert.match(html, /disabled/);
});
