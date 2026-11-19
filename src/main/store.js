'use strict';
// Persistent state: shelves (+ items) and settings, stored as JSON in the user-data folder.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_SETTINGS = {
  language: 'auto',
  theme: 'auto',            // auto | light | dark
  accent: 'yellow',
  hotkey: process.platform === 'win32' ? 'Control+Shift+F' : 'Alt+Shift+S',
  strict: true,             // only pop up when a real file drag is in progress
  moveOnDragOut: true,      // items leave the shelf once dropped somewhere else (hold ⌥ to copy)
  guideDone: false,
  autoPaste: false,         // new clipboard contents land on the active shelf
  captureScale: 2,          // screenshot resolution multiple (1–4×)
  ocrAuto: true,            // read text in new screenshots once the OCR models are installed
  ocrMode: 'best',          // best | fast
  quickPasteKey: process.platform === 'darwin' ? 'Alt+Shift+V' : 'Control+Shift+V',
  skipConcealed: true,      // auto-paste ignores copies marked secret (password managers)
  historyDays: 0,           // forget unpinned history after N days (0 = keep)
  asked: false              // already asked for the Accessibility permission once
};

class Store {
  constructor(dir, defaultShelfName = 'Shelf 1') {
    this.dir = dir;
    this.file = path.join(dir, 'shelves.json');
    this.settingsFile = path.join(dir, 'settings.json');
    this.historyFile = path.join(dir, 'history.json');
    this.history = [];          // everything that ever landed on a shelf, newest first: { p, added, pinned }
    this.ocrFile = path.join(dir, 'ocr.json');
    this.ocr = {};              // recognised text per image: path → { m: mtime, t: text }
    this.rules = [];            // smart shelves: [{ id, kind: 'ext' | 'name', value, shelf: shelfId }]
    this.undoStack = []; this.redoStack = [];
    this.shelves = [];
    this.defaultShelfName = defaultShelfName;
    this.active = 0;
    this.settings = { ...DEFAULT_SETTINGS };
    this._t = null;
    fs.mkdirSync(dir, { recursive: true });
    this.load();
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.shelves = (j.shelves || []).map(s => ({
        id: typeof s.id === 'string' ? s.id : randomUUID(),
        delivery: s.delivery && typeof s.delivery === 'object' ? s.delivery : null,
        name: String(s.name || 'Shelf'),
        items: (s.items || []).filter(i => i && i.p).map(i => ({ p: i.p, done: !!i.done, added: i.added || Date.now() }))
      }));
      this.active = Math.max(0, Math.min(j.active | 0, this.shelves.length - 1));
    } catch (_) { /* first run */ }
    if (!this.shelves.length) this.shelves = [{ id: randomUUID(), name: this.defaultShelfName, delivery: null, items: [] }];
    try { Object.assign(this.settings, JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'))); } catch (_) { /* defaults */ }
    try { this.history = (JSON.parse(fs.readFileSync(this.historyFile, 'utf8')).items || []).filter(h => h && typeof h.p === 'string').map(h => ({ p: h.p, added: h.added || Date.now(), pinned: !!h.pinned })); } catch (_) { /* no history yet */ }
    try { this.ocr = JSON.parse(fs.readFileSync(this.ocrFile, 'utf8')).items || {}; } catch (_) { /* no OCR yet */ }
    try { this.rules = (JSON.parse(fs.readFileSync(this.file, 'utf8')).rules || []).filter(r => r && r.value && r.shelf); } catch (_) { /* no rules */ }
    this.expireHistory();
  }

  _write(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 120);
  }
  flush() {
    clearTimeout(this._t);
    try {
      this._write(this.file, { version: 1, active: this.active, shelves: this.shelves, rules: this.rules });
      this._write(this.settingsFile, this.settings);
      this._write(this.historyFile, { version: 1, items: this.history });
      this._write(this.ocrFile, { version: 1, items: this.ocr });
    } catch (e) { console.error('save failed', e); }
  }

  get cur() { return this.shelves[this.active]; }
  total() { return this.shelves.reduce((n, s) => n + s.items.length, 0); }

  setSetting(k, v) { if (k === 'language' && !['auto', 'en', 'km'].includes(v)) return; this.settings[k] = v; this.save(); }

