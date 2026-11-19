'use strict';
// Auto-paste: watches the system clipboard and reports each new copy so it can land on the shelf.
// Electron's clipboard is asynchronous and W3C-shaped: read() gives ClipboardItems whose types include standard
// MIME types plus native formats as `electron application/osclipboard;format="…"` (used here for copied files).
const { fileURLToPath } = require('url');

const raw = format => `electron application/osclipboard;format="${format}"`;

function parseUriList(text) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('file:'))
    .map(u => { try { return fileURLToPath(u); } catch (_) { return ''; } }).filter(Boolean);
}
function parsePlistPaths(xml) {
  return [...String(xml || '').matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
function parseWindowsFileName(buffer) {
  const p = buffer && buffer.length ? buffer.toString('utf16le').replace(/\0[\s\S]*$/, '') : '';
  return p ? [p] : [];
}

// Copied files, in the formats Finder, Explorer and Linux file managers use.
const FILE_FORMATS = [
  ['text/uri-list', b => parseUriList(b.toString('utf8'))], [raw('text/uri-list'), b => parseUriList(b.toString('utf8'))],
  [raw('NSFilenamesPboardType'), b => parsePlistPaths(b.toString('utf8'))], [raw('public.file-url'), b => parseUriList(b.toString('utf8'))],
  [raw('FileNameW'), parseWindowsFileName],
];

const bufferOf = async blob => Buffer.from(await blob.arrayBuffer());

function sampleHash(buffer) {
  let h = buffer.length | 0;
  const step = Math.max(1, Math.floor(buffer.length / 4096));
  for (let i = 0; i < buffer.length; i += step) h = (h * 31 + buffer[i]) | 0;
  return h;
}

// What is on the clipboard now: { sig, kind: 'files' | 'image' | 'text' | '', paths, data, mime, text }.
async function readClipboard(clipboard) {
  const entries = await clipboard.read();
  const paths = [];
  for (const entry of entries) {
    for (const [type, parse] of FILE_FORMATS) {
      if (!entry.types.includes(type)) continue;
      const found = parse(await bufferOf(await entry.getType(type)));
      if (found.length) { paths.push(...found); break; }
    }
  }
  if (paths.length) { const unique = [...new Set(paths)]; return { sig: 'f:' + unique.join('|'), kind: 'files', paths: unique }; }
  for (const entry of entries) {
    const mime = entry.types.find(t => t.startsWith('image/'));
    if (!mime) continue;
    const data = await bufferOf(await entry.getType(mime));
    return { sig: `i:${mime}:${data.length}:${sampleHash(data)}`, kind: 'image', mime, data };
  }
  const textOf = async type => { for (const e of entries) if (e.types.includes(type)) return (await e.getType(type)).text(); return ''; };
  let text = await textOf('text/plain');
  if (!text.trim()) text = (await textOf('text/html')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  if (text.trim()) return { sig: 't:' + text, kind: 'text', text };
  return { sig: '', kind: '' };
}

class ClipWatcher {
  constructor({ clipboard, onCopy, interval = 900 }) {
    Object.assign(this, { clipboard, onCopy, interval });
    this.timer = null; this.last = null; this.busy = null;
  }
  get running() { return !!this.timer; }
  async start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.interval);
    this.last = (await this.safeRead()).sig; // only things copied after switching on are collected
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async safeRead() { try { return await readClipboard(this.clipboard); } catch (_) { return { sig: this.last || '', kind: '' }; } }
  tick() {
    if (this.busy || this.last === null) return this.busy;
    this.busy = (async () => {
      const snap = await this.safeRead();
      if (snap.sig && snap.sig !== this.last) { this.last = snap.sig; if (snap.kind) await this.onCopy(snap); }
    })().catch(() => {}).finally(() => { this.busy = null; });
    return this.busy;
  }
  // After Drag Shelf writes to the clipboard itself, remember it so it is not pasted back onto the shelf.
  async resync() { await this.busy; this.last = (await this.safeRead()).sig; }
}

module.exports = { ClipWatcher, readClipboard, parseUriList, parsePlistPaths, parseWindowsFileName };
