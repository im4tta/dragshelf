'use strict';
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const { ud } = require('./demo-data')(fs.mkdtempSync(path.join(os.tmpdir(), 'ds-display-')));
(async () => {
  const app = await electron.launch({ args: [root, '--no-sandbox'], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud, DRAGSHELF_FAKE_IP: '127.0.0.1' } });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('.row');
    for (const [name, width, height] of [
      ['1366x768 at 100%', 1366, 720], ['1366x768 at 150%', 910, 480],
      ['1920x1080 at 150%', 1280, 680], ['4K at 200%', 1920, 1040]
    ]) {
      await app.evaluate((_, area) => { global.__test.setWorkArea(area); global.__test.showShelf(); }, { x: 0, y: 0, width, height });
      await page.waitForTimeout(300);
      const shelf = await page.evaluate(() => {
        const card = document.querySelector('#card').getBoundingClientRect();
        const list = document.querySelector('#list');
        return { width: card.width, height: card.height, scrollable: list.scrollHeight > list.clientHeight };
      });
      assert.equal(shelf.width, 320); assert(shelf.height <= height - 36, name + ': shelf fits');
      if (process.env.DRAGSHELF_DISPLAY_CAPTURE && height === 720) {
        fs.mkdirSync(process.env.DRAGSHELF_DISPLAY_CAPTURE, { recursive: true });
        await page.locator('#card').screenshot({ path: path.join(process.env.DRAGSHELF_DISPLAY_CAPTURE, 'shelf-standard.png') });
      }
      if (height < 500) assert(shelf.scrollable, 'short display uses scrolling instead of larger rows');
      const guideReady = app.waitForEvent('window');
      await app.evaluate(() => global.__test.openGuide());
      const guide = await guideReady; await guide.waitForSelector('#next');
      await guide.evaluate(() => window.__guide.show(3));
      const fit = await guide.evaluate(() => { const b = document.querySelector('#next').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; });
      assert(fit, name + ': guide controls remain visible');
      if (process.env.DRAGSHELF_DISPLAY_CAPTURE && height === 480) await guide.screenshot({ path: path.join(process.env.DRAGSHELF_DISPLAY_CAPTURE, 'guide-compact.png') });
      await Promise.all([guide.waitForEvent('close'), app.evaluate(() => global.__test.guideWin().close())]);
      const phoneReady = app.waitForEvent('window');
      await app.evaluate(() => global.__test.openPhone());
      const phone = await phoneReady; await phone.waitForSelector('#qr svg');
      const phoneFit = await phone.evaluate(() => { const card = document.querySelector('.card'); const b = card.getBoundingClientRect(); return b.bottom <= innerHeight && (card.scrollHeight <= card.clientHeight || getComputedStyle(card).overflowY === 'auto'); });
      assert(phoneFit, name + ': phone content is visible or scrollable');
      await Promise.all([phone.waitForEvent('close'), phone.click('#stop', { noWaitAfter: true }).catch(error => { if (!/closed/.test(error.message)) throw error; })]);
      console.log('PASS', name, '- 320px shelf; guide and phone controls fit');
    }
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
