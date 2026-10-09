'use strict';
// Tests for scripts/release-naming.sh — the single source of release tag/title/APK naming.
// The workflow derives tag, title, and APK filename from versionName in
// app/build.gradle.kts; these tests dry-run that logic.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'release-naming.sh');
const REAL_GRADLE = path.join(ROOT, 'app', 'build.gradle.kts');

function runNaming(gradleFile, runNumber) {
  const out = execFileSync('bash', [SCRIPT, gradleFile, String(runNumber)], { encoding: 'utf8' });
  const kv = {};
  for (const line of out.trim().split('\n')) {
    const i = line.indexOf('=');
    kv[line.slice(0, i)] = line.slice(i + 1);
  }
  return kv;
}

function fixture(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-naming-'));
  const file = path.join(dir, 'build.gradle.kts');
  fs.writeFileSync(file, content);
  return file;
}

test('derives tag, title, and APK name from versionName', () => {
  const f = fixture('android {\n    defaultConfig {\n        versionName = "9.99.9"\n    }\n}\n');
  const kv = runNaming(f, 123);
  assert.equal(kv.VERSION, '9.99.9');
  assert.equal(kv.TAG, 'v9.99.9-preview.123');
  assert.equal(kv.TITLE, 'OddDough 9.99.9 preview 123');
  assert.equal(kv.APK, 'OddDough-9.99.9-preview.apk');
});

test('tag and title always agree on the same version', () => {
  const f = fixture('versionName = "2.0.0-beta1"\n');
  const kv = runNaming(f, 7);
  assert.match(kv.TAG, /^v2\.0\.0-beta1-preview\.7$/);
  assert.match(kv.TITLE, /^OddDough 2\.0\.0-beta1 preview 7$/);
  assert.ok(kv.TAG.includes(kv.VERSION) && kv.TITLE.includes(kv.VERSION));
});

test('exits non-zero when versionName is missing', () => {
  const f = fixture('android { defaultConfig { versionCode = 1 } }\n');
  assert.throws(() => runNaming(f, 1));
});

test('real build.gradle.kts resolves to the current version, single-sourced', () => {
  const kv = runNaming(REAL_GRADLE, 98);
  assert.equal(kv.VERSION, '1.64.0');
  assert.equal(kv.TAG, 'v1.64.0-preview.98');
  assert.equal(kv.TITLE, 'OddDough 1.64.0 preview 98');
  assert.equal(kv.APK, 'OddDough-1.64.0-preview.apk');
});
