'use strict';
const repo = 'https://github.com/im4tta/dragshelf';
const platform = navigator.userAgentData?.platform || navigator.platform || '';
const mac = /mac/i.test(platform), windows = /win/i.test(platform);
const smart = document.querySelector('[data-smart-download]');
const preferred = mac ? 'mac-universal.dmg' : windows ? 'windows-x64-setup.exe' : '';
if (preferred) { smart.dataset.asset = preferred; }
else { smart.href = '#download'; }
let releaseVersion = '', releaseFailed = false;
function localizeDownloads() {
  const km = document.documentElement.lang === 'km';
  document.querySelector('[data-download-label]').textContent = preferred ? (km ? 'ទាញយកសម្រាប់ ' : 'Download for ') + (mac ? 'Mac' : 'Windows') : km ? 'ទាញយក Drag Shelf' : 'Download Drag Shelf';
  document.querySelector('#release-status').textContent = releaseVersion ? releaseVersion + ' · ' + (km ? 'ទាញយកដោយផ្ទាល់ពីកំណែ GitHub របស់យើង' : 'Direct downloads from our GitHub release') : releaseFailed ? (km ? 'តំណទាញយកបើកកំណែថ្មីបំផុតលើ GitHub។ សូមជ្រើសឯកសារសម្រាប់ប្រព័ន្ធរបស់អ្នក។' : 'Downloads open the latest GitHub release. Choose the file for your computer.') : km ? 'ជ្រើសប្រព័ន្ធរបស់អ្នក ដើម្បីទាញយកកំណែថ្មីបំផុត។' : 'Choose your platform to get the latest release.';
}
addEventListener('landinglanguagechange', localizeDownloads); localizeDownloads();
// Static fallback remains usable if GitHub's public API is unavailable or rate limited.
fetch('https://api.github.com/repos/im4tta/dragshelf/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) }).then(async response => {
  if (!response.ok) throw new Error('Unavailable'); const release = await response.json();
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('Invalid release');
  document.querySelectorAll('[data-asset]').forEach(link => {
    const asset = release.assets.find(asset => asset.name.endsWith('-' + link.dataset.asset));
    if (asset && asset.browser_download_url.startsWith(repo + '/releases/download/' + release.tag_name + '/')) link.href = asset.browser_download_url;
  });
  releaseVersion = release.tag_name; localizeDownloads();
}).catch(() => { releaseFailed = true; localizeDownloads(); });
