'use strict';
// File metadata used to render a shelf row: kind, size, thumbnail.
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'svg', 'avif', 'raw', 'dng', 'cr2', 'nef', 'arw'],
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'pages', 'rtf', 'odt', 'md', 'epub'],
  sheet: ['xls', 'xlsx', 'numbers', 'csv', 'tsv', 'ods'],
  slides: ['ppt', 'pptx', 'key', 'odp'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'dmg', 'iso', 'pkg'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'aiff', 'aif'],
  video: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'wmv'],
  code: ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'java', 'kt', 'swift', 'cs', 'php', 'sh', 'zsh', 'json', 'yml', 'yaml', 'toml', 'xml', 'html', 'css', 'scss', 'sql'],
  text: ['txt', 'log'],
  link: ['webloc', 'url', 'inetloc'],
  app: ['app']
};
const EXT_TO_KIND = {};
for (const [k, exts] of Object.entries(KINDS)) for (const e of exts) EXT_TO_KIND[e] = k;

function fmtSize(n) {
  if (n < 1000) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}

function readLink(p) {
  try {
    const t = fs.readFileSync(p, 'utf8').slice(0, 4096);
    const m = t.match(/<string>\s*([a-z][a-z0-9+.-]*:\/\/[^<\s]+)\s*<\/string>/i) || t.match(/^URL=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch (_) { return ''; }
}
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

const cache = new Map();   // path -> { mtime, size, meta }

function thumb(p) {
  try {
    if (typeof nativeImage.createThumbnailFromPath === 'function' && process.platform !== 'linux') {
      // macOS: Quick Look thumbnails (images, PDFs, videos, documents)
      return nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }).then(i => (i.isEmpty() ? '' : i.toDataURL()), () => '');
    }
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return Promise.resolve('');
    const { width, height } = img.getSize(); const s = 96 / Math.max(width, height, 1);
    return Promise.resolve(img.resize({ width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) }).toDataURL());
  } catch (_) { return Promise.resolve(''); }
}

async function describe(p) {
  let st;
  try { st = fs.statSync(p); } catch (_) {
    return { path: p, name: path.basename(p), stem: path.basename(p), kind: 'missing', label: 'Missing', detail: 'Moved or deleted', missing: true };
  }
  const c = cache.get(p);
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.meta;
  const base = path.basename(p);
  const ext = path.extname(base).slice(1).toLowerCase();
  let kind = st.isDirectory() ? (ext === 'app' ? 'app' : 'folder') : (EXT_TO_KIND[ext] || 'file');
  let label = kind === 'folder' ? 'Folder' : kind === 'app' ? 'App' : (ext ? ext.toUpperCase() : 'File');
  let detail = st.isDirectory() ? '' : fmtSize(st.size);
  let stem = st.isDirectory() ? base : (ext ? base.slice(0, -(ext.length + 1)) : base) || base;
  if (kind === 'link') {
    const u = readLink(p); label = host(u) ? '' : 'Link'; detail = host(u) || 'Web link';
  } else if (kind === 'text' && /^Text \d{4}-/.test(base)) { label = 'Text'; }
  let thumbUrl = '';
  if (kind === 'image' || kind === 'pdf' || kind === 'video') thumbUrl = await thumb(p);
  const meta = { path: p, name: base, stem, kind, label, detail, thumb: thumbUrl, missing: false };
  cache.set(p, { mtime: st.mtimeMs, size: st.size, meta });
  return meta;
}

module.exports = { describe };
