'use strict';
const $ = selector => document.querySelector(selector);
const t = (key, values) => Locale.t(key, values);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const invoke = (channel, ...args) => window.shelf.invoke(channel, ...args);
let data, config, state, plan = null, busy = false, phase = 'edit', result = null;
const expanded = new Set();
function bytes(value) { if (value < 1000) return Locale.number(value) + ' B'; let unit = -1; const units = ['KB', 'MB', 'GB', 'TB']; do { value /= 1000; unit++; } while (value >= 1000 && unit < 3); return Locale.number(Math.round(value * 10) / 10) + ' ' + units[unit]; }
function status(message, type = '') { $('#status').textContent = message; $('#status').className = 'status ' + type; $('#status').hidden = !message; }
function checkResult(value) { if (value && value.error) { const key = value.error + 'Delivery'; status(t(I18N.messages.en[key] ? key : 'deliveryOperationFailed'), value.error === 'cancelled' ? '' : 'bad'); return false; } return true; }
function setBusy(value) {
  busy = value; $('#busyPanel').hidden = !value;
  document.querySelectorAll('.work-scroll input,.work-scroll select,.work-scroll textarea,.work-scroll button,#primary,#saveRecipe,#recipe,#addFiles,.source-file input,[data-language-select],#recipeForm input,#recipeForm button').forEach(el => { el.disabled = value; });
}
function dirty(renderAgain = true) {
  plan = null; phase = 'edit'; result = null; $('#revealResult').hidden = true;
  status(t('changesPending')); $('#primary').textContent = t('reviewPreparation');
  invoke('delivery:update', config).then(checkResult);
  if (renderAgain) render();
  else { renderPreview(); document.querySelectorAll('.req-status').forEach(el => { el.textContent = t('notChecked'); }); document.querySelectorAll('.req-mark').forEach(el => { el.className = 'req-mark'; el.textContent = '·'; }); }
}
async function load(force = false) {
  const next = await invoke('delivery:info'); if (!checkResult(next)) return;
  const same = data && data.shelf.id === next.shelf.id; data = next;
  if (!config || force || !same) { config = clone(data.shelf.delivery); plan = null; phase = 'edit'; }
  render();
}
function reqTitle(req) { return req.title || t(I18N.messages.en[req.id + 'Requirement'] ? req.id + 'Requirement' : 'newRequirement'); }
const matchKeys = ['assets', 'images', 'sources', 'invoice', 'instructions', 'documents', 'text', 'links', 'any', 'manual'];
function renderSources() {
  if (!data) return;
  $('#shelfName').textContent = data.shelf.name;
  $('#sourceCount').textContent = t('deliverySummary', { count: Locale.number(data.shelf.items.length), size: '' }).replace(/ ·\s*$/, '');
  $('#sourceFiles').innerHTML = data.shelf.items.map((file, index) => {
    const included = !config.excluded.includes(file.path);
    return `<li class="source-file${included ? '' : ' excluded'}"><div class="source-tile">${file.thumb ? `<img src="${esc(file.thumb)}" alt="">` : window.glyph(file.kind)}</div><div><div class="file-name" title="${esc(file.name)}">${esc(file.stem)}</div><small>${esc([file.label, file.detail].filter(Boolean).join(' · '))}</small></div><input type="checkbox" data-include="${index}" aria-label="${esc(t('includeOutput') + ': ' + file.name)}" ${included ? 'checked' : ''} ${busy ? 'disabled' : ''}></li>`;
  }).join('');
}
function renderRequirements() {
  $('#requirements').innerHTML = config.requirements.map((req, index) => {
    const checked = plan && plan.requirements.find(item => item.id === req.id), met = checked && checked.met;
    const label = !checked ? t('notChecked') : met ? t('added') : req.required ? t('notAdded') : t('optional');
    return `<details class="requirement" data-req="${index}" ${expanded.has(req.id) ? 'open' : ''}><summary><span class="req-mark${met ? ' met' : checked && req.required ? ' missing' : ''}">${met ? window.glyph('check') : checked && req.required ? '!' : '·'}</span><span class="req-title">${esc(reqTitle(req))}</span><span class="req-status">${esc(label)}</span>${window.glyph('chevron')}</summary><div class="req-options"><input type="text" data-req-title="${index}" value="${esc(req.title)}" placeholder="${esc(reqTitle(req))}" aria-label="${esc(t('newRequirement'))}"><label><input type="checkbox" data-req-required="${index}" ${req.required ? 'checked' : ''}>${esc(t('required'))}</label><label class="rule">${esc(t('matchRule'))}<select data-req-match="${index}">${matchKeys.map(key => `<option value="${key}" ${req.match === key ? 'selected' : ''}>${esc(t(key + 'Match'))}</option>`).join('')}</select></label><span>${esc(t('assignFiles'))}</span><div class="assign-list">${data.shelf.items.map((file, fileIndex) => `<label><input type="checkbox" data-assign-req="${index}" data-assign-file="${fileIndex}" ${req.assigned.includes(file.path) ? 'checked' : ''}>${esc(file.name)}</label>`).join('')}</div><button class="quiet" data-add-req="${index}">${esc(t('addFile'))}</button><button class="text-action" data-remove-req="${index}">${esc(t('removeRequirement'))}</button></div></details>`;
  }).join('');
  document.querySelectorAll('.requirement').forEach(el => el.addEventListener('toggle', () => { const req = config.requirements[+el.dataset.req]; if (req) el.open ? expanded.add(req.id) : expanded.delete(req.id); }));
  $('#issues').innerHTML = plan ? plan.issues.map(issue => `<div class="issue${issue.blocking ? ' blocking' : ''}">${esc(t(issue.code + 'Issue', { ...issue, count: Locale.number(issue.count || 0), limit: Locale.number(issue.limit || 0) }))}</div>`).join('') : '';
}
function renderPreview() {
  $('#primary').textContent = t(phase === 'review' && plan && plan.canExport ? 'createDelivery' : 'reviewPreparation');
  $('#outputOverview').hidden = !plan;
  if (plan) {
    const summary = t('deliverySummary', { count: Locale.number(plan.count), size: bytes(plan.totalBytes) });
    const paths = [...plan.files.slice(0, 2).map(file => file.relativeOutput), ...plan.generated].join(' · ');
    $('#outputOverview').innerHTML = `<strong>${esc(t('deliveryFolder'))}: ${esc(plan.project)}${config.options.format === 'zip' ? '.zip' : '/'} — ${esc(summary)}</strong><span>${esc(paths)}</span>`;
    $('#outputOverview').title = paths;
  }
  if (!plan) { $('#previewSummary').textContent = t('previewHelp'); $('#outputPreview').innerHTML = `<p class="placeholder">${esc(t('previewHelp'))}</p>`; return; }
  $('#previewSummary').textContent = t('deliverySummary', { count: Locale.number(plan.count), size: bytes(plan.totalBytes) }) + ' · ' + t(plan.canExport ? 'readyDelivery' : 'needsAttention');
  const folders = new Set();
  let tree = `<li class="folder">${window.glyph('folder')}<strong>${esc(plan.project)}/</strong></li>`;
  for (const file of plan.files) {
    const parts = file.relativeOutput.split('/');
    for (let i = 0; i < parts.length - 1; i++) { const full = parts.slice(0, i + 1).join('/'); if (!folders.has(full)) { folders.add(full); tree += `<li class="folder" style="padding-left:${12 * (i + 1)}px">${window.glyph('folder')}${esc(parts[i])}/</li>`; } }
    tree += `<li style="padding-left:${12 * parts.length}px">${window.glyph('file')}${esc(parts.at(-1))}</li>`;
  }
  tree += plan.generated.map(name => `<li style="padding-left:12px">${window.glyph('file')}${esc(name)}</li>`).join('');
  $('#outputPreview').innerHTML = `<ul class="tree">${tree}</ul><div class="mapping"><h3>${esc(t('filenameExamples'))}</h3>${plan.files.map(file => `<article>${esc(file.name)}<div class="new-name">→ ${esc(file.relativeOutput)}</div><small>${esc(bytes(file.size))} → ${esc(bytes(file.outputSize))}${file.width ? ` · ${Locale.number(file.width)} × ${Locale.number(file.height)} px` : ''}</small></article>`).join('')}</div>`;
}
function renderHistory() {
  $('#historyList').innerHTML = data.history.length ? data.history.map(item => `<article class="history-item"><h3>${esc(item.project)}</h3><p>${esc(I18N.date(Locale.language, item.created))} · ${Locale.number(item.count)} · ${esc(item.format.toUpperCase())}</p><div><button class="quiet" data-history-id="${esc(item.id)}" data-history-action="reveal" ${item.exists ? '' : 'disabled'}>${esc(t('revealDelivery'))}</button><button class="quiet" data-history-id="${esc(item.id)}" data-history-action="restore">${esc(t('restoreShelf'))}</button></div></article>`).join('') : `<p class="field-help">${esc(t('historyEmpty'))}</p>`;
}
function render() {
  if (!data || !config) return;
  Locale.apply(); document.title = t('prepareDelivery');
  $('#historyButton').innerHTML = window.glyph('history') + esc(t('history'));
  const selected = $('#recipe').value;
  $('#recipe').innerHTML = Object.keys(data.templates).map(key => `<option value="${key}">${esc(t(key + 'Template'))}</option>`).join('') + data.recipes.map(recipe => `<option value="recipe:${esc(recipe.id)}">${esc(recipe.name)}</option>`).join('');
  $('#recipe').value = selected && [...$('#recipe').options].some(option => option.value === selected) ? selected : config.template;
  $('#projectName').value = config.project || data.shelf.name; $('#notes').value = config.notes;
  for (const key of ['naming', 'resize', 'imageFormat', 'maxMB', 'format', 'quality']) $('#' + key).value = config.options[key];
  for (const key of ['readme', 'index', 'group', 'deduplicate']) $('#' + key).checked = !!config.options[key];
  renderSources(); renderRequirements(); renderPreview(); renderHistory(); setBusy(busy);
}
async function analyze() {
  setBusy(true); status('');
  try { const next = await invoke('delivery:analyze', config); if (!checkResult(next)) return; plan = next; phase = plan.canExport ? 'review' : 'edit'; result = null; $('#revealResult').hidden = true; status(t(plan.canExport ? 'readyDelivery' : 'notReadyDelivery'), plan.canExport ? 'good' : 'bad'); renderRequirements(); renderPreview(); }
  catch (_) { status(t('deliveryOperationFailed'), 'bad'); } finally { setBusy(false); }
}
async function exportDelivery() {
  if (!plan) return analyze();
  setBusy(true); status('');
  try {
    const next = await invoke('delivery:export', plan.id); if (!checkResult(next) || next.cancelled) return;
    result = next; phase = 'done'; $('#revealResult').hidden = false;
    status(t(next.warning ? next.warning + 'Delivery' : 'deliveryCreated') + ' — ' + next.output, next.warning ? '' : 'good');
    const fresh = await invoke('delivery:info'); if (checkResult(fresh)) { data.history = fresh.history; renderHistory(); }
    renderPreview();
  } catch (_) { status(t('deliveryOperationFailed'), 'bad'); } finally { setBusy(false); }
}
$('#primary').onclick = () => phase === 'review' && plan && plan.canExport ? exportDelivery() : analyze();
$('#runChecks').onclick = analyze;
$('#outputOverview').onclick = () => { $('.preview-section').scrollIntoView({ block: 'start' }); $('#format').focus({ preventScroll: true }); };
$('#cancelJob').onclick = () => invoke('delivery:cancel');
$('#addFiles').onclick = async () => { const fresh = await invoke('delivery:add'); if (checkResult(fresh)) { data = fresh; dirty(); } };
$('#saveRecipe').onclick = () => { $('#recipeForm').hidden = !$('#recipeForm').hidden; $('#recipeName').value = config.project || data.shelf.name; if (!$('#recipeForm').hidden) $('#recipeName').focus(); };
$('#recipeForm').onsubmit = async event => { event.preventDefault(); const fresh = await invoke('delivery:recipe', $('#recipeName').value, config); if (checkResult(fresh)) { data.recipes = fresh.recipes; $('#recipeForm').hidden = true; render(); status(t('shortcutSaved'), 'good'); } };
$('#historyButton').onclick = () => { renderHistory(); $('#historyPanel').hidden = false; };
$('#closeHistory').onclick = () => { $('#historyPanel').hidden = true; };
$('#closeHistory').innerHTML = window.glyph('close');
$('#revealResult').onclick = async () => { if (result) checkResult(await invoke('delivery:reveal', result.id)); };
document.querySelectorAll('[data-window]').forEach(button => { button.innerHTML = window.glyph(button.dataset.window); button.onclick = () => window.shelf.send('delivery:window', button.dataset.window); });
$('#recipe').onchange = () => {
  const choice = $('#recipe').value;
  const next = choice.startsWith('recipe:') ? data.recipes.find(recipe => recipe.id === choice.slice(7)).config : data.templates[choice];
  const project = config.project, excluded = config.excluded; config = clone(next); config.project = project; config.excluded = excluded; expanded.clear(); dirty();
};
$('#addRequirement').onclick = () => { const req = { id: 'custom-' + crypto.randomUUID(), title: '', required: true, match: 'manual', assigned: [] }; config.requirements.push(req); expanded.add(req.id); dirty(); };
$('#requirements').addEventListener('click', async event => {
  const remove = event.target.closest('[data-remove-req]'), add = event.target.closest('[data-add-req]');
  if (remove) { config.requirements.splice(+remove.dataset.removeReq, 1); dirty(); }
  if (add) { const fresh = await invoke('delivery:add', config.requirements[+add.dataset.addReq].id); if (checkResult(fresh)) { data = fresh; config = clone(fresh.shelf.delivery); dirty(); } }
});
$('#requirements').addEventListener('change', event => {
  const el = event.target;
  if (el.dataset.reqRequired !== undefined) config.requirements[+el.dataset.reqRequired].required = el.checked;
  else if (el.dataset.reqMatch !== undefined) config.requirements[+el.dataset.reqMatch].match = el.value;
  else if (el.dataset.assignReq !== undefined) { const req = config.requirements[+el.dataset.assignReq], file = data.shelf.items[+el.dataset.assignFile].path; req.assigned = req.assigned.filter(p => p !== file); if (el.checked) req.assigned.push(file); }
  else return;
  dirty();
});
$('#requirements').addEventListener('input', event => { const el = event.target; if (el.dataset.reqTitle !== undefined) { config.requirements[+el.dataset.reqTitle].title = el.value; dirty(false); } });
$('#sourceFiles').addEventListener('change', event => { const el = event.target; if (el.dataset.include === undefined) return; const file = data.shelf.items[+el.dataset.include].path; config.excluded = config.excluded.filter(p => p !== file); if (!el.checked) config.excluded.push(file); dirty(); });
for (const key of ['naming', 'resize', 'imageFormat', 'maxMB', 'format', 'quality', 'readme', 'index', 'group', 'deduplicate']) {
  $('#' + key).onchange = event => { const el = event.target; config.options[key] = el.type === 'checkbox' ? el.checked : ['resize', 'maxMB', 'quality'].includes(key) ? Number(el.value) : el.value; dirty(); };
}
$('#projectName').oninput = event => { config.project = event.target.value; dirty(false); };
$('#notes').oninput = event => { config.notes = event.target.value; dirty(false); };
$('#historyList').addEventListener('click', async event => {
  const button = event.target.closest('[data-history-id]'); if (!button || busy) return;
  const fresh = await invoke('delivery:history', button.dataset.historyId, button.dataset.historyAction);
  if (!checkResult(fresh)) return;
  if (button.dataset.historyAction === 'restore') { data = fresh; config = clone(data.shelf.delivery); plan = null; phase = 'edit'; result = null; $('#recipe').value = ''; $('#historyPanel').hidden = true; $('#revealResult').hidden = true; status(''); render(); }
});
window.shelf.on('delivery:progress', value => { if (value.stage === 'idle') return; $('#busyText').textContent = t(value.stage) + (value.total ? ` ${Locale.number(value.current)}/${Locale.number(value.total)}` : ''); $('#progress').max = value.total || 1; $('#progress').value = value.current || 0; });
function applyAppearance() {
  if (!state) return;
  document.documentElement.dataset.scheme = state.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.settings.theme;
  document.documentElement.dataset.accent = state.settings.accent;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);
