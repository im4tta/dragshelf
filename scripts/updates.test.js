'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { Updates, newer, selectAsset } = require('../src/main/updates');
const release = { tag_name: 'v1.5.0', assets: [] };
for (const suffix of ['windows-x64-setup.exe', 'windows-x64-portable.exe', 'mac-arm64.dmg', 'mac-x64.dmg']) { const name = 'DragShelf-1.5.0-' + suffix; release.assets.push({ name, browser_download_url: 'https://github.com/im4tta/dragshelf/releases/download/v1.5.0/' + name }); }
test('only newer stable versions and matching trusted assets are selected', () => {
  assert(newer('v1.10.0', '1.9.9')); assert(!newer('v1.4.0', '1.4.0')); assert(!newer('v1.4.0-beta', '1.3.0')); assert(!newer('v1.3.0', '1.4.0'));
  assert(selectAsset(release, 'darwin', 'arm64').endsWith('mac-arm64.dmg')); assert(selectAsset(release, 'win32', 'x64', true).endsWith('portable.exe'));
  const bad = structuredClone(release); bad.assets[0].browser_download_url = 'https://evil.example/setup.exe'; assert.equal(selectAsset(bad, 'win32', 'x64'), 'https://github.com/im4tta/dragshelf/releases/tag/v1.5.0');
});
function fixture(body = release, response = 1) { const calls = [], opened = [], settings = {}; const update = new Updates({ app: { getVersion: () => '1.4.0' }, dialog: { showMessageBox: async options => { calls.push(options); return { response }; } }, shell: { openExternal: async url => opened.push(url) }, net: { fetch: async () => ({ ok: true, json: async () => body }) }, store: { settings, setSetting: (k, v) => { settings[k] = v; } }, t: key => key }); return { update, calls, opened, settings }; }
test('automatic opt-out, skip persistence, manual override and offline behavior', async () => {
  const f = fixture(release, 2); await f.update.check(false); assert.equal(f.settings.skippedUpdate, 'v1.5.0'); await f.update.check(false); assert.equal(f.calls.length, 1); await f.update.check(true); assert.equal(f.calls.length, 2);
  f.settings.updateChecks = false; await f.update.check(false); assert.equal(f.calls.length, 2);
  f.update.net.fetch = async () => { throw new Error('offline'); }; await f.update.check(false); assert.equal(f.calls.length, 2); await f.update.check(true); assert.equal(f.calls.at(-1).message, 'updateFailed'); assert.equal(f.update.busy, false);
  const current = fixture({ ...release, tag_name: 'v1.4.0' }); await current.update.check(false); assert.equal(current.calls.length, 0); await current.update.check(true); assert.equal(current.calls[0].message, 'updatesCurrent');
  const yes = fixture(release, 0); await yes.update.check(true); assert.equal(yes.opened.length, 1); assert(yes.opened[0].startsWith('https://github.com/im4tta/dragshelf/releases/'));
});
