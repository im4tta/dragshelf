'use strict';
// Detects "a file is being dragged and the user shook the mouse / pushed it against a screen edge".
// Uses a global mouse hook (uiohook-napi → needs the macOS Accessibility permission) plus, in strict mode,
// a look at the system drag pasteboard so that dragging a window or selecting text does not trigger the shelf.
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const { screen } = require('electron');

const DRAG_THRESHOLD = 8;        // px before a press counts as a drag
const SHAKE_REVERSAL_PX = 40;    // each direction change must travel this far…
const SHAKE_COUNT = 3;           // …this many times…
const SHAKE_WINDOW_MS = 1200;    // …within this time.

const JXA = `
ObjC.import('AppKit');
var pb = $.NSPasteboard.pasteboardWithName('Apple CFPasteboard drag');
var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
JSON.stringify({
  cc: pb.changeCount,
  name: app ? ObjC.unwrap(app.localizedName) : '',
  id: app ? ObjC.unwrap(app.bundleIdentifier) : ''
});`;

// Reads { cc: dragPasteboardChangeCount, name, id: frontmostApp } – null when unavailable (non-mac, error).
function systemSnapshot() {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise(resolve => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA], { timeout: 2500 }, (err, out, errOut) => {
      if (err) return resolve(null);
      const m = String(out + '\n' + errOut).match(/\{[^{}]*\}/);
      try { resolve(m ? JSON.parse(m[0]) : null); } catch (_) { resolve(null); }
    });
  });
}

class DragWatch extends EventEmitter {
  constructor() {
    super();
    this.hook = null; this.started = false;
    this.tracking = false; this.fired = false;
    this.p0 = { x: 0, y: 0 }; this.last = { x: 0, y: 0 };
    this.dir = 0; this.ext = 0; this.rev = 0; this.revT = 0; this.revFirst = 0;
    this.baseline = null;     // Promise of the pasteboard snapshot taken at mouse-down
    this.strict = true;
  }

  start() {
    if (this.started) return true;
    try {
      const { uIOhook } = require('uiohook-napi');
      this.hook = uIOhook;
      uIOhook.on('mousedown', e => this._down(e));
      uIOhook.on('mouseup', e => this._up(e));
      uIOhook.on('mousemove', e => this._move(e));
      uIOhook.on('keydown', e => { if (e.keycode === 1) this.emit('escape'); });
      uIOhook.start();
      this.started = true;
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }
  stop() { try { if (this.started && this.hook) this.hook.stop(); } catch (_) { /* ignore */ } this.started = false; }

  _down(e) {
    this.tracking = true; this.fired = false;
    this.p0 = this.last = { x: e.x, y: e.y }; this.dir = 0; this.rev = 0;
    this.baseline = this.strict ? systemSnapshot() : null;
  }
  _up(e) {
    if (this.tracking) { this.tracking = false; this.emit('mouseup', { x: e.x, y: e.y, altKey: e.altKey }); }
  }
  _fire(pt) {
    if (this.fired) return; this.fired = true;
    const baseline = this.baseline;
    this.emit('trigger', pt, baseline);
  }
  _move(e) {
    if (!this.tracking || this.fired) return;
    const pt = { x: e.x, y: e.y };
    const dx = pt.x - this.p0.x, dy = pt.y - this.p0.y, mdx = pt.x - this.last.x;
    this.last = pt;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

    // 1. pushed against an outer screen edge (not a shared edge between two monitors)
    const d = screen.getDisplayNearestPoint(pt), b = d.bounds; let probe = null;
    if (pt.x <= b.x + 1) probe = { x: pt.x - 4, y: pt.y };
    else if (pt.x >= b.x + b.width - 2) probe = { x: pt.x + 4, y: pt.y };
    else if (pt.y <= b.y + 1) probe = { x: pt.x, y: pt.y - 4 };
    else if (pt.y >= b.y + b.height - 2) probe = { x: pt.x, y: pt.y + 4 };
    if (probe && !screen.getAllDisplays().some(o => probe.x >= o.bounds.x && probe.x < o.bounds.x + o.bounds.width && probe.y >= o.bounds.y && probe.y < o.bounds.y + o.bounds.height)) {
      return this._fire(pt);
    }
    // 2. shake: three direction reversals of 40+ px within ~1.2 s
    if (mdx !== 0) {
      const dir = mdx > 0 ? 1 : -1, now = Date.now();
      if (this.dir === 0) { this.dir = dir; this.ext = pt.x; }
      else if (dir === this.dir) this.ext = pt.x;
      else if (Math.abs(pt.x - this.ext) >= SHAKE_REVERSAL_PX) {
        if (this.rev === 0 || now - this.revT > 500) { this.rev = 1; this.revFirst = now; } else this.rev++;
        this.revT = now; this.dir = dir; this.ext = pt.x;
        if (this.rev >= SHAKE_COUNT && now - this.revFirst < SHAKE_WINDOW_MS) this._fire(pt);
      }
    }
  }
}

module.exports = { DragWatch, systemSnapshot };
