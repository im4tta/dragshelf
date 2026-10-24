'use strict';
const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, nativeTheme, shell, systemPreferences, clipboard
} = require('electron');

const { Store } = require('./store');
const { describe } = require('./meta');
const { Stash } = require('./stash');
const { PhoneServer } = require('./phone');
const { DragWatch, systemSnapshot } = require('./dragwatch');

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

let store, stash, phone, watch;
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
    name: s.name,
    items: await Promise.all(s.items.map(async it => ({ ...(await describe(it.p)), done: it.done, added: it.added })))
  })));
  const st = store.settings;
  return {
    viewport: { maxCardHeight: workAreaAt(shelfWin ? { x: shelfWin.getBounds().x + PAD, y: shelfWin.getBounds().y + PAD } : undefined).height - 2 * PAD - 12 },
    shelves, active: store.active, platform: process.platform,
    settings: { theme: st.theme, accent: st.accent, hotkey: st.hotkey, hotkeyLabel: accelLabel(st.hotkey), strict: st.strict, moveOnDragOut: st.moveOnDragOut },
    phone: !!(phone && phone.running), hooks: hooksOn
  };
}
function pushState() {
  clearTimeout(pushing);
  pushing = setTimeout(async () => {
    const s = await buildState();
    for (const w of [shelfWin, phoneWin, guideWin, keyWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
    refreshTrayTitle();
  }, 16);
}
function applyTheme() { nativeTheme.themeSource = store.settings.theme === 'auto' ? 'system' : store.settings.theme; }

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
  shelfWin.loadFile(R('shelf.html'), { query: TEST ? { test: '1' } : {} });
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
      if (!inside && !d.cancelled && store.settings.moveOnDragOut && !altKey) { store.removePaths(d.shelf, d.paths); pushState(); }
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
  keyWin.loadFile(R('shortcut.html'));
  keyWin.once('ready-to-show', () => { keyWin.show(); keyWin.focus(); });
  keyWin.on('closed', () => { keyWin = null; if (!globalShortcut.isRegistered(store.settings.hotkey)) registerHotkey(store.settings.hotkey); });
}

// ───────────────────────────────────────────────────────── phone window
async function openPhone() {
  if (phoneWin && !phoneWin.isDestroyed()) return closePhone();
  let info;
  try { info = await phone.start(); } catch (_) {
    const { dialog } = require('electron');
    dialog.showMessageBox({ type: 'info', message: 'No local network found', detail: 'Connect to the same Wi-Fi as your phone and try again.', buttons: ['OK'] });
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
  phoneWin.loadFile(R('phone.html'));
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
    title: 'Welcome to Drag Shelf', titleBarStyle: IS_MAC ? 'hiddenInset' : 'default', backgroundColor: '#242520', alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true }
  });
  guideWin.loadFile(R('guide.html'));
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
function accentNames() { return [['yellow', 'Yellow'], ['blue', 'Blue'], ['purple', 'Purple'], ['pink', 'Pink'], ['red', 'Red'], ['orange', 'Orange'], ['green', 'Green'], ['teal', 'Teal']]; }
function buildTrayMenu() {
  const st = store.settings;
  const set = (k, v) => () => { store.setSetting(k, v); if (k === 'theme') applyTheme(); if (k === 'strict' && watch) watch.strict = v; pushState(); };
  return Menu.buildFromTemplate([
    { label: shelfWin && shelfWin.isVisible() ? 'Hide shelf' : 'Show shelf', accelerator: undefined, sublabel: accelLabel(st.hotkey), click: () => toggleShelf(true) },
    { label: 'Photos from phone…', type: 'checkbox', checked: !!(phoneWin && !phoneWin.isDestroyed()), click: openPhone },
    { type: 'separator' },
    { label: 'Theme', submenu: [['auto', IS_MAC ? 'Match macOS' : 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, type: 'radio', checked: st.theme === v, click: set('theme', v) })) },
    { label: 'Accent color', submenu: accentNames().map(([v, l]) => ({ label: l, type: 'radio', checked: st.accent === v, click: set('accent', v) })) },
    { label: 'Change shortcut…', click: openShortcutWindow },
    { type: 'separator' },
    { label: 'Clear all shelves', click: () => { store.clearAll(); pushState(); if (!pinned) hideShelf(); } },
    { label: 'Remove items after dragging them out', type: 'checkbox', checked: st.moveOnDragOut, click: set('moveOnDragOut', !st.moveOnDragOut) },
    { label: 'Strict drag detection', type: 'checkbox', checked: st.strict, click: set('strict', !st.strict) },
    { label: IS_WIN ? 'Start with Windows' : 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings(loginOptions()).openAtLogin, click: m => app.setLoginItemSettings({ ...loginOptions(), openAtLogin: m.checked }) },
    ...(lastApp ? [{ label: `Never show over ${lastApp}`, click: () => { ensureExcluded(); fs.appendFileSync(excludedFile(), lastApp + '\n'); } }] : []),
    { label: 'Edit excluded apps…', click: () => { ensureExcluded(); shell.openPath(excludedFile()); } },
    { type: 'separator' },
    ...(IS_MAC ? [{ label: hooksOn ? 'Drag detection: on' : 'Enable drag detection…', enabled: !hooksOn, click: () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility') }] : []),
    { label: 'Show guide', click: openGuide },
    { label: 'Privacy policy', click: () => shell.openExternal('https://github.com/im4tta/dragshelf/blob/main/PRIVACY.md') },
    { label: 'Help and support', click: () => shell.openExternal('https://github.com/im4tta/dragshelf/issues') },
    { label: 'About Drag Shelf', click: () => app.showAboutPanel() },
    { label: 'Quit Drag Shelf', accelerator: IS_MAC ? 'Command+Q' : undefined, click: () => app.quit() }
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
    { label: 'Open', click: () => shell.openPath(it.p) },
    { label: IS_MAC ? 'Show in Finder' : 'Show in folder', click: () => shell.showItemInFolder(it.p) },
    { label: 'Copy path', click: () => clipboard.writeText(it.p) },
    { type: 'separator' },
    { label: it.done ? 'Mark as not done' : 'Mark as done', click: () => { store.toggleDone(store.active, index); pushState(); } },
    { label: 'Remove from shelf', click: () => { store.removePaths(store.active, [it.p]); pushState(); setTimeout(autoHideIfEmpty, 50); } }
  ]).popup({ window: shelfWin });
}
function openTabMenu(index) {
  store.setActive(index); pushState();
  Menu.buildFromTemplate([
    { label: 'Rename', click: () => shelfWin.webContents.send('rename', index) },
    { label: 'Clear shelf', click: () => { store.clearShelf(index); pushState(); } },
    { label: 'Delete shelf', enabled: store.shelves.length > 1, click: () => { store.deleteShelf(index); pushState(); } }
  ]).popup({ window: shelfWin });
}

function wireIpc() {
  ipcMain.handle('state:get', () => buildState());
  ipcMain.handle('act', (e, type, p = {}) => {
    switch (type) {
      case 'add': store.addPaths(p.shelf ?? store.active, p.paths || []); break;
      case 'toggleDone': store.toggleDone(p.shelf ?? store.active, p.index); break;
      case 'remove': store.removePaths(p.shelf ?? store.active, p.paths || []); break;
      case 'clearShelf': store.clearShelf(p.shelf ?? store.active); break;
      case 'clearDone': store.clearDone(p.shelf ?? store.active); break;
      case 'clearAll': store.clearAll(); break;
      case 'newShelf': { const i = store.newShelf(); if (p.activate !== false) store.setActive(i); pushState(); return i; }
      case 'setActive': store.setActive(p.index); break;
      case 'rename': store.renameShelf(p.index, p.name); break;
      case 'move': store.moveItems(p.from, p.paths || [], p.to, p.at); break;
      case 'open': shell.openPath(p.path); break;
      case 'phone': openPhone(); break;
      case 'setting': store.setSetting(p.key, p.value); if (p.key === 'theme') applyTheme(); break;
      default: break;
    }
    pushState(); setTimeout(autoHideIfEmpty, 400);
    return null;
  });
  ipcMain.handle('drop:blob', (e, shelf, name, buf) => { const p = stash.saveBlob(name, buf); store.addPaths(shelf, [p]); pushState(); return p; });
  ipcMain.handle('drop:text', (e, shelf, text) => { const p = stash.saveText(text); store.addPaths(shelf, [p]); pushState(); return p; });
  ipcMain.handle('drop:url', (e, shelf, url) => { const p = stash.saveUrl(url); store.addPaths(shelf, [p]); pushState(); return p; });

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
app.on('before-quit', () => { if (store) store.flush(); if (phone) phone.stop(); if (watch) watch.stop(); if (IS_WIN) require('./windows-context').stop(); });
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(() => {
  if (IS_MAC && app.dock) app.dock.hide();
  if (IS_WIN && !TEST && process.env.LOCALAPPDATA) {
    try { require('./windows-migration').importWindowsShelves(path.join(process.env.LOCALAPPDATA, 'DragShelf'), app.getPath('userData')); }
    catch (error) { console.warn('Legacy shelves could not be imported:', error.message); }
  }
  store = new Store(app.getPath('userData'));
  stash = new Stash(path.join(app.getPath('userData'), 'stash'));
  phone = new PhoneServer(stash.dir);
  dragIcon = nativeImage.createFromPath(B('dragicon.png'));
  ensureExcluded(); applyTheme();
  app.setAboutPanelOptions({ applicationName: 'Drag Shelf', applicationVersion: app.getVersion(), copyright: 'MIT License', credits: 'A temporary shelf for files, links, text and images.' });

  phone.on('file', p => { store.addPaths(store.active, [p]); pushState(); if (phoneWin && !phoneWin.isDestroyed()) phoneWin.webContents.send('phone:count', phone.count); });
  wireIpc();
  createShelfWindow();
  screen.on('display-metrics-changed', () => { if (shelfWin) { const b = shelfWin.getBounds(); placeCard(b.x + PAD, b.y + PAD); pushState(); } });
  if (!TEST) { createTray(); registerHotkey(store.settings.hotkey); startWatching(); }
  if (!TEST && !store.settings.guideDone) openGuide();

  if (TEST) {   // automated screenshots drive the app through these hooks
    global.__test = {
      setWorkArea: area => { testWorkArea = area; pushState(); },
      windowsReady: async () => {
        const snapshot = await require('./windows-context').snapshot();
        const { uIOhook } = require('uiohook-napi'); uIOhook.start(); uIOhook.stop();
        return snapshot && typeof snapshot.dragging === 'boolean';
      },
      shelfWin: () => shelfWin, phoneWin: () => phoneWin, guideWin: () => guideWin, keyWin: () => keyWin,
      showShelf: () => { placeCard(80, 60); shelfWin.showInactive(); pushState(); },
      openPhone, openGuide, openShortcutWindow, pushState, store: () => store
    };
  }
});
