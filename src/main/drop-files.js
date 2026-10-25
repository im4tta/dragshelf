'use strict';
const fs = require('fs/promises');
const path = require('path');
const { fileURLToPath } = require('url');

// Only explicit file URLs from this drop can recover an empty Electron path.
// Never guess from a display name, search the disk, or read a stale clipboard.
async function resolveDrop(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const paths = [], candidates = [];
  const add = value => { if (!paths.includes(value)) paths.push(value); };
  for (const file of files) if (typeof file.path === 'string' && path.isAbsolute(file.path)) add(file.path);
  for (const field of ['uriList', 'fileURL', 'text']) {
    if (typeof payload[field] !== 'string') continue;
    for (const line of payload[field].split(/\r?\n/)) {
      const value = line.trim(); if (!/^file:\/\//i.test(value)) continue;
      try {
        const url = new URL(value); if (url.search || url.hash) continue;
        const source = fileURLToPath(url), stat = await fs.stat(source);
        if (!stat.isFile() && !stat.isDirectory()) continue;
        add(source);
        if (!candidates.some(item => item.path === source)) candidates.push({ path: source, name: path.basename(source).normalize('NFC'), size: stat.size, directory: stat.isDirectory() });
      } catch (_) { /* Invalid, nonlocal, or unavailable URI: retain normal blob handling. */ }
    }
  }
  const unresolved = [];
  files.forEach((file, index) => {
    if (typeof file.path === 'string' && path.isAbsolute(file.path)) return;
    const matches = candidates.filter(item => item.name === String(file.name || '').normalize('NFC') && (item.directory || item.size === file.size));
    if (!matches.length) unresolved.push(index);
  });
  return { paths, unresolved };
}
module.exports = { resolveDrop };
