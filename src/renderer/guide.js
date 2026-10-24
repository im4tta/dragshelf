'use strict';
const $ = s => document.querySelector(s);
const PAGES = [0, 1, 2, 3];
let page = 0, info = { hotkey: '⌥⇧S', mac: true };
const dots = $('#dots'); PAGES.forEach(() => dots.appendChild(document.createElement('i')));
document.querySelectorAll('.folder svg').forEach(s => { s.innerHTML = window.GLYPH.folder; s.style.display = 'none'; });

function show(p) {
  page = Math.max(0, Math.min(PAGES.length - 1, p));
  document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', +s.dataset.p === page));
  document.title = Locale.t('welcome');
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('#title').textContent = Locale.t('guideTitle' + page);
  $('#desc').innerHTML = Locale.t('guideDesc' + page, { copyKey: info.mac ? '⌥' : 'Ctrl', hotkey: escape(info.hotkey), tray: Locale.t(info.mac ? 'menuBar' : 'systemTray') });
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === page));
  $('#back').hidden = page === 0; $('#next').textContent = Locale.t(page === PAGES.length - 1 ? 'getStarted' : 'next');
  const parts = info.mac ? String(info.hotkey).match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) || [] : String(info.hotkey).split('+');
  document.querySelector('.note').innerHTML = Locale.t('copyNote', { copyKey: `<span class="keycap sm">${info.mac ? '⌥' : 'Ctrl'}</span>` });
  document.querySelectorAll('.keys .keycap').forEach((k, i) => { k.textContent = parts[i] || ''; k.style.display = parts[i] ? '' : 'none'; });
  document.querySelectorAll('.scene:not([data-p="3"]) .mrow .s').forEach(el => { el.textContent = `PDF · ${Locale.number(2.4)} MB · ${I18N.date(Locale.language, new Date(2026, 9, 23, 15, 6))}`; });
  const demoRows = document.querySelectorAll('.scene[data-p="3"] .mrow .s');
  demoRows[0].textContent = `PDF · ${Locale.number(410)} KB`;
  demoRows[1].textContent = `${Locale.t('link')} · figma.com`;
}
$('#next').onclick = () => (page === PAGES.length - 1 ? window.shelf.send('guide:done') : show(page + 1));
$('#back').onclick = () => show(page - 1);
addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(page + 1); else if (e.key === 'ArrowLeft') show(page - 1); else if (e.key === 'Escape') window.shelf.send('guide:done'); });
window.__guide = { show };
addEventListener('languagechange', () => show(page));

const scheme = t => (t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t);
const theme = s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = scheme(s.settings.theme); };
window.shelf.on('state', theme);
Promise.all([window.shelf.invoke('guide:info'), window.shelf.invoke('state:get')]).then(([i, s]) => { info = i; theme(s); show(page); });
show(0);
