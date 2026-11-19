'use strict';
// Area / window capture and markup: crop, arrow, box, highlight and blur. Edits are drawn on top of the
// original pixels and exported at full resolution; the source file is never changed.
const $ = s => document.querySelector(s);
const canvas = $('#canvas'), ctx = canvas.getContext('2d');
let base = null;           // HTMLImageElement with the full-resolution picture
let selection = null;      // area mode: { x1, y1, x2, y2 } in image pixels while choosing
let mode = 'area';         // 'area' | 'markup' | 'window'
let tool = 'arrow', shapes = [], redoStack = [], drawing = null, crop = null;
const ACCENT = '#ff4d3a';

const toolIcons = { crop: '<path d="M6 3v14h14M3 6h14v14"/>', arrow: '<path d="M5 19L19 5M10 5h9v9"/>', box: '<rect x="4" y="5" width="16" height="14" rx="2"/>', highlight: '<path d="M4 20h16M7 16l9-9 3 3-9 9H7z"/>', blur: '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>' };
document.querySelectorAll('[data-tool]').forEach(b => { b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${toolIcons[b.dataset.tool]}</svg>`; });
document.querySelector('[data-act=undo]').innerHTML = window.glyph('undo'); document.querySelector('[data-act=redo]').innerHTML = window.glyph('redo');

function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
const scale = () => canvas.width / canvas.getBoundingClientRect().width;
function toImage(e) { const r = canvas.getBoundingClientRect(), s = scale(); return { x: Math.max(0, Math.min(canvas.width, (e.clientX - r.left) * s)), y: Math.max(0, Math.min(canvas.height, (e.clientY - r.top) * s)) }; }
const norm = r => ({ x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2), x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2) });

function drawShape(g, s, src) {
  const r = norm(s), w = r.x2 - r.x1, h = r.y2 - r.y1, lw = Math.max(3, Math.round(Math.min(g.canvas.width, g.canvas.height) / 300));
  g.save();
  if (s.type === 'box') { g.strokeStyle = ACCENT; g.lineWidth = lw; g.strokeRect(r.x1, r.y1, w, h); }
  else if (s.type === 'highlight') { g.fillStyle = 'rgba(255, 214, 10, .38)'; g.fillRect(r.x1, r.y1, w, h); }
  else if (s.type === 'blur' && w > 1 && h > 1) {
    const cell = Math.max(6, Math.round(Math.min(w, h) / 12)), sw = Math.max(1, Math.round(w / cell)), sh = Math.max(1, Math.round(h / cell));
    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
    tmp.getContext('2d').drawImage(src, r.x1 - (s.ox || 0), r.y1 - (s.oy || 0), w, h, 0, 0, sw, sh);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, sw, sh, r.x1, r.y1, w, h);
  } else if (s.type === 'arrow') {
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), head = lw * 5;
    g.strokeStyle = g.fillStyle = ACCENT; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2 - Math.cos(ang) * head * .6, s.y2 - Math.sin(ang) * head * .6); g.stroke();
    g.beginPath(); g.moveTo(s.x2, s.y2); g.lineTo(s.x2 - head * Math.cos(ang - .45), s.y2 - head * Math.sin(ang - .45)); g.lineTo(s.x2 - head * Math.cos(ang + .45), s.y2 - head * Math.sin(ang + .45)); g.closePath(); g.fill();
  }
  g.restore();
}

function render() {
  if (!base) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  if (mode === 'area' && !document.body.classList.contains('editing')) {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (selection) { const r = norm(selection); ctx.drawImage(base, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * scale(); ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); }
    return;
  }
  for (const s of shapes) drawShape(ctx, s, base);
  if (drawing && drawing.type !== 'crop') drawShape(ctx, drawing, base);
  const c = drawing && drawing.type === 'crop' ? norm(drawing) : crop;
  if (c) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, canvas.width, c.y1); ctx.fillRect(0, c.y2, canvas.width, canvas.height - c.y2); ctx.fillRect(0, c.y1, c.x1, c.y2 - c.y1); ctx.fillRect(c.x2, c.y1, canvas.width - c.x2, c.y2 - c.y1); ctx.strokeStyle = '#fff'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2 * scale(); ctx.strokeRect(c.x1, c.y1, c.x2 - c.x1, c.y2 - c.y1); ctx.setLineDash([]); }
  updateButtons();
}
function updateButtons() { document.querySelector('[data-act=undo]').disabled = !shapes.length && !crop; document.querySelector('[data-act=redo]').disabled = !redoStack.length; }

// Area selection turns into a cropped picture, then markup starts on it.
async function useRegion(r) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.x2 - r.x1)); c.height = Math.max(1, Math.round(r.y2 - r.y1));
  c.getContext('2d').drawImage(base, r.x1, r.y1, c.width, c.height, 0, 0, c.width, c.height);
  await startEditing(c.toDataURL('image/png'));
}
async function startEditing(src) {
  base = await loadImage(src); canvas.width = base.naturalWidth; canvas.height = base.naturalHeight; canvas.style.width = canvas.style.height = '';
  document.body.classList.add('editing', 'markup'); $('#tools').hidden = false; window.shelf.send('capture:editing');
  render(); document.querySelector(`[data-tool="${tool}"]`).focus();
}

canvas.addEventListener('pointerdown', e => {
  if (!base || e.button !== 0) return; canvas.setPointerCapture(e.pointerId);
  const p = toImage(e);
  if (!document.body.classList.contains('editing')) selection = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  else drawing = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  render();
});
canvas.addEventListener('pointermove', e => {
  const p = toImage(e);
  if (selection && !document.body.classList.contains('editing')) { selection.x2 = p.x; selection.y2 = p.y; render(); }
  else if (drawing) { drawing.x2 = p.x; drawing.y2 = p.y; render(); }
});
canvas.addEventListener('pointerup', () => {
  if (selection && !document.body.classList.contains('editing')) {
    const r = norm(selection); selection = null;
    if (r.x2 - r.x1 > 4 && r.y2 - r.y1 > 4) useRegion(r); else render();
    return;
  }
  if (!drawing) return;
  const d = drawing; drawing = null;
  const r = norm(d);
  if ((d.type === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) : Math.min(r.x2 - r.x1, r.y2 - r.y1)) > 3) {
    if (d.type === 'crop') { shapes.push({ type: 'crop-mark', prev: crop }); crop = r; } else shapes.push(d);
    redoStack = [];
  }
  render();
});

function undo() { const s = shapes.pop(); if (!s) return; redoStack.push(s.type === 'crop-mark' ? { ...s, next: crop } : s); if (s.type === 'crop-mark') crop = s.prev; render(); }
function redo() { const s = redoStack.pop(); if (!s) return; if (s.type === 'crop-mark') { shapes.push({ type: 'crop-mark', prev: crop }); crop = s.next; } else shapes.push(s); render(); }
function exportPng() {
  const full = document.createElement('canvas'); full.width = base.naturalWidth; full.height = base.naturalHeight;
  const g = full.getContext('2d'); g.drawImage(base, 0, 0); shapes.filter(s => s.type !== 'crop-mark').forEach(s => drawShape(g, s, base));
  const c = crop || { x1: 0, y1: 0, x2: full.width, y2: full.height };
  const out = document.createElement('canvas'); out.width = Math.round(c.x2 - c.x1); out.height = Math.round(c.y2 - c.y1);
  out.getContext('2d').drawImage(full, c.x1, c.y1, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise(r => out.toBlob(async b => r(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}
async function act(name) {
  if (name === 'cancel') return window.shelf.send('capture:close');
  if (name === 'undo') return undo();
  if (name === 'redo') return redo();
  const png = await exportPng();
  if (name === 'copy') { await window.shelf.invoke('capture:copy', png); return window.shelf.send('capture:close'); }
  if (name === 'save') { await window.shelf.invoke('capture:save', png); return window.shelf.send('capture:close'); }
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') { if (drawing || selection) { drawing = selection = null; render(); } else act('cancel'); }
  else if (e.key === 'Enter' && !document.body.classList.contains('editing') && base) useRegion({ x1: 0, y1: 0, x2: base.naturalWidth, y2: base.naturalHeight });
  else if (e.key === 'Enter' && document.body.classList.contains('editing') && !(e.target instanceof HTMLButtonElement)) act('save');
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); act('copy'); }
  else if (document.body.classList.contains('editing') && !mod && 'cabhx'.includes(e.key.toLowerCase())) {
    const t = { c: 'crop', a: 'arrow', b: 'box', h: 'highlight', x: 'blur' }[e.key.toLowerCase()]; document.querySelector(`[data-tool="${t}"]`).click();
  }
});
addEventListener('resize', render);

(async () => {
  const job = await window.shelf.invoke('capture:job');
  mode = job.mode;
  if (job.mode === 'window') {
    $('#picker').hidden = false; $('#stage').hidden = true;
    const list = $('#windows');
    for (const w of job.windows) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.innerHTML = `<img alt="" src="${w.thumb}"><span></span>`; b.querySelector('span').textContent = w.name;
      b.onclick = async () => { const picture = await window.shelf.invoke('capture:window', w.id); $('#picker').hidden = true; $('#stage').hidden = false; await startEditing(picture); };
      li.appendChild(b); list.appendChild(li);
    }
    const first = list.querySelector('button'); if (first) first.focus();
    return;
  }
  if (job.mode === 'markup') return startEditing(job.image);
  base = await loadImage(job.image); canvas.width = base.naturalWidth; canvas.height = base.naturalHeight;
  canvas.style.width = '100vw'; canvas.style.height = '100vh'; render();
})();
if (location.search.includes('test=1')) window.__c = { act, setTool: t => document.querySelector(`[data-tool="${t}"]`).click(), state: () => ({ shapes: shapes.length, crop, mode }) };
