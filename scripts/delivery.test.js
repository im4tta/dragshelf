'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), fsp = fs.promises, os = require('os'), path = require('path');
const { Delivery, defaults, safeName, normalize } = require('../src/main/delivery');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-delivery-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'inputs'), output = path.join(dir, 'outputs'); fs.mkdirSync(input); fs.mkdirSync(output);
  const write = (name, content) => { const p = path.join(input, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; };
  return { dir, input, output, write, service: new Delivery(path.join(dir, 'app')), shelf: paths => ({ id: 'test', name: 'Client project', items: paths.map(p => ({ p, done: false, added: Date.now() })) }) };
}
test('readiness uses explicit requirements and missing sources block export', async t => {
  const f = fixture(t), pdf = f.write('Brand.pdf', 'pdf'), source = f.write('Source.zip', 'source');
  const config = defaults('client');
  let plan = await f.service.analyze(f.shelf([pdf, source]), config);
  assert.equal(plan.canExport, false); assert.equal(plan.requirements.find(req => req.id === 'invoice').met, false);
  config.requirements.find(req => req.id === 'invoice').required = false;
  plan = await f.service.analyze(f.shelf([pdf, source]), config); assert.equal(plan.canExport, true);
  plan = await f.service.analyze(f.shelf([pdf, source, path.join(f.input, 'missing.pdf')]), config);
  assert(plan.issues.some(issue => issue.code === 'missingSource')); assert.equal(plan.canExport, false);
});
test('content hashes detect duplicates and export copies preserve sources and avoid overwrites', async t => {
  const f = fixture(t), a = f.write('Logo.PNG', 'identical'), b = f.write('different-name.PNG', 'identical'), c = f.write('other/logo.png', 'different');
  // Windows cannot distinguish case-only sibling names, so test collisions in separate folders.
  const other = f.write('nested/Logo.PNG', 'other');
  const config = defaults('custom'); config.options.naming = 'slug'; config.options.group = false; config.options.deduplicate = true;
  const sourcePaths = [...new Set([a, b, c, other])], snapshots = sourcePaths.map(p => fs.readFileSync(p));
  const plan = await f.service.analyze(f.shelf(sourcePaths), config);
  assert(plan.issues.some(issue => issue.code === 'duplicates')); assert.equal(plan.canExport, true);
  assert.equal(new Set(plan.files.map(file => file.relativeOutput.toLowerCase())).size, plan.count);
  const first = await f.service.export(plan.id, f.output), second = await f.service.export(plan.id, f.output);
  assert.notEqual(first.output, second.output);
  for (const file of plan.files) assert.deepEqual(fs.readFileSync(path.join(first.output, ...file.relativeOutput.split('/'))), fs.readFileSync(file.source));
  sourcePaths.forEach((p, i) => assert.deepEqual(fs.readFileSync(p), snapshots[i]));
  const manifestText = fs.readFileSync(path.join(first.output, 'delivery-manifest.json'), 'utf8');
  assert(!manifestText.includes(f.input.replace(/\\/g, '\\\\'))); assert(fs.existsSync(path.join(first.output, 'index.html')));
  assert.equal(f.service.data.history.length, 2);
});
test('changed sources invalidate a reviewed export and partial output is removed', async t => {
  const f = fixture(t), file = f.write('original.txt', 'before'), config = defaults('custom');
  const plan = await f.service.analyze(f.shelf([file]), config); fs.writeFileSync(file, 'after');
  await assert.rejects(f.service.export(plan.id, f.output), error => error.code === 'sourceChanged');
  assert.deepEqual(fs.readdirSync(f.output), []); assert.equal(fs.readFileSync(file, 'utf8'), 'after');
});
test('cancellation never publishes a partial delivery', async t => {
  const f = fixture(t), file = f.write('large.txt', Buffer.alloc(1024 * 1024)), config = defaults('custom');
  const plan = await f.service.analyze(f.shelf([file]), config), controller = new AbortController();
  await assert.rejects(f.service.export(plan.id, f.output, { signal: controller.signal, progress: () => controller.abort() }));
  assert.deepEqual(fs.readdirSync(f.output), []); assert.equal(fs.statSync(file).size, 1024 * 1024);
});
test('folder exports preserve hierarchy and reject destinations inside a source folder', async t => {
  const f = fixture(t), file = f.write('assets/ខ្មែរ.txt', 'សួស្ដី'), config = defaults('custom'); config.options.naming = 'original';
  const folder = path.dirname(file), plan = await f.service.analyze(f.shelf([folder]), config);
  await assert.rejects(f.service.export(plan.id, folder), error => error.code === 'destinationInsideSource');
  const result = await f.service.export(plan.id, f.output); assert.equal(fs.readFileSync(path.join(result.output, ...plan.files[0].relativeOutput.split('/')), 'utf8'), 'សួស្ដី');
});
test('ZIP export contains UTF-8 filenames, README, index and manifest', async t => {
  const f = fixture(t), file = f.write('ឯកសារ.txt', 'Khmer filename'), config = defaults('custom'); config.options.format = 'zip'; config.options.naming = 'original';
  const plan = await f.service.analyze(f.shelf([file]), config, { language: 'km' }), result = await f.service.export(plan.id, f.output);
  const archive = fs.readFileSync(result.output); assert.equal(archive.readUInt32LE(0), 0x04034b50);
  for (const name of ['ឯកសារ.txt', 'README.txt', 'index.html', 'delivery-manifest.json']) assert(archive.includes(Buffer.from(name)), name);
});
test('recipes omit project-specific exclusions and assignments; history survives a restart', async t => {
  const f = fixture(t), file = f.write('one.txt', 'one'), config = defaults('custom');
  config.project = 'Project A'; config.requirements = [{ id: 'custom', title: 'File', match: 'manual', required: true, assigned: [file] }];
  const recipe = f.service.saveRecipe('Reusable', config); assert.equal(recipe.config.project, ''); assert.deepEqual(recipe.config.requirements[0].assigned, []);
  const plan = await f.service.analyze(f.shelf([file]), config); await f.service.export(plan.id, f.output);
  const loaded = new Delivery(path.join(f.dir, 'app')); await loaded.ready;
  assert.equal(loaded.data.recipes[0].name, 'Reusable'); assert.equal(loaded.data.history[0].shelf.items[0].p, file);
});
test('long colliding names terminate and reserved names stay safe', async t => {
  const f = fixture(t), a = f.write('a/README.txt', 'a'), b = f.write('b/readme.txt', 'b'), config = defaults('custom');
  config.options.naming = 'project'; config.project = 'ខ្មែរ'.repeat(100); config.options.group = false;
  const plan = await f.service.analyze(f.shelf([a, b]), config); assert.equal(plan.count, 2); assert.notEqual(plan.files[0].relativeOutput.toLowerCase(), plan.files[1].relativeOutput.toLowerCase());
  assert.equal(safeName('CON.txt'), '_CON.txt'); assert(!safeName('../../escape').includes('/'));
  assert.equal(normalize({ requirements: [null], options: { group: 'false' } }).options.group, true);
});
