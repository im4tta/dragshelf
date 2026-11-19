'use strict';
// Clipboard auto-paste, history + pins, undo / redo and split / merge text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const TextOps = require('../src/shared/textops');
const { Store } = require('../src/main/store');
const C = require('../src/main/clipwatch');

test('split and merge text', () => {
  assert.equal(TextOps.split('a, b,,c', ','), 'a\nb\nc');
  assert.equal(TextOps.split('a1b22c', '\\d+', { regex: true }), 'a\nb\nc');
  assert.equal(TextOps.split('x\ty', '\\t'), 'x\ny');
  assert.equal(TextOps.split('a,a,b', ',', { unique: true }), 'a\nb');
  assert.equal(TextOps.split(' a | b ', '|', { trim: false }), ' a \n b ');
  assert.equal(TextOps.merge('a\n\nb\nc', ', '), 'a, b, c');
  assert.equal(TextOps.merge('a\nb', ',', { wrap: "'" }), "'a','b'");
  assert.equal(TextOps.merge('a\nb', '\\n\\n'), 'a\n\nb');
  assert.deepEqual(TextOps.splitParts('ក,ខ', ','), ['ក', 'ខ']);
  assert.equal(TextOps.mergeParts(['one\n', 'two'], '\\n'), 'one\ntwo');
});

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-tools-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new Store(dir) };
}

test('history remembers every added item, keeps pins on top and persists', t => {
  const { dir, store } = tempStore(t);
  store.addPaths(0, ['/a', '/b', '/c']);
  assert.deepEqual(store.historyView().map(h => h.p), ['/c', '/b', '/a']);
  store.togglePin('/a');
  assert.deepEqual(store.historyView().map(h => h.p), ['/a', '/c', '/b']);
  store.removePaths(0, ['/b']); store.addPaths(0, ['/b']);
  assert.deepEqual(store.historyView().map(h => h.p), ['/a', '/b', '/c']);
  store.forget(['/c']); store.flush();
  const again = new Store(dir);
  assert.deepEqual(again.historyView().map(h => [h.p, h.pinned]), [['/a', true], ['/b', false]]);
  again.clearHistory(); assert.deepEqual(again.historyView().map(h => h.p), ['/a'], 'clearing keeps pinned entries');
});

test('history pruning never drops pinned entries', t => {
  const { store } = tempStore(t);
  store.addPaths(0, ['/keep']); store.togglePin('/keep');
  store.addPaths(0, Array.from({ length: Store.HISTORY_LIMIT + 20 }, (_, i) => '/x' + i));
  assert.equal(store.history.length, Store.HISTORY_LIMIT + 1);
  assert.equal(store.historyView()[0].p, '/keep');
});

test('undo and redo shelf changes', t => {
  const { store } = tempStore(t);
  store.checkpoint(); store.addPaths(0, ['/a', '/b']);
  store.checkpoint(); store.clearShelf(0);
  assert.equal(store.cur.items.length, 0);
  assert.ok(store.undo()); assert.deepEqual(store.cur.items.map(i => i.p), ['/a', '/b']);
  assert.ok(store.undo()); assert.equal(store.cur.items.length, 0);
  assert.equal(store.undo(), false);
  assert.ok(store.redo()); assert.ok(store.redo()); assert.equal(store.cur.items.length, 0);
  store.checkpoint(); store.settle(); assert.equal(store.canRedo, false);
  store.checkpoint(); store.addPaths(0, ['/c']); store.checkpoint(); store.replaceItem(0, 0, ['/c1', '/c2']);
  assert.deepEqual(store.cur.items.map(i => i.p), ['/c1', '/c2']);
  store.undo(); assert.deepEqual(store.cur.items.map(i => i.p), ['/c']);
});

function fakeClipboard(state) {
  const entry = values => ({ types: Object.keys(values), getType: async type => new Blob([values[type]]) });
  return { read: async () => (state.entries || []).map(entry) };
}

test('clipboard file formats on each platform', () => {
  assert.deepEqual(C.parseUriList('# c\nfile:///tmp/a%20b.png\nhttps://x'), ['/tmp/a b.png']);
  assert.deepEqual(C.parsePlistPaths('<array><string>/Users/me/A &amp; B.pdf</string><string>/x.txt</string></array>'), ['/Users/me/A & B.pdf', '/x.txt']);
  assert.deepEqual(C.parseWindowsFileName(Buffer.from('C:\\ទុក\\a.docx\0junk', 'utf16le')), ['C:\\ទុក\\a.docx']);
});

test('auto-paste reports only new copies: files, images and text', async () => {
  const state = { entries: [{ 'text/plain': 'before' }] }, got = [];
  const w = new C.ClipWatcher({ clipboard: fakeClipboard(state), onCopy: snap => got.push(snap) });
  await w.start(); w.stop();
  await w.tick(); assert.equal(got.length, 0, 'what was already copied is not pasted');
  state.entries = [{ 'text/plain': 'hello', 'text/html': '<b>hello</b>' }]; await w.tick(); await w.tick();
  assert.deepEqual(got.map(s => [s.kind, s.text]), [['text', 'hello']]);
  state.entries = [{ 'electron application/osclipboard;format="public.file-url"': 'file:///tmp/a.pdf' }, { 'electron application/osclipboard;format="public.file-url"': 'file:///tmp/b.zip' }];
  await w.tick(); assert.deepEqual(got[1].paths, ['/tmp/a.pdf', '/tmp/b.zip']);
  state.entries = [{ 'electron application/osclipboard;format="FileNameW"': Buffer.from('C:\\x.docx\0', 'utf16le') }];
  await w.tick(); assert.deepEqual(got[2].paths, ['C:\\x.docx']);
  state.entries = [{ 'image/png': Buffer.from('png-bytes') }]; await w.tick(); await w.tick();
  assert.equal(got.length, 4); assert.equal(got[3].kind, 'image'); assert.equal(got[3].data.toString(), 'png-bytes');
  state.entries = [{ 'text/html': '<p>only <b>html</b></p>' }]; await w.tick(); assert.equal(got[4].text.trim(), 'only html');
  state.entries = [{ 'text/plain': 'written by Drag Shelf' }]; await w.resync(); await w.tick(); assert.equal(got.length, 5);
});
