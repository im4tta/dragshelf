'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const T = require('../website/tuk/core.js');

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
