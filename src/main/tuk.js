'use strict';
// Tuk: clipboard history + screen capture for Drag Shelf. The main process watches the system clipboard
// (it keeps working while the window is hidden) and hands each new item to the Tuk window, which stores it in IndexedDB.
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', json: 'application/json', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const mimeFor = name => MIME[path.extname(name).slice(1).toLowerCase()] || '';

function parseUriList(text) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && s.startsWith('file:'))
    .map(u => { try { return fileURLToPath(u); } catch (_) { return ''; } }).filter(Boolean);
}
function parsePlistPaths(xml) {
  return [...String(xml || '').matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
function parseWindowsFileName(buffer) {
  if (!buffer || !buffer.length) return [];
  const p = buffer.toString('utf16le').replace(/\0[\s\S]*$/, '');
  return p ? [p] : [];
}

// Electron's clipboard is asynchronous and W3C-shaped: read() gives ClipboardItems whose types include
// standard MIME types plus native formats as `electron application/osclipboard;format="…"`.
const raw = format => `electron application/osclipboard;format="${format}"`;
const FILE_FORMATS = [
  ['text/uri-list', parseUriList], [raw('text/uri-list'), parseUriList],
  [raw('NSFilenamesPboardType'), parsePlistPaths], [raw('public.file-url'), parseUriList],
  [raw('FileNameW'), (text, blobBuffer) => parseWindowsFileName(blobBuffer)],
];

async function blobBuffer(blob) { return Buffer.from(await blob.arrayBuffer()); }

async function readFilePaths(entries) {
  const paths = [];
  for (const entry of entries) {
    for (const [type, parse] of FILE_FORMATS) {
      if (!entry.types.includes(type)) continue;
      const buffer = await blobBuffer(await entry.getType(type));
      const found = parse(buffer.toString('utf8'), buffer);
      if (found.length) { paths.push(...found); break; }
    }
  }
  return [...new Set(paths)];
}

function sampleHash(buffer) {
  let h = buffer.length | 0;
  const step = Math.max(1, Math.floor(buffer.length / 4096));
  for (let i = 0; i < buffer.length; i += step) h = (h * 31 + buffer[i]) | 0;
  return h;
}

// Reads whatever is on the clipboard now: files (any type), an image, HTML, or text.
async function readClipboard(clipboard) {
  const entries = await clipboard.read();
  const files = await readFilePaths(entries);
  if (files.length) {
    const items = [];
    for (const p of files) {
      let stat; try { stat = fs.statSync(p); } catch (_) { continue; }
      if (stat.isFile() && stat.size <= MAX_FILE_BYTES) items.push({ type: 'file', name: path.basename(p), mime: mimeFor(p), path: p, data: fs.readFileSync(p) });
      else items.push({ type: 'text', text: p, path: p }); // folders and very large files are kept as a path reference
    }
    return { sig: 'f:' + files.join('|'), items };
  }
  for (const entry of entries) {
    const type = entry.types.find(t => t.startsWith('image/'));
    if (!type) continue;
    const data = await blobBuffer(await entry.getType(type));
    return { sig: `i:${type}:${data.length}:${sampleHash(data)}`, items: [{ type: 'file', name: '', mime: type, data }] };
  }
  const textOf = async type => { for (const e of entries) if (e.types.includes(type)) return (await e.getType(type)).text(); return ''; };
  const text = await textOf('text/plain');
  if (text.trim()) {
    const html = await textOf('text/html');
    return { sig: 't:' + text, items: [html.trim() ? { type: 'html', text: html } : { type: 'text', text }] };
  }
  const html = await textOf('text/html');
  if (html.trim()) return { sig: 'h:' + html, items: [{ type: 'html', text: html }] };
  return { sig: '', items: [] };
}

class ClipWatcher {
  constructor({ clipboard, onItems, interval = 900 }) {
    Object.assign(this, { clipboard, onItems, interval });
    this.timer = null; this.last = null; this.busy = null;
  }
  get running() { return !!this.timer; }
  async start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.interval);
    this.last = (await this.safeRead()).sig; // only things copied after switching on are collected
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async safeRead() { try { return await readClipboard(this.clipboard); } catch (_) { return { sig: this.last || '', items: [] }; } }
  tick() {
    if (this.busy || this.last === null) return this.busy;
    this.busy = (async () => {
      const snap = await this.safeRead();
      if (snap.sig && snap.sig !== this.last) { this.last = snap.sig; if (snap.items.length) this.onItems(snap.items); }
    })().finally(() => { this.busy = null; });
    return this.busy;
  }
  // After Tuk writes to the clipboard itself, remember it so it is not collected again.
  async resync() { await this.busy; this.last = (await this.safeRead()).sig; }
  async readNow() { return (await this.safeRead()).items; }
}

module.exports = { ClipWatcher, readClipboard, readFilePaths, parseUriList, parsePlistPaths, parseWindowsFileName, mimeFor, MAX_FILE_BYTES };
