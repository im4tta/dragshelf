'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const { Updates, newer, selectAsset, trustedAsset, macBundle, macScript, portableScript } = require('../src/main/updates');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const BODY = { 'windows-x64-setup.exe': Buffer.from('setup-bytes'), 'windows-x64-portable.exe': Buffer.from('portable-bytes'), 'mac-arm64.dmg': Buffer.from('dmg'), 'mac-x64.dmg': Buffer.from('dmg'), 'mac-arm64.zip': Buffer.from('zip-bytes') };
const release = { tag_name: 'v1.5.0', assets: [] };
for (const [suffix, body] of Object.entries(BODY)) { const name = 'DragShelf-1.5.0-' + suffix; release.assets.push({ name, size: body.length, digest: 'sha256:' + sha(body), browser_download_url: 'https://github.com/im4tta/dragshelf/releases/download/v1.5.0/' + name }); }

test('only newer stable versions and matching trusted assets are selected', () => {
  assert(newer('v1.10.0', '1.9.9')); assert(!newer('v1.4.0', '1.4.0')); assert(!newer('v1.4.0-beta', '1.3.0')); assert(!newer('v1.3.0', '1.4.0'));
  assert(selectAsset(release, 'darwin', 'arm64').endsWith('mac-arm64.dmg')); assert(selectAsset(release, 'win32', 'x64', true).endsWith('portable.exe'));
  const bad = structuredClone(release); bad.assets[0].browser_download_url = 'https://evil.example/setup.exe'; assert.equal(selectAsset(bad, 'win32', 'x64'), 'https://github.com/im4tta/dragshelf/releases/tag/v1.5.0');
  assert.equal(trustedAsset(bad, 'DragShelf-1.5.0-windows-x64-setup.exe'), null, 'foreign URL is never installed');
  const noDigest = structuredClone(release); delete noDigest.assets[0].digest; assert.equal(trustedAsset(noDigest, 'DragShelf-1.5.0-windows-x64-setup.exe'), null, 'no digest → no silent install');
  assert.equal(macBundle('/Applications/Drag Shelf.app/Contents/MacOS/Drag Shelf'), '/Applications/Drag Shelf.app');
});

function fixture({ body = release, response = 1, platform = 'linux', ...extra } = {}) {
  const calls = [], opened = [], spawned = [], settings = {}, quit = [];
  const net = { fetch: async url => {
    if (url.includes('api.github.com')) return { ok: true, json: async () => body };
    const suffix = Object.keys(BODY).find(s => url.endsWith(s)); const data = extra.tamper ? Buffer.from('evil') : BODY[suffix];
    return { ok: true, status: 200, body: (async function* () { yield data.subarray(0, 3); yield data.subarray(3); })() };
  } };
  const update = new Updates({ app: { getVersion: () => '1.4.0', quit: () => quit.push(1) }, dialog: { showMessageBox: async options => { calls.push(options); return { response: typeof response === 'function' ? response(options) : response }; } },
    shell: { openExternal: async url => opened.push(url) }, net, store: { settings, setSetting: (k, v) => { settings[k] = v; } }, t: (key, v) => key + (v && v.version ? ':' + v.version : ''),
    platform, arch: 'arm64', tmpdir: fs.mkdtempSync(path.join(os.tmpdir(), 'ds-upd-')), spawn: (cmd, args) => { spawned.push([cmd, args]); return { unref() {}, on() {} }; }, ...extra });
  return { update, calls, opened, settings, spawned, quit };
}

test('automatic opt-out, skip persistence, manual override and offline behavior', async () => {
  const f = fixture({ response: 2 }); await f.update.check(false); assert.equal(f.settings.skippedUpdate, 'v1.5.0'); await f.update.check(false); assert.equal(f.calls.length, 1); await f.update.check(true); assert.equal(f.calls.length, 2);
  f.settings.updateChecks = false; await f.update.check(false); assert.equal(f.calls.length, 2);
  f.update.net.fetch = async () => { throw new Error('offline'); }; await f.update.check(false); assert.equal(f.calls.length, 2); await f.update.check(true); assert.equal(f.calls.at(-1).message, 'updateFailed'); assert.equal(f.update.busy, false);
  const current = fixture({ body: { ...release, tag_name: 'v1.4.0' } }); await current.update.check(false); assert.equal(current.calls.length, 0); await current.update.check(true); assert.equal(current.calls[0].message, 'updatesCurrent');
  const yes = fixture({ response: 0 }); await yes.update.check(true); assert.equal(yes.opened.length, 1); assert(yes.opened[0].startsWith('https://github.com/im4tta/dragshelf/releases/'), 'platforms without in-place updates keep the download page');
});

test('Windows installer: downloads in the background, verifies, installs silently and relaunches', async () => {
  const f = fixture({ platform: 'win32', exePath: 'C:\\Users\\me\\AppData\\Local\\Programs\\Drag Shelf\\DragShelf.exe', portableFile: '', response: 0 });
  await f.update.check(false);
  assert.equal(f.opened.length, 0, 'no browser');
  assert.equal(f.calls[0].message, 'updateReady'); assert.match(f.calls[0].detail, /v1\.5\.0/);
  const [cmd, args] = f.spawned[0];
  assert.match(cmd, /DragShelf-1\.5\.0-windows-x64-setup\.exe$/); assert.deepEqual(args, ['/S', '--force-run', '--updated']);
  assert.deepEqual(fs.readFileSync(cmd), BODY['windows-x64-setup.exe']); assert.equal(f.quit.length, 1);
});

