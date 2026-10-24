'use strict';
// Creates realistic demo files + a seeded user-data folder. Used by the screenshot script.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

function makeFile(p, bytes) { fs.writeFileSync(p, Buffer.alloc(Math.min(bytes, 4096), 7)); if (bytes > 4096) fs.truncateSync(p, bytes); }

module.exports = function seed(dir) {
  const files = path.join(dir, 'Demo Files'); fs.mkdirSync(files, { recursive: true });
  const ud = path.join(dir, 'userdata'); fs.mkdirSync(ud, { recursive: true });
  // a real image so the thumbnail path is exercised
  const png = path.join(files, 'Hero shot.png');
  execFileSync('python3', ['-I', '-c', `
from PIL import Image, ImageDraw
im = Image.new('RGB', (480, 320)); d = ImageDraw.Draw(im)
for y in range(320):
    for x in range(0, 480, 4):
        t = (x / 480 + y / 320) / 2
        d.rectangle((x, y, x + 3, y), fill=(int(245 - 120 * t), int(198 - 60 * t), int(58 + 150 * t)))
d.ellipse((300, 40, 420, 160), fill=(255, 255, 255)); im.save(r'${png}')`]);
  const rows = [
    ['Brand guidelines v3.pdf', 2.4e6, true], ['Hero shot.png', 0, true], ['Tax & bank forms.xlsx', 86e3, true],
    ['Accounts & access.webloc', 0, false], ['Meeting notes.txt', 3.1e3, false], ['Q4 goals draft.pptx', 14.2e6, false],
    ['Launch demo.mov', 1.2e9, false], ['Handbook.zip', 38e6, false]
  ];
  const items = rows.map(([name, size, done], i) => {
    const p = path.join(files, name);
    if (name.endsWith('.webloc')) fs.writeFileSync(p, '<?xml version="1.0"?><plist version="1.0"><dict><key>URL</key><string>https://www.figma.com/files/team</string></dict></plist>');
    else if (size) makeFile(p, size);
    return { p, done, added: new Date(2026, 9, 23, 8 + i, i % 2 ? 30 : 5).getTime() };
  });
  fs.writeFileSync(path.join(ud, 'shelves.json'), JSON.stringify({ version: 1, active: 0, shelves: [{ name: 'Onboarding', items }] }));
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ theme: 'dark', accent: 'yellow', hotkey: 'Alt+Shift+S', guideDone: true, asked: true }));
  return { files, ud, items };
};
