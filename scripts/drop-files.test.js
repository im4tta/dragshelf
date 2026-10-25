'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const { resolveDrop } = require('../src/main/drop-files');

test('empty Electron paths recover from explicit file URLs without making blob copies', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-drop-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const name = 'ខ្មែរ #100%.txt', source = path.join(dir, name); fs.writeFileSync(source, 'hello');
  const files = [{ path: '', name, size: 5 }];
  for (const field of ['uriList', 'fileURL', 'text']) {
    const result = await resolveDrop({ files, [field]: '# comment\r\n' + pathToFileURL(source).href });
    assert.deepEqual(result, { paths: [source], unresolved: [] });
  }
  const mixed = await resolveDrop({ files: [...files, { path: '', name: 'browser.png', size: 6 }], uriList: pathToFileURL(source).href });
  assert.deepEqual(mixed, { paths: [source], unresolved: [1] });
  assert.deepEqual(await resolveDrop({ files, uriList: 'https://example.com/file\nfile:///missing/file\nfile://%invalid' }), { paths: [], unresolved: [0] });
  assert.deepEqual(await resolveDrop({ files, uriList: pathToFileURL(source).href + '#fragment' }), { paths: [], unresolved: [0] });
});

test('native paths, same-named files, URI-only folders and real blobs retain their semantics', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-drop-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const a = path.join(dir, 'a'), b = path.join(dir, 'b'); fs.mkdirSync(a); fs.mkdirSync(b);
  const first = path.join(a, 'file.txt'), second = path.join(b, 'file.txt'); fs.writeFileSync(first, 'same'); fs.writeFileSync(second, 'same');
  const uris = [first, second].map(file => pathToFileURL(file).href).join('\n');
  assert.deepEqual(await resolveDrop({ files: [{ path: '', name: 'file.txt', size: 4 }, { path: '', name: 'file.txt', size: 4 }], uriList: uris }), { paths: [first, second], unresolved: [] });
  assert.deepEqual(await resolveDrop({ files: [], uriList: pathToFileURL(a).href }), { paths: [a], unresolved: [] });
  assert.deepEqual(await resolveDrop({ files: [{ path: first, name: 'file.txt', size: 4 }], uriList: pathToFileURL(first).href }), { paths: [first], unresolved: [] });
  assert.deepEqual(await resolveDrop({ files: [{ path: '', name: 'image.png', size: 4 }], text: '/not/a/trusted/path' }), { paths: [], unresolved: [0] });
});
