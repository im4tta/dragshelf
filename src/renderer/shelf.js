'use strict';
const $ = s => document.querySelector(s);
const TEST = location.search.includes('test=1');
const root = document.documentElement;

let S = null;                 // latest state from the main process
let selfDrag = null;          // { shelf, paths } while one of our own items is being dragged
let hoverTab = -1, hoverTick = 0;
let insertAt = null;          // list position under the pointer while dragging
let justDone = null;          // path that was just ticked (animation)
let renaming = false;

// ───────────────────────────────────────────── state & render
window.shelf.on('state', s => { S = s; render(); });
window.shelf.invoke('state:get').then(s => { S = s; render(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S && render());

const act = (type, payload) => window.shelf.invoke('act', type, payload);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => S.shelves[S.active];

function when(ts) {
  const d = new Date(ts);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function render() {
  if (!S) return;
  const scheme = S.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.settings.theme;
  root.dataset.scheme = scheme; root.dataset.accent = S.settings.accent;

  const sh = cur(), items = sh.items, done = items.filter(i => i.done).length;
  $('#counter').textContent = `${done}/${items.length}`;
  $('#phoneBtn').innerHTML = window.glyph('phone'); $('#phoneBtn').classList.toggle('live', S.phone);
  $('#closeBtn').innerHTML = window.glyph('close');

  if (!renaming) {
    const tabs = $('#tabs'); tabs.innerHTML = '';
    S.shelves.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'tab' + (i === S.active ? ' on' : ''); b.dataset.tab = i; b.textContent = s.name; b.title = s.name;
      tabs.appendChild(b);
    });
    const on = tabs.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'nearest' });
  }

  const list = $('#list'); list.innerHTML = '';
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'row' + (it.done ? ' done' : '') + (it.missing ? ' missing' : ''); li.dataset.i = i; li.draggable = true; li.title = it.name;
    const sub = it.missing ? 'Missing · moved or deleted' : [it.label, it.detail, when(it.added)].filter(Boolean).join(' · ');
    li.innerHTML = `<div class="tile">${it.thumb ? `<img src="${it.thumb}" alt="">` : window.glyph(it.kind)}</div>
      <div class="meta"><div class="name">${esc(it.stem)}</div><div class="sub">${esc(sub)}</div></div>
      <button class="check${justDone === it.path ? ' pop' : ''}" title="${it.done ? 'Mark as not done' : 'Mark as done'}">${window.glyph('check')}</button>`;
    list.appendChild(li);
  });
  justDone = null;

  const n = items.length, card = $('#card');
  card.classList.toggle('has-items', n > 0);
  $('#empty').style.display = n ? 'none' : 'block';
  $('#foot').style.display = n >= 2 ? 'flex' : 'none';
  $('#clearDone').style.display = done > 0 ? 'inline-block' : 'none';
  $('#dragAll').innerHTML = `${window.glyph('stack')}Drag all · ${n}`;
  $('#empty .zone-ico').innerHTML = window.glyph('drop');
  $('#empty .zone-s').textContent = S.hooks === false && S.platform === 'darwin'
    ? `Press ${S.settings.hotkeyLabel} or click the menu bar icon` : 'Or drag something and shake the mouse';
  requestAnimationFrame(reportSize);
}

let lastH = 0;
function reportSize() {
  const h = Math.ceil($('#card').getBoundingClientRect().height);
  if (h !== lastH) { lastH = h; window.shelf.send('win:resize', h); }
}
new ResizeObserver(reportSize).observe($('#card'));

// ───────────────────────────────────────────── clicks
$('#closeBtn').onclick = () => window.shelf.send('win:hide');
$('#phoneBtn').onclick = () => act('phone');
$('#addTab').onclick = () => act('newShelf');
$('#clearAll').onclick = () => act('clearShelf');
$('#clearDone').onclick = () => act('clearDone');