window.shelf.on('state', next => {
  state = next; applyAppearance(); if (!data) return;
  const shelf = next.shelves.find(item => item.id === data.shelf.id);
  if (shelf) {
    const changed = JSON.stringify(shelf.items.map(item => item.path)) !== JSON.stringify(data.shelf.items.map(item => item.path));
    data.shelf = { ...shelf, delivery: data.shelf.delivery };
    if (changed && plan) { plan = null; phase = 'edit'; status(t('changesPending')); renderPreview(); }
    renderSources();
  }
});
addEventListener('languagechange', () => { if (!busy) { plan = null; phase = 'edit'; render(); } });
const collection = $('.collection');
collection.addEventListener('dragover', event => { event.preventDefault(); if (!busy) collection.classList.add('drop-hot'); });
collection.addEventListener('dragleave', () => collection.classList.remove('drop-hot'));
collection.addEventListener('drop', async event => {
  event.preventDefault(); collection.classList.remove('drop-hot'); if (busy || !data || !state) return;
  const snapshot = DropFiles.capture(event.dataTransfer);
  const shelf = state.shelves.findIndex(item => item.id === data.shelf.id); if (shelf < 0) return;
  const { paths, blobs } = await DropFiles.resolve(snapshot);
  await invoke('act', 'add', { shelf, paths }); await load(); dirty();
  for (const file of blobs) await invoke('drop:blob', shelf, file.name, await file.arrayBuffer());
  if (blobs.length) { await load(); dirty(); }
});
invoke('state:get').then(next => { state = next; applyAppearance(); });
load();
