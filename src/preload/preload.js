'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set(['state:get', 'act', 'drop:resolve', 'drop:blob', 'drop:text', 'drop:url', 'phone:info', 'shortcut:set', 'shortcut:info', 'guide:info', 'delivery:info', 'delivery:update', 'delivery:analyze', 'delivery:export', 'delivery:cancel', 'delivery:recipe', 'delivery:add', 'delivery:history', 'delivery:reveal', 'history:get', 'capture:job', 'capture:window', 'capture:save', 'capture:copy', 'palette:items']);
const SEND = new Set(['drag:start', 'win:resize', 'win:move-start', 'win:move', 'win:hide', 'ctx:item', 'ctx:tab', 'focusable', 'phone:close', 'shortcut:cancel', 'guide:done', 'ui:log', 'delivery:window', 'capture:close', 'capture:editing', 'ctx:capture']);
const ON = new Set(['state', 'drag:ended', 'phone:count', 'phone:info', 'rename', 'flash', 'delivery:progress', 'text:open']);

contextBridge.exposeInMainWorld('shelf', {
  platform: process.platform,
  invoke: (ch, ...a) => (INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('blocked channel ' + ch))),
  send: (ch, ...a) => { if (SEND.has(ch)) ipcRenderer.send(ch, ...a); },
  on: (ch, cb) => {
    if (!ON.has(ch)) return () => {};
    const h = (_e, ...a) => cb(...a);
    ipcRenderer.on(ch, h);
    return () => ipcRenderer.removeListener(ch, h);
  },
  pathFor: file => {
    try { const resolved = webUtils.getPathForFile(file); if (resolved) return resolved; } catch (_) { /* Try older Electron's native File.path. */ }
    try { return typeof file.path === 'string' ? file.path : ''; } catch (_) { return ''; }
  }
});
