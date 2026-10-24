'use strict';
// Things that are not files on disk (links, text, images from a browser) are saved into a stash folder
// so that they can be dragged back out as real files.
const fs = require('fs');
const path = require('path');

function sanitize(s) {
  s = String(s || '').replace(/[\\/:*?"<>|\r\n\t\0]/g, '_').replace(/^\.+/, '_').replace(/[ .]+$/, '');
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].slice(0, 96).map(part => part.segment).join('');
}
function uniqueIn(dir, name) {
  name = sanitize(name) || 'item';
  let full = path.join(dir, name);
  if (!fs.existsSync(full)) return full;
  const ext = path.extname(name), stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 2; i < 5000; i++) {
    full = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(full)) return full;
  }
  return full;
}
function timestamp() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '') || 'Link'; } catch (_) { return 'Link'; } }

class Stash {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  saveText(text) {
    const p = uniqueIn(this.dir, `Text ${timestamp()}.txt`);
    fs.writeFileSync(p, text, 'utf8'); return p;
  }
  saveUrl(url) {
    if (process.platform === 'win32') {
      const p = uniqueIn(this.dir, `${hostOf(url)}.url`);
      fs.writeFileSync(p, `[InternetShortcut]\r\nURL=${String(url).replace(/[\r\n]/g, '')}\r\n`, 'utf8');
      return p;
    }
    const p = uniqueIn(this.dir, `${hostOf(url)}.webloc`);
    fs.writeFileSync(p, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${esc(url)}</string>\n</dict>\n</plist>\n`);
    return p;
  }
  saveBlob(name, buf) {
    const ext = path.extname(name || '');
    const p = uniqueIn(this.dir, name && name.length ? name : `Image ${timestamp()}${ext || '.png'}`);
    fs.writeFileSync(p, Buffer.from(buf)); return p;
  }
}
module.exports = { Stash, sanitize, uniqueIn, timestamp };
