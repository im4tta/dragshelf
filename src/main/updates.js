'use strict';
// In-app updates: check GitHub's latest stable release, download the matching build in the background,
// verify it against the SHA-256 digest GitHub publishes for every release asset, then install and relaunch.
//  - Windows installer build: the new NSIS installer runs silently (/S) and starts the app again (--force-run).
//  - Windows portable build: the running .exe is swapped for the new one after Drag Shelf quits.
//  - macOS: the release .zip is unpacked with ditto and replaces the .app bundle after Drag Shelf quits.
//    (This works with ad-hoc signed builds; Squirrel.Mac would require an Apple Developer ID.)
// Anything that cannot be updated in place (read-only location, app run from the DMG, missing digest)
// falls back to opening the matching download, as before.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const REPO = 'im4tta/dragshelf';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const DAY = 24 * 60 * 60 * 1000;

function version(value) { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value)); return m && m.slice(1).map(Number); }
function newer(remote, local) { const a = version(remote), b = version(local); if (!a || !b) return false; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }

// kind: 'setup' | 'portable' (Windows) or 'zip' | 'dmg' (macOS).
function assetName(release, platform, arch, kind) {
  const v = release.tag_name.replace(/^v/, '');
  if (platform === 'win32') return `DragShelf-${v}-windows-x64-${kind === 'portable' ? 'portable' : 'setup'}.exe`;
  if (platform === 'darwin') return `DragShelf-${v}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.${kind === 'zip' ? 'zip' : 'dmg'}`;
  return '';
}
// The release asset to install, only if its URL is the expected GitHub download and it carries a SHA-256 digest.
function trustedAsset(release, name) {
  if (!version(release.tag_name) || release.draft || release.prerelease) throw new Error('Invalid release');
  const asset = (release.assets || []).find(item => item.name === name);
  const url = `https://github.com/${REPO}/releases/download/${release.tag_name}/${name}`;
  const digest = asset && /^sha256:([0-9a-f]{64})$/.exec(asset.digest || '');
  return asset && asset.browser_download_url === url && digest ? { name, url, sha256: digest[1], size: asset.size } : null;
}
// Browser fallback: the matching installer page/file (unchanged behaviour from 1.4).
function selectAsset(release, platform, arch, portable) {
  if (!version(release.tag_name) || release.draft || release.prerelease) throw new Error('Invalid release');
  const name = assetName(release, platform, arch, platform === 'win32' ? (portable ? 'portable' : 'setup') : 'dmg');
  const asset = (release.assets || []).find(item => item.name === name);
  const expected = `https://github.com/${REPO}/releases/download/${release.tag_name}/${name}`;
  return asset && asset.browser_download_url === expected ? expected : `https://github.com/${REPO}/releases/tag/${release.tag_name}`;
}

// The .app bundle that contains the running executable (…/Drag Shelf.app/Contents/MacOS/Drag Shelf).
function macBundle(exePath) { const i = exePath.indexOf('.app/Contents/MacOS/'); return i < 0 ? '' : exePath.slice(0, i + 4); }
function writable(dir) { try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch (_) { return false; } }

const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
// Waits for Drag Shelf (pid) to exit, swaps the bundle atomically (keeping the old one until the move succeeds), relaunches.
function macScript({ pid, staged, target, relaunch }) {
  return [
    '#!/bin/sh',
    `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.2; done`,
    `OLD=${sh(target + '.old-' + Date.now())}`,
    `mv ${sh(target)} "$OLD" || exit 1`,
    `if mv ${sh(staged)} ${sh(target)}; then rm -rf "$OLD"; else mv "$OLD" ${sh(target)}; exit 1; fi`,
    `xattr -dr com.apple.quarantine ${sh(target)} 2>/dev/null`,
    relaunch ? `open -n ${sh(target)}` : ':',
    `rm -rf ${sh(path.dirname(staged))}`,
    ''
  ].join('\n');
}
const cmdQuote = s => `"${String(s).replace(/"/g, '')}"`;
// Windows portable: wait for the old .exe to be released, replace it, start the new one.
function portableScript({ pid, staged, target, relaunch }) {
  return [
    '@echo off',
    ':wait',
    `tasklist /FI "PID eq ${Number(pid)}" 2>NUL | find "${Number(pid)}" >NUL && (timeout /t 1 /nobreak >NUL & goto wait)`,
    'set tries=0',
    ':move',
    `move /Y ${cmdQuote(staged)} ${cmdQuote(target)} >NUL 2>&1 || (set /a tries+=1 & if %tries% LSS 20 (timeout /t 1 /nobreak >NUL & goto move))`,
    relaunch ? `start "" ${cmdQuote(target)}` : 'rem no relaunch',
    '(goto) 2>NUL & del "%~f0"',
    ''
  ].join('\r\n');
}

