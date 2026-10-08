const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/src/main/assets/core.js');

// At-rest encrypted vault (roadmap #8 remainder): boot-time storage-source
// decisions and the automatic-backup slot document. The native EncryptedFile
// side is exercised by CI (compile + emulator); these cover the pure logic.

test('wrapVault/unwrapVault round-trip preserves data and timestamp', () => {
  const w = C.wrapVault('{"a":1}', 1234567890);
  const u = C.unwrapVault(w);
  assert.equal(u.data, '{"a":1}');
  assert.equal(u.updated, 1234567890);
});

test('unwrapVault is lenient with raw plan JSON', () => {
  const u = C.unwrapVault('{"profile":{}}');
  assert.equal(u.data, '{"profile":{}}');
  assert.equal(u.updated, 0);
  assert.equal(C.unwrapVault(null), null);
  assert.equal(C.unwrapVault(''), null);
});

test('vaultMigrationPlan: vault copy wins when it is the only copy', () => {
  const p = C.vaultMigrationPlan(C.wrapVault('{"a":1}', 100), null, 0, true);
  assert.equal(p.action, 'use-secure');
  assert.equal(p.payload, '{"a":1}');
});

test('vaultMigrationPlan: legacy migrates into an empty vault', () => {
  const p = C.vaultMigrationPlan(null, '{"a":2}', 0, true);
  assert.equal(p.action, 'migrate');
  assert.equal(p.payload, '{"a":2}');
});

test('vaultMigrationPlan: newer plaintext beats an older vault copy', () => {
  const p = C.vaultMigrationPlan(C.wrapVault('{"a":1}', 100), '{"a":2}', 200, true);
  assert.equal(p.action, 'migrate');
  assert.equal(p.payload, '{"a":2}');
});

test('vaultMigrationPlan: newer vault copy beats stale plaintext', () => {
  const p = C.vaultMigrationPlan(C.wrapVault('{"a":1}', 300), '{"a":2}', 200, true);
  assert.equal(p.action, 'use-secure');
  assert.equal(p.payload, '{"a":1}');
});

test('vaultMigrationPlan: ties go to the vault (its write is the sealed one)', () => {
  const p = C.vaultMigrationPlan(C.wrapVault('{"a":1}', 200), '{"a":2}', 200, true);
  assert.equal(p.action, 'use-secure');
});

test('vaultMigrationPlan: no vault available falls back to legacy', () => {
  const p = C.vaultMigrationPlan(null, '{"a":2}', 0, false);
  assert.equal(p.action, 'use-legacy');
  assert.equal(p.payload, '{"a":2}');
});

test('vaultMigrationPlan: nothing stored anywhere', () => {
  const p = C.vaultMigrationPlan(null, null, 0, true);
  assert.equal(p.action, 'none');
  assert.equal(p.payload, null);
  const q = C.vaultMigrationPlan(null, '', 0, false);
  assert.equal(q.action, 'none');
});

test('auto slots: write/read round-trip', () => {
  let doc = { meta: [], payloads: {} };
  let r = C.autoSlotWrite(doc, 's1', '{"x":1}', '2026-10-08T00:00:00Z', 'daily', 5);
  doc = r.doc;
  assert.deepEqual(r.evicted, []);
  assert.equal(C.autoSlotRead(doc, 's1'), '{"x":1}');
  assert.equal(C.autoSlotRead(doc, 'missing'), null);
  const ser = C.serializeAutoSlots(doc);
  const back = C.parseAutoSlots(ser);
  assert.equal(back.meta.length, 1);
  assert.equal(back.meta[0].reason, 'daily');
  assert.equal(C.autoSlotRead(back, 's1'), '{"x":1}');
});

test('auto slots: oldest evicted past the cap, newest first', () => {
  let doc = { meta: [], payloads: {} };
  const evictedAll = [];
  for (let i = 1; i <= 7; i++) {
    const r = C.autoSlotWrite(doc, 's' + i, '{"n":' + i + '}', '2026-10-08T00:00:0' + i + 'Z', 'r' + i, 5);
    doc = r.doc;
    evictedAll.push(...r.evicted);
  }
  assert.deepEqual(evictedAll, ['s1', 's2']);
  assert.equal(doc.meta.length, 5);
  assert.equal(doc.meta[0].id, 's7');
  assert.equal(doc.meta[4].id, 's3');
  assert.equal(C.autoSlotRead(doc, 's1'), null);
  assert.equal(C.autoSlotRead(doc, 's7'), '{"n":7}');
});

test('auto slots: rewriting the same id replaces it without growing', () => {
  let doc = { meta: [], payloads: {} };
  doc = C.autoSlotWrite(doc, 's1', '{"n":1}', '2026-10-08T00:00:01Z', 'r', 5).doc;
  doc = C.autoSlotWrite(doc, 's1', '{"n":2}', '2026-10-08T00:00:02Z', 'r', 5).doc;
  assert.equal(doc.meta.length, 1);
  assert.equal(C.autoSlotRead(doc, 's1'), '{"n":2}');
});

test('auto slots: parse rejects garbage safely', () => {
  assert.deepEqual(C.parseAutoSlots(null), { meta: [], payloads: {} });
  assert.deepEqual(C.parseAutoSlots('not json'), { meta: [], payloads: {} });
  assert.deepEqual(C.parseAutoSlots('[1,2]'), { meta: [], payloads: {} });
  assert.deepEqual(C.parseAutoSlots('{"meta":"x"}'), { meta: [], payloads: {} });
  const d = C.parseAutoSlots('{"meta":[{"id":"s1","when":"t"}],"payloads":{"s1":42,"s2":"ok"}}');
  assert.equal(d.meta.length, 1);
  assert.equal(C.autoSlotRead(d, 's1'), null); // non-string payload dropped
  assert.equal(serializeRoundTripKeepsOnlyMetaPayloads(d), true);
});

function serializeRoundTripKeepsOnlyMetaPayloads(d) {
  const back = C.parseAutoSlots(C.serializeAutoSlots({ meta: d.meta, payloads: { s1: 'x', orphan: 'y' } }));
  return back.meta.length === 1 && C.autoSlotRead(back, 's1') === 'x' && !('orphan' in back.payloads);
}
