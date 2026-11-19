'use strict';
const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, nativeTheme, shell, systemPreferences, clipboard, dialog, net, desktopCapturer
} = require('electron');

const { Store } = require('./store');
const { describe, EXT_TO_KIND } = require('./meta');
const { Stash } = require('./stash');
const { PhoneServer } = require('./phone');
const { DragWatch, systemSnapshot } = require('./dragwatch');
const I18N = require('../shared/i18n');
const { Delivery } = require('./delivery');
const { ClipWatcher } = require('./clipwatch');
const TextOps = require('../shared/textops');
let clipWatch = null;
let updates;
function language() { return I18N.resolveLanguage(store && store.settings.language, app.getLocale()); }
function tr(key, values) { return I18N.t(language(), key, values); }
function localizedMeta(meta) {
  const keys = { Missing: 'missing', Folder: 'folder', App: 'app', File: 'file', Link: 'link', Text: 'text' };
  const details = { 'Moved or deleted': 'moved', 'Web link': 'webLink' };
  let detail = details[meta.detail] ? tr(details[meta.detail]) : meta.detail;
  if (language() === 'km' && /^\d+(\.\d+)? (B|KB|MB|GB|TB)$/.test(detail || '')) detail = detail.replace(/^\d+(\.\d+)?/, value => I18N.number('km', Number(value)));
  return { ...meta, label: keys[meta.label] ? tr(keys[meta.label]) : meta.label, detail };
}
function windowQuery() { return { lang: language() }; }
function updateLanguage() {
  if (phone) phone.language = language;
  if (guideWin) guideWin.setTitle(tr('welcome'));
  if (phoneWin) phoneWin.setTitle(tr('phoneTitle'));
  if (keyWin) keyWin.setTitle(tr('shortcutTitle'));
  if (deliveryWin) deliveryWin.setTitle(tr('prepareDelivery'));
  app.setAboutPanelOptions({ applicationName: 'Drag Shelf', applicationVersion: app.getVersion(), copyright: 'MIT License', credits: tr('tagline') });
  pushState();
}

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const TEST = !!process.env.DRAGSHELF_TEST;
const CARD_W = 320, PAD = 18, WIN_W = CARD_W + PAD * 2;
const R = p => path.join(__dirname, '..', 'renderer', p);
const B = p => path.join(__dirname, '..', '..', 'build', p);

app.setName('Drag Shelf');
if (IS_WIN) app.setAppUserModelId('com.santhon.dragshelf');
if (process.env.DRAGSHELF_USER_DATA) app.setPath('userData', process.env.DRAGSHELF_USER_DATA);
if (!TEST && !app.requestSingleInstanceLock()) { app.quit(); }

let store, stash, phone, watch, delivery;
let deliveryWin = null, deliveryShelfId = '', deliveryJobs = null;
let shelfWin = null, phoneWin = null, guideWin = null, keyWin = null, tray = null;
let pinned = false;               // opened from tray / hotkey → don't auto-hide when empty
let dragOut = null;               // { shelf, paths, cancelled } while we are the drag source
let lastApp = '';
let hooksOn = false;
let moveStart = null;
let dragIcon = null;
let testWorkArea = null;
function workAreaAt(pt = screen.getCursorScreenPoint()) { return (TEST && testWorkArea) || screen.getDisplayNearestPoint(pt).workArea; }