class Updates {
  // deps: app, dialog, shell, net, store, t; optional: platform, arch, exePath, portableFile, spawn, tmpdir, notify(text)
  constructor(deps) {
    Object.assign(this, { platform: process.platform, arch: process.arch, spawn: childProcess.spawn, tmpdir: os.tmpdir(), notify: () => {}, onChange: () => {} }, deps);
    this.exePath = deps.exePath || (deps.app.getPath ? deps.app.getPath('exe') : process.execPath);
    this.portableFile = deps.portableFile !== undefined ? deps.portableFile : process.env.PORTABLE_EXECUTABLE_FILE || '';
    this.busy = false; this.ready = null; this.downloading = null; this.progress = 0;
  }
  start() {
    this.initial = setTimeout(() => this.check(false), 20000); this.initial.unref && this.initial.unref();
    this.interval = setInterval(() => this.check(false), DAY); this.interval.unref && this.interval.unref();
  }
  stop() { clearTimeout(this.initial); clearInterval(this.interval); }

  // How this copy can update itself: { kind, assetKind, target } or null (→ browser download).
  method() {
    if (this.platform === 'win32') {
      if (this.portableFile) return writable(path.dirname(this.portableFile)) ? { kind: 'portable', assetKind: 'portable', target: this.portableFile } : null;
      return { kind: 'setup', assetKind: 'setup', target: this.exePath };
    }
    if (this.platform === 'darwin') {
      const bundle = macBundle(this.exePath);
      if (!bundle || /^\/Volumes\//.test(bundle) || /AppTranslocation/.test(bundle) || !writable(path.dirname(bundle)) || !writable(bundle)) return null;
      return { kind: 'mac', assetKind: 'zip', target: bundle };
    }
    return null;
  }

  async latest() {
    const response = await this.net.fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DragShelf/' + this.app.getVersion() }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error('Release check failed');
    const release = await response.json();
    if (!version(release.tag_name) || release.draft || release.prerelease) throw new Error('Invalid release');
    return release;
  }

  async check(manual = true) {
    if (this.busy) return; if (!manual && this.store.settings.updateChecks === false) return;
    if (this.ready) { if (manual) await this.promptRestart(); return; }
    this.busy = true;
    try {
      const release = await this.latest();
      if (!newer(release.tag_name, this.app.getVersion())) { if (manual) await this.dialog.showMessageBox({ type: 'info', message: this.t('updatesCurrent'), detail: this.app.getVersion() }); return; }
      if (!manual && this.store.settings.skippedUpdate === release.tag_name) return;
      const how = this.method(), asset = how && trustedAsset(release, assetName(release, this.platform, this.arch, how.assetKind));
      if (!asset) return this.offerBrowser(release, manual);
      if (manual) this.notify(this.t('updateDownloading', { version: release.tag_name }));
      await this.download(release, asset, how);
      await this.promptRestart();
    } catch (error) {
      if (manual) await this.dialog.showMessageBox({ type: 'warning', message: this.t('updateFailed'), detail: error && error.message ? String(error.message) : '' });
    } finally { this.busy = false; this.onChange(); }
  }

  async offerBrowser(release, manual) {
    const choice = await this.dialog.showMessageBox({ type: 'info', title: this.t('updateAvailable'), message: this.t('updateAvailable'), detail: this.t('updateDetail', { version: release.tag_name }), buttons: [this.t('downloadUpdate'), this.t('laterUpdate'), this.t('skipUpdate')], defaultId: 0, cancelId: 1, noLink: true });
    if (choice.response === 0) await this.shell.openExternal(selectAsset(release, this.platform, this.arch, !!this.portableFile));
    else if (choice.response === 2) this.store.setSetting('skippedUpdate', release.tag_name);
    void manual;
  }

  // Streams the asset to a private temp folder, checks size and SHA-256, and (macOS) unpacks it.
  async download(release, asset, how) {
    const dir = fs.mkdtempSync(path.join(this.tmpdir, 'dragshelf-update-'));
    const file = path.join(dir, asset.name);
    try {
      const response = await this.net.fetch(asset.url, { headers: { 'User-Agent': 'DragShelf/' + this.app.getVersion() } });
      if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`);
      const hash = crypto.createHash('sha256'), out = fs.createWriteStream(file);
      let got = 0, lastPct = -1;
      try {
        for await (const chunk of response.body) {
          const buf = Buffer.from(chunk); hash.update(buf); got += buf.length;
          if (!out.write(buf)) await new Promise(r => out.once('drain', r));
          const pct = asset.size ? Math.floor((got / asset.size) * 100) : 0;
          if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; this.progress = pct; this.onChange(); }
        }
      } finally { await new Promise(r => out.end(r)); }
      if (asset.size && got !== asset.size) throw new Error('Download incomplete');
      if (hash.digest('hex') !== asset.sha256) throw new Error('Checksum mismatch');
      let staged = file;
      if (how.kind === 'mac') staged = await this.unpackMac(file, dir, release);
      this.ready = { version: release.tag_name, kind: how.kind, file, staged, target: how.target, dir };
      return this.ready;
    } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error; }
  }

  async unpackMac(zip, dir, release) {
    const out = path.join(dir, 'app');
    await new Promise((resolve, reject) => {
      const p = this.spawn('/usr/bin/ditto', ['-x', '-k', zip, out], { stdio: 'ignore' });
      p.on('error', reject); p.on('exit', code => (code === 0 ? resolve() : reject(new Error('Could not unpack the update'))));
    });
    const app = fs.readdirSync(out).find(n => n.endsWith('.app'));
    if (!app) throw new Error('Update has no application');
    const plist = fs.readFileSync(path.join(out, app, 'Contents', 'Info.plist'), 'utf8');
    const v = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist);
    if (!v || `v${v[1]}` !== release.tag_name) throw new Error('Update version does not match the release');
    return path.join(out, app);
  }

  async promptRestart() {
    if (!this.ready) return;
    const choice = await this.dialog.showMessageBox({ type: 'info', title: this.t('updateReady'), message: this.t('updateReady'), detail: this.t('updateReadyDetail', { version: this.ready.version }), buttons: [this.t('restartNow'), this.t('installLater')], defaultId: 0, cancelId: 1, noLink: true });
    if (choice.response === 0) this.install(true);
  }

  // Starts the installer/helper and quits. relaunch=false is used when the update is applied on quit.
  install(relaunch = true) {
    const r = this.ready; if (!r || this.installing) return false;
    this.installing = true;
    const detached = { detached: true, stdio: 'ignore', windowsHide: true };
    if (r.kind === 'setup') {
      this.spawn(r.file, ['/S', ...(relaunch ? ['--force-run'] : []), '--updated'], detached).unref();
    } else if (r.kind === 'portable') {
      const script = path.join(r.dir, 'apply-update.cmd');
      fs.writeFileSync(script, portableScript({ pid: process.pid, staged: r.file, target: r.target, relaunch }));
      this.spawn('cmd.exe', ['/d', '/c', script], detached).unref();
    } else if (r.kind === 'mac') {
      const script = path.join(r.dir, 'apply-update.sh');
      fs.writeFileSync(script, macScript({ pid: process.pid, staged: r.staged, target: r.target, relaunch }), { mode: 0o755 });
      this.spawn('/bin/sh', [script], detached).unref();
    } else return false;
    if (relaunch) this.app.quit();
    return true;
  }
  // Called from before-quit: a downloaded update the user postponed is installed silently.
  installOnQuit() { return this.ready && !this.installing ? this.install(false) : false; }
}
module.exports = { Updates, newer, selectAsset, trustedAsset, assetName, macBundle, macScript, portableScript };
