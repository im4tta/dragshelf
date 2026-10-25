'use strict';
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-drop-ui-'));
const ud = path.join(temp, 'userdata'); fs.mkdirSync(ud);
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: 'en', guideDone: true, asked: true }));
const source = path.join(temp, 'ខ្មែរ #100%.txt'); fs.writeFileSync(source, 'original bytes');
const uri = pathToFileURL(source).href;
(async () => {
  const app = await electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud } });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#addTab');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const drop = async (target, options = {}) => page.evaluate(({ target, uri, ...options }) => {
      const dt = new DataTransfer();
      if (!options.uriOnly) { const file = new File(['original bytes'], 'ខ្មែរ #100%.txt'); if (window.shelf.pathFor(file)) throw new Error('Fixture must have no native path'); dt.items.add(file); }
      dt.setData(options.field || 'text/uri-list', uri);
      if (options.blob) dt.items.add(new File(['browser image'], 'browser.png', { type: 'image/png' }));
      document.querySelector(target).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      // Simulate Chromium invalidating drop text after the event returns.
      dt.clearData();
    }, { target, uri, ...options });
    await drop('#addTab', { blob: true });
    await page.waitForFunction(() => window.__t.state().active === 1 && window.__t.state().shelves[1].items.length === 2);
    let state = await app.evaluate(() => global.__test.store().cur.items.map(item => item.p));
    assert(state.includes(source), 'original filesystem path retained');
    assert.equal(state.filter(file => path.basename(file) === path.basename(source)).length, 1, 'no stashed duplicate');
    assert.equal(fs.readFileSync(state.find(file => file.endsWith('browser.png')), 'utf8'), 'browser image');
    await page.evaluate(() => window.shelf.invoke('act', 'clearShelf', { shelf: 1 }));
    await drop('#list', { uriOnly: true, field: 'public.file-url' });
    await page.waitForFunction(() => window.__t.state().shelves[1].items.length === 1);
    assert.deepEqual(await app.evaluate(() => global.__test.store().cur.items.map(item => item.p)), [source]);
    const opened = app.waitForEvent('window'); await page.click('#prepareBtn'); const delivery = await opened;
    await delivery.waitForSelector('.source-file');
    await delivery.evaluate(uri => { const dt = new DataTransfer(); dt.items.add(new File(['original bytes'], 'ខ្មែរ #100%.txt')); dt.setData('text/uri-list', uri); document.querySelector('.collection').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); dt.clearData(); }, uri);
    await delivery.waitForTimeout(200);
    assert.deepEqual(await app.evaluate(() => global.__test.store().cur.items.map(item => item.p)), [source]);
    assert.equal(fs.readFileSync(source, 'utf8'), 'original bytes'); assert.deepEqual(errors, []);
    console.log('PASS drops: empty native path + file URI, synchronous snapshot on new shelf, mixed browser blob, URI-only file, delivery drop, no duplicate copies');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