// ───────────────────────────────────────────────────────── helpers
const clamp = (v, a, b) => Math.max(a, Math.min(v, Math.max(a, b)));
const SYMS = { Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘', Meta: '⌘' };
function accelLabel(a) {
  const parts = String(a).split('+'); const key = parts.pop();
  const order = ['Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Command', 'Cmd', 'CommandOrControl', 'Super', 'Meta'];
  const mods = parts.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  if (IS_MAC || process.env.DRAGSHELF_MAC_LABELS) return mods.map(m => SYMS[m] || m).join('') + (key.length === 1 ? key.toUpperCase() : key);
  const labels = { CommandOrControl: 'Ctrl', Control: 'Ctrl', Super: 'Win', Meta: 'Win', Option: 'Alt' };
  return [...mods.map(m => labels[m] || m), key].join('+');
}
function excludedFile() { return path.join(app.getPath('userData'), 'excluded.txt'); }
function ensureExcluded() {
  if (!fs.existsSync(excludedFile())) {
    fs.writeFileSync(excludedFile(), IS_WIN ? '# Apps where Drag Shelf must never pop up. One executable name per line.\n# Example:\n# POWERPNT.EXE\n' : '# Apps where Drag Shelf must never pop up. One per line: the app name or bundle id.\n# Example:\n# Keynote\n# com.apple.dt.Xcode\n');
  }
}
function isExcluded(snap) {
  try {
    const want = [snap.name, snap.id].filter(Boolean).map(s => s.toLowerCase());
    return fs.readFileSync(excludedFile(), 'utf8').split(/\r?\n/).map(l => l.trim().toLowerCase()).some(l => l && !l.startsWith('#') && want.includes(l));
  } catch (_) { return false; }
}

// ───────────────────────────────────────────────────────── state → renderer
let pushing = null;
async function buildState() {
  const shelves = await Promise.all(store.shelves.map(async s => ({
    id: s.id,
    name: s.name,
    items: await Promise.all(s.items.map(async it => ({ ...localizedMeta(await describe(it.p)), done: it.done, added: it.added, editable: isTextFile(it.p) })))
  })));
  const st = store.settings;
  return {
    viewport: { maxCardHeight: workAreaAt(shelfWin ? { x: shelfWin.getBounds().x + PAD, y: shelfWin.getBounds().y + PAD } : undefined).height - 2 * PAD - 12 },
    shelves, active: store.active, platform: process.platform, language: language(),
    settings: { theme: st.theme, accent: st.accent, hotkey: st.hotkey, hotkeyLabel: accelLabel(st.hotkey), strict: st.strict, moveOnDragOut: st.moveOnDragOut, autoPaste: !!st.autoPaste, captureScale: st.captureScale },
    canUndo: store.canUndo, canRedo: store.canRedo,
    phone: !!(phone && phone.running), hooks: hooksOn
  };
}
function pushState() {
  clearTimeout(pushing);
  pushing = setTimeout(async () => {
    const s = await buildState();
    for (const w of [shelfWin, phoneWin, guideWin, keyWin, deliveryWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
    refreshTrayTitle();
  }, 16);
}
function applyTheme() { nativeTheme.themeSource = store.settings.theme === 'auto' ? 'system' : store.settings.theme; }

function openDelivery() {
  if (deliveryWin && !deliveryWin.isDestroyed()) { deliveryWin.show(); deliveryWin.focus(); return; }
  deliveryShelfId = store.cur.id;
  const wa = workAreaAt(), width = Math.min(1160, wa.width - 24), height = Math.min(820, wa.height - 36);
  deliveryWin = new BrowserWindow({ width, height, minWidth: Math.min(640, width), minHeight: Math.min(420, height),
    x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2),
    show: false, frame: false, resizable: true, icon: B('icon.png'), title: tr('prepareDelivery'), backgroundColor: '#242520',
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  deliveryWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  deliveryWin.webContents.on('will-navigate', event => event.preventDefault());
  deliveryWin.loadFile(R('delivery.html'), { query: windowQuery() });
  deliveryWin.once('ready-to-show', () => { shelfWin.hide(); deliveryWin.show(); deliveryWin.focus(); });
  deliveryWin.on('closed', () => { deliveryWin = null; if (deliveryJobs) deliveryJobs.cancel(); });
}

// ───────────────────────────────────────────────────────── clipboard, capture, history, text tools
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'log', 'json', 'yml', 'yaml', 'xml', 'html', 'css', 'js', 'ts', 'sql', 'ini']);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
function isTextFile(p) {
  if (!TEXT_EXT.has(path.extname(p).slice(1).toLowerCase())) return false;
  try { const st = fs.statSync(p); return st.isFile() && st.size <= MAX_TEXT_BYTES; } catch (_) { return false; }
}
// Puts whatever was copied onto the active shelf: files by reference, images and text saved to the stash.
function addClipboard(snap) {
  if (!snap || !snap.kind) return 0;
  let paths = [];
  if (snap.kind === 'files') paths = snap.paths.filter(p => fs.existsSync(p));
  else if (snap.kind === 'image') paths = [stash.saveBlob(`Image ${require('./stash').timestamp()}.${(snap.mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '')}`, snap.data)];
  else if (/^https?:\/\/\S+$/i.test(snap.text.trim())) paths = [stash.saveUrl(snap.text.trim())];
  else if (snap.text.trim()) paths = [stash.saveText(snap.text)];
  if (!paths.length) return 0;
  store.checkpoint(); const n = store.addPaths(store.active, paths); store.settle(); pushState();
  return n;
}
function ensureClipWatch() { if (!clipWatch) clipWatch = new ClipWatcher({ clipboard, onCopy: addClipboard }); return clipWatch; }
function setAutoPaste(on) {
  store.setSetting('autoPaste', !!on);
  if (on) ensureClipWatch().start(); else if (clipWatch) clipWatch.stop();
  pushState();
}
async function pasteNow() { return addClipboard(await ensureClipWatch().safeRead()); }
// Writes to the clipboard without auto-paste picking it straight back up.
async function copyOut(write) { await write(); if (clipWatch) await clipWatch.resync(); }
async function copyItem(p) {
  const { ClipboardItem } = require('electron');
  const kind = EXT_TO_KIND[path.extname(p).slice(1).toLowerCase()];
  if (isTextFile(p)) return copyOut(() => clipboard.writeText(fs.readFileSync(p, 'utf8')));
  if (kind === 'image' && fs.existsSync(p)) {
    const png = nativeImage.createFromPath(p).toPNG();
    if (png.length) return copyOut(() => clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]));
  }
  return copyOut(() => clipboard.writeText(p));
}

