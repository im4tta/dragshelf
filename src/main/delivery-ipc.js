'use strict';
const fs = require('fs');
const { ipcMain, dialog, shell } = require('electron');
const { defaults, normalize } = require('./delivery');
const copy = value => JSON.parse(JSON.stringify(value));

module.exports = function registerDelivery(ctx) {
  let job = null, pending = Promise.resolve();
  const source = () => { const shelf = ctx.store().shelves.find(s => s.id === ctx.shelfId()); if (!shelf) throw Object.assign(new Error('shelfGone'), { code: 'shelfGone' }); return shelf; };
  const info = async () => {
    const shelf = source(), state = await ctx.state();
    return { shelf: { ...state.shelves.find(s => s.id === shelf.id), delivery: normalize(shelf.delivery || defaults()) },
      templates: Object.fromEntries(['client', 'social', 'submission', 'research', 'custom'].map(type => [type, defaults(type)])),
      recipes: ctx.service().data.recipes,
      history: ctx.service().data.history.map(item => ({ id: item.id, created: item.created, project: item.project, count: item.count, format: item.format, exists: fs.existsSync(item.output) })) };
  };
  const sendProgress = value => { const win = ctx.window(); if (win && !win.isDestroyed()) win.webContents.send('delivery:progress', value); };
  const task = fn => {
    if (job) return Promise.resolve({ error: 'busy' });
    const controller = new AbortController(); job = controller;
    pending = (async () => {
      try { return await fn({ signal: controller.signal, progress: sendProgress }); }
      catch (error) { return { error: error.name === 'AbortError' ? 'cancelled' : error.code || 'operationFailed', details: error.details || {} }; }
      finally { if (job === controller) job = null; sendProgress({ stage: 'idle' }); }
    })();
    return pending;
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!ctx.window() || event.sender !== ctx.window().webContents) return { error: 'unavailable' };
    try { return await fn(...args); } catch (error) { return { error: error.code || 'operationFailed', details: error.details || {} }; }
  });
  handle('delivery:info', info);
  handle('delivery:update', config => { source().delivery = normalize(config); ctx.store().save(); return { ok: true }; });
  handle('delivery:analyze', config => task(async options => {
    const shelf = source(); shelf.delivery = normalize(config); ctx.store().save();
    return ctx.service().analyze(copy(shelf), shelf.delivery, { ...options, language: ctx.language() });
  }));
  handle('delivery:export', planId => task(async options => {
    const plan = ctx.service().plans.get(planId), shelf = source();
    if (!plan || plan.shelf.id !== shelf.id || JSON.stringify(normalize(shelf.delivery)) !== JSON.stringify(plan.config) || JSON.stringify(shelf.items.map(item => item.p)) !== JSON.stringify(plan.shelf.items.map(item => item.p))) return { error: 'expiredPlan' };
    let destination = '';
    if (ctx.test() && process.env.DRAGSHELF_TEST_EXPORT_DIR) destination = process.env.DRAGSHELF_TEST_EXPORT_DIR;
    else { const result = await dialog.showOpenDialog(ctx.window(), { title: ctx.t('chooseDeliveryLocation'), properties: ['openDirectory', 'createDirectory'] }); if (result.canceled) return { cancelled: true }; destination = result.filePaths[0]; }
    return ctx.service().export(planId, destination, options);
  }));
  handle('delivery:cancel', () => { if (job) job.abort(); return { ok: true }; });
  handle('delivery:recipe', (name, config) => { ctx.service().saveRecipe(name, config); return info(); });
  handle('delivery:add', async requirementId => {
    const result = await dialog.showOpenDialog(ctx.window(), { properties: ['openFile', 'multiSelections'] });
    if (!result.canceled) {
      const shelf = source(), index = ctx.store().shelves.indexOf(shelf); ctx.store().addPaths(index, result.filePaths);
      const config = normalize(shelf.delivery), requirement = config.requirements.find(req => req.id === requirementId);
      if (requirement) { requirement.assigned.push(...result.filePaths); shelf.delivery = config; ctx.store().save(); }
      ctx.push();
    }
    return info();
  });
  handle('delivery:history', async (id, action) => {
    const entry = ctx.service().data.history.find(item => item.id === id); if (!entry) return { error: 'historyMissing' };
    if (action === 'reveal') { if (!fs.existsSync(entry.output)) return { error: 'outputMissing' }; shell.showItemInFolder(entry.output); return { ok: true }; }
    if (action === 'restore') {
      const store = ctx.store(), index = store.newShelf(n => ctx.t('restoredShelf', { name: entry.shelf.name, n }));
      store.shelves[index].items = copy(entry.shelf.items); store.shelves[index].delivery = copy(entry.config); store.setActive(index); store.flush();
      ctx.setShelfId(store.shelves[index].id); ctx.push(); return info();
    }
    return { error: 'unavailable' };
  });
  handle('delivery:reveal', id => {
    const entry = ctx.service().data.history.find(item => item.id === id); if (!entry || !fs.existsSync(entry.output)) return { error: 'outputMissing' };
    shell.showItemInFolder(entry.output); return { ok: true };
  });
  ipcMain.on('delivery:window', (event, action) => {
    const win = ctx.window(); if (!win || event.sender !== win.webContents) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
  return { cancel() { if (job) job.abort(); }, get pending() { return pending; }, get busy() { return !!job; } };
};
