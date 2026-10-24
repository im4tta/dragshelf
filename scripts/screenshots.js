'use strict';
// Regenerates docs/screenshots/*.png from the real running app (Electron).
//   npm run screenshots        (on Linux: xvfb-run -a npm run screenshots)
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const seed = require('./demo-data');
const ROOT = path.join(__dirname, '..'), OUT = process.env.DRAGSHELF_SCREENSHOT_DIR || path.join(ROOT, 'docs', process.platform === 'win32' ? 'screenshots-windows' : 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = p => require('url').pathToFileURL(p).href;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsS-')); const { ud, files } = seed(tmp);
  const app = await electron.launch({ args: [ROOT, '--no-sandbox', '--force-device-scale-factor=2'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud, DRAGSHELF_FAKE_IP: '192.168.1.42', DRAGSHELF_MAC_LABELS: process.platform === 'darwin' ? '1' : '' } });
  const page = await app.firstWindow();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await app.evaluate(() => global.__test.showShelf()); await page.waitForSelector('.row');

  const patch = (p) => app.evaluate((_, p) => { const s = global.__test.store(); if (p.settings) Object.assign(s.settings, p.settings); if (p.shelves) s.shelves = p.shelves; if (p.active != null) s.active = p.active; global.__test.pushState(); }, p);
  const settle = async () => { await page.mouse.move(2, 2); await sleep(450); };
  const shot = async (name, pg = page, sel = '#frame') => { const box = await pg.locator(sel).boundingBox(); await pg.screenshot({ path: path.join(OUT, name), omitBackground: true, clip: box }); console.log('  ✓', name); };
  const itemsOf = (idx) => JSON.parse(fs.readFileSync(path.join(ud, 'shelves.json'), 'utf8')).shelves[0].items.filter((_, i) => idx.includes(i));
  const all = JSON.parse(fs.readFileSync(path.join(ud, 'shelves.json'), 'utf8')).shelves[0].items;
  const t = h => new Date(2026, 9, 23, h, 30).getTime();

  // 01 / 02  main look, dark + light
  await settle(); await shot('01-shelf-dark.png');
  await patch({ settings: { theme: 'light' } }); await settle(); await shot('02-shelf-light.png');
  await patch({ settings: { theme: 'dark' } });

  // 03 empty, 04 drop-hot (empty)
  await patch({ shelves: [{ name: 'Shelf 1', items: [] }] }); await settle(); await shot('03-empty.png');
  await page.evaluate(() => window.__t.hot(true)); await sleep(250); await shot('04-drop-hot-empty.png'); await page.evaluate(() => window.__t.hot(false));

  // 05 drop-hot with items, insertion line
  await patch({ shelves: [{ name: 'Onboarding', items: all }] }); await settle();
  await page.evaluate(() => { window.__t.hot(true); window.__t.insert(5); }); await sleep(250); await shot('05-drop-hot.png');
  await page.evaluate(() => { window.__t.hot(false); document.getElementById('insert').style.display = 'none'; });

  // 06 reorder: lifted row + insertion line
  await page.evaluate(() => { window.__t.reorder(); window.__t.lift(5); window.__t.insert(2); }); await sleep(300); await shot('06-drag-reorder.png');
  await patch({ settings: {} }); await page.evaluate(() => location.reload()); await page.waitForSelector('.row'); await settle();

  // 07 tabs (three shelves, hover-to-switch highlight)
  const mk = (n, c) => ({ name: n, items: all.slice(c[0], c[1]).map((i, k) => ({ ...i, added: t(9 + k) })) });
  await patch({ shelves: [mk('Work', [3, 7]), mk('Trip', [0, 2]), mk('Later', [5, 6])], active: 0 }); await settle();
  await page.evaluate(() => document.querySelectorAll('.tab')[1].classList.add('over')); await sleep(200); await shot('07-tabs.png');

  // 08 rename
  await page.evaluate(() => window.__t.rename(0)); await sleep(400); await shot('08-rename-tab.png');
  await page.keyboard.press('Escape'); await sleep(300);

  // 09 confetti right after ticking
  await patch({ shelves: [mk('Work', [3, 8])], active: 0 }); await settle();
  await page.click('.row:nth-child(2) .check'); await sleep(200); await page.mouse.move(2, 2); await sleep(30); await shot('09-confetti.png');
  await sleep(900);

  // 10 missing file
  const gone = path.join(files, 'Old invoice (moved).pdf');
  await patch({ shelves: [{ name: 'Work', items: [...all.slice(3, 6), { p: gone, done: false, added: t(11) }] }], active: 0 }); await settle(); await shot('10-missing-file.png');

  // 11 accent colours (8 small shelves → composite)
  const accents = ['yellow', 'blue', 'purple', 'pink', 'red', 'orange', 'green', 'teal'];
  fs.mkdirSync(path.join(tmp, 'acc'), { recursive: true });
  for (const a of accents) {
    await patch({ settings: { accent: a, theme: 'dark' }, shelves: [{ name: 'Onboarding', items: all.slice(0, 4).map((i, k) => ({ ...i, done: k < 2 })) }], active: 0 }); await settle();
    const box = await page.locator('#frame').boundingBox(); await page.screenshot({ path: path.join(tmp, 'acc', a + '.png'), omitBackground: true, clip: box });
  }
  await patch({ settings: { accent: 'yellow', theme: 'dark' }, shelves: [{ name: 'Onboarding', items: all }], active: 0 }); await settle();

  // 12 phone window
  await app.evaluate(() => global.__test.openPhone()); await sleep(1300);
  const phone = app.windows().find(w => w.url().includes('phone.html'));
  await phone.waitForSelector('#qr svg'); await phone.evaluate(() => { document.querySelector('#n').textContent = '3'; }); await sleep(200);
  await shot('12-phone-photos.png', phone, '.card'); // card only, crisp edges
  await Promise.all([phone.waitForEvent('close'), phone.click('#stop', { noWaitAfter: true }).catch(error => { if (!/closed/.test(error.message)) throw error; })]); await sleep(500);

  // 13 / 14 shortcut recorder
  await app.evaluate(() => global.__test.openShortcutWindow()); await sleep(1000);
  const kw = app.windows().find(w => w.url().includes('shortcut.html'));
  await kw.keyboard.down('Alt'); await kw.keyboard.down('Shift'); await sleep(250); await shot('13-shortcut-recording.png', kw, '.card');
  await kw.keyboard.press('KeyS'); await sleep(220); await shot('14-shortcut-saved.png', kw, '.card'); await sleep(900);

  // 15–18 guide
  await app.evaluate(() => global.__test.openGuide()); await sleep(1000);
  const gw = app.windows().find(w => w.url().includes('guide.html'));
  const times = [2700, 2350, 2150, 700];
  for (let i = 0; i < 4; i++) {
    await gw.evaluate(i => window.__guide.show(i), i); await sleep(120);
    await gw.evaluate(tm => document.getAnimations().forEach(a => { a.pause(); a.currentTime = tm; }), times[i]); await sleep(150);
    await shot(`${15 + i}-guide-${i + 1}.png`, gw, '.wrap');
  }
  await gw.evaluate(() => 0);

  // composites
  const img = n => url(path.join(OUT, n));
  const compose = async (html, w, h, out) => {
    const f = path.join(tmp, 'c' + Math.random().toString(36).slice(2) + '.html'); fs.writeFileSync(f, html);
    await app.evaluate(async ({ BrowserWindow }, a) => {
      const win = new BrowserWindow({ show: false, width: a.w, height: a.h, useContentSize: true, frame: false, backgroundColor: '#14150f', webPreferences: {} });
      await win.loadFile(a.f); await new Promise(r => setTimeout(r, 700));
      const png = (await win.webContents.capturePage()).toPNG().toString('base64'); win.destroy(); return png;
    }, { f, w, h }).then(b64 => fs.writeFileSync(path.join(OUT, out), Buffer.from(b64, 'base64')));
    console.log('  ✓', out);
  };
  const platformChips = process.platform === 'win32' ? '<span class="a">Windows</span><span>Installer + portable</span>' : '<span class="a">macOS</span><span>Apple Silicon</span><span>Intel</span>';
  const css = `<link rel="stylesheet" href="${url(path.join(ROOT, 'src/renderer/common.css'))}"><style>
    body{margin:0;font-family:var(--font);color:#f4f5ee;background:#14150f;overflow:hidden} .abs{position:absolute}
    h1,h2,p{margin:0} .cap{font-size:15px;font-weight:600;color:#c9cabf;text-align:center;margin-top:6px}</style>`;

  await compose(`<!doctype html><meta charset=utf-8>${css}<style>
    body{width:1280px;height:720px;background:radial-gradient(900px 600px at 85% 20%,rgba(245,198,58,.16),transparent 60%),radial-gradient(700px 500px at 10% 100%,rgba(245,198,58,.07),transparent 60%),#14150f}
    .t{left:96px;top:190px}.t img{width:104px;height:104px;margin-left:-8px}.t h1{font-size:76px;letter-spacing:-.035em;font-weight:760;margin-top:14px}
    .t p{font-size:26px;color:#a9aa9e;line-height:1.4;margin-top:14px;max-width:470px} .chips{margin-top:26px;display:flex;gap:10px}
    .chips span{font-size:15px;font-weight:650;padding:9px 16px;border-radius:999px;background:#2c2d27;color:#f4f5ee}.chips span.a{background:#f5c63a;color:#242520}
    .l{left:790px;top:48px;width:356px;transform:rotate(5deg);opacity:.96}.d{left:640px;top:56px;width:356px;transform:rotate(-3deg)} img.s{display:block;width:100%}
  </style><div class="abs t"><img src="${img('../../build/icon.png')}"><h1>Drag Shelf</h1><p>A temporary shelf for the files, links, text and images you’re moving around.</p><div class="chips">${platformChips}<span>Free &amp; open source</span></div></div>
  <div class="abs l"><img class=s src="${img('02-shelf-light.png')}"></div><div class="abs d"><img class=s src="${img('01-shelf-dark.png')}"></div>`, 1280, 720, '00-hero.png');

  await compose(`<!doctype html><meta charset=utf-8>${css}<style>body{width:1400px;height:1300px;background:#14150f;padding:34px 40px;box-sizing:border-box}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 20px}.g div{text-align:center}.g img{width:100%;display:block}</style>
    <div class=g>${accents.map(a => `<div><img src="${url(path.join(tmp, 'acc', a + '.png'))}"><div class=cap>${a[0].toUpperCase() + a.slice(1)}</div></div>`).join('')}</div>`, 1400, 1300, '11-accent-colors.png');


  const gimg = i => img(`${14 + i}-guide-${i}.png`);
  await compose(`<!doctype html><meta charset=utf-8>${css}<style>body{width:1160px;height:1060px;background:#14150f;padding:26px;box-sizing:border-box}
    .g{display:grid;grid-template-columns:1fr 1fr;gap:20px}.g img{width:100%;display:block;border-radius:18px}</style>
    <div class=g>${[1, 2, 3, 4].map(i => `<img src="${gimg(i)}">`).join('')}</div>`, 1160, 1060, '19-guide-overview.png');
  await app.close();
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'icon.png'));
  console.log('done →', OUT);
})().catch(e => { console.error('SCREENSHOTS FAILED', e); process.exit(1); });