// Screenshot of the display under the cursor at 1–4× its logical size, added to the active shelf.
async function captureScreen() {
  const scale = Math.min(4, Math.max(1, Number(store.settings.captureScale) || 2));
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wasVisible = shelfWin && shelfWin.isVisible();
  if (wasVisible) shelfWin.hide();
  await new Promise(r => setTimeout(r, 250)); // let the shelf disappear before grabbing the screen
  try {
    const factor = Math.max(display.scaleFactor, scale);
    const thumbnailSize = { width: Math.round(display.size.width * factor), height: Math.round(display.size.height * factor) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source = sources.find(s => String(s.display_id) === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error(tr(IS_MAC ? 'captureDeniedMac' : 'captureFailed'));
    let image = source.thumbnail;
    const target = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
    if (image.getSize().width < target.width) image = image.resize({ ...target, quality: 'best' });
    const file = stash.saveBlob(`Screenshot ${require('./stash').timestamp()}@${scale}x.png`, image.toPNG());
    store.checkpoint(); store.addPaths(store.active, [file]); pushState();
    return { path: file, ...image.getSize() };
  } finally { if (wasVisible) shelfWin.showInactive(); }
}

function historyEntries() {
  return store.historyView().map(h => {
    const ext = path.extname(h.p).slice(1).toLowerCase(), exists = fs.existsSync(h.p);
    let preview = '';
    if (exists && isTextFile(h.p)) { try { const fd = fs.openSync(h.p, 'r'), buf = Buffer.alloc(240); const n = fs.readSync(fd, buf, 0, 240, 0); fs.closeSync(fd); preview = buf.subarray(0, n).toString('utf8').replace(/�$/, '').replace(/\s+/g, ' ').trim(); } catch (_) { /* unreadable */ } }
    return { path: h.p, name: path.basename(h.p), kind: exists ? EXT_TO_KIND[ext] || (fs.statSync(h.p).isDirectory() ? 'folder' : 'file') : 'missing', exists, added: h.added, pinned: h.pinned, preview, onShelf: store.cur.items.some(i => i.p === h.p) };
  });
}

// Split one text item into several, or merge every text item on the shelf into one.
function splitTextItem(index, separator, opts) {
  const it = store.cur.items[index]; if (!it || !isTextFile(it.p)) return 0;
  const parts = TextOps.splitParts(fs.readFileSync(it.p, 'utf8'), separator, opts);
  if (parts.length < 2) return parts.length;
  store.checkpoint(); store.replaceItem(store.active, index, parts.map(part => stash.saveText(part))); pushState();
  return parts.length;
}
function mergeTextItems(separator, opts) {
  const items = store.cur.items.filter(i => isTextFile(i.p));
  if (items.length < 2) return 0;
  const merged = stash.saveText(TextOps.mergeParts(items.map(i => fs.readFileSync(i.p, 'utf8')), separator, opts));
  const first = store.cur.items.indexOf(items[0]);
  store.checkpoint();
  store.removePaths(store.active, items.slice(1).map(i => i.p));
  store.replaceItem(store.active, store.cur.items.indexOf(items[0]) === -1 ? first : store.cur.items.indexOf(items[0]), [merged]);
  pushState();
  return items.length;
}

// ───────────────────────────────────────────────────────── shelf window
function createShelfWindow() {
  shelfWin = new BrowserWindow({
    width: WIN_W, height: 260, show: false, frame: false, transparent: true, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, fullscreenable: false, minimizable: false, maximizable: false,
    backgroundColor: '#00000000', title: 'Drag Shelf', ...(IS_MAC ? { type: 'panel' } : {}),
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  shelfWin.setAlwaysOnTop(true, 'screen-saver');
  if (IS_MAC) shelfWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  shelfWin.loadFile(R('shelf.html'), { query: { ...windowQuery(), ...(TEST ? { test: '1' } : {}) } });
  shelfWin.webContents.on('did-finish-load', pushState);
  shelfWin.on('closed', () => { shelfWin = null; });
}
function placeCard(x, y) {      // x,y = top-left of the visible card
  const wa = workAreaAt({ x, y });
  const h = shelfWin.getBounds().height - 2 * PAD;
  shelfWin.setPosition(Math.round(clamp(x, wa.x + 6, wa.x + wa.width - CARD_W - 6) - PAD), Math.round(clamp(y, wa.y + 6, wa.y + wa.height - h - 6) - PAD));
}
function showShelfAt(pt, pin) {
  const wa = workAreaAt(pt), h = shelfWin.getBounds().height - 2 * PAD;
  let x = pt.x + 28; if (x + CARD_W > wa.x + wa.width) x = pt.x - CARD_W - 28;
  placeCard(x, pt.y - Math.round(h / 3));
  pinned = pin; pushState(); shelfWin.showInactive();
}
function showShelfAtTray() {
  const b = tray.getBounds();
  if (!b || !b.width) return showShelfAt(screen.getCursorScreenPoint(), true);
  pinned = true; placeCard(b.x + b.width / 2 - CARD_W / 2, b.y + b.height + 6);
  pushState(); shelfWin.showInactive();
}
function hideShelf() { closePhone(); if (shelfWin) shelfWin.hide(); pinned = false; }
function toggleShelf(fromTray) {
  if (shelfWin.isVisible()) return hideShelf();
  if (fromTray && tray) showShelfAtTray(); else showShelfAt(screen.getCursorScreenPoint(), true);
}
function autoHideIfEmpty() {
  if (shelfWin && shelfWin.isVisible() && !pinned && !dragOut && store.total() === 0 && !(phoneWin && !phoneWin.isDestroyed())) hideShelf();
}

// ───────────────────────────────────────────────────────── drag detection
function startWatching() {
  watch = new DragWatch(); watch.strict = store.settings.strict;
  watch.on('error', err => console.warn('drag hook unavailable:', err && err.message));
  watch.on('trigger', async (pt, baselineP) => {
    if (!shelfWin || shelfWin.isVisible()) return;
    let snap = null, base = null;
    [snap, base] = await Promise.all([systemSnapshot(), baselineP || Promise.resolve(null)]);
    if (snap && (snap.suppressed || (IS_WIN && store.settings.strict && !snap.dragging))) return;
    if (store.settings.strict && snap && base && snap.cc === base.cc) return;   // not a real drag session
    if (snap) { lastApp = snap.name || lastApp; if (isExcluded(snap)) return; }
    if (!watch.tracking) return;                                                  // already released
    showShelfAt(pt, false);
  });
  watch.on('mouseup', ({ x, y, altKey }) => {
    if (dragOut) {
      const d = dragOut; dragOut = null;
      const b = shelfWin.getBounds();
      const inside = shelfWin.isVisible() && x >= b.x + PAD && x <= b.x + b.width - PAD && y >= b.y + PAD && y <= b.y + b.height - PAD;
      shelfWin.webContents.send('drag:ended', { inside });
      if (!inside && !d.cancelled && store.settings.moveOnDragOut && !altKey) { store.checkpoint(); store.removePaths(d.shelf, d.paths); pushState(); }
    }
    setTimeout(autoHideIfEmpty, 350);
  });
  watch.on('escape', () => { if (dragOut) dragOut.cancelled = true; });
  tryStartHook();
}
function tryStartHook() {
  if (TEST) return;
  if (IS_MAC) {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      if (!store.settings.asked) { store.setSetting('asked', true); systemPreferences.isTrustedAccessibilityClient(true); }
      const t = setInterval(() => { if (systemPreferences.isTrustedAccessibilityClient(false)) { clearInterval(t); hooksOn = watch.start(); pushState(); } }, 2000);
      return;
    }
  }
  hooksOn = watch.start();
}

// ───────────────────────────────────────────────────────── hotkey
function registerHotkey(accel) { try { return globalShortcut.register(accel, () => { if (shelfWin.isVisible()) hideShelf(); else toggleShelf(false); }); } catch (_) { return false; } }

function openShortcutWindow() {
  if (keyWin && !keyWin.isDestroyed()) { keyWin.focus(); return; }
  globalShortcut.unregister(store.settings.hotkey);
  const wa = workAreaAt();
  keyWin = new BrowserWindow({
    width: 380, height: 220, x: Math.round(wa.x + (wa.width - 380) / 2), y: Math.round(wa.y + (wa.height - 220) / 2),
    frame: false, transparent: true, resizable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true }
  });
  keyWin.loadFile(R('shortcut.html'), { query: windowQuery() });
  keyWin.once('ready-to-show', () => { keyWin.show(); keyWin.focus(); });
  keyWin.on('closed', () => { keyWin = null; if (!globalShortcut.isRegistered(store.settings.hotkey)) registerHotkey(store.settings.hotkey); });
}

// ───────────────────────────────────────────────────────── phone window
async function openPhone() {
  if (phoneWin && !phoneWin.isDestroyed()) return closePhone();
  let info;
  try { info = await phone.start(); } catch (_) {
    const { dialog } = require('electron');
    dialog.showMessageBox({ type: 'info', message: tr('noNetwork'), detail: tr('networkHelp'), buttons: [tr('ok')] });
    return;
  }
  if (!shelfWin.isVisible()) showShelfAt(screen.getCursorScreenPoint(), true); else pinned = true;
  const sb = shelfWin.getBounds(), wa = workAreaAt({ x: sb.x + PAD, y: sb.y + PAD }), W = 300 + 2 * 14, H = Math.min(484 + 2 * 14, wa.height - 12);
  let x = sb.x + sb.width - PAD + 10 - 14; if (x + W > wa.x + wa.width) x = sb.x + PAD - 10 - W + 14;
  const y = clamp(sb.y + PAD - 14, wa.y, wa.y + wa.height - H);
  phoneWin = new BrowserWindow({
    width: W, height: H, x: Math.round(clamp(x, wa.x, wa.x + wa.width - W)), y: Math.round(y), frame: false, transparent: true, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, backgroundColor: '#00000000', ...(IS_MAC ? { type: 'panel' } : {}),
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true }
  });
  phoneWin.setAlwaysOnTop(true, 'screen-saver');
  if (IS_MAC) phoneWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  phoneWin.loadFile(R('phone.html'), { query: windowQuery() });
  phoneWin.once('ready-to-show', () => phoneWin.showInactive());
  phoneWin.on('closed', () => { phoneWin = null; phone.stop(); pushState(); setTimeout(autoHideIfEmpty, 100); });
  pushState();
}
function closePhone() { if (phoneWin && !phoneWin.isDestroyed()) phoneWin.close(); else phone.stop(); }

// ───────────────────────────────────────────────────────── guide
function openGuide() {
  if (guideWin && !guideWin.isDestroyed()) { guideWin.focus(); return; }
  const wa = workAreaAt(), W = Math.min(560, wa.width - 24), H = Math.min(560, wa.height - 60);
  guideWin = new BrowserWindow({
    useContentSize: true, autoHideMenuBar: true, icon: B('icon.png'),
    width: W, height: H, x: Math.round(wa.x + (wa.width - W) / 2), y: Math.round(wa.y + (wa.height - H - 32) / 2), show: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    title: tr('welcome'), titleBarStyle: IS_MAC ? 'hiddenInset' : 'default', backgroundColor: '#242520', alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true }
  });
  guideWin.loadFile(R('guide.html'), { query: windowQuery() });
  guideWin.once('ready-to-show', () => { guideWin.show(); guideWin.focus(); });
  guideWin.on('closed', () => { guideWin = null; store.setSetting('guideDone', true); });
}

