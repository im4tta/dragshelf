'use strict';
const API = 'https://api.github.com/repos/im4tta/dragshelf/releases/latest';
function version(value) { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value)); return m && m.slice(1).map(Number); }
function newer(remote, local) { const a = version(remote), b = version(local); if (!a || !b) return false; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
function selectAsset(release, platform, arch, portable) {
  if (!version(release.tag_name) || release.draft || release.prerelease) throw new Error('Invalid release');
  const v = release.tag_name.replace(/^v/, '');
  const name = platform === 'win32' ? `DragShelf-${v}-windows-x64-${portable ? 'portable' : 'setup'}.exe` : platform === 'darwin' ? `DragShelf-${v}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg` : '';
  const asset = (release.assets || []).find(item => item.name === name);
  const expected = `https://github.com/im4tta/dragshelf/releases/download/${release.tag_name}/${name}`;
  return asset && asset.browser_download_url === expected ? expected : `https://github.com/im4tta/dragshelf/releases/tag/${release.tag_name}`;
}
class Updates {
  constructor({ app, dialog, shell, net, store, t }) { Object.assign(this, { app, dialog, shell, net, store, t }); this.busy = false; }
  start() {
    this.initial = setTimeout(() => this.check(false), 20000); this.initial.unref();
    this.interval = setInterval(() => this.check(false), 24 * 60 * 60 * 1000); this.interval.unref();
  }
  stop() { clearTimeout(this.initial); clearInterval(this.interval); }
  async check(manual = true) {
    if (this.busy) return; if (!manual && this.store.settings.updateChecks === false) return;
    this.busy = true;
    try {
      const response = await this.net.fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DragShelf/' + this.app.getVersion() }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (!response.ok) throw new Error('Release check failed');
      const release = await response.json();
      if (!version(release.tag_name) || release.draft || release.prerelease) throw new Error('Invalid release');
      if (!newer(release.tag_name, this.app.getVersion())) { if (manual) await this.dialog.showMessageBox({ type: 'info', message: this.t('updatesCurrent'), detail: this.app.getVersion() }); return; }
      if (!manual && this.store.settings.skippedUpdate === release.tag_name) return;
      const choice = await this.dialog.showMessageBox({ type: 'info', title: this.t('updateAvailable'), message: this.t('updateAvailable'), detail: this.t('updateDetail', { version: release.tag_name }), buttons: [this.t('downloadUpdate'), this.t('laterUpdate'), this.t('skipUpdate')], defaultId: 0, cancelId: 1, noLink: true });
      if (choice.response === 0) await this.shell.openExternal(selectAsset(release, process.platform, process.arch, !!process.env.PORTABLE_EXECUTABLE_FILE));
      else if (choice.response === 2) this.store.setSetting('skippedUpdate', release.tag_name);
    } catch (_) { if (manual) await this.dialog.showMessageBox({ type: 'warning', message: this.t('updateFailed') }); }
    finally { this.busy = false; }
  }
}
module.exports = { Updates, newer, selectAsset };
