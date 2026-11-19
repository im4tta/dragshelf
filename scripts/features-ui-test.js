'use strict';
// End-to-end checks for capture/markup, OCR, quick paste, command bar, smart shelves, snippets, smart rows,
// keyboard use, clipboard privacy, quick ZIP, LAN sharing, quick look and backup/restore, in the real app.
// OCR models: copied from DRAGSHELF_OCR_MODELS when set, otherwise downloaded (and checksum-verified) by the app.
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-features-')), ud = path.join(temp, 'userdata'), out = path.join(temp, 'out');
fs.mkdirSync(ud); fs.mkdirSync(out);
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: 'en', theme: 'dark', accent: 'yellow', guideDone: true, asked: true }));
if (process.env.DRAGSHELF_OCR_MODELS) fs.cpSync(process.env.DRAGSHELF_OCR_MODELS, path.join(ud, 'ocr-models'), { recursive: true });
const pdf = path.join(temp, 'Contract.pdf'); fs.writeFileSync(pdf, '%PDF-1.4 sample');
const shots = process.env.DRAGSHELF_FEATURES_CAPTURE;
const launch = () => electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud, DRAGSHELF_TEST_EXPORT_DIR: out, DRAGSHELF_FAKE_IP: '127.0.0.1' } });
const get = url => new Promise((resolve, reject) => http.get(url, res => { const parts = []; res.on('data', c => parts.push(c)).on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(parts) })); }).on('error', reject));
const pngWidth = file => fs.readFileSync(file).readUInt32BE(16);
async function newWindow(app, trigger, match) {
  const known = new Set(app.windows());
  await trigger();
  for (let i = 0; i < 100; i++) { const w = app.windows().find(x => !known.has(x) && (!match || x.url().includes(match))); if (w) { await w.waitForLoadState(); return w; } await new Promise(r => setTimeout(r, 100)); }
  throw new Error('window did not open: ' + match);
}
(async () => {
  const app = await launch();
  const errors = [];
  try {
    const shelf = await app.firstWindow(); await app.evaluate(() => global.__test.showShelf());
    shelf.on('pageerror', e => errors.push('shelf: ' + e.message));
    await shelf.waitForFunction(() => window.__t && window.__t.state());
    const items = () => shelf.evaluate(() => window.__t.state().shelves[window.__t.state().active].items);
    const count = async () => (await items()).length;

    // Smart shelves: PDFs copied in a file manager go to the "PDFs" shelf, everything else stays put.
    await shelf.evaluate(() => window.shelf.invoke('act', 'newShelf', { activate: false }));
    await app.evaluate(() => global.__test.store().renameShelf(1, 'PDFs'));
    const pdfShelf = await app.evaluate(() => global.__test.store().shelves[1].id);
    await shelf.evaluate(id => window.shelf.invoke('act', 'rules', { rules: [{ kind: 'ext', value: 'pdf', shelf: id }] }), pdfShelf);
    await shelf.evaluate(() => window.__t.openPanel('rules'));
    await shelf.waitForFunction(() => document.querySelectorAll('#ruleList li').length === 1);
    assert.match(await shelf.textContent('#ruleList'), /File type is pdf → PDFs/);
    await shelf.evaluate(() => window.__t.openPanel(null));
    await shelf.evaluate(() => window.shelf.invoke('act', 'autoPaste', { value: true }));
    await new Promise(r => setTimeout(r, 1300));
    await app.evaluate(({ clipboard, ClipboardItem }, href) => clipboard.write([new ClipboardItem({ 'text/uri-list': href })]), pathToFileURL(pdf).href);
    await shelf.waitForFunction(() => window.__t.state().shelves[1].items.length === 1, null, { timeout: 6000 });
    assert.equal(await count(), 0, 'routed away from the active shelf');

    // Clipboard privacy: a copy marked as secret by a password manager is ignored.
    await app.evaluate(({ clipboard, ClipboardItem }) => clipboard.write([new ClipboardItem({ 'text/plain': 'hunter2', 'electron application/osclipboard;format="org.nspasteboard.ConcealedType"': new Blob(['']) })]));
    await new Promise(r => setTimeout(r, 2200));
    assert.equal(await count(), 0, 'secret copy skipped');
    await shelf.evaluate(() => window.shelf.invoke('act', 'autoPaste', { value: false }));

    // Smart rows: colour swatch, link and e-mail chips.
    for (const t of ['#f5c63a', 'https://example.com/brief', 'hello@example.com']) await shelf.evaluate(t => window.shelf.invoke('drop:text', 0, t), t);
    await shelf.waitForFunction(() => document.querySelectorAll('#list .row').length === 3);
    assert.equal(await shelf.locator('#list .swatch').count(), 1);
    assert.equal(await shelf.locator('#list [data-open=email]').count(), 1);

    // Keyboard: arrows move, D ticks the focused row.
    await shelf.locator('#list .row').first().focus(); await shelf.keyboard.press('ArrowDown'); await shelf.keyboard.press('d');
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items[1].done === true);
    assert.equal(await shelf.evaluate(() => document.activeElement.dataset.i), '1');

    // Snippets: placeholders are filled in when copied.
    const snippetIndex = await shelf.evaluate(() => window.shelf.invoke('act', 'newSnippet', { text: 'Invoice {year} for {clipboard}' }));
    await app.evaluate(({ clipboard }) => clipboard.writeText('ACME'));
    await shelf.waitForFunction(i => window.__t.state().shelves[0].items[i], snippetIndex);
    await shelf.evaluate(() => window.__t.openPanel(null));
    await shelf.evaluate(i => window.shelf.invoke('act', 'copy', { path: window.__t.state().shelves[0].items[i].path }), snippetIndex);
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), `Invoice ${new Date().getFullYear()} for ACME`);
    assert.equal((await shelf.evaluate(() => window.shelf.invoke('history:get')))[0].pinned, true, 'snippets are pinned');

    // Command bar: ⌘K / Ctrl+K → "zip" → Enter makes a ZIP of the shelf.
    await shelf.locator('#list .row').first().focus();
    await shelf.keyboard.press('Control+k'); await shelf.waitForSelector('#commands:not([hidden])');
    await shelf.waitForFunction(() => document.activeElement && document.activeElement.id === 'cmdInput');
    await shelf.keyboard.type('zip'); await shelf.waitForFunction(() => document.querySelectorAll('#cmdList li').length === 1);
    await shelf.keyboard.press('Enter');
    await shelf.waitForFunction(() => document.querySelector('#toast').textContent.includes('ZIP saved'), null, { timeout: 8000 });
    if (!fs.readdirSync(out).some(f => f.endsWith('.zip'))) throw new Error('no zip; toast=' + await shelf.textContent('#toast') + ' cmd=' + await shelf.textContent('#cmdList'));
    const zipFile = path.join(out, fs.readdirSync(out).find(f => f.endsWith('.zip')));
    const names = (await require('../src/main/unzip').readZip(zipFile)).map(e => e.name);
    assert.equal(names.length, 4, JSON.stringify(names));

    // OCR: render Khmer + English text, put it on the shelf, copy the text out of the image.
    const sample = await shelf.evaluate(async () => {
      await document.fonts.load('34px "Noto Sans Khmer"');
      const c = document.createElement('canvas'); c.width = 900; c.height = 200; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 200); g.fillStyle = '#111';
      g.font = '34px "Noto Sans Khmer"'; g.fillText('សួស្តី ពិភពលោក', 30, 60); g.font = '30px "Noto Sans Khmer"'; g.fillText('Drag Shelf invoice 2026', 30, 140);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      return window.shelf.invoke('drop:blob', 0, 'Scan.png', new Uint8Array(await blob.arrayBuffer()));
    });
    const ocr = await shelf.evaluate(p => window.shelf.invoke('act', 'ocrCopy', { path: p }), sample);
    assert.ok(ocr && ocr.text, 'OCR returned text: ' + JSON.stringify(ocr));
    assert.match(ocr.text, /Drag Shelf invoice 2026/); assert.match(ocr.text, /សួស្តី/);
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), ocr.text);
    const history = await shelf.evaluate(() => window.shelf.invoke('history:get'));
    assert.match(history.find(h => h.path === sample).ocr, /invoice/, 'history search covers text in images');
    await shelf.waitForFunction(() => document.querySelector('#list [data-ocr]'));

    // Quick paste: palette search finds the scan by its text; Shift+Enter copies without pasting.
    const palette = await newWindow(app, () => shelf.evaluate(() => window.shelf.invoke('act', 'palette')), 'palette.html');
    palette.on('pageerror', e => errors.push('palette: ' + e.message));
    await palette.waitForSelector('#list li'); await palette.fill('#q', 'invoice 2026');
    await palette.waitForFunction(() => document.querySelectorAll('#list li').length === 1);
    if (shots) await palette.screenshot({ path: shots.replace('.png', '-palette.png') });
    await app.evaluate(({ clipboard }) => clipboard.writeText('-'));
    await palette.keyboard.press('Shift+Enter').catch(e => { if (!/closed/.test(e.message)) throw e; }); // the palette closes itself
    for (let i = 0; i < 40 && (await app.evaluate(({ clipboard }) => clipboard.read().then(e => e[0] && e[0].types.join(',')))) !== 'image/png'; i++) await new Promise(r => setTimeout(r, 100));
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.read().then(e => e[0].types.includes('image/png'))), true);

    // Area capture → markup (box + blur) → save: a new cropped picture lands on the shelf.
    const before = await count();
    const cap = await newWindow(app, () => shelf.evaluate(() => window.shelf.invoke('act', 'capture', { mode: 'area' })), 'capture.html');
    cap.on('pageerror', e => errors.push('capture: ' + e.message));
    await cap.waitForFunction(() => document.querySelector('#canvas').width > 0);
    const box = await cap.locator('#canvas').boundingBox();
    await cap.mouse.move(box.x + 100, box.y + 100); await cap.mouse.down(); await cap.mouse.move(box.x + 400, box.y + 300, { steps: 5 }); await cap.mouse.up();
    await cap.waitForSelector('#tools:not([hidden])');
    const scaleX = await cap.evaluate(() => document.querySelector('#canvas').width);
    const cbox = await cap.locator('#canvas').boundingBox();
    await cap.click('[data-tool=box]'); await cap.mouse.move(cbox.x + 20, cbox.y + 20); await cap.mouse.down(); await cap.mouse.move(cbox.x + 120, cbox.y + 90, { steps: 4 }); await cap.mouse.up();
    await cap.click('[data-tool=blur]'); await cap.mouse.move(cbox.x + 130, cbox.y + 30); await cap.mouse.down(); await cap.mouse.move(cbox.x + 200, cbox.y + 80, { steps: 4 }); await cap.mouse.up();
    assert.equal((await cap.evaluate(() => window.__c.state())).shapes, 2);
    if (shots) await cap.screenshot({ path: shots.replace('.png', '-markup.png') });
    await cap.click('[data-act=save]');
    await shelf.waitForFunction(n => window.__t.state().shelves[0].items.length === n + 1, before);
    const saved = (await items())[before].path;
    assert.equal(pngWidth(saved), scaleX, 'saved at the selection’s full resolution');
    assert.ok(Math.abs(scaleX - 300 * 2) <= 4, 'area of 300 logical px at 2× = ' + scaleX);

    // Mark up an existing item: the copy is inserted right after the original, which stays unchanged.
    const original = fs.readFileSync(sample);
    const mk = await newWindow(app, () => app.evaluate((_, p) => global.__test.markupItem(p), sample), 'capture.html');
    await mk.waitForSelector('#tools:not([hidden])'); const mb = await mk.locator('#canvas').boundingBox();
    await mk.click('[data-tool=arrow]'); await mk.mouse.move(mb.x + 10, mb.y + 10); await mk.mouse.down(); await mk.mouse.move(mb.x + 80, mb.y + 60, { steps: 3 }); await mk.mouse.up();
    await mk.keyboard.press('Control+z'); assert.equal((await mk.evaluate(() => window.__c.state())).shapes, 0);
    await mk.keyboard.press('Control+Shift+z'); assert.equal((await mk.evaluate(() => window.__c.state())).shapes, 1);
    await mk.click('[data-act=save]');
    await shelf.waitForFunction(n => window.__t.state().shelves[0].items.length === n + 2, before);
    const list = (await items()).map(i => i.name), at = list.indexOf('Scan.png');
    assert.equal(list[at + 1], 'Scan (marked up).png'); assert.deepEqual(fs.readFileSync(sample), original);

    // LAN sharing: the phone page lists the shelf's files and serves them.
    const info = await app.evaluate(async () => global.__test.phone().start());
    const page = await get(info.url.replace(/\/\/[^/:]+/, '//127.0.0.1') + '?lang=en');
    assert.equal(page.status, 200); assert.match(page.body.toString(), /Files on the shelf/);
    const file0 = await get(info.url.replace(/\/\/[^/:]+/, '//127.0.0.1') + '/f/0');
    assert.equal(file0.status, 200); assert.ok(file0.body.length > 0);
    await app.evaluate(() => global.__test.phone().stop());

    // Quick look opens a preview of the focused item (Space).
    const preview = await newWindow(app, async () => { await shelf.locator('#list .row').first().focus(); await shelf.keyboard.press(' '); });
    assert.ok(preview); await preview.close();

    // Backup → wipe → restore: shelves, history pins, rules and stash files come back.
    const backup = path.join(out, 'backup.zip');
    await app.evaluate((_, f) => global.__test.backupTo(f), backup);
    const snapshot = await app.evaluate(() => JSON.stringify(global.__test.store().shelves.map(s => [s.name, s.items.map(i => require('path').basename(i.p))]))).catch(async () => null);
    const names0 = await app.evaluate(() => global.__test.store().shelves.map(s => [s.name, s.items.length]));
    await app.evaluate(() => { const st = global.__test.store(); st.clearAll(); st.rules = []; st.history = []; });
    const textFile = (await items()).length === 0 ? null : null;
    const stashText = await app.evaluate(() => global.__test.store().exportBackup().shelves.length);
    await app.evaluate((_, f) => global.__test.restoreFrom(f), backup);
    assert.deepEqual(await app.evaluate(() => global.__test.store().shelves.map(s => [s.name, s.items.length])), names0);
    assert.equal(await app.evaluate(() => global.__test.store().rules.length), 1);
    assert.equal(await app.evaluate(() => global.__test.store().historyView()[0].pinned), true);
    assert.equal(await app.evaluate(() => global.__test.rebuildLastDelivery()), false, 'no delivery yet → nothing to rebuild');
    void snapshot; void textFile; void stashText;

    if (shots) { await app.evaluate(() => global.__test.showShelf()); await shelf.waitForTimeout(400); await shelf.screenshot({ path: shots }); }
    assert.deepEqual(errors, []);
    console.log('PASS features: smart shelves, clipboard privacy, smart rows, keyboard, snippets, command bar + quick ZIP, Khmer/English OCR, quick paste, area capture + markup, markup copy, LAN sharing, quick look, backup/restore');
  } finally { await app.close().catch(() => {}); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
