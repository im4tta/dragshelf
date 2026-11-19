'use strict';
// Quick paste: search history (names, text, text found in images); Enter pastes into the app in front.
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let items = [], shown = [], index = 0;
const ACCENT_THEME = () => window.shelf.invoke('state:get').then(s => {
  const scheme = s.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme;
  document.documentElement.dataset.scheme = scheme; document.documentElement.dataset.accent = s.settings.accent;
});
function render() {
  const q = $('#q').value.trim().toLowerCase();
  shown = items.filter(h => h.exists && (!q || [h.name, h.preview, h.ocr].join(' ').toLowerCase().includes(q))).slice(0, 80);
  index = Math.min(index, Math.max(0, shown.length - 1));
  $('#list').innerHTML = shown.map((h, i) => `<li role="option" id="o${i}" data-i="${i}" aria-selected="${i === index}">
    <div class="tile">${window.glyph(h.kind)}</div>
    <div><div class="name">${esc(h.preview || h.name)}</div><div class="sub">${esc(h.ocr ? h.ocr.replace(/\s+/g, ' ').slice(0, 90) : h.name)}</div></div>
    ${h.pinned ? `<span class="pin" title="${esc(Locale.t('pinned'))}">${window.glyph('pin')}</span>` : '<span></span>'}</li>`).join('');
  $('#empty').hidden = shown.length > 0;
  $('#q').setAttribute('aria-activedescendant', shown.length ? 'o' + index : '');
  const sel = document.getElementById('o' + index); if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function choose(i, paste = true) { const h = shown[i]; if (h) window.shelf.invoke('act', 'palettePaste', { path: h.path, paste }); }
$('#q').addEventListener('input', () => { index = 0; render(); });
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, shown.length - 1); render(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); render(); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(index, !e.shiftKey); }
  else if (e.key === 'Escape') window.close();
  else if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) { e.preventDefault(); choose(+e.key - 1); }
});
$('#list').addEventListener('click', e => { const li = e.target.closest('li'); if (li) choose(+li.dataset.i); });
(async () => { await ACCENT_THEME(); items = await window.shelf.invoke('palette:items'); render(); $('#q').focus(); })();
