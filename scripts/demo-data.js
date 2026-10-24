'use strict';
// Creates realistic demo files + a seeded user-data folder. Used by the screenshot script.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function demoImage() {
  const w = 480, h = 320, raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = (Math.floor(x / 4) * 4 / w + y / h) / 2, p = y * (1 + w * 3) + 1 + x * 3;
    const moon = ((x - 360) / 60) ** 2 + ((y - 100) / 60) ** 2 <= 1;
    raw[p] = moon ? 255 : 245 - 120 * t; raw[p + 1] = moon ? 255 : 198 - 60 * t; raw[p + 2] = moon ? 255 : 58 + 150 * t;
  }
  const chunk = (name, data) => {
    const bytes = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, bytes, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function makeFile(p, bytes) { fs.writeFileSync(p, Buffer.alloc(Math.min(bytes, 4096), 7)); if (bytes > 4096) fs.truncateSync(p, bytes); }

module.exports = function seed(dir) {
  const files = path.join(dir, 'Demo Files'); fs.mkdirSync(files, { recursive: true });
  const ud = path.join(dir, 'userdata'); fs.mkdirSync(ud, { recursive: true });
  // a real image so the thumbnail path is exercised
  const png = path.join(files, 'Hero shot.png');
  fs.writeFileSync(png, demoImage());
  const rows = [
    ['Brand guidelines v3.pdf', 2.4e6, true], ['Hero shot.png', 0, true], ['Tax & bank forms.xlsx', 86e3, true],
    [process.platform === 'win32' ? 'Accounts & access.url' : 'Accounts & access.webloc', 0, false], ['Meeting notes.txt', 3.1e3, false], ['Q4 goals draft.pptx', 14.2e6, false],
    ['Launch demo.mov', 1.2e9, false], ['Handbook.zip', 38e6, false]
  ];
  const items = rows.map(([name, size, done], i) => {
    const p = path.join(files, name);
    if (name.endsWith('.url')) fs.writeFileSync(p, '[InternetShortcut]\r\nURL=https://www.figma.com/files/team\r\n');
    else if (name.endsWith('.webloc')) fs.writeFileSync(p, '<?xml version="1.0"?><plist version="1.0"><dict><key>URL</key><string>https://www.figma.com/files/team</string></dict></plist>');
    else if (size) makeFile(p, size);
    return { p, done, added: new Date(2026, 9, 23, 8 + i, i % 2 ? 30 : 5).getTime() };
  });
  fs.writeFileSync(path.join(ud, 'shelves.json'), JSON.stringify({ version: 1, active: 0, shelves: [{ name: 'Onboarding', items }] }));
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ theme: 'dark', accent: 'yellow', hotkey: process.platform === 'win32' ? 'Control+Shift+F' : 'Alt+Shift+S', guideDone: true, asked: true }));
  return { files, ud, items };
};
