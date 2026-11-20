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

test('smart text detection and snippet placeholders', () => {
  assert.deepEqual(TextOps.detect('#f5c63a'), { kind: 'color', value: '#f5c63a' });
  assert.deepEqual(TextOps.detect('rgb(1, 2, 3)'), { kind: 'color', value: 'rgb(1, 2, 3)' });
  assert.equal(TextOps.detect('https://x.dev/a?b=1').kind, 'link');
  assert.equal(TextOps.detect('hello@example.com').kind, 'email');
  assert.deepEqual(TextOps.detect('+855 12 345 678'), { kind: 'phone', value: '+85512345678' });
  assert.equal(TextOps.detect('{"a": [1]}').kind, 'json');
  assert.equal(TextOps.detect('const a = 1;\nreturn a;').kind, 'code');
  assert.equal(TextOps.detect('សួស្តី').kind, 'text');
  assert.equal(TextOps.detect('2026').kind, 'text');
  const now = new Date(2026, 10, 9, 8, 5);
  assert.equal(TextOps.expand('{date} {time} {datetime} {year} {clipboard} {other}', { now, clipboard: 'X' }), '2026-11-09 08:05 2026-11-09 08:05 2026 X {other}');
});

test('smart shelves route new items by type or name', t => {
  const { store } = tempStore(t);
  store.newShelf(); store.newShelf();
  const [, pdfs, shots] = store.shelves.map(s => s.id);
  store.setRules([{ kind: 'ext', value: '.pdf, docx', shelf: pdfs }, { kind: 'name', value: 'screenshot', shelf: shots }, { kind: 'ext', value: 'png', shelf: 'missing-shelf' }, { kind: 'bad', value: 'x', shelf: pdfs }]);
  assert.equal(store.rules.length, 2, 'invalid rules are dropped');
  const r = store.addRouted(['/a/Brief.PDF', '/a/Screenshot 1.png', '/a/notes.txt', '/a/spec.docx']);
  assert.equal(r.added, 4);
  assert.deepEqual(store.shelves.map(s => s.items.map(i => i.p)), [['/a/notes.txt'], ['/a/Brief.PDF', '/a/spec.docx'], ['/a/Screenshot 1.png']]);
});

test('history expiry keeps pins; OCR text cache follows file changes', t => {
  const { store } = tempStore(t);
  store.addPaths(0, ['/old', '/pinned-old', '/new']);
  store.history.find(h => h.p === '/old').added = Date.now() - 10 * 864e5;
  Object.assign(store.history.find(h => h.p === '/pinned-old'), { added: Date.now() - 10 * 864e5, pinned: true });
  store.setSetting('historyDays', 7); store.expireHistory();
  assert.deepEqual(store.history.map(h => h.p).sort(), ['/new', '/pinned-old']);
  store.setOcrText('/img.png', 111, 'សួស្តី');
  assert.equal(store.ocrText('/img.png', 111), 'សួស្តី');
  assert.equal(store.ocrText('/img.png', 222), null, 'a changed file is read again');
  assert.equal(store.ocrOf('/img.png'), 'សួស្តី');
});

test('backup round trip restores shelves, history, rules and safe settings', t => {
  const { store } = tempStore(t);
  store.newShelf(); store.renameShelf(1, 'ធ្នើ'); store.addPaths(1, ['/x/a.pdf']); store.togglePin('/x/a.pdf');
  store.setRules([{ kind: 'ext', value: 'pdf', shelf: store.shelves[1].id }]);
  store.setSetting('captureScale', 4);
  const backup = JSON.parse(JSON.stringify(store.exportBackup()));
  backup.settings.hotkey = 'Ctrl+Q'; // not restored: shortcuts belong to this computer
  const { store: other } = tempStore(t);
  other.importBackup(backup);
  assert.deepEqual(other.shelves.map(s => [s.name, s.items.map(i => i.p)]), [['Shelf 1', []], ['ធ្នើ', ['/x/a.pdf']]]);
  assert.equal(other.historyView()[0].pinned, true);
  assert.equal(other.rules.length, 1); assert.equal(other.settings.captureScale, 4); assert.notEqual(other.settings.hotkey, 'Ctrl+Q');
  assert.ok(other.undo(), 'restoring can be undone');
  assert.throws(() => other.importBackup({ app: 'Other' }), /Not a Drag Shelf backup/);
});