// ───────────────────────────────────────────────────────── tray + menus
function trayImage() {
  if (!IS_MAC) return nativeImage.createFromPath(B('icon.png')).resize({ width: 20, height: 20 });
  const img = nativeImage.createFromPath(B('trayTemplate.png'));
  img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(B('trayTemplate@2x.png')) });
  img.setTemplateImage(true); return img;
}
function refreshTrayTitle() { /* reserved: could show item count next to the icon */ }
function accentNames() { return ['yellow', 'blue', 'purple', 'pink', 'red', 'orange', 'green', 'teal'].map(key => [key, tr(key)]); }
function buildTrayMenu() {
  const st = store.settings;
  const set = (k, v) => () => { store.setSetting(k, v); if (k === 'theme') applyTheme(); if (k === 'strict' && watch) watch.strict = v; pushState(); };
  return Menu.buildFromTemplate([
    { label: tr(shelfWin && shelfWin.isVisible() ? 'hideShelf' : 'showShelf'), accelerator: undefined, sublabel: accelLabel(st.hotkey), click: () => toggleShelf(true) },
    { label: tr('phoneMenu'), type: 'checkbox', checked: !!(phoneWin && !phoneWin.isDestroyed()), click: openPhone },
    { label: tr('prepareDelivery'), click: openDelivery },
    { type: 'separator' },
    { label: tr('autoPaste'), type: 'checkbox', checked: !!st.autoPaste, click: () => setAutoPaste(!st.autoPaste) },
    { label: tr('pasteNow'), click: () => pasteNow() },
    { label: tr('captureScreen'), click: () => captureScreen().catch(err => dialog.showErrorBox(tr('captureScreen'), err.message)) },
    { label: tr('captureScale'), submenu: [1, 2, 3, 4].map(n => ({ label: `${n}×`, type: 'radio', checked: Number(st.captureScale) === n, click: set('captureScale', n) })) },
    { label: tr('undo'), enabled: store.canUndo, click: () => { store.undo(); pushState(); } },
    { label: tr('redo'), enabled: store.canRedo, click: () => { store.redo(); pushState(); } },
    { type: 'separator' },
    { type: 'separator' },
    { label: tr('theme'), submenu: [['auto', IS_MAC ? 'macTheme' : 'systemTheme'], ['light', 'light'], ['dark', 'dark']].map(([v, key]) => ({ label: tr(key), type: 'radio', checked: st.theme === v, click: set('theme', v) })) },
    { label: tr('accent'), submenu: accentNames().map(([v, l]) => ({ label: l, type: 'radio', checked: st.accent === v, click: set('accent', v) })) },
    { label: tr('language'), submenu: [['auto', tr('systemLanguage')], ['en', 'English'], ['km', 'ភាសាខ្មែរ']].map(([value, label]) => ({ label, type: 'radio', checked: st.language === value, click: () => { store.setSetting('language', value); updateLanguage(); } })) },
    { label: tr('shortcutMenu'), click: openShortcutWindow },
    { type: 'separator' },
    { label: tr('clearShelves'), click: () => { store.checkpoint(); store.clearAll(); pushState(); if (!pinned) hideShelf(); } },
    { label: tr('removeAfter'), type: 'checkbox', checked: st.moveOnDragOut, click: set('moveOnDragOut', !st.moveOnDragOut) },
    { label: tr('strictDrag'), type: 'checkbox', checked: st.strict, click: set('strict', !st.strict) },
    { label: tr(IS_WIN ? 'startWindows' : 'startLogin'), type: 'checkbox', checked: app.getLoginItemSettings(loginOptions()).openAtLogin, click: m => app.setLoginItemSettings({ ...loginOptions(), openAtLogin: m.checked }) },
    ...(lastApp ? [{ label: tr('excludeApp', { name: lastApp }), click: () => { ensureExcluded(); fs.appendFileSync(excludedFile(), lastApp + '\n'); } }] : []),
    { label: tr('editExcluded'), click: () => { ensureExcluded(); shell.openPath(excludedFile()); } },
    { type: 'separator' },
    ...(IS_MAC ? [{ label: tr(hooksOn ? 'detectionOn' : 'enableDetection'), enabled: !hooksOn, click: () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility') }] : []),
    { label: tr('showGuide'), click: openGuide },
    { label: tr('checkUpdates'), click: () => updates && updates.check(true) },
    { label: tr('automaticUpdates'), type: 'checkbox', checked: st.updateChecks !== false, click: set('updateChecks', st.updateChecks === false) },
    { label: tr('privacy'), click: () => shell.openExternal(`https://github.com/im4tta/dragshelf/blob/main/PRIVACY${language() === 'km' ? '.km' : ''}.md`) },
    { label: tr('support'), click: () => shell.openExternal('https://github.com/im4tta/dragshelf/issues') },
    { label: tr('about'), click: () => app.showAboutPanel() },
    { label: tr('quit'), accelerator: IS_MAC ? 'Command+Q' : undefined, click: () => app.quit() }
  ]);
}
function loginOptions() { return IS_WIN ? { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] } : {}; }
function createTray() {
  try {
    tray = new Tray(trayImage()); tray.setToolTip('Drag Shelf');
    tray.on('click', () => toggleShelf(true));
    tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
  } catch (e) { console.warn('tray unavailable', e.message); }
}

// ───────────────────────────────────────────────────────── IPC
function openItemMenu(index) {
  const it = store.cur.items[index]; if (!it) return;
  Menu.buildFromTemplate([
    { label: tr('open'), click: () => shell.openPath(it.p) },
    { label: tr(IS_MAC ? 'revealMac' : 'reveal'), click: () => shell.showItemInFolder(it.p) },
    { label: tr('copyPath'), click: () => copyOut(() => clipboard.writeText(it.p)) },
    { label: tr('copyItem'), click: () => copyItem(it.p) },
    ...(isTextFile(it.p) ? [{ label: tr('splitMerge'), click: () => shelfWin.webContents.send('text:open', index) }] : []),
    { type: 'separator' },
    { label: tr(it.done ? 'markNotDone' : 'markDone'), click: () => { store.toggleDone(store.active, index); pushState(); } },
    { label: tr('remove'), click: () => { store.checkpoint(); store.removePaths(store.active, [it.p]); pushState(); setTimeout(autoHideIfEmpty, 50); } }
  ]).popup({ window: shelfWin });
}
function openTabMenu(index) {
  store.setActive(index); pushState();
  Menu.buildFromTemplate([
    { label: tr('rename'), click: () => shelfWin.webContents.send('rename', index) },
    { label: tr('clearShelf'), click: () => { store.checkpoint(); store.clearShelf(index); pushState(); } },
    { label: tr('deleteShelf'), enabled: store.shelves.length > 1, click: () => { store.checkpoint(); store.deleteShelf(index); pushState(); } }
  ]).popup({ window: shelfWin });
}

function wireIpc() {
  ipcMain.handle('drop:resolve', (event, payload) => {
    if (![shelfWin, deliveryWin].some(win => win && !win.isDestroyed() && event.sender === win.webContents)) return { paths: [], unresolved: [] };
    return require('./drop-files').resolveDrop(payload);
  });
  ipcMain.handle('state:get', () => buildState());
  ipcMain.handle('act', async (e, type, p = {}) => {
    const undoable = ['add', 'toggleDone', 'remove', 'clearShelf', 'clearDone', 'clearAll', 'rename', 'move', 'addFromHistory'].includes(type);
    if (undoable) store.checkpoint();
    switch (type) {
      case 'undo': store.undo(); break;
      case 'redo': store.redo(); break;
      case 'paste': { const n = await pasteNow(); pushState(); return n; }
      case 'capture': try { return await captureScreen(); } catch (err) { return { error: err.message }; }
      case 'autoPaste': setAutoPaste(p.value); return !!p.value;
      case 'addFromHistory': if (fs.existsSync(p.path)) store.addPaths(store.active, [p.path]); break;
      case 'pinHistory': { const on = store.togglePin(p.path); pushState(); return on; }
      case 'forget': store.forget([p.path]); return true;
      case 'clearHistory': store.clearHistory(); return true;
      case 'copy': await copyItem(p.path); return true;
      case 'readText': { const it = store.cur.items[p.index]; return it && isTextFile(it.p) ? { path: it.p, text: fs.readFileSync(it.p, 'utf8') } : null; }
      case 'saveText': { const it = store.cur.items[p.index]; if (!it || !isTextFile(it.p)) return false; fs.writeFileSync(it.p, String(p.text), 'utf8'); pushState(); return true; }
      case 'split': return splitTextItem(p.index, p.separator, p.opts || {});
      case 'merge': return mergeTextItems(p.separator, p.opts || {});
      case 'add': store.addPaths(p.shelf ?? store.active, p.paths || []); break;
      case 'toggleDone': store.toggleDone(p.shelf ?? store.active, p.index); break;
      case 'remove': store.removePaths(p.shelf ?? store.active, p.paths || []); break;
      case 'clearShelf': store.clearShelf(p.shelf ?? store.active); break;
      case 'clearDone': store.clearDone(p.shelf ?? store.active); break;
      case 'clearAll': store.clearAll(); break;
      case 'newShelf': { const i = store.newShelf(n => tr('shelfName', { n: I18N.number(language(), n) })); if (p.activate !== false) store.setActive(i); pushState(); return i; }
      case 'setActive': store.setActive(p.index); break;
      case 'rename': store.renameShelf(p.index, p.name); break;
      case 'move': store.moveItems(p.from, p.paths || [], p.to, p.at); break;
      case 'open': shell.openPath(p.path); break;
      case 'phone': openPhone(); break;
      case 'delivery': openDelivery(); break;
      case 'setting': store.setSetting(p.key, p.value); if (p.key === 'theme') applyTheme(); if (p.key === 'language') updateLanguage(); break;
      default: break;
    }
    if (undoable) store.settle();
    pushState(); setTimeout(autoHideIfEmpty, 400);
    return null;
  });
  ipcMain.handle('history:get', () => historyEntries());
  ipcMain.handle('drop:blob', (e, shelf, name, buf) => { store.checkpoint(); const p = stash.saveBlob(name, buf); store.addPaths(shelf, [p]); pushState(); return p; });
  ipcMain.handle('drop:text', (e, shelf, text) => { store.checkpoint(); const p = stash.saveText(text); store.addPaths(shelf, [p]); pushState(); return p; });
  ipcMain.handle('drop:url', (e, shelf, url) => { store.checkpoint(); const p = stash.saveUrl(url); store.addPaths(shelf, [p]); pushState(); return p; });

  // Native drag-out. Must be synchronous inside the renderer's dragstart handler.
  ipcMain.on('drag:start', (e, paths) => {
    const ok = (paths || []).filter(p => fs.existsSync(p)), gone = (paths || []).filter(p => !fs.existsSync(p));
    if (gone.length) { store.removePaths(store.active, gone); pushState(); }
    if (!ok.length) return;
    dragOut = { shelf: store.active, paths: ok, cancelled: false };
    if (!hooksOn) setTimeout(() => { dragOut = null; }, 30000);      // no global mouse-up available → never auto-remove
    e.sender.startDrag({ file: ok[0], files: ok, icon: dragIcon });
  });
  ipcMain.on('win:resize', (e, h) => {
    if (!shelfWin) return; const b = shelfWin.getBounds(), wa = screen.getDisplayMatching(b).workArea;
    const H = Math.min(Math.ceil(h) + 2 * PAD, workAreaAt({ x: b.x + PAD, y: b.y + PAD }).height - 12); if (H === b.height) return;
    shelfWin.setBounds({ x: b.x, y: Math.round(clamp(b.y, wa.y - PAD + 4, wa.y + wa.height - H + PAD - 4)), width: WIN_W, height: H });
  });
  ipcMain.on('win:move-start', () => { moveStart = shelfWin.getPosition(); });
  ipcMain.on('win:move', (e, dx, dy) => { if (moveStart) shelfWin.setPosition(Math.round(moveStart[0] + dx), Math.round(moveStart[1] + dy)); });
  ipcMain.on('win:hide', () => hideShelf());
  ipcMain.on('ctx:item', (e, i) => openItemMenu(i));
  ipcMain.on('ctx:tab', (e, i) => openTabMenu(i));
  ipcMain.on('focusable', (e, on) => { if (!shelfWin) return; shelfWin.setFocusable(!!on); if (on) { app.focus({ steal: true }); shelfWin.focus(); } });
  ipcMain.on('phone:close', () => closePhone());
  ipcMain.handle('phone:info', () => phone.info());
  ipcMain.handle('shortcut:info', () => ({ label: accelLabel(store.settings.hotkey), mac: IS_MAC }));
  ipcMain.handle('shortcut:set', (e, accel) => {
    const old = store.settings.hotkey; globalShortcut.unregister(old);
    if (registerHotkey(accel)) { store.setSetting('hotkey', accel); pushState(); if (keyWin) setTimeout(() => keyWin && keyWin.close(), 650); return { ok: true, label: accelLabel(accel) }; }
    registerHotkey(old); return { ok: false, label: accelLabel(old) };
  });
  ipcMain.on('shortcut:cancel', () => { if (keyWin) keyWin.close(); });
  ipcMain.handle('guide:info', () => ({ hotkey: accelLabel(store.settings.hotkey), mac: IS_MAC }));
  ipcMain.on('guide:done', () => { if (guideWin) guideWin.close(); });
}

// ───────────────────────────────────────────────────────── lifecycle
app.on('second-instance', () => { if (shelfWin) showShelfAt(screen.getCursorScreenPoint(), true); });
app.on('window-all-closed', e => e.preventDefault && e.preventDefault());
app.on('before-quit', event => {
  if (clipWatch) clipWatch.stop();
  if (updates) updates.stop();
  if (store) store.flush(); if (phone) phone.stop(); if (watch) watch.stop(); if (IS_WIN) require('./windows-context').stop();
  if (deliveryJobs && deliveryJobs.busy) { event.preventDefault(); deliveryJobs.cancel(); deliveryJobs.pending.finally(() => app.quit()); }
});
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(() => {
  if (IS_MAC && app.dock) app.dock.hide();
  if (IS_WIN && !TEST && process.env.LOCALAPPDATA) {
    try { require('./windows-migration').importWindowsShelves(path.join(process.env.LOCALAPPDATA, 'DragShelf'), app.getPath('userData')); }
    catch (error) { console.warn('Legacy shelves could not be imported:', error.message); }
  }
  store = new Store(app.getPath('userData'), tr('shelfName', { n: 1 }));
  stash = new Stash(path.join(app.getPath('userData'), 'stash'));
  phone = new PhoneServer(stash.dir, language);
  delivery = new Delivery(app.getPath('userData'), require('./delivery-images'));
  dragIcon = nativeImage.createFromPath(B('dragicon.png'));
  ensureExcluded(); applyTheme();
  updateLanguage();

  phone.on('file', p => { store.addPaths(store.active, [p]); pushState(); if (phoneWin && !phoneWin.isDestroyed()) phoneWin.webContents.send('phone:count', phone.count); });
  wireIpc();
  deliveryJobs = require('./delivery-ipc')({ window: () => deliveryWin, shelfId: () => deliveryShelfId, setShelfId: value => { deliveryShelfId = value; }, store: () => store, service: () => delivery, state: buildState, language, t: tr, push: pushState, test: () => TEST });
  createShelfWindow();
  if (store.settings.autoPaste) ensureClipWatch().start(); // keeps pasting copies onto the shelf in the background
  screen.on('display-metrics-changed', () => { if (shelfWin) { const b = shelfWin.getBounds(); placeCard(b.x + PAD, b.y + PAD); pushState(); } });
  if (!TEST) {
    updates = new (require('./updates').Updates)({ app, dialog, shell, net, store, t: tr });
    createTray(); registerHotkey(store.settings.hotkey); startWatching();
    if (app.isPackaged) updates.start();
  }
  if (!TEST && !store.settings.guideDone) openGuide();

  if (TEST) {   // automated screenshots drive the app through these hooks
    global.__test = {
      menuLabels: () => { const labels = menu => menu.items.flatMap(item => [item.label, ...(item.submenu ? labels(item.submenu) : [])]).filter(Boolean); return labels(buildTrayMenu()); },
      setWorkArea: area => { testWorkArea = area; pushState(); },
      windowsReady: async () => {
        const snapshot = await require('./windows-context').snapshot();
        const { uIOhook } = require('uiohook-napi'); uIOhook.start(); uIOhook.stop();
        return snapshot && typeof snapshot.dragging === 'boolean';
      },
      shelfWin: () => shelfWin, phoneWin: () => phoneWin, guideWin: () => guideWin, keyWin: () => keyWin,
      showShelf: () => { placeCard(80, 60); shelfWin.showInactive(); pushState(); },
      openPhone, openGuide, openShortcutWindow, pushState, store: () => store,
      openDelivery, deliveryWin: () => deliveryWin, clipWatch: () => clipWatch, captureScreen,   delivery: () => delivery,
      imageSize: file => nativeImage.createFromPath(file).getSize(),
      writeTestImage: (source, destination, width, height) => fs.writeFileSync(destination, nativeImage.createFromPath(source).resize({ width, height }).toPNG())
    };
  }
});
