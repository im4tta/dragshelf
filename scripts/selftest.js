'use strict';
// End-to-end self test: launches the real app (Electron) with demo data and drives the UI.
//   npm test            (on Linux: xvfb-run -a npm test)
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const seed = require('./demo-data');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpReq = (url, opt = {}, body) => new Promise((res, rej) => { const r = http.request(url, opt, x => { let d = ''; x.on('data', c => (d += c)); x.on('end', () => res({ code: x.statusCode, body: d })); }); r.on('error', rej); if (body) r.write(body); r.end(); });

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsT-')); const { ud } = seed(tmp);
  const launch = () => electron.launch({ args: [ROOT, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud, DRAGSHELF_FAKE_IP: '127.0.0.1' } });
  let app = await launch(); let page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await app.evaluate(() => global.__test.showShelf()); await page.waitForSelector('.row');
  const st = () => app.evaluate(() => { const s = global.__test.store(); return { active: s.active, shelves: s.shelves.map(x => ({ name: x.name, items: x.items.map(i => ({ p: i.p, done: i.done })) })), settings: s.settings }; });
  const counter = () => page.textContent('#counter');
  const drop = (init) => page.evaluate(i => { const dt = new DataTransfer(); if (i.file) dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], i.file, { type: 'image/png' })); if (i.uri) dt.setData('text/uri-list', i.uri); if (i.text) dt.setData('text/plain', i.text); document.querySelector('#list').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 100, clientY: 200 })); }, init);

  console.log('shelf');
  ok((await page.$$('.row')).length === 8, '8 rows rendered from saved shelf');
  ok((await counter()) === '3/8', 'counter shows done/total = 3/8');
  ok((await page.$$('.row.done')).length === 3, '3 rows rendered as done (strike-through)');
  ok(await page.$eval('.row .tile img', i => !!i.src) .catch(() => false), 'image items get a thumbnail');

  console.log('tick / clear');
  await page.click('.row:nth-child(4) .check'); await sleep(250);
  ok((await counter()) === '4/8', 'ticking an item updates the counter');
  ok((await page.$$('#confetti i')).length > 5, 'confetti burst is spawned');
  await page.click('#clearDone'); await sleep(250);
  ok((await page.$$('.row')).length === 4, 'Clear done removes the 4 done items');
  ok((await st()).shelves[0].items.length === 4, 'main-process state agrees');

  console.log('drops that are not files on disk');
  await drop({ file: 'Pasted image.png' }); await sleep(300);
  await drop({ uri: 'https://www.example.com/some/page' }); await sleep(300);
  await drop({ text: 'Hello from a text selection' }); await sleep(300);
  const items = (await st()).shelves[0].items.map(i => i.p);
  ok(items.some(p => p.endsWith('Pasted image.png') && fs.existsSync(p)), 'image blob → stashed file');
  ok(items.some(p => p.endsWith('example.com.webloc') && /example\.com\/some\/page/.test(fs.readFileSync(p, 'utf8'))), 'link → .webloc file');
  ok(items.some(p => /Text .*\.txt$/.test(p) && fs.readFileSync(p, 'utf8') === 'Hello from a text selection'), 'text → .txt file');
  ok((await page.$$('.row')).length === 7, 'three new rows appear');

  console.log('tabs');
  await page.click('#addTab'); await sleep(300);
  ok((await page.$$('.tab')).length === 2 && (await st()).active === 1, '+ creates a second shelf and switches to it');
  ok((await page.$$('.row')).length === 0 && (await page.isVisible('#empty')), 'empty state is shown for the new shelf');
  const moved = items[0];
  await page.evaluate(async p => { await window.shelf.invoke('act', 'move', { from: 0, paths: [p], to: 1, at: null }); }, moved); await sleep(250);
  const s2 = await st(); ok(s2.shelves[1].items.length === 1 && s2.shelves[0].items.length === 6, 'item moved from shelf 1 to shelf 2');
  await page.evaluate(() => window.shelf.invoke('act', 'rename', { index: 1, name: 'Trip' })); await sleep(200);
  ok((await page.textContent('.tab.on')) === 'Trip', 'rename works');
  await page.evaluate(() => window.shelf.invoke('act', 'setActive', { index: 0 })); await sleep(200);
  const before = (await st()).shelves[0].items.map(i => i.p), pick = before[3];
  await page.evaluate(p => window.shelf.invoke('act', 'move', { from: 0, paths: [p], to: 0, at: 0 }), pick); await sleep(200);
  const reordered = (await st()).shelves[0].items.map(i => i.p);
  ok(reordered[0] === pick && reordered.length === before.length && reordered.slice(1).join() === before.filter(x => x !== pick).join(), 'reordering inside a shelf puts the item first and keeps the rest in order');

  console.log('missing files');
  await page.evaluate(() => window.shelf.invoke('act', 'add', { shelf: 0, paths: ['/definitely/not/here.pdf'] })); await sleep(250);
  ok(await page.$('.row.missing') !== null, 'missing file is flagged');
  page.evaluate(() => window.shelf.send('drag:start', ['/definitely/not/here.pdf'])); await sleep(300);
  ok(!(await st()).shelves[0].items.some(i => i.p === '/definitely/not/here.pdf'), 'dragging a missing file removes it from the shelf');

  console.log('settings');
  await page.evaluate(() => window.shelf.invoke('act', 'setting', { key: 'theme', value: 'light' })); await sleep(250);
  ok((await page.evaluate(() => document.documentElement.dataset.scheme)) === 'light', 'light theme applies');
  await page.evaluate(() => window.shelf.invoke('act', 'setting', { key: 'accent', value: 'blue' })); await sleep(250);
  ok((await page.evaluate(() => document.documentElement.dataset.accent)) === 'blue', 'accent colour applies');

  console.log('phone upload');
  await app.evaluate(() => global.__test.openPhone()); await sleep(1200);
  const pw = await app.evaluate(() => !!global.__test.phoneWin());
  ok(pw, 'phone window opens');
  if (pw) {
    const pp = app.windows().find(w => w.url().includes('phone.html'));
    await pp.waitForSelector('#qr svg'); ok(true, 'QR code is rendered');
    const info = await pp.evaluate(() => window.shelf.invoke('phone:info')); const u = new URL(info.url);
    const g = await httpReq(info.url); ok(g.code === 200 && /Send photos/.test(g.body), 'phone page is served on the secret URL');
    const bad = await httpReq(`http://${u.host}/wrongtoken`); ok(bad.code === 404, 'wrong token → 404');
    const up = await httpReq(`${info.url}/up?name=${encodeURIComponent('IMG 001.jpg')}`, { method: 'POST', headers: { 'Content-Length': 5 } }, 'hello'); await sleep(500);
    ok(up.code === 200, 'upload accepted');
    ok((await st()).shelves[0].items.some(i => /IMG 001\.jpg$/.test(i.p)), 'uploaded photo lands on the shelf');
    ok((await pp.textContent('#n')) === '1', 'received counter = 1');
    await pp.click('#stop'); await sleep(500);
    ok(!(await app.evaluate(() => !!global.__test.phoneWin())), 'stop closes the window');
    const dead = await httpReq(info.url).then(() => false, () => true); ok(dead, 'server is shut down afterwards');
  }

  console.log('shortcut recorder');
  await app.evaluate(() => global.__test.openShortcutWindow()); await sleep(900);
  const kw = app.windows().find(w => w.url().includes('shortcut.html')); ok(!!kw, 'shortcut window opens');
  if (kw) {
    await kw.keyboard.down('Alt'); await kw.keyboard.down('Shift'); await kw.keyboard.press('KeyK'); await sleep(500);
    ok((await st()).settings.hotkey === 'Alt+Shift+K', 'new shortcut is saved as Alt+Shift+K');
    await sleep(1000);
  }

  console.log('guide');
  await app.evaluate(() => global.__test.openGuide()); await sleep(900);
  const gw = app.windows().find(w => w.url().includes('guide.html')); ok(!!gw, 'guide opens');
  if (gw) {
    ok((await gw.textContent('#title')) === 'Drag a file, then shake', 'page 1');
    await gw.click('#next'); await gw.click('#next'); await gw.click('#next'); await sleep(200);
    ok((await gw.textContent('#next')) === 'Get started', 'last page shows “Get started”');
    await gw.click('#next', { noWaitAfter: true }).catch(() => {}); await sleep(600);
    ok(!(await app.evaluate(() => !!global.__test.guideWin())), '“Get started” closes the guide');
  }

  console.log('persistence');
  await app.evaluate(() => global.__test.store().flush()); await app.close();
  app = await launch(); page = await app.firstWindow(); await app.evaluate(() => global.__test.showShelf()); await page.waitForSelector('.tab');
  const after = await st(); ok(after.shelves.length === 2 && after.shelves[1].name === 'Trip', 'shelves + names survive a restart');
  ok(after.settings.accent === 'blue' && after.settings.theme === 'light' && after.settings.hotkey === 'Alt+Shift+K', 'settings survive a restart');
  await app.close();

  ok(errors.length === 0, 'no renderer errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SELFTEST CRASHED', e); process.exit(2); });
