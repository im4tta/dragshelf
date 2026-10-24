'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const I18N = require('../src/shared/i18n');
const { Store } = require('../src/main/store');
const { Stash } = require('../src/main/stash');
test('Khmer translations preserve every English interpolation placeholder', () => {
  for (const [key, english] of Object.entries(I18N.messages.en)) {
    const khmer = I18N.messages.km[key]; assert(khmer && /[\u1780-\u17ff]/.test(khmer), key);
    const slots = value => (value.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(slots(khmer), slots(english), key);
  }
  assert.equal(I18N.resolveLanguage('auto', 'km-KH'), 'km');
  assert.equal(I18N.resolveLanguage('en', 'km-KH'), 'en');
  assert.equal(I18N.resolveLanguage('unsupported', 'fr-FR'), 'en');
  assert.equal(I18N.number('km', 123), '១២៣');
  assert(I18N.date('km', new Date(2026, 9, 25, 8, 5)).includes('តុលា'));
});
test('Khmer names and text persist without cutting character clusters', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-khmer-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir), stash = new Stash(path.join(dir, 'stash'));
  const title = 'ឯកសារសម្រាប់ការងារនិងផែនការប្រចាំខែ';
  store.renameShelf(0, title); store.setSetting('language', 'km');
  const file = stash.saveBlob('រូបថតខ្មែរ.png', Buffer.from('sample'));
  const text = stash.saveText('សួស្ដី! នេះជាអត្ថបទខ្មែរ។');
  store.addPaths(0, [file, text]); store.flush();
  const loaded = new Store(dir);
  assert.equal(loaded.cur.name, title); assert.equal(loaded.settings.language, 'km');
  assert.equal(fs.readFileSync(text, 'utf8'), 'សួស្ដី! នេះជាអត្ថបទខ្មែរ។');
  assert(loaded.cur.items.some(item => path.basename(item.p) === 'រូបថតខ្មែរ.png'));
  loaded.setSetting('language', 'bad-value'); assert.equal(loaded.settings.language, 'km');
  loaded.flush();
});
