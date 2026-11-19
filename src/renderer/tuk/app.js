'use strict';
const { makeZip, uniqueNames, split, merge, detectKind, textKind, History, formatBytes } = TukCore;
const $ = s => document.querySelector(s);
const state = { items: [], view: 'shots', selected: new Set(), query: '', kind: '', lastClipSig: '' };
const urls = new Map(); // id -> object URL for previews
// Inside Drag Shelf the preload bridge gives native clipboard watching, capture and "add to shelf".
const desk = window.shelf && new URLSearchParams(location.search).has('desktop') ? window.shelf : null;
document.documentElement.classList.toggle('desktop', !!desk);

/* ---------- storage (IndexedDB) ---------- */
const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open('tuk', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' }).createIndex('created', 'created');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function tx(mode, fn) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction('items', mode), store = t.objectStore('items');
    const result = fn(store);
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = item => tx('readwrite', s => s.put(item));
const dbDelete = ids => tx('readwrite', s => ids.forEach(id => s.delete(id)));

/* ---------- adding items ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
async function blobSig(blob) {
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  let h = 0; for (const b of head) h = (h * 31 + b) | 0;
  return blob.type + blob.size + ':' + h;
}
async function addItem(partial) {
  const item = { id: uid(), created: Date.now(), caption: '', pinned: false, ...partial };
  // Re-copying the same thing moves it to the top instead of duplicating it.
  const dup = state.items.find(i => i.sig && i.sig === item.sig);
  if (dup) { dup.created = item.created; await dbPut(dup); render(); return dup; }
  state.items.push(item);
  await dbPut(item);
  render();
  return item;
}
async function addBlob(blob, name, source = 'paste', path = '') {
  const kind = detectKind(name, blob.type);
  const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg').replace(/[^a-z0-9]/gi, '');
  name = name || `${kind === 'image' ? 'screenshot' : 'pasted'}-${stamp()}.${ext}`;
  let width, height;
  if (kind === 'image') try { const bmp = await createImageBitmap(blob); width = bmp.width; height = bmp.height; bmp.close(); } catch (_) {}
  return addItem({ kind, name, mime: blob.type, size: blob.size, blob, width, height, source, path, sig: path ? 'p:' + path + ':' + blob.size : await blobSig(blob) });
}
async function addText(text, mime = 'text/plain', source = 'paste') {
  if (!text || !text.trim()) return;
  const kind = mime === 'text/html' ? 'html' : textKind(text);
  return addItem({ kind, text, mime, size: new Blob([text]).size, source, sig: 't:' + text.length + ':' + text.slice(0, 200) + text.slice(-50) });
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

// Reads a DataTransfer (paste or drop). Any file type is kept; images pasted as raw bitmaps arrive as files too.
async function ingestTransfer(dt, source) {
  const files = [...(dt.files || [])];
  let added = 0;
  for (const f of files) { await addBlob(f, f.name && !/^image\.(png|jpe?g)$/i.test(f.name) ? f.name : '', source); added++; }
  if (!files.length) {
    const html = dt.getData('text/html'), text = dt.getData('text/plain'), uri = dt.getData('text/uri-list');
    if (text || uri) { await addText(text || uri, 'text/plain', source); added++; }
    else if (html) { await addText(html, 'text/html', source); added++; }
  }
  if (added) toast(`Kept ${added} item${added > 1 ? 's' : ''}`);
}

// Items read by the main process: { type: 'file' | 'text' | 'html', name, mime, data, path, text }.
async function ingestNative(items, source) {
  for (const it of items) {
    if (it.type === 'file') await addBlob(new Blob([it.data], { type: it.mime || '' }), it.name, source, it.path || '');
    else await addText(it.text, it.type === 'html' ? 'text/html' : 'text/plain', source);
  }
  if (items.length) toast(source === 'auto' ? `Collected ${items.length} copied item${items.length > 1 ? 's' : ''}` : `Kept ${items.length} item${items.length > 1 ? 's' : ''}`);
  else if (source !== 'auto') toast('Clipboard is empty');
}

// Async Clipboard API: used by "Paste" and Auto-paste. Recognises every type the browser exposes.
async function readClipboard(silent) {
  if (desk) return ingestNative(await desk.invoke('tuk:read'), silent ? 'auto' : 'paste');
  if (!navigator.clipboard) return silent || toast('Clipboard access is not available here — use Ctrl/⌘+V');
  try {
    if (navigator.clipboard.read) {
      const entries = await navigator.clipboard.read();
      const sigParts = [];
      const found = [];
      for (const entry of entries) {
        const img = entry.types.find(t => t.startsWith('image/'));
        const other = entry.types.find(t => !t.startsWith('text/') && !t.startsWith('image/') && !t.startsWith('web '));
        const type = img || other || (entry.types.includes('text/plain') ? 'text/plain' : entry.types.find(t => t === 'text/html' || t === 'text/uri-list'));
        if (!type) continue;
        const blob = await entry.getType(type);
        if (type.startsWith('text/')) { const text = await blob.text(); sigParts.push(text.slice(0, 300)); found.push(() => addText(text, type === 'text/html' ? 'text/html' : 'text/plain', silent ? 'auto' : 'paste')); }
        else { sigParts.push(await blobSig(blob)); found.push(() => addBlob(blob, '', silent ? 'auto' : 'paste')); }
      }
      const sig = sigParts.join('|');
      if (silent && sig === state.lastClipSig) return;
      state.lastClipSig = sig;
      for (const add of found) await add();
      if (found.length && silent) toast('Auto-pasted from clipboard');
      if (!found.length && !silent) toast('Clipboard is empty');
    } else {
      const text = await navigator.clipboard.readText();
      if (silent && text === state.lastClipSig) return;
      state.lastClipSig = text; await addText(text, 'text/plain', silent ? 'auto' : 'paste');
    }
  } catch (err) {
    if (!silent) toast(err.name === 'NotAllowedError' ? 'Clipboard permission denied — press Ctrl/⌘+V instead' : 'Could not read clipboard: ' + err.message);
  }
}

/* ---------- screen capture ---------- */
async function capture() {
  if (desk) {
    try { const shot = await desk.invoke('tuk:capture', Number($('#scale').value)); await addBlob(new Blob([shot.data], { type: 'image/png' }), `capture-${stamp()}@${$('#scale').value}x.png`, 'capture'); toast(`Captured ${shot.width}×${shot.height}`); }
    catch (err) { toast('Capture failed: ' + String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) return toast('Screen capture is not supported in this browser');
  const scale = Number($('#scale').value);
  const targetW = Math.round(screen.width * scale), targetH = Math.round(screen.height * scale);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: targetW }, height: { ideal: targetH }, frameRate: { ideal: 5 } }, audio: false, preferCurrentTab: false });
  } catch (err) { return err.name !== 'NotAllowedError' && toast('Capture failed: ' + err.message); }
  try {
    const video = Object.assign(document.createElement('video'), { srcObject: stream, muted: true, playsInline: true });
    await video.play();
    await new Promise(r => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : setTimeout(r, 300)));
    const vw = video.videoWidth, vh = video.videoHeight;
    // Captured pixels come from the display; we upscale only if the source is smaller than the chosen multiple of the CSS size.
    const factor = Math.max(1, Math.min(4, (targetW / vw)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * factor); canvas.height = Math.round(vh * factor);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    await addBlob(blob, `capture-${stamp()}@${scale}x.png`, 'capture');
    toast(`Captured ${canvas.width}×${canvas.height}`);
  } finally { stream.getTracks().forEach(t => t.stop()); }
}

