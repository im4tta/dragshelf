'use strict';
// Drives the shelf's clipboard, capture, history, pin, split / merge and undo / redo features in the real app.
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-tools-ui-')), ud = path.join(temp, 'userdata');
fs.mkdirSync(ud);
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: 'en', theme: 'dark', accent: 'yellow', guideDone: true, asked: true }));
const pdf = path.join(temp, 'Brief ទុក.pdf'); fs.writeFileSync(pdf, '%PDF-1.4 sample');
const shot = process.env.DRAGSHELF_TOOLS_CAPTURE;
const launch = () => electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud } });
const rows = page => page.locator('#list .row .name').allTextContents();
(async () => {
  let app = await launch();
  try {
    const shelf = await app.firstWindow(); await app.evaluate(() => global.__test.showShelf());
    const errors = []; shelf.on('pageerror', e => errors.push(e.message));
    await shelf.waitForSelector('#captureBtn svg');

    // Auto-paste: switched on from the history panel; only copies made afterwards land on the shelf.
    await app.evaluate(({ clipboard }) => clipboard.writeText('copied earlier'));
    await shelf.click('#historyBtn'); await shelf.check('#autoPaste', { force: true });
    await shelf.waitForFunction(() => window.__t.state().settings.autoPaste);
    await shelf.waitForTimeout(1200);
    await app.evaluate(({ clipboard }) => clipboard.writeText('alpha, beta, gamma'));
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 1, null, { timeout: 5000 });
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com/brief'));
    await app.evaluate(({ clipboard, ClipboardItem, nativeImage }, icon) => new Promise(r => setTimeout(r, 1300)).then(() => clipboard.write([new ClipboardItem({ 'image/png': new Blob([nativeImage.createFromPath(icon).toPNG()], { type: 'image/png' }) })])), path.join(root, 'build/icon.png'));
    await new Promise(r => setTimeout(r, 1300));
    await app.evaluate(({ clipboard, ClipboardItem }, href) => clipboard.write([new ClipboardItem({ 'text/uri-list': href })]), pathToFileURL(pdf).href);
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 4, null, { timeout: 6000 });
    const items = await app.evaluate(() => global.__test.store().cur.items.map(i => i.p));
    assert.equal(items[3], pdf, 'copied files are added by reference');
    assert.match(path.basename(items[1]), /\.(webloc|url)$/, 'copied links become link files');
    assert.match(path.basename(items[2]), /^Image .*\.png$/, 'copied images are saved');

    // History lists everything; pins stay on top; search filters.
    await shelf.waitForFunction(() => document.querySelectorAll('#historyList .h-row').length === 4);
    await shelf.locator('.h-row', { hasText: 'Brief' }).locator('[data-h=pin]').click();
    await shelf.waitForFunction(() => document.querySelector('#historyList .h-row').classList.contains('pinned'));
    assert.equal(await shelf.locator('.h-label').first().textContent(), 'Pinned');
    await shelf.fill('#historySearch', 'gamma'); assert.equal(await shelf.locator('.h-row').count(), 1);
    await shelf.fill('#historySearch', '');
    // Copy from history does not get pasted straight back onto the shelf.
    await shelf.locator('.h-row', { hasText: 'alpha' }).locator('[data-h=copy]').click();
    await shelf.waitForTimeout(1500);
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'alpha, beta, gamma');
    assert.equal(await app.evaluate(() => global.__test.store().cur.items.length), 4);
    if (shot) await shelf.screenshot({ path: shot.replace('.png', '-history.png') });
    await shelf.locator('#history [data-close]').click();

    // Split / merge: edit the text item, split it into shelf items, undo, then merge text items back.
    await shelf.evaluate(() => window.__t.openText(0));
    await shelf.waitForFunction(() => document.querySelector('#textBody').value === 'alpha, beta, gamma');
    await shelf.click('#doSplit'); assert.equal(await shelf.inputValue('#textBody'), 'alpha\nbeta\ngamma');
    await shelf.click('#textUndo'); assert.equal(await shelf.inputValue('#textBody'), 'alpha, beta, gamma');
    await shelf.click('#textRedo'); await shelf.click('#textUndo');
    if (shot) await shelf.screenshot({ path: shot.replace('.png', '-text.png') });
    await shelf.click('#splitItems');
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 6);
    const splitNames = await rows(shelf); assert.equal(splitNames.length, 6);
    // Undo / redo the split from the footer.
    await shelf.click('#undoBtn'); await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 4);
    await shelf.click('#redoBtn'); await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 6);
    await shelf.evaluate(() => window.__t.openText(0)); await shelf.waitForFunction(() => document.querySelector('#textBody').value === 'alpha');
    await shelf.fill('#sep', ' + '); await shelf.click('#mergeItems');
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 4);
    await shelf.evaluate(() => window.__t.openText(0)); await shelf.waitForFunction(() => document.querySelector('#textBody').value === 'alpha + beta + gamma');
    await shelf.locator('#textTools [data-close]').click();

    // Clear all, then undo brings everything back.
    await shelf.click('#clearAll'); await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 0);
    await app.evaluate(() => global.__test.showShelf());
    await shelf.click('#undoBtn'); await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 4);

    // Screen capture at 2× goes straight onto the shelf.
    await app.evaluate(() => global.__test.store().setSetting('captureScale', 2));
    await shelf.click('#captureBtn'); await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 5, null, { timeout: 10000 });
    const capturePath = await app.evaluate(() => global.__test.store().cur.items[4].p);
    const screenWidth = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().size.width);
    const capture = { name: path.basename(capturePath), width: fs.readFileSync(capturePath).readUInt32BE(16) }; // PNG IHDR width
    assert.match(capture.name, /^Screenshot .*@2x\.png$/); assert.equal(capture.width, screenWidth * 2, 'captured at 2× the screen size');
    await shelf.waitForTimeout(400);
    if (shot) await shelf.screenshot({ path: shot });
    assert.deepEqual(errors, []);
    await app.close();

    // History, pins and auto-paste survive a restart; auto-paste works without opening anything.
    app = await launch(); const again = await app.firstWindow();
    await again.waitForFunction(() => window.__t && window.__t.state());
    await app.evaluate(({ clipboard }) => new Promise(r => setTimeout(r, 1500)).then(() => clipboard.writeText('after restart')));
    await again.waitForFunction(() => window.__t.state().shelves[0].items.length === 6, null, { timeout: 6000 });
    const history = await again.evaluate(() => window.shelf.invoke('history:get'));
    assert.equal(history[0].pinned, true); assert.equal(history[0].path, pdf);
    console.log('PASS shelf tools: auto-paste (text, link, image, files), history + pins + search, copy without re-paste, split/merge with undo/redo, shelf undo/redo, 2× capture, restart persistence');
  } finally { await app.close().catch(() => {}); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
