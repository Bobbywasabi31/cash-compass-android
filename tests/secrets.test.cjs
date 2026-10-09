/* Encrypted-at-rest remainder (roadmap #8): the connected-coach API key lives
   in EncryptedSharedPreferences on Android instead of WebView localStorage.
   Loads app.js with stubbed browser globals like wallet-banner.test.cjs does;
   the native crypto itself is exercised by CI (compile + emulator). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Fake Android keystore vault. When vaultOk, aiKeySave/aiKeyLoad behave like
// EncryptedSharedPreferences (save('') removes the key); when false,
// aiKeySave reports {ok:false} like the real bridge does with no keystore.
function loadApp({ seedStore = {}, vaultOk = true, native = true } = {}) {
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.setInterval = () => 0;
  globalThis.CashCore = require('../app/src/main/assets/core.js');
  const store = { ...seedStore };
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
  let vaultKey = null;
  if (native) {
    globalThis.NativeBridge = {
      aiKeySave: k => { if (vaultOk) { vaultKey = k || null; return '{"ok":true}'; } return '{"ok":false}'; },
      aiKeyLoad: () => (vaultKey == null ? 'null' : JSON.stringify(vaultKey)),
    };
  } else {
    delete globalThis.NativeBridge;
  }
  const src = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/app.js'), 'utf8')
    + '\n;globalThis.__s = { aiKeyGet, aiKeySet, migrateAiKey, store: () => store };';
  eval(src);
  return globalThis.__s;
}

test('aiKeySet saves into the native vault, never localStorage', () => {
  const s = loadApp();
  assert.equal(s.aiKeySet('sk-live'), true);
  assert.equal(s.store()['cc-ai-key'], undefined);
  assert.equal(s.aiKeyGet(), 'sk-live');
});

test('boot migration moves a legacy localStorage key into the vault and wipes it', () => {
  const s = loadApp({ seedStore: { 'cc-ai-key': 'legacy-secret' } });
  // migrateAiKey() runs in the boot sequence during loadApp()
  assert.equal(s.store()['cc-ai-key'], undefined);
  assert.equal(s.aiKeyGet(), 'legacy-secret');
});

test('failed migration never wipes the plaintext original', () => {
  const s = loadApp({ seedStore: { 'cc-ai-key': 'keep-me' }, vaultOk: false });
  s.migrateAiKey();
  assert.equal(s.store()['cc-ai-key'], 'keep-me');
  assert.equal(s.aiKeyGet(), 'keep-me');
});

test('vault unavailable: aiKeySet falls back to localStorage', () => {
  const s = loadApp({ vaultOk: false });
  assert.equal(s.aiKeySet('sk-fallback'), false);
  assert.equal(s.store()['cc-ai-key'], 'sk-fallback');
  assert.equal(s.aiKeyGet(), 'sk-fallback');
});

test('no native bridge: localStorage is the store', () => {
  const s = loadApp({ native: false });
  assert.equal(s.aiKeySet('sk-web'), false);
  assert.equal(s.store()['cc-ai-key'], 'sk-web');
  assert.equal(s.aiKeyGet(), 'sk-web');
});

test('clearing the key removes it from the vault and localStorage', () => {
  const s = loadApp();
  assert.equal(s.aiKeySet('sk-temp'), true);
  assert.equal(s.aiKeySet(''), true);
  assert.equal(s.aiKeyGet(), '');
  assert.equal(s.store()['cc-ai-key'], undefined);
});

test('migrateAiKey is a no-op with no legacy key and no native bridge', () => {
  const s = loadApp({ native: false, seedStore: { 'cc-ai-key': 'stays' } });
  s.migrateAiKey();
  assert.equal(s.store()['cc-ai-key'], 'stays');
  assert.equal(s.aiKeyGet(), 'stays');
});