/* ---------- rendering ---------- */
function visibleItems() {
  const q = state.query.toLowerCase();
  return state.items
    .filter(i => state.view === 'shots' ? i.kind === 'image' : state.view === 'pinned' ? i.pinned : true)
    .filter(i => !state.kind || i.kind === state.kind)
    .filter(i => !q || [i.caption, i.name, i.text, i.kind].some(v => v && v.toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned - a.pinned) || (b.created - a.created));
}
function urlFor(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob));
  return urls.get(item.id);
}
function render() {
  $('#count-shots').textContent = state.items.filter(i => i.kind === 'image').length;
  $('#count-history').textContent = state.items.length;
  $('#count-pinned').textContent = state.items.filter(i => i.pinned).length;
  const textMode = state.view === 'text';
  $('#text-view').hidden = !textMode; $('#list-toolbar').hidden = textMode; $('#grid').hidden = textMode;
  if (textMode) { $('#empty').hidden = true; return; }
  const items = visibleItems();
  for (const id of state.selected) if (!state.items.some(i => i.id === id)) state.selected.delete(id);
  $('#delete-selected').disabled = !state.selected.size;
  $('#export').textContent = state.selected.size ? `Export ${state.selected.size} as ZIP` : 'Export ZIP';
  $('#empty').hidden = items.length > 0;
  const grid = $('#grid');
  const existing = new Map([...grid.children].map(el => [el.dataset.id, el]));
  const keep = new Set(items.map(i => i.id));
  existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });
  // Only move cards whose position changed, so their entrance animation doesn't replay on every render.
  items.forEach((item, index) => {
    const el = existing.get(item.id) || card(item); updateCard(el, item);
    if (grid.children[index] !== el) grid.insertBefore(el, grid.children[index] || null);
  });
}
function card(item) {
  const el = document.createElement('article');
  el.className = 'card enter'; el.dataset.id = item.id;
  setTimeout(() => el.classList.remove('enter'), 300); // also clears cards created while the grid was hidden
  const preview = document.createElement('div');
  if (item.blob && item.kind === 'image') { preview.className = 'preview'; const img = new Image(); img.loading = 'lazy'; img.alt = ''; img.src = urlFor(item); preview.append(img); }
  else if (item.text != null) { preview.className = 'preview text'; preview.textContent = item.kind === 'html' ? htmlToText(item.text).slice(0, 600) : item.text.slice(0, 600); if (item.kind === 'color') preview.style.background = item.text.trim(); }
  else { preview.className = 'preview'; preview.innerHTML = `<span class="glyph"></span>`; preview.firstChild.textContent = (item.name.split('.').pop() || item.kind).slice(0, 5); }
  preview.onclick = () => open(item);
  el.innerHTML = `<input type="checkbox" class="check" aria-label="Select"><div class="meta"><input class="caption" placeholder="Add a caption…" aria-label="Caption"><div class="sub"></div><div class="actions"><button data-a="copy" title="Copy back to clipboard">Copy</button><button data-a="pin" title="Pin">📌</button><button data-a="download" title="Download">↓</button><button data-a="text" title="Open in Split / Merge">✂</button><button data-a="shelf" class="desk-only" title="Add to the current shelf">⇪ Shelf</button><button data-a="delete" title="Delete">✕</button></div></div>`;
  el.prepend(preview);
  el.querySelector('.check').onchange = e => { e.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id); render(); };
  const caption = el.querySelector('.caption');
  const saveCaption = debounce(it => dbPut(it), 300);
  caption.oninput = () => { const it = find(item.id); it.caption = caption.value; saveCaption(it); };
  el.querySelector('.actions').onclick = e => { const a = e.target.closest('button')?.dataset.a; if (a) actions[a](find(item.id)); };
  return el;
}
function updateCard(el, item) {
  el.classList.toggle('selected', state.selected.has(item.id));
  el.querySelector('.check').checked = state.selected.has(item.id);
  const caption = el.querySelector('.caption'); if (document.activeElement !== caption) caption.value = item.caption || '';
  const dims = item.width ? `${item.width}×${item.height}` : '';
  el.querySelector('.sub').innerHTML = '';
  for (const part of [item.kind, dims, formatBytes(item.size || 0), timeAgo(item.created), item.name || ''].filter(Boolean)) {
    const span = document.createElement('span'); span.textContent = part; if (part === item.kind) span.className = 'tag'; el.querySelector('.sub').append(span);
  }
  el.querySelector('[data-a=pin]').classList.toggle('on', item.pinned);
  el.querySelector('[data-a=pin]').setAttribute('aria-pressed', item.pinned);
  el.querySelector('[data-a=text]').hidden = item.text == null;
}
const find = id => state.items.find(i => i.id === id);
function htmlToText(html) { return new DOMParser().parseFromString(html, 'text/html').body.textContent || ''; }
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : new Date(t).toLocaleDateString();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function open(item) {
  if (item.kind === 'image') { $('#viewer-img').src = urlFor(item); $('#viewer').showModal(); }
  else if (item.text != null) actions.text(item);
  else actions.download(item);
}

