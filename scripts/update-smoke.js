'use strict';
// Exercises the in-app update installers against the real build output on the CI runner's own OS.
//  win32:  silently installs dist/…-setup.exe the way the updater does (/S --updated), twice (install, then update in place).
//  darwin: unpacks dist/…-mac-<arch>.zip with ditto, checks its version, swaps a copied .app bundle with the
//          generated update script, and verifies the code signature of the result.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { Updates, macScript } = require('../src/main/updates');
const pkg = require('../package.json');
const dist = path.join(__dirname, '..', 'dist');
const find = re => { const f = fs.readdirSync(dist).find(n => re.test(n)); assert.ok(f, 'missing ' + re); return path.join(dist, f); };

async function windows() {
  const setup = find(new RegExp(`^DragShelf-${pkg.version.replace(/\./g, '\\.')}-windows-x64-setup\\.exe$`));
  const run = args => execFileSync(setup, args, { stdio: 'inherit', timeout: 180000 });
  run(['/S']);                                   // first install (per user)
  const root = path.join(process.env.LOCALAPPDATA, 'Programs');
  const dir = fs.readdirSync(root).map(n => path.join(root, n)).find(d => fs.existsSync(path.join(d, 'DragShelf.exe')));
  assert.ok(dir, 'installed DragShelf.exe under ' + root);
  const exe = path.join(dir, 'DragShelf.exe'), before = fs.statSync(exe).mtimeMs;
  await new Promise(r => setTimeout(r, 1500));
  run(['/S', '--updated']);                      // what the updater runs (minus --force-run, so CI does not launch the UI)
  assert.ok(fs.existsSync(exe), 'still installed after the silent update'); assert.ok(fs.statSync(exe).mtimeMs >= before);
  console.log('PASS Windows silent install + in-place update:', exe);
}

async function mac() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const zip = find(new RegExp(`^DragShelf-${pkg.version.replace(/\./g, '\\.')}-mac-${arch}\\.zip$`));
  const built = path.join(dist, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Drag Shelf.app');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-update-smoke-')), target = path.join(root, 'Applications', 'Drag Shelf.app');
  fs.mkdirSync(path.dirname(target)); execFileSync('/usr/bin/ditto', [built, target]);
  fs.writeFileSync(path.join(target, 'Contents', 'old-marker'), 'old');
  const u = new Updates({ app: { getVersion: () => '0.0.0', quit() {} }, dialog: {}, shell: {}, net: {}, store: { settings: {} }, t: k => k, platform: 'darwin', arch, exePath: path.join(target, 'Contents', 'MacOS', 'Drag Shelf'), tmpdir: root });
  assert.equal(u.method().kind, 'mac');
  const dir = fs.mkdtempSync(path.join(root, 'dl-'));
  const staged = await u.unpackMac(zip, dir, { tag_name: 'v' + pkg.version });
  const script = path.join(dir, 'apply.sh');
  fs.writeFileSync(script, macScript({ pid: 999999999, staged, target, relaunch: false }), { mode: 0o755 });
  execFileSync('/bin/sh', [script], { stdio: 'inherit' });
  assert.ok(!fs.existsSync(path.join(target, 'Contents', 'old-marker')), 'bundle replaced');
  assert.match(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8'), new RegExp(`<string>${pkg.version.replace(/\./g, '\\.')}</string>`));
  // The swap must not change the signature state: verify the updated bundle exactly as the freshly built one.
  // (Ad-hoc builds without an Apple Developer ID do not pass --strict; Developer-ID builds must, and then both pass.)
  const verify = app => { try { execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' }); return 'valid'; } catch (e) { return String(e.stderr || e.message).replace(/^.*?\.app: /m, '').trim(); } };
  const before = verify(built), after = verify(target);
  console.log('codesign (built):', before, '| (updated):', after);
  assert.equal(after, before, 'updated bundle has the same signature state as the build');
  execFileSync('/usr/bin/codesign', ['--verify', path.join(target, 'Contents', 'MacOS', 'Drag Shelf')], { stdio: 'inherit' }); // main executable signature intact
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['Drag Shelf.app']);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('PASS macOS unpack + version check + bundle swap + signature unchanged:', zip);
}

(process.platform === 'win32' ? windows() : process.platform === 'darwin' ? mac() : Promise.resolve(console.log('skip: no in-place updater on', process.platform)))
  .catch(error => { console.error(error); process.exit(1); });

