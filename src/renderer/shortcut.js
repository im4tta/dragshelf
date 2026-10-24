'use strict';
const $ = s => document.querySelector(s);
let mac = window.shelf.platform === 'darwin', busy = false, hintState = 'idle';
function localize() {
  document.title = Locale.t('shortcutTitle');
  $('#hint').textContent = hintState === 'idle' ? Locale.t('shortcutHint', { keys: mac ? '⌃, ⌥, ⇧, ⌘' : 'Ctrl, Alt, Win' }) : Locale.t({ saved: 'shortcutSaved', busy: 'shortcutBusy', retry: 'shortcutRetry' }[hintState]);
}
addEventListener('languagechange', localize);
localize();
const NAMED = { Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Tab: 'Tab', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
function keyName(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  return NAMED[code] || '';
}
function show(mods, key, cls) {
  const el = $('#keys'); el.className = 'keys ' + (cls || '');
  const caps = [];
  if (mods.ctrl) caps.push(mac ? '⌃' : 'Ctrl'); if (mods.alt) caps.push(mac ? '⌥' : 'Alt'); if (mods.shift) caps.push(mac ? '⇧' : 'Shift'); if (mods.meta) caps.push(mac ? '⌘' : 'Win');
  if (key) caps.push(key.length === 1 ? key.toUpperCase() : key);
  el.innerHTML = caps.length ? caps.map(c => `<span class="keycap">${c}</span>`).join('') : '<span class="keycap ghost">…</span>';
}
show({}, '');
window.shelf.invoke('shortcut:info').then(i => { mac = i.mac; localize(); });
window.shelf.invoke('state:get').catch(() => 0);
addEventListener('keydown', async e => {
  e.preventDefault(); if (busy) return;
  if (e.key === 'Escape') return window.shelf.send('shortcut:cancel');
  const mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  const key = keyName(e.code);
  show(mods, key);
  if (!key || !(mods.ctrl || mods.alt || mods.meta)) return;
  busy = true;
  const accel = [mods.meta ? (mac ? 'Command' : 'Super') : '', mods.ctrl ? 'Control' : '', mods.alt ? 'Alt' : '', mods.shift ? 'Shift' : '', key].filter(Boolean).join('+');
  const r = await window.shelf.invoke('shortcut:set', accel);
  if (r.ok) { show(mods, key, 'ok'); hintState = 'saved'; localize(); }
  else { show(mods, key, 'bad'); const h = $('#hint'); h.className = 'hint bad'; hintState = 'busy'; localize(); setTimeout(() => { busy = false; h.className = 'hint'; hintState = 'retry'; localize(); show({}, ''); }, 2400); }
});
addEventListener('keyup', e => { if (!busy) show({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }, ''); });
window.shelf.on('state', s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('state:get').then(s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
