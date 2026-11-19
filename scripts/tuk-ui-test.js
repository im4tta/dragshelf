'use strict';
// Drives Tuk inside the Drag Shelf desktop app: native clipboard collection, files of any type, add-to-shelf, persistence.
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-tuk-ui-')), ud = path.join(temp, 'userdata');
fs.mkdirSync(ud);
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: 'en', theme: 'dark', accent: 'yellow', guideDone: true, asked: true }));
const pdf = path.join(temp, 'Brief ទុក.pdf'); fs.writeFileSync(pdf, '%PDF-1.4 sample');
const shot = process.env.DRAGSHELF_TUK_CAPTURE;
(async () => {
  const launch = () => electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud } });
  let app = await launch();
  try {
    await app.firstWindow();
    const opened = app.waitForEvent('window'); await app.evaluate(() => global.__test.openTuk(true)); const tuk = await opened;
    const errors = []; tuk.on('pageerror', e => errors.push(e.message));
    await tuk.waitForSelector('#grid', { state: 'attached' }); await tuk.waitForFunction(() => document.documentElement.classList.contains('desktop'));
    await app.evaluate(({ clipboard }) => clipboard.writeText('copied before switching on'));
    await tuk.check('#auto-paste', { force: true });
    await tuk.waitForTimeout(1200); // watcher records what was already copied
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com/brief'));
    await tuk.click('[data-view=history]');
    await tuk.waitForFunction(() => document.querySelector('#count-history').textContent === '1', null, { timeout: 5000 });
    await app.evaluate(({ clipboard, ClipboardItem, nativeImage }, icon) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([nativeImage.createFromPath(icon).toPNG()], { type: 'image/png' }) })]), path.join(root, 'build/icon.png'));
    await tuk.waitForFunction(() => document.querySelector('#count-shots').textContent === '1', null, { timeout: 5000 });
    // A file copied in a file manager arrives as a file list; it is kept with its contents and type.
    await app.evaluate(({ clipboard, ClipboardItem }, href) => clipboard.write([new ClipboardItem({ 'text/uri-list': href })]), require('url').pathToFileURL(pdf).href);
    await tuk.waitForFunction(() => document.querySelector('#count-history').textContent === '3', null, { timeout: 5000 });
    assert.equal(await tuk.locator('.card .tag', { hasText: 'pdf' }).count(), 1);
    // Add the link to the shelf and pin it.
    const link = tuk.locator('.card', { hasText: 'example.com' });
    await link.locator('[data-a=shelf]').click(); await link.locator('[data-a=pin]').click();
    await tuk.waitForFunction(() => document.querySelector('#count-pinned').textContent === '1');
    const shelfItems = await app.evaluate(() => global.__test.store().cur.items.map(i => i.p));
    assert.equal(shelfItems.length, 1); assert.match(fs.readFileSync(shelfItems[0], 'utf8'), /example\.com\/brief/);
    // Copy back must not be re-collected.
    await link.locator('[data-a=copy]').click();
    await tuk.waitForTimeout(1500);
    const historyCount = await tuk.textContent('#count-history');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'https://example.com/brief');
    assert.equal(historyCount, '3', 'copying back does not add a duplicate');
    // Native screen capture at 2×.
    await tuk.click('[data-view=shots]'); await tuk.selectOption('#scale', '2'); await tuk.click('#capture');
    await tuk.waitForFunction(() => document.querySelector('#count-shots').textContent === '2', null, { timeout: 10000 });
    const captured = await tuk.locator('.card .sub').first().textContent();
    const [w] = captured.match(/(\d+)×/).slice(1).map(Number);
    assert.equal(w, await app.evaluate(({ screen }) => screen.getPrimaryDisplay().size.width * 2), 'capture is rendered at the chosen multiple');
    // Split / merge + undo.
    await tuk.click('[data-view=text]'); await tuk.fill('#text', 'a;b;c'); await tuk.fill('#sep', ';'); await tuk.click('#do-split');
    assert.equal(await tuk.inputValue('#text'), 'a\nb\nc'); await tuk.keyboard.press('Control+z'); assert.equal(await tuk.inputValue('#text'), 'a;b;c');
    await tuk.click('[data-view=history]');
    if (shot) { await tuk.waitForTimeout(500); await tuk.screenshot({ path: shot }); }
    assert.deepEqual(errors, []);
    await app.close();
    // History and the auto-collect setting survive a restart; collection runs without opening the window.
    app = await launch(); await app.firstWindow();
    assert.equal(await app.evaluate(() => !!(global.__test.clipWatch() && global.__test.clipWatch().running)), true, 'clipboard collection resumes at startup without opening Tuk');
    const reopened = app.waitForEvent('window'); await app.evaluate(() => global.__test.openTuk(true)); const win = await reopened;
    await app.evaluate(({ clipboard }) => clipboard.writeText('collected while Tuk was closed'));
    await win.click('[data-view=history]');
    await win.waitForFunction(() => document.querySelector('#count-history').textContent === '5', null, { timeout: 5000 });
    assert.equal(await win.locator('.card', { hasText: 'collected while Tuk was closed' }).count(), 1);
    assert.equal(await win.textContent('#count-pinned'), '1');
    assert.equal(await win.isChecked('#auto-paste'), true);
    console.log('Tuk desktop test passed:', historyCount, 'items');
  } finally { await app.close().catch(() => {}); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
