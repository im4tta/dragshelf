'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
let child = null, pending = [], buffer = '';
function stop() {
  const old = child; child = null; buffer = '';
  if (old) old.kill();
  for (const p of pending.splice(0)) p(null);
}
function snapshot() {
  if (!child) {
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'win-helper.exe') : path.join(__dirname, '../../build/win-helper.exe');
    child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const proc = child;
    const failed = () => { if (child === proc) stop(); };
    child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed);
    child.stdout.on('data', data => {
      buffer += data.toString();
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const done = pending.shift();
        if (done) { try { done(JSON.parse(line)); } catch (_) { done(null); } }
      }
    });
  }
  return new Promise(resolve => {
    const timer = setTimeout(stop, 1500);
    pending.push(value => { clearTimeout(timer); resolve(value); });
    child.stdin.write('snapshot\n', error => { if (error) stop(); });
  });
}
module.exports = { snapshot, stop };
