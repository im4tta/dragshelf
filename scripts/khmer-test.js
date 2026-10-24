'use strict';
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const I18N = require('../src/shared/i18n');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-km-ui-'));
const { ud } = require('./demo-data')(temp);
const output = process.env.DRAGSHELF_KHMER_CAPTURE;
(async () => {
  const launch = () => electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud, DRAGSHELF_FAKE_IP: '127.0.0.1' } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.waitForSelector('.row');
    await app.evaluate(() => global.__test.showShelf());
    const guideReady = app.waitForEvent('window'); await app.evaluate(() => global.__test.openGuide());
    const guide = await guideReady; await guide.waitForSelector('[data-language-select]');
    await guide.selectOption('[data-language-select]', 'km');
    await page.waitForFunction(() => document.documentElement.lang === 'km');
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => [...document.fonts].some(face => face.family === 'Noto Sans Khmer' && face.status === 'loaded')), 'bundled Khmer font is loaded offline');
    assert.equal(await page.textContent('#clearAll'), I18N.t('km', 'clearAll'));
    const menu = await app.evaluate(() => global.__test.menuLabels());
    assert(menu.includes(I18N.t('km', 'theme')) && menu.includes(I18N.t('km', 'showGuide')), 'native menus are translated');
    for (let i = 0; i < 4; i++) {
      await guide.evaluate(index => window.__guide.show(index), i);
      assert.equal(await guide.textContent('#title'), I18N.t('km', 'guideTitle' + i));
      assert(await guide.evaluate(() => { const b = document.querySelector('#next').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }), 'Khmer guide controls fit');
    }
    const name = 'ឯកសារសម្រាប់ការងារ និងផែនការប្រចាំខែ';
    const file = path.join(temp, 'របាយការណ៍ខ្មែរ.txt'); fs.writeFileSync(file, 'សួស្ដីពិភពលោក');
    await page.evaluate(({ name, file }) => Promise.all([window.shelf.invoke('act', 'rename', { index: 0, name }), window.shelf.invoke('act', 'add', { paths: [file] })]), { name, file });
    await page.waitForFunction(expected => document.querySelector('.tab.on').textContent === expected, name);
    assert(await page.evaluate(() => document.querySelector('#top').classList.contains('long-tabs')), 'long Khmer tab uses wrapping layout');
    assert.equal(await page.locator('.tab.on').evaluate(el => getComputedStyle(el).textOverflow), 'clip');
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.locator('#card').screenshot({ path: path.join(output, 'shelf-khmer-dark.png') }); await guide.screenshot({ path: path.join(output, 'guide-khmer.png') }); }
    const phoneReady = app.waitForEvent('window'); await app.evaluate(() => global.__test.openPhone());
    const phone = await phoneReady; await phone.waitForSelector('#qr svg');
    assert.equal(await phone.textContent('#stop'), I18N.t('km', 'stopClose'));
    const info = await phone.evaluate(() => window.shelf.invoke('phone:info'));
    const html = await (await fetch(info.url)).text(); assert(html.includes(I18N.t('km', 'phoneChoose')));
    const english = await (await fetch(info.url + '?lang=en')).text(); assert(english.includes('Choose photos or videos'));
    const font = await fetch(info.url + '/font.ttf'); assert.equal(font.status, 200); assert((await font.arrayBuffer()).byteLength > 10000);
    const uploadedName = 'រូបភាពពីទូរសព្ទ.txt';
    const upload = await fetch(info.url + '/up?lang=km&name=' + encodeURIComponent(uploadedName), { method: 'POST', body: 'ខ្មែរពីទូរសព្ទ' }); assert.equal(upload.status, 200);
    const invalid = await fetch(info.url + '/up?lang=km&name=empty.txt', { method: 'POST', body: '' }); assert.equal(invalid.status, 413); assert.equal(await invalid.text(), I18N.t('km', 'badSize'));
    if (output) await phone.locator('.card').screenshot({ path: path.join(output, 'phone-khmer.png') });
    await Promise.all([phone.waitForEvent('close'), phone.click('#stop', { noWaitAfter: true }).catch(error => { if (!/closed/.test(error.message)) throw error; })]);
    const keyReady = app.waitForEvent('window'); await app.evaluate(() => global.__test.openShortcutWindow());
    const key = await keyReady; await key.waitForSelector('#hint');
    assert.equal(await key.textContent('h1'), I18N.t('km', 'shortcutTitle'));
    if (output) await key.locator('.card').screenshot({ path: path.join(output, 'shortcut-khmer.png') });
    await Promise.all([key.waitForEvent('close'), key.keyboard.press('Escape').catch(error => { if (!/closed/.test(error.message)) throw error; })]);
    await app.evaluate(() => { global.__test.setWorkArea({ x: 0, y: 0, width: 910, height: 480 }); global.__test.showShelf(); });
    await page.waitForTimeout(250);
    const fits = await page.evaluate(() => document.querySelector('#card').getBoundingClientRect().height <= 444); assert(fits, 'long Khmer name and footer fit a short work area');
    if (output) await page.locator('#card').screenshot({ path: path.join(output, 'shelf-khmer-compact.png') });
    await page.evaluate(() => window.shelf.invoke('act', 'setting', { key: 'theme', value: 'light' }));
    await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
    if (output) { await page.waitForTimeout(300); await page.locator('#card').screenshot({ path: path.join(output, 'shelf-khmer-light.png') }); }
    await app.evaluate(() => global.__test.store().flush()); await app.close();
    app = await launch(); page = await app.firstWindow(); await page.waitForSelector('.row');
    assert.equal(await page.getAttribute('html', 'lang'), 'km');
    assert.equal(await page.textContent('.tab.on'), name);
    const state = await page.evaluate(() => window.shelf.invoke('state:get')); assert(state.shelves[0].items.some(item => item.name === uploadedName));
    await page.evaluate(() => window.shelf.invoke('act', 'setting', { key: 'language', value: 'en' }));
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.textContent('#clearAll'), 'Clear all'); assert.equal(await page.textContent('.tab.on'), name);
    const longEnglish = 'Client delivery — final presentation, artwork, documents and supporting references';
    await page.evaluate(name => window.shelf.invoke('act', 'rename', { index: 0, name }), longEnglish);
    await page.waitForFunction(name => document.querySelector('.tab.on').textContent === name, longEnglish);
    assert(await page.locator('.tab.on').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'long English shelf name wraps without an ellipsis');
    console.log('PASS Khmer: switching, native menus, offline font, four guide pages, long names, Unicode files/uploads, localized errors, short-screen fit, restart persistence, and return to English');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
