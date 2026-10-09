'use strict';
// Version consistency guard: the in-app APP_VERSION shown by the updater UI
// must match versionName in app/build.gradle.kts. A stale APP_VERSION once
// made the updater claim an update was available on the latest build
// (fixed manually in task 24); this test makes that regression structural.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const GRADLE = path.join(ROOT, 'app', 'build.gradle.kts');
const APP_JS = path.join(ROOT, 'app', 'src', 'main', 'assets', 'app.js');

const SEMVER = /^\d+\.\d+\.\d+$/;

function readGradleVersionName() {
  const text = fs.readFileSync(GRADLE, 'utf8');
  const m = text.match(/versionName\s*=\s*"([^"]+)"/);
  assert.ok(m, 'versionName not found in app/build.gradle.kts');
  return m[1];
}

function readAppVersion() {
  const text = fs.readFileSync(APP_JS, 'utf8');
  const m = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(m, 'APP_VERSION not found in app.js');
  return m[1];
}

test('versionName in build.gradle.kts is a plain semver', () => {
  assert.match(readGradleVersionName(), SEMVER);
});

test('in-app APP_VERSION matches versionName in build.gradle.kts', () => {
  const gradle = readGradleVersionName();
  const app = readAppVersion();
  assert.equal(app, gradle, `APP_VERSION '${app}' != versionName '${gradle}'`);
});
