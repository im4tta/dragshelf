'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { importWindowsShelves } = require('../src/main/windows-migration');
test('imports native shelves and exclusions once, preserving original paths and data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dragshelf-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'old'), current = path.join(root, 'new'); fs.mkdirSync(legacy);
  const contents = 'S\tWork\r\nI\tC:\\My files\\design.pdf\r\nS\t旅行\nI\tC:\\photos\\旅行.png\n';
  fs.writeFileSync(path.join(legacy, 'shelves.txt'), contents);
  fs.writeFileSync(path.join(legacy, 'excluded.txt'), 'POWERPNT.EXE\n');
  assert.equal(importWindowsShelves(legacy, current), true);
  const shelves = JSON.parse(fs.readFileSync(path.join(current, 'shelves.json'))).shelves;
  assert.equal(shelves[0].items[0].p, 'C:\\My files\\design.pdf');
  assert.equal(shelves[1].name, '旅行');
  assert.equal(fs.readFileSync(path.join(legacy, 'shelves.txt'), 'utf8'), contents);
  assert.equal(fs.readFileSync(path.join(current, 'excluded.txt'), 'utf8'), 'POWERPNT.EXE\n');
  assert.equal(importWindowsShelves(legacy, current), false);
});
test('does not create imported state when there are no legacy shelves', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dragshelf-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(importWindowsShelves(root, path.join(root, 'new')), false);
  assert.equal(fs.existsSync(path.join(root, 'new')), false);
});
