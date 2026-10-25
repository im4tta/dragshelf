'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set(['state:get', 'act', 'drop:blob', 'drop:text', 'drop:url', 'phone:info', 'shortcut:set', 'shortcut:info', 'guide:info', 'delivery:info', 'delivery:update', 'delivery:analyze', 'delivery:export', 'delivery:cancel', 'delivery:recipe', 'delivery:add', 'delivery:history', 'delivery:reveal']);
const SEND = new Set(['drag:start', 'win:resize', 'win:move-start', 'win:move', 'win:hide', 'ctx:item', 'ctx:tab', 'focusable', 'phone:close', 'shortcut:cancel', 'guide:done', 'ui:log', 'delivery:window']);
const ON = new Set(['state', 'drag:ended', 'phone:count', 'phone:info', 'rename', 'flash', 'delivery:progress']);

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
  pathFor: file => { try { return webUtils.getPathForFile(file) || ''; } catch (_) { return ''; } }
});