/* ---------- item actions ---------- */
const actions = {
  async copy(item) {
    try {
      if (desk) {
        if (item.kind === 'image') await desk.invoke('tuk:copy', { png: new Uint8Array(await (item.mime === 'image/png' ? item.blob : await toPng(item.blob)).arrayBuffer()) });
        else if (item.text != null) await desk.invoke('tuk:copy', item.kind === 'html' ? { html: item.text, text: htmlToText(item.text) } : { text: item.text });
        else if (item.path) { await desk.invoke('tuk:copy', { path: item.path }); return toast('File path copied'); }
        else return actions.download(item);
        return toast('Copied to clipboard');
      }
      if (item.text != null) {
        if (item.kind === 'html' && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([item.text], { type: 'text/html' }), 'text/plain': new Blob([htmlToText(item.text)], { type: 'text/plain' }) })]);
        else await navigator.clipboard.writeText(item.text);
      } else if (item.kind === 'image') {
        const png = item.mime === 'image/png' ? item.blob : await toPng(item.blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      } else return toast('Browsers can only copy text and images — downloading instead'), actions.download(item);
      state.lastClipSig = '__self__'; // don't let auto-paste re-add what we just copied
      toast('Copied to clipboard');
    } catch (err) { toast('Copy failed: ' + err.message); }
  },
  pin(item) { item.pinned = !item.pinned; render(); dbPut(item); },
  download(item) { const blob = itemBlob(item); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName(item) }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
  text(item) { setView('text'); setText(item.kind === 'html' ? htmlToText(item.text) : item.text, true); },
  async delete(item) { await removeItems([item.id]); },
  async shelf(item) {
    if (!desk) return;
    const payload = item.text != null ? { text: item.kind === 'html' ? htmlToText(item.text) : item.text } : { path: item.path, name: fileName(item), data: new Uint8Array(await item.blob.arrayBuffer()) };
    try { const name = await desk.invoke('tuk:to-shelf', payload); toast(`Added to ${name}`); } catch (err) { toast('Could not add to shelf: ' + err.message); }
  },
};
async function removeItems(ids) {
  const removed = state.items.filter(i => ids.includes(i.id));
  await dbDelete(ids);
  state.items = state.items.filter(i => !ids.includes(i.id));
  ids.forEach(id => { if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } state.selected.delete(id); });
  render();
  toast(`Deleted ${removed.length} — `, 'Undo', async () => { for (const i of removed) { state.items.push(i); await dbPut(i); } render(); });
}
async function toPng(blob) {
  const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0); return new Promise(r => c.toBlob(r, 'image/png'));
}
function itemBlob(item) { return item.blob || new Blob([item.text], { type: item.kind === 'html' ? 'text/html' : 'text/plain' }); }
function fileName(item) {
  if (item.name) { const cap = item.caption?.trim(); if (!cap) return item.name; const ext = item.name.includes('.') ? item.name.slice(item.name.lastIndexOf('.')) : ''; return cap + ext; }
  return (item.caption?.trim() || `${item.kind}-${new Date(item.created).toISOString().slice(0, 19).replace(/[T:]/g, '-')}`) + (item.kind === 'html' ? '.html' : '.txt');
}
async function exportZip() {
  const items = state.selected.size ? state.items.filter(i => state.selected.has(i.id)) : visibleItems();
  if (!items.length) return toast('Nothing to export');
  const names = uniqueNames(items.map(fileName));
  const entries = [];
  for (const [n, item] of items.entries()) entries.push({ name: names[n], data: new Uint8Array(await itemBlob(item).arrayBuffer()), date: new Date(item.created) });
  const index = items.map((it, n) => `${names[n]}\t${new Date(it.created).toISOString()}\t${it.kind}\t${(it.caption || '').replace(/\s+/g, ' ')}`).join('\n');
  entries.push({ name: 'captions.tsv', data: new TextEncoder().encode('file\tcreated\tkind\tcaption\n' + index + '\n') });
  const zip = new Blob([makeZip(entries)], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(zip), download: `tuk-${stamp()}.zip` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Exported ${items.length} item${items.length > 1 ? 's' : ''} (${formatBytes(zip.size)})`);
}

/* ---------- Split / Merge with undo/redo ---------- */
const textHistory = new History(300);
const ta = $('#text');
let typingSnapshot = null;
function setText(value, record = true) {
  if (record && value !== ta.value) textHistory.record(ta.value);
  ta.value = value; persistText(); updateTextUi();
}
function opts() { return { trim: $('#opt-trim').checked, skipEmpty: $('#opt-empty').checked, unique: $('#opt-unique').checked, regex: $('#opt-regex').checked, wrap: $('#opt-wrap').value }; }
function updateTextUi() {
  $('#undo').disabled = !textHistory.canUndo; $('#redo').disabled = !textHistory.canRedo;
  const v = ta.value; $('#text-stats').textContent = `${v ? v.split(/\r?\n/).length : 0} lines · ${[...v].length} characters`;
}
const persistText = debounce(() => { try { localStorage.setItem('tuk-text', ta.value); } catch (_) {} }, 300);
function undo() { flushTyping(); const v = textHistory.undo(ta.value); if (v != null) { ta.value = v; persistText(); updateTextUi(); } }
function redo() { flushTyping(); const v = textHistory.redo(ta.value); if (v != null) { ta.value = v; persistText(); updateTextUi(); } }
// Typing is grouped into one undo step per pause.
const endTyping = debounce(() => { typingSnapshot = null; }, 700);
function flushTyping() { typingSnapshot = null; }
ta.addEventListener('beforeinput', () => { if (typingSnapshot === null) { typingSnapshot = ta.value; textHistory.record(typingSnapshot); } endTyping(); });
ta.addEventListener('input', () => { persistText(); updateTextUi(); });
$('#do-split').onclick = () => { try { setText(split(ta.value, $('#sep').value, opts())); } catch (e) { toast('Invalid pattern: ' + e.message); } };
$('#do-merge').onclick = () => { const { wrap, ...o } = opts(); setText(merge(ta.value, $('#sep').value, { ...o, wrap })); };
$('#do-sort').onclick = () => setText(ta.value.split(/\r?\n/).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('\n'));
$('#do-reverse').onclick = () => setText(ta.value.split(/\r?\n/).reverse().join('\n'));
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#text-copy').onclick = async () => { try { await navigator.clipboard.writeText(ta.value); state.lastClipSig = '__self__'; toast('Copied'); } catch (e) { toast('Copy failed: ' + e.message); } };
$('#text-keep').onclick = async () => { await addText(ta.value, 'text/plain', 'text'); toast('Kept in history'); };
$('#sep-chips').onclick = e => { const b = e.target.closest('button'); if (b) $('#sep').value = b.dataset.sep; };

/* ---------- global events ---------- */
function setView(view) {
  state.view = view;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
  try { localStorage.setItem('tuk-view', view); } catch (_) {}
  render();
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); };
$('#search').oninput = debounce(e => { state.query = e.target.value; render(); }, 120);
$('#kind-filter').onchange = e => { state.kind = e.target.value; render(); };
$('#capture').onclick = capture;
$('#paste-now').onclick = () => readClipboard(false);
$('#file-input').onchange = async e => { for (const f of e.target.files) await addBlob(f, f.name, 'file'); e.target.value = ''; };
$('#export').onclick = exportZip;
$('#select-all').onclick = () => { const vis = visibleItems(); const all = vis.every(i => state.selected.has(i.id)); vis.forEach(i => all ? state.selected.delete(i.id) : state.selected.add(i.id)); render(); };
$('#delete-selected').onclick = () => removeItems([...state.selected]);
$('#scale').onchange = e => { try { localStorage.setItem('tuk-scale', e.target.value); } catch (_) {} };

document.addEventListener('paste', e => {
  const target = e.target;
  if (target === ta || (target.matches && target.matches('input'))) return; // normal pasting into fields
  e.preventDefault();
  ingestTransfer(e.clipboardData, 'paste');
});
let dragDepth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#dropzone').hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropzone').hidden = true; if (e.target !== ta) ingestTransfer(e.dataTransfer, 'drop'); });

document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (state.view === 'text' && mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (state.view === 'text' && mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); if (state.view === 'text') setView('history'); $('#search').focus(); }
  else if (e.key === 'Escape' && state.selected.size) { state.selected.clear(); render(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected.size && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) removeItems([...state.selected]);
});

// Auto-paste: read the clipboard each time the page regains focus (browsers only allow reads while focused).
const autoBox = $('#auto-paste');
autoBox.onchange = () => {
  if (desk) return desk.invoke('tuk:auto', autoBox.checked);
  try { localStorage.setItem('tuk-auto', autoBox.checked ? '1' : ''); } catch (_) {}
  if (autoBox.checked) readClipboard(true);
};
const autoRead = () => { if (!desk && autoBox.checked && document.hasFocus() && document.visibilityState === 'visible') readClipboard(true); };
addEventListener('focus', autoRead);
document.addEventListener('visibilitychange', autoRead);
setInterval(autoRead, 2000);

// Theme
const themeBtn = $('#theme');
function applyTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('tuk-theme', t); } catch (_) {} }
themeBtn.onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

let toastTimer;
function toast(msg, actionLabel, action) {
  const el = $('#toast'); el.textContent = msg;
  if (actionLabel) { const b = document.createElement('button'); b.textContent = actionLabel; b.style.cssText = 'margin-left:8px;padding:2px 8px;pointer-events:auto'; b.onclick = () => { action(); el.classList.remove('show'); }; el.append(b); el.style.pointerEvents = 'auto'; }
  else el.style.pointerEvents = 'none';
  el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 5000 : 2200);
}

/* ---------- start ---------- */
(async function init() {
  let saved = {};
  try { saved = { theme: localStorage.getItem('tuk-theme'), view: localStorage.getItem('tuk-view'), auto: localStorage.getItem('tuk-auto'), scale: localStorage.getItem('tuk-scale'), text: localStorage.getItem('tuk-text') }; } catch (_) {}
  applyTheme(saved.theme || 'dark');
  autoBox.checked = !!saved.auto;
  if (desk) {
    try { autoBox.checked = !!(await desk.invoke('tuk:info')).auto; } catch (_) {}
    desk.on('tuk:clip', items => ingestNative(items, 'auto'));
    desk.on('tuk:auto', on => { autoBox.checked = !!on; });
    autoBox.parentElement.title = 'Collect everything you copy, even while this window is closed';
  }
  localize(new URLSearchParams(location.search).get('lang') || (navigator.language.startsWith('km') ? 'km' : 'en'));
  if (saved.scale) $('#scale').value = saved.scale;
  ta.value = saved.text || ''; updateTextUi();
  try { const stored = await dbAll(); const ids = new Set(state.items.map(i => i.id)); state.items = [...stored.filter(i => !ids.has(i.id)), ...state.items]; } catch (err) { toast('Storage unavailable: ' + err.message); }
  try { navigator.storage?.persist?.(); } catch (_) {}
  setView(saved.view || 'shots');
  setInterval(() => state.view !== 'text' && render(), 60000);
})();

/* ---------- Khmer interface ---------- */
function localize(lang) {
  if (lang !== 'km') return;
  document.documentElement.lang = 'km';
  const km = { 'Shots': 'រូបថត', 'History': 'ប្រវត្តិ', 'Pinned': 'បានខ្ទាស់', 'Split / Merge': 'បំបែក / បញ្ចូល', 'Auto-paste': 'បិទភ្ជាប់ស្វ័យប្រវត្តិ',
    'Capture screen': 'ថតអេក្រង់', 'Paste': 'បិទភ្ជាប់', 'Add files': 'បន្ថែមឯកសារ', 'Select all': 'ជ្រើសទាំងអស់', 'Export ZIP': 'នាំចេញ ZIP', 'Delete': 'លុប',
    'Split → lines': 'បំបែក → បន្ទាត់', 'Merge lines →': 'បញ្ចូលបន្ទាត់ →', 'Sort': 'តម្រៀប', 'Reverse': 'បញ្ច្រាស', '↶ Undo': '↶ មិនធ្វើវិញ', '↷ Redo': '↷ ធ្វើវិញ',
    'Copy': 'ចម្លង', 'Keep': 'ទុក', 'All types': 'គ្រប់ប្រភេទ', 'Paste anything to keep it.': 'បិទភ្ជាប់អ្វីក៏បាន ដើម្បីទុកវា។' };
  const walk = node => { for (const n of node.childNodes) { if (n.nodeType === 3) { const t = n.textContent.trim(); if (km[t]) n.textContent = n.textContent.replace(t, km[t]); } else if (n.nodeType === 1 && !/SCRIPT|STYLE|TEXTAREA/.test(n.tagName)) walk(n); } };
  walk(document.body);
  $('#search').placeholder = 'ស្វែងរកចំណងជើង អត្ថបទ ឈ្មោះឯកសារ…  ( / )';
  $('#text').placeholder = 'បិទភ្ជាប់ ឬវាយអត្ថបទនៅទីនេះ រួចបំបែក ឬបញ្ចូលបន្ទាត់។';
}
