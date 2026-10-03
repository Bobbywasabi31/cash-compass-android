const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../app/src/main/assets/core.js');

test('migrates v1 schema', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v1-schema.json'), 'utf8'));
  const state = C.normalize(raw);
  assert.equal(state.profile.balance, 1000);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].label, 'Old format');
  // v1 didn't have category, should default
  assert.ok(state.transactions[0].category);
});

test('migrates v2 schema', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v2-schema.json'), 'utf8'));
  const state = C.normalize(raw);
  assert.equal(state.profile.balance, 2000);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.transactions[0].category, 'Food');
});

test('rejects invalid backup', () => {
  assert.throws(() => C.normalize(null));
  assert.throws(() => C.normalize('not an object'));
  assert.throws(() => C.normalize([]));
});
