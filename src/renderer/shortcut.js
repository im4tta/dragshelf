'use strict';
const $ = s => document.querySelector(s);
let mac = true, busy = false;
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
  if (mods.ctrl) caps.push('⌃'); if (mods.alt) caps.push('⌥'); if (mods.shift) caps.push('⇧'); if (mods.meta) caps.push('⌘');
  if (key) caps.push(key.length === 1 ? key.toUpperCase() : key);
  el.innerHTML = caps.length ? caps.map(c => `<span class="keycap">${c}</span>`).join('') : '<span class="keycap ghost">…</span>';
}
show({}, '');
window.shelf.invoke('shortcut:info').then(i => { mac = i.mac; });
window.shelf.invoke('state:get').catch(() => 0);
addEventListener('keydown', async e => {
  e.preventDefault(); if (busy) return;
  if (e.key === 'Escape') return window.shelf.send('shortcut:cancel');
  const mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  const key = keyName(e.code);
  show(mods, key);
  if (!key || !(mods.ctrl || mods.alt || mods.meta)) return;
  busy = true;
  const accel = [mods.meta ? 'Command' : '', mods.ctrl ? 'Control' : '', mods.alt ? 'Alt' : '', mods.shift ? 'Shift' : '', key].filter(Boolean).join('+');
  const r = await window.shelf.invoke('shortcut:set', accel);
  if (r.ok) { show(mods, key, 'ok'); $('#hint').textContent = 'Saved.'; }
  else { show(mods, key, 'bad'); const h = $('#hint'); h.className = 'hint bad'; h.textContent = 'That shortcut is already used by macOS or another app. The previous one stays active.'; setTimeout(() => { busy = false; h.className = 'hint'; h.innerHTML = 'Try another combination.<br>Esc cancels.'; show({}, ''); }, 2400); }
});
addEventListener('keyup', e => { if (!busy) show({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }, ''); });
window.shelf.on('state', s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
window.shelf.invoke('state:get').then(s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme; });