test('"Install when I quit" applies the verified update silently on quit, without relaunching', async () => {
  const f = fixture({ platform: 'win32', exePath: 'C:\\DS\\DragShelf.exe', portableFile: '', response: 1 });
  await f.update.check(false);
  assert.equal(f.spawned.length, 0); assert.ok(f.update.ready);
  await f.update.check(true); assert.equal(f.calls.at(-1).message, 'updateReady', 'a manual check offers the restart again without downloading twice');
  assert.equal(f.update.installOnQuit(), true); assert.deepEqual(f.spawned[0][1], ['/S', '--updated']); assert.equal(f.quit.length, 0);
  assert.equal(f.update.installOnQuit(), false, 'only once');
});

test('a tampered download is rejected and nothing is installed', async () => {
  const f = fixture({ platform: 'win32', exePath: 'C:\\DS\\DragShelf.exe', portableFile: '', tamper: true, response: 0 });
  await f.update.check(true);
  assert.equal(f.spawned.length, 0); assert.equal(f.update.ready, null);
  assert.equal(f.calls.at(-1).message, 'updateFailed'); assert.match(f.calls.at(-1).detail, /incomplete|Checksum/);
  assert.deepEqual(fs.readdirSync(f.update.tmpdir), [], 'the download is deleted');
});

test('Windows portable: the .exe is replaced after quitting', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-port-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'DragShelf-1.4.0-windows-x64-portable.exe'); fs.writeFileSync(exe, 'old');
  const f = fixture({ platform: 'win32', exePath: 'C:\\Temp\\unpacked\\DragShelf.exe', portableFile: exe, response: 0 });
  await f.update.check(false);
  assert.deepEqual(f.spawned[0].slice(0, 1), ['cmd.exe']);
  const script = fs.readFileSync(f.spawned[0][1][2], 'utf8');
  assert.match(script, /move \/Y ".*DragShelf-1\.5\.0-windows-x64-portable\.exe" ".*DragShelf-1\.4\.0-windows-x64-portable\.exe"/); assert.match(script, /start ""/);
  assert.match(portableScript({ pid: 7, staged: 'a', target: 'b', relaunch: false }), /rem no relaunch/);
});

test('macOS: unpacks the zip, checks the version, swaps the bundle with a script that really works', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-mac-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'Applications', 'Drag Shelf.app'); fs.mkdirSync(path.join(target, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(target, 'Contents', 'version'), 'old');
  const plist = v => `<plist><dict><key>CFBundleShortVersionString</key>\n<string>${v}</string></dict></plist>`;
  let unpackVersion = '1.5.0';
  const spawn = (cmd, args) => {
    if (cmd === '/usr/bin/ditto') { const out = args[3]; const app = path.join(out, 'Drag Shelf.app', 'Contents'); fs.mkdirSync(app, { recursive: true }); fs.writeFileSync(path.join(app, 'Info.plist'), plist(unpackVersion)); fs.writeFileSync(path.join(app, 'version'), 'new');
      return { on: (ev, cb) => { if (ev === 'exit') setImmediate(() => cb(0)); }, unref() {} }; }
    f.spawned.push([cmd, args]); return { unref() {}, on() {} };
  };
  const f = fixture({ platform: 'darwin', exePath: path.join(target, 'Contents', 'MacOS', 'Drag Shelf'), response: 1, spawn });
  await f.update.check(false); assert.ok(f.update.ready, 'downloaded and staged'); assert.equal(f.opened.length, 0);
  f.update.install(false);
  const [cmd, [script]] = f.spawned[0]; assert.equal(cmd, '/bin/sh');
  // Run the generated script for real, with a pid that has already exited.
  fs.writeFileSync(script, fs.readFileSync(script, 'utf8').replace(/kill -0 \d+/, 'kill -0 999999999').replace(/^xattr.*$/m, ':'));
  execFileSync('/bin/sh', [script]);
  assert.equal(fs.readFileSync(path.join(target, 'Contents', 'version'), 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['Drag Shelf.app'], 'old bundle removed, nothing left behind');
  // A zip whose app is not the announced version is refused.
  unpackVersion = '1.4.9';
  const g = fixture({ platform: 'darwin', exePath: path.join(target, 'Contents', 'MacOS', 'Drag Shelf'), response: 1, spawn });
  await g.update.check(true); assert.equal(g.update.ready, null); assert.match(g.calls.at(-1).detail, /does not match/);
  // Run from the DMG or a read-only place → the download page instead.
  const dmg = fixture({ platform: 'darwin', exePath: '/Volumes/Drag Shelf 1.4.0/Drag Shelf.app/Contents/MacOS/Drag Shelf', response: 0 });
  await dmg.update.check(true); assert.equal(dmg.opened[0], 'https://github.com/im4tta/dragshelf/releases/download/v1.5.0/DragShelf-1.5.0-mac-arm64.dmg');
  assert.match(macScript({ pid: 1, staged: "/a/it's.app", target: '/b/x.app', relaunch: true }), /'\/a\/it'\\''s\.app'/, 'paths are shell-quoted');
});