$('#tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t && !renaming) act('setActive', { index: +t.dataset.tab }); });
$('#tabs').addEventListener('dblclick', e => { const t = e.target.closest('[data-tab]'); if (t) beginRename(+t.dataset.tab); });
$('#tabs').addEventListener('contextmenu', e => { const t = e.target.closest('[data-tab]'); if (t) { e.preventDefault(); window.shelf.send('ctx:tab', +t.dataset.tab); } });

$('#list').addEventListener('click', e => {
  const row = e.target.closest('.row'); if (!row) return;
  const i = +row.dataset.i, it = cur().items[i];
  if (e.target.closest('.check')) {
    if (!it.done) { const r = e.target.closest('.check').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); justDone = it.path; }
    act('toggleDone', { index: i });
  }
});
$('#list').addEventListener('dblclick', e => {
  const row = e.target.closest('.row'); if (row && !e.target.closest('.check')) act('open', { path: cur().items[+row.dataset.i].path });
});
$('#list').addEventListener('contextmenu', e => { const row = e.target.closest('.row'); if (row) { e.preventDefault(); window.shelf.send('ctx:item', +row.dataset.i); } });

// ───────────────────────────────────────────── rename
function beginRename(i) {
  const el = document.querySelector(`[data-tab="${i}"]`); if (!el || renaming) return;
  renaming = true; window.shelf.send('focusable', true);
  const input = document.createElement('input'); input.className = 'tab-edit'; input.value = S.shelves[i].name; input.maxLength = 24;
  el.replaceWith(input); setTimeout(() => { input.focus(); input.select(); }, 60);
  const end = ok => { if (!renaming) return; renaming = false; window.shelf.send('focusable', false); if (ok && input.value.trim()) act('rename', { index: i, name: input.value }); else render(); };
  input.onkeydown = e => { if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
  input.onblur = () => end(true);
}
window.shelf.on('rename', beginRename);

// ───────────────────────────────────────────── move the window by its header
let mv = null;
$('#top').addEventListener('pointerdown', e => {
  if (e.target.closest('button, input') || e.button !== 0) return;
  mv = { x: e.screenX, y: e.screenY }; e.currentTarget.setPointerCapture(e.pointerId); window.shelf.send('win:move-start');
});
$('#top').addEventListener('pointermove', e => { if (mv) window.shelf.send('win:move', e.screenX - mv.x, e.screenY - mv.y); });
$('#top').addEventListener('pointerup', () => { mv = null; });

// ───────────────────────────────────────────── dragging OUT of the shelf
$('#list').addEventListener('dragstart', e => {
  const row = e.target.closest('.row'); if (!row) return;
  e.preventDefault();                                   // hand over to the native file drag
  const it = cur().items[+row.dataset.i]; if (!it || it.missing) return;
  row.classList.add('lifted');
  selfDrag = { shelf: S.active, paths: [it.path] };
  window.shelf.send('drag:start', [it.path]);
  armSelfDragTimeout();
});
$('#dragAll').addEventListener('dragstart', e => {
  e.preventDefault();
  const paths = cur().items.filter(i => !i.missing).map(i => i.path); if (!paths.length) return;
  selfDrag = { shelf: S.active, paths };
  document.querySelectorAll('.row').forEach(r => r.classList.add('lifted'));
  window.shelf.send('drag:start', paths);
  armSelfDragTimeout();
});
let sdTimer = null;
function armSelfDragTimeout() { clearTimeout(sdTimer); sdTimer = setTimeout(endSelfDrag, 30000); }
function endSelfDrag() { selfDrag = null; document.querySelectorAll('.row.lifted').forEach(r => r.classList.remove('lifted')); hideInsert(); setHot(false); }
window.shelf.on('drag:ended', () => setTimeout(endSelfDrag, 30));

// ───────────────────────────────────────────── dropping INTO the shelf
function setHot(on) { $('#card').classList.toggle('drop-hot', on); $('#card').classList.toggle('reorder', on && !!selfDrag); if (!on) { clearTabHover(); } }
function clearTabHover() { hoverTab = -1; document.querySelectorAll('.tab.over, #addTab.over').forEach(x => x.classList.remove('over')); }
function hideInsert() { insertAt = null; $('#insert').style.display = 'none'; }
function insertIndexFor(y) {
  const rows = [...document.querySelectorAll('#list .row')]; let idx = 0;
  rows.forEach(r => { const b = r.getBoundingClientRect(); if (b.top + b.height / 2 < y) idx++; });
  return idx;
}
function showInsert(idx) {
  const rows = [...document.querySelectorAll('#list .row')], wrap = $('#listWrap').getBoundingClientRect(); if (!rows.length) return hideInsert();
  const r = idx < rows.length ? rows[idx].getBoundingClientRect() : rows[rows.length - 1].getBoundingClientRect();
  const y = (idx < rows.length ? r.top : r.bottom) - wrap.top; insertAt = idx;
  Object.assign($('#insert').style, { display: 'block', top: Math.round(y - 1.5) + 'px' });
}

document.addEventListener('dragenter', e => { e.preventDefault(); setHot(true); });
document.addEventListener('dragover', e => {
  e.preventDefault(); e.dataTransfer.dropEffect = selfDrag ? 'move' : 'copy'; setHot(true);
  const tab = e.target.closest('[data-tab]'), plus = e.target.closest('#addTab');
  document.querySelectorAll('.tab.over, #addTab.over').forEach(x => x.classList.remove('over'));
  if (tab) {
    const i = +tab.dataset.tab; if (i !== S.active) tab.classList.add('over');
    if (!selfDrag && i !== S.active) { if (i !== hoverTab) { hoverTab = i; hoverTick = Date.now(); } else if (Date.now() - hoverTick > 450) { hoverTab = -1; act('setActive', { index: i }); } }
  } else hoverTab = -1;
  if (plus) plus.classList.add('over');
  if (e.target.closest('#listWrap') && !tab && !plus) showInsert(insertIndexFor(e.clientY)); else hideInsert();
});
document.addEventListener('dragleave', e => { if (!e.relatedTarget) { setHot(false); hideInsert(); } });

document.addEventListener('drop', async e => {
  e.preventDefault();
  const at = insertAt; const tabEl = e.target.closest('[data-tab]'), plus = e.target.closest('#addTab');
  setHot(false); hideInsert();
  let target = S.active;
  if (tabEl) target = +tabEl.dataset.tab;
  else if (plus) target = await act('newShelf', { activate: true });
  const intoActive = !tabEl && !plus;

  // 1. one of our own items → reorder / move to another shelf
  if (selfDrag) {
    const sd = selfDrag; endSelfDrag();
    if (target === sd.shelf && !intoActive) return;
    await act('move', { from: sd.shelf, paths: sd.paths, to: target, at: target === sd.shelf || intoActive ? at : null });
    return;
  }

  // 2. everything else (read synchronously, the DataTransfer is only valid during the event)
  const dt = e.dataTransfer, paths = [], blobs = [];
  for (const f of dt.files) { const p = window.shelf.pathFor(f); if (p) paths.push(p); else blobs.push(f); }
  const uriList = dt.getData('text/uri-list'), text = dt.getData('text/plain');
  if (paths.length) { await act('add', { shelf: target, paths }); if (intoActive && at != null) await act('move', { from: target, paths, to: target, at }); if (tabEl && !plus) await act('setActive', { index: target }); }
  for (const f of blobs) { const buf = await f.arrayBuffer(); await window.shelf.invoke('drop:blob', target, f.name, buf); }
  if (!paths.length && !blobs.length) {
    const url = (uriList.split(/\r?\n/).find(l => l && !l.startsWith('#')) || '').trim();
    if (/^https?:\/\//i.test(url)) await window.shelf.invoke('drop:url', target, url);
    else if (/^https?:\/\/\S+$/i.test(text.trim())) await window.shelf.invoke('drop:url', target, text.trim());
    else if (text.trim()) await window.shelf.invoke('drop:text', target, text);
  }
});

// ───────────────────────────────────────────── confetti (the little reward when you tick something off)
function burst(cx, cy) {
  const layer = $('#confetti'), box = $('#card').getBoundingClientRect();
  const colors = ['var(--accent)', 'var(--accent)', '#ffffff', 'var(--dim)', 'var(--accent)'];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 46, s = 3 + Math.random() * 4;
    Object.assign(p.style, { left: cx - box.left - s / 2 + 'px', top: cy - box.top - s / 2 + 'px', width: s + 'px', height: s + 'px', background: colors[i % colors.length], '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', animationDelay: Math.random() * 60 + 'ms' });
    layer.appendChild(p); setTimeout(() => p.remove(), 950);
  }
}

// helpers for automated screenshots (only when launched in test mode)
if (TEST) window.__t = {
  hot: on => setHot(on), lift: i => document.querySelectorAll('.row')[i].classList.add('lifted'),
  insert: i => showInsert(i), burstAt: i => { const c = document.querySelectorAll('.check')[i].getBoundingClientRect(); burst(c.left + c.width / 2, c.top + c.height / 2); },
  reorder: () => { selfDrag = { shelf: 0, paths: [] }; setHot(true); }, rename: i => beginRename(i), state: () => S
};
