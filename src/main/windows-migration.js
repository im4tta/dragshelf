'use strict';
const fs = require('fs');
const path = require('path');

// Import once, without modifying the native app's files or moving its stash.
function importWindowsShelves(legacyDir, userData) {
  const target = path.join(userData, 'shelves.json');
  if (fs.existsSync(target) || !fs.existsSync(path.join(legacyDir, 'shelves.txt'))) return false;
  const shelves = [];
  for (const line of fs.readFileSync(path.join(legacyDir, 'shelves.txt'), 'utf8').split(/\r?\n/)) {
    const value = line.slice(2);
    if (line.startsWith('S\t')) shelves.push({ name: value || 'Shelf', items: [] });
    else if (line.startsWith('I\t') && shelves.length && value) shelves.at(-1).items.push({ p: value, done: false, added: Date.now() });
  }
  if (!shelves.length) return false;
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ version: 1, active: 0, shelves }, null, 2), { flag: 'wx' });
  for (const name of ['excluded.txt']) {
    if (fs.existsSync(path.join(legacyDir, name)) && !fs.existsSync(path.join(userData, name))) fs.copyFileSync(path.join(legacyDir, name), path.join(userData, name));
  }
  return true;
}
module.exports = { importWindowsShelves };
