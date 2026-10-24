'use strict';
const $ = s => document.querySelector(s);
const PAGES = [
  { t: 'Drag a file, then shake', d: () => 'Start dragging a file anywhere, then <b>shake the mouse</b> – or push it against a screen edge. The shelf pops up right next to your cursor.' },
  { t: 'Drop it on the shelf', d: () => 'Drop <b>files, folders, links, text or images</b> on it. Files are only referenced, so even huge ones land instantly. Tick the circle to mark something as done.' },
  { t: 'Take it back out', d: () => 'Drag an item – or <b>Drag all</b> – to where you need it. Reorder by dragging inside the shelf. Items leave the shelf once dropped; hold <b>⌥</b> to keep them.' },
  { t: 'Tabs, phone photos, shortcut', d: i => `Use <b>+</b> for more shelves, scan the phone QR to send photos over your Wi-Fi, and press <b>${i.hotkey}</b> any time. Everything else lives in the menu bar icon.` }
];
let page = 0, info = { hotkey: '⌥⇧S', mac: true };
const dots = $('#dots'); PAGES.forEach(() => dots.appendChild(document.createElement('i')));
document.querySelectorAll('.folder svg').forEach(s => { s.innerHTML = window.GLYPH.folder; s.style.display = 'none'; });

function show(p) {
  page = Math.max(0, Math.min(PAGES.length - 1, p));
  document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', +s.dataset.p === page));
  $('#title').textContent = PAGES[page].t; $('#desc').innerHTML = PAGES[page].d(info);
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === page));
  $('#back').hidden = page === 0; $('#next').textContent = page === PAGES.length - 1 ? 'Get started' : 'Next';
  const parts = String(info.hotkey).match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) || [];
  document.querySelectorAll('.keys .keycap').forEach((k, i) => { k.textContent = parts[i] || ''; k.style.display = parts[i] ? '' : 'none'; });
}
$('#next').onclick = () => (page === PAGES.length - 1 ? window.shelf.send('guide:done') : show(page + 1));
$('#back').onclick = () => show(page - 1);
addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(page + 1); else if (e.key === 'ArrowLeft') show(page - 1); else if (e.key === 'Escape') window.shelf.send('guide:done'); });
window.__guide = { show };

const scheme = t => (t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t);
const theme = s => { document.documentElement.dataset.accent = s.settings.accent; document.documentElement.dataset.scheme = scheme(s.settings.theme); };
window.shelf.on('state', theme);
Promise.all([window.shelf.invoke('guide:info'), window.shelf.invoke('state:get')]).then(([i, s]) => { info = i; theme(s); show(page); });
show(0);
