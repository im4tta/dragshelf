'use strict';
// Persistent state: shelves (+ items) and settings, stored as JSON in the user-data folder.
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  accent: 'yellow',
  hotkey: process.platform === 'win32' ? 'Control+Shift+F' : 'Alt+Shift+S',
  strict: true,             // only pop up when a real file drag is in progress
  moveOnDragOut: true,      // items leave the shelf once dropped somewhere else (hold ⌥ to copy)
  guideDone: false,
  asked: false              // already asked for the Accessibility permission once
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'shelves.json');
    this.settingsFile = path.join(dir, 'settings.json');
    this.shelves = [];
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
        name: String(s.name || 'Shelf'),
        items: (s.items || []).filter(i => i && i.p).map(i => ({ p: i.p, done: !!i.done, added: i.added || Date.now() }))
      }));
      this.active = Math.max(0, Math.min(j.active | 0, this.shelves.length - 1));
    } catch (_) { /* first run */ }
    if (!this.shelves.length) this.shelves = [{ name: 'Shelf 1', items: [] }];
    try { Object.assign(this.settings, JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'))); } catch (_) { /* defaults */ }
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
      this._write(this.file, { version: 1, active: this.active, shelves: this.shelves });
      this._write(this.settingsFile, this.settings);
    } catch (e) { console.error('save failed', e); }
  }

  get cur() { return this.shelves[this.active]; }
  total() { return this.shelves.reduce((n, s) => n + s.items.length, 0); }

  setSetting(k, v) { this.settings[k] = v; this.save(); }

  addPaths(shelf, paths) {
    const s = this.shelves[shelf]; if (!s) return 0;
    let n = 0;
    for (const p of paths) {
      if (!p || s.items.some(i => i.p === p)) continue;
      s.items.push({ p, done: false, added: Date.now() }); n++;
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
  newShelf() {
    let n = this.shelves.length + 1; const names = new Set(this.shelves.map(s => s.name));
    while (names.has('Shelf ' + n)) n++;
    this.shelves.push({ name: 'Shelf ' + n, items: [] }); this.save();
    return this.shelves.length - 1;
  }
  deleteShelf(i) {
    if (this.shelves.length < 2 || !this.shelves[i]) return;
    this.shelves.splice(i, 1);
    this.active = Math.max(0, Math.min(this.active, this.shelves.length - 1)); this.save();
  }
  renameShelf(i, name) {
    name = String(name || '').trim().slice(0, 24);
    if (name && this.shelves[i]) { this.shelves[i].name = name; this.save(); }
  }
  setActive(i) { if (this.shelves[i]) { this.active = i; this.save(); } }
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

module.exports = { Store, DEFAULT_SETTINGS };