test('auto-paste ignores copies marked secret unless told otherwise', async () => {
  const secret = { entries: [{ 'text/plain': 'hunter2', 'electron application/osclipboard;format="org.nspasteboard.ConcealedType"': '' }] };
  assert.equal((await C.readClipboard(fakeClipboard(secret))).kind, '');
  assert.equal((await C.readClipboard(fakeClipboard(secret), { skipConcealed: false })).text, 'hunter2');
  const win = { entries: [{ 'text/plain': 'pw', 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"': '' }] };
  assert.equal((await C.readClipboard(fakeClipboard(win))).concealed, true);
});

test('OCR models are verified before use', async t => {
  const M = require('../src/main/ocr-models');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-ocr-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(M.MODELS.length, 4); assert.ok(M.TOTAL_BYTES > 40e6 && M.TOTAL_BYTES < 60e6);
  assert.ok(M.MODELS.every(m => /^https:\/\/(huggingface\.co\/muyleanging\/Chakkhu-OCR-Khmer-ONNX\/resolve\/7a2c283f|cdn\.jsdelivr\.net\/gh\/im4tta\/tools123@a50a636)/.test(m.url) && /^[0-9a-f]{64}$/.test(m.sha256)));
  const bad = async () => ({ ok: true, body: (async function* () { yield Buffer.from('not a model'); })() });
  await assert.rejects(M.download(dir, bad), /checksum mismatch/);
  assert.equal(fs.readdirSync(dir).length, 0, 'nothing half-written is kept');
  assert.equal(M.installed(dir), false);
  await assert.rejects(M.download(dir, async () => ({ ok: false, status: 404 })), /HTTP 404/);
});

test('OCR line grouping keeps columns apart', () => {
  const { lineSegments } = require('../src/ocr/engine');
  const b = (x1, x2) => ({ x1, x2, y1: 0, y2: 20, classId: 1, score: 0.9 });
  assert.deepEqual(lineSegments([b(50, 90), b(0, 40), b(200, 260)]).map(s => [s.x1, s.x2]), [[0, 90], [200, 260]]);
});

// A 2×2 bitmap: red, green / blue, white (top row first in the expected output).
function dib({ bpp = 24, topDown = false, v5 = false, alpha = 0 }) {
  const header = v5 ? 124 : 40, stride = Math.ceil((2 * bpp) / 32) * 4, buf = Buffer.alloc(header + stride * 2);
  buf.writeUInt32LE(header, 0); buf.writeInt32LE(2, 4); buf.writeInt32LE(topDown ? -2 : 2, 8); buf.writeUInt16LE(1, 12); buf.writeUInt16LE(bpp, 14);
  const rows = [[[0, 0, 255], [0, 255, 0]], [[255, 0, 0], [255, 255, 255]]]; // BGR: red, green / blue, white
  rows.forEach((row, y) => row.forEach((px, x) => { const r = topDown ? y : 1 - y, o = header + r * stride + x * (bpp / 8); buf[o] = px[0]; buf[o + 1] = px[1]; buf[o + 2] = px[2]; if (bpp === 32) buf[o + 3] = alpha; }));
  return buf;
}
test('copied screenshots in Windows bitmap formats are decoded (24/32-bit, bottom-up/top-down, V5 header)', () => {
  const expected = [0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255];
  for (const opts of [{}, { topDown: true }, { bpp: 32 }, { bpp: 32, v5: true }, { bpp: 32, topDown: true, alpha: 255 }]) {
    const { width, height, bgra } = C.dibToBitmap(dib(opts));
    assert.equal(width, 2); assert.equal(height, 2); assert.deepEqual([...bgra], expected, JSON.stringify(opts));
  }
  assert.throws(() => C.dibToBitmap(Buffer.alloc(10)), /Not a bitmap/);
  assert.throws(() => C.dibToBitmap(dib({}).subarray(0, 50)), /Truncated/);
});
test('image formats from screenshot tools are recognised, PNG preferred', () => {
  const raw = f => `electron application/osclipboard;format="${f}"`;
  assert.deepEqual(C.imageType([raw('CF_DIB'), raw('PNG'), 'text/plain']), { type: raw('PNG'), mime: 'image/png' });
  assert.deepEqual(C.imageType([raw('CF_DIBV5')]), { type: raw('CF_DIBV5'), mime: 'image/x-dib' });
  assert.deepEqual(C.imageType([raw('public.tiff')]), { type: raw('public.tiff'), mime: 'image/tiff' });
  assert.equal(C.imageType([raw('image/x-bitmap-custom')]).mime, 'image/x-dib');
  assert.equal(C.imageType(['text/plain']), null);
});
test('auto-paste picks up a screenshot copied as a Windows bitmap even when text is also on the clipboard', async () => {
  const got = [], state = { entries: [{ 'text/plain': 'x' }] };
  const w = new C.ClipWatcher({ clipboard: fakeClipboard(state), onCopy: s => got.push(s) });
  await w.start(); w.stop();
  state.entries = [{ 'electron application/osclipboard;format="CF_DIBV5"': dib({ bpp: 32, v5: true }), 'text/plain': 'caption' }];
  await w.tick();
  assert.equal(got[0].kind, 'image'); assert.equal(got[0].mime, 'image/x-dib');
});