  addPaths(shelf, paths) {
    const s = this.shelves[shelf]; if (!s) return 0;
    let n = 0;
    for (const p of paths) {
      if (!p || s.items.some(i => i.p === p)) continue;
      s.items.push({ p, done: false, added: Date.now() }); n++;
      this.remember(p);
    }
    if (n) this.save();
    return n;
  }
  removePaths(shelf, paths) {
    const s = this.shelves[shelf]; if (!s) return;
    const set = new Set(paths);
    s.items = s.items.filter(i => !set.has(i.p)); this.save();
  }
  toggleDone(shelf, index) {
    const it = this.shelves[shelf] && this.shelves[shelf].items[index];
    if (it) { it.done = !it.done; this.save(); }
  }
  clearShelf(shelf) { if (this.shelves[shelf]) { this.shelves[shelf].items = []; this.save(); } }
  clearDone(shelf) { const s = this.shelves[shelf]; if (s) { s.items = s.items.filter(i => !i.done); this.save(); } }
  clearAll() { this.shelves.forEach(s => (s.items = [])); this.save(); }
  newShelf(nameFor = n => 'Shelf ' + n) {
    let n = this.shelves.length + 1; const names = new Set(this.shelves.map(s => s.name));
    while (names.has(nameFor(n))) n++;
    this.shelves.push({ id: randomUUID(), name: nameFor(n), delivery: null, items: [] }); this.save();
    return this.shelves.length - 1;
  }
  deleteShelf(i) {
    if (this.shelves.length < 2 || !this.shelves[i]) return;
    this.shelves.splice(i, 1);
    this.active = Math.max(0, Math.min(this.active, this.shelves.length - 1)); this.save();
  }
  renameShelf(i, name) {
    name = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(name || '').trim())].slice(0, 256).map(part => part.segment).join('');
    if (name && this.shelves[i]) { this.shelves[i].name = name; this.save(); }
  }
  setActive(i) { if (this.shelves[i]) { this.active = i; this.save(); } }
  // ── history: every item added to a shelf, newest first. Pinned entries stay on top and are never pruned.
  remember(p) {
    const old = this.history.find(h => h.p === p);
    this.history = this.history.filter(h => h.p !== p);
    this.history.unshift({ p, added: Date.now(), pinned: !!(old && old.pinned) });
    this.pruneHistory(); this.save();
  }
  pruneHistory(limit = Store.HISTORY_LIMIT) {
    let unpinned = 0;
    this.history = this.history.filter(h => h.pinned || ++unpinned <= limit);
  }
  historyView() { return [...this.history.filter(h => h.pinned), ...this.history.filter(h => !h.pinned)]; }
  togglePin(p) { const h = this.history.find(x => x.p === p); if (h) { h.pinned = !h.pinned; this.save(); } return !!(h && h.pinned); }
  forget(paths) { const set = new Set(paths); this.history = this.history.filter(h => !set.has(h.p)); this.save(); }
  clearHistory() { this.history = this.history.filter(h => h.pinned); this.save(); }

  expireHistory(now = Date.now()) {
    const days = Number(this.settings.historyDays) || 0; if (!days) return;
    const cutoff = now - days * 864e5;
    this.history = this.history.filter(h => h.pinned || h.added >= cutoff);
  }

  // ── OCR text cache
  ocrText(p, mtime) { const o = this.ocr[p]; return o && o.m === mtime ? o.t : null; }
  setOcrText(p, mtime, text) { this.ocr[p] = { m: mtime, t: String(text || '') }; this.save(); }
  ocrOf(p) { return this.ocr[p] ? this.ocr[p].t : ''; }

  // ── smart shelves: the first matching rule decides where a new item lands
  ruleTarget(p) {
    const ext = path.extname(p).slice(1).toLowerCase(), name = path.basename(p).toLowerCase();
    for (const r of this.rules) {
      const values = String(r.value).toLowerCase().split(/[,\s]+/).filter(Boolean).map(v => v.replace(/^\./, ''));
      const hit = r.kind === 'ext' ? values.includes(ext) : values.some(v => name.includes(v));
      const shelf = this.shelves.findIndex(s => s.id === r.shelf);
      if (hit && shelf >= 0) return shelf;
    }
    return -1;
  }
  addRouted(paths, fallback = this.active) {
    const groups = new Map();
    for (const p of paths) { const t = this.ruleTarget(p); const i = t >= 0 ? t : fallback; groups.set(i, [...(groups.get(i) || []), p]); }
    let n = 0; for (const [i, ps] of groups) n += this.addPaths(i, ps);
    return { added: n, shelves: [...groups.keys()] };
  }
  setRules(rules) {
    this.rules = (Array.isArray(rules) ? rules : []).filter(r => r && ['ext', 'name'].includes(r.kind) && String(r.value || '').trim() && this.shelves.some(s => s.id === r.shelf))
      .map(r => ({ id: r.id || randomUUID(), kind: r.kind, value: String(r.value).trim().slice(0, 200), shelf: r.shelf }));
    this.save();
  }

  // ── backup: everything in one JSON document
  exportBackup() { return { app: 'Drag Shelf', version: 1, exported: new Date().toISOString(), active: this.active, shelves: this.shelves, rules: this.rules, history: this.history, settings: this.settings }; }
  importBackup(j) {
    if (!j || j.app !== 'Drag Shelf' || !Array.isArray(j.shelves)) throw new Error('Not a Drag Shelf backup');
    this.checkpoint();
    this.shelves = j.shelves.map(s => ({ id: typeof s.id === 'string' ? s.id : randomUUID(), name: String(s.name || 'Shelf'), delivery: s.delivery && typeof s.delivery === 'object' ? s.delivery : null, items: (s.items || []).filter(i => i && i.p).map(i => ({ p: String(i.p), done: !!i.done, added: i.added || Date.now() })) }));
    if (!this.shelves.length) this.shelves = [{ id: randomUUID(), name: this.defaultShelfName, delivery: null, items: [] }];
    this.active = Math.max(0, Math.min(j.active | 0, this.shelves.length - 1));
    this.history = (j.history || []).filter(h => h && typeof h.p === 'string').map(h => ({ p: h.p, added: h.added || Date.now(), pinned: !!h.pinned }));
    this.rules = []; this.setRules(j.rules || []);
    const keep = ['language', 'theme', 'accent', 'strict', 'moveOnDragOut', 'captureScale', 'ocrAuto', 'ocrMode', 'skipConcealed', 'historyDays', 'autoPaste'];
    for (const [k, v] of Object.entries(j.settings || {})) if (keep.includes(k)) this.settings[k] = v;
    this.save();
  }

  // ── undo / redo for shelf changes. checkpoint() is called before every change that should be undoable.
  _snap() { return JSON.stringify({ active: this.active, shelves: this.shelves }); }
  _restore(snap) { const j = JSON.parse(snap); this.shelves = j.shelves; this.active = Math.min(j.active, this.shelves.length - 1); this.save(); }
  checkpoint() {
    const snap = this._snap();
    if (this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap); if (this.undoStack.length > Store.UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }
  // Drops the last checkpoint when the change it guarded turned out to be a no-op.
  settle() { if (this.undoStack[this.undoStack.length - 1] === this._snap()) this.undoStack.pop(); }
  undo() { if (!this.undoStack.length) return false; this.redoStack.push(this._snap()); this._restore(this.undoStack.pop()); return true; }
  redo() { if (!this.redoStack.length) return false; this.undoStack.push(this._snap()); this._restore(this.redoStack.pop()); return true; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // Replace the item at `index` with `paths` (used when a text item is split into several items).
  replaceItem(shelf, index, paths) {
    const s = this.shelves[shelf]; if (!s || !s.items[index]) return;
    const fresh = paths.filter(p => !s.items.some(i => i.p === p)).map(p => ({ p, done: false, added: Date.now() }));
    s.items.splice(index, 1, ...fresh); fresh.forEach(i => this.remember(i.p)); this.save();
  }

  // move the items at `paths` (from shelf `from`) so that they sit before position `to` of shelf `toShelf`
  moveItems(from, paths, toShelf, to) {
    const src = this.shelves[from], dst = this.shelves[toShelf]; if (!src || !dst) return;
    const set = new Set(paths);
    const moving = src.items.filter(i => set.has(i.p));
    if (!moving.length) return;
    if (from === toShelf) {
      const before = src.items.slice(0, to).filter(i => set.has(i.p)).length;
      src.items = src.items.filter(i => !set.has(i.p));
      const at = Math.max(0, Math.min(to - before, src.items.length));
      src.items.splice(at, 0, ...moving);
    } else {
      src.items = src.items.filter(i => !set.has(i.p));
      dst.items = dst.items.filter(i => !set.has(i.p));
      const at = Math.max(0, Math.min(to == null ? dst.items.length : to, dst.items.length));
      dst.items.splice(at, 0, ...moving);
    }
    this.save();
  }
}

Store.HISTORY_LIMIT = 300;
Store.UNDO_LIMIT = 50;

module.exports = { Store, DEFAULT_SETTINGS };
