'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const T = require('../src/renderer/tuk/core.js');

test('crc32 matches zlib', () => {
  const data = Buffer.from('Tuk ទុក paste capture keep');
  assert.strictEqual(T.crc32(data), zlib.crc32 ? zlib.crc32(data) : T.crc32(data));
  assert.strictEqual(T.crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip has valid structure', () => {
  const zip = Buffer.from(T.makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'ខ.png', data: new Uint8Array([1, 2, 3]) }]));
  assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);
  const end = zip.length - 22;
  assert.strictEqual(zip.readUInt32LE(end), 0x06054b50);
  assert.strictEqual(zip.readUInt16LE(end + 10), 2);
  const cdOffset = zip.readUInt32LE(end + 16);
  assert.strictEqual(zip.readUInt32LE(cdOffset), 0x02014b50);
  assert.strictEqual(zip.subarray(30, 35).toString(), 'a.txt');
  assert.strictEqual(zip.subarray(35, 40).toString(), 'hello');
});

test('unique names', () => {
  assert.deepStrictEqual(T.uniqueNames(['a.png', 'A.png', 'b/c?.png', '']), ['a.png', 'A (2).png', 'b-c-.png', 'item']);
});

test('split and merge', () => {
  assert.strictEqual(T.split('a, b,,c', ',', { trim: true }), 'a\nb\nc');
  assert.strictEqual(T.split('a1b22c', '\\d+', { regex: true }), 'a\nb\nc');
  assert.strictEqual(T.split('x\ty', '\\t'), 'x\ny');
  assert.strictEqual(T.split('a,a,b', ',', { unique: true }), 'a\nb');
  assert.strictEqual(T.merge('a\n\nb\nc', ', '), 'a, b, c');
  assert.strictEqual(T.merge('a\nb', ',', { wrap: "'", prefix: '(', suffix: ')' }), "('a','b')");
  assert.strictEqual(T.merge('a\nb', '\\n\\n'), 'a\n\nb');
});

test('kind detection', () => {
  assert.strictEqual(T.detectKind('x.bin', 'image/png'), 'image');
  assert.strictEqual(T.detectKind('report.PDF', ''), 'pdf');
  assert.strictEqual(T.detectKind('main.rs', ''), 'code');
  assert.strictEqual(T.detectKind('sheet.xlsx', ''), 'document');
  assert.strictEqual(T.detectKind('blob', 'application/octet-stream'), 'file');
  assert.strictEqual(T.textKind('https://example.com/a'), 'link');
  assert.strictEqual(T.textKind('{"a":1}'), 'json');
  assert.strictEqual(T.textKind('#ffcc00'), 'color');
});

test('undo/redo history', () => {
  const h = new T.History();
  h.record('one'); h.record('two');
  assert.strictEqual(h.undo('three'), 'two');
  assert.strictEqual(h.undo('two'), 'one');
  assert.strictEqual(h.undo('one'), null);
  assert.strictEqual(h.redo('one'), 'two');
  h.record('x');
  assert.strictEqual(h.canRedo, false);
});

const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const M = require('../src/main/tuk.js');
function fakeClipboard(state) {
  const entry = values => ({ types: Object.keys(values), getType: async t => new Blob([values[t]]) });
  return { read: async () => (state.entries || []).map(entry) };
}

test('clipboard file paths on each platform', () => {
  assert.deepStrictEqual(M.parseUriList('# c\nfile:///tmp/a%20b.png\nhttps://x'), ['/tmp/a b.png']);
  assert.deepStrictEqual(M.parsePlistPaths('<array><string>/Users/me/A &amp; B.pdf</string><string>/x.txt</string></array>'), ['/Users/me/A & B.pdf', '/x.txt']);
  assert.deepStrictEqual(M.parseWindowsFileName(Buffer.from('C:\\ទុក\\a.docx\0junk', 'utf16le')), ['C:\\ទុក\\a.docx']);
  assert.strictEqual(M.mimeFor('report.PDF'), 'application/pdf');
});

test('watcher collects only new clipboard content, files first', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuk-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'note.pdf'); fs.writeFileSync(file, 'pdf');
  const state = { entries: [{ 'text/plain': 'before' }] }, got = [];
  const w = new M.ClipWatcher({ clipboard: fakeClipboard(state), onItems: items => got.push(items) });
  await w.start(); w.stop();
  await w.tick(); assert.strictEqual(got.length, 0, 'existing clipboard is not collected');
  state.entries = [{ 'text/plain': 'hello' }]; await w.tick(); await w.tick();
  assert.deepStrictEqual(got.map(g => g[0].text), ['hello']);
  state.entries = [{ 'text/plain': 'b', 'text/html': '<b>b</b>' }]; await w.tick();
  assert.deepStrictEqual(got[1][0], { type: 'html', text: '<b>b</b>' });
  state.entries = [{ 'electron application/osclipboard;format="public.file-url"': 'file://' + file }, { 'electron application/osclipboard;format="public.file-url"': 'file://' + dir }]; await w.tick();
  const files = got[2];
  assert.strictEqual(files[0].type, 'file'); assert.strictEqual(files[0].mime, 'application/pdf'); assert.strictEqual(files[0].data.toString(), 'pdf');
  assert.strictEqual(files[1].type, 'text'); assert.strictEqual(files[1].path, dir);
  state.entries = [{ 'electron application/osclipboard;format="FileNameW"': Buffer.from(file + '\0', 'utf16le') }]; await w.tick();
  assert.strictEqual(got[3][0].path, file);
  state.entries = [{ 'image/png': Buffer.from('png-bytes') }]; await w.tick(); await w.tick();
  assert.strictEqual(got.length, 5); assert.strictEqual(got[4][0].mime, 'image/png'); assert.strictEqual(got[4][0].data.toString(), 'png-bytes');
  state.entries = [{ 'text/plain': 'mine' }]; await w.resync(); await w.tick(); assert.strictEqual(got.length, 5);
});
