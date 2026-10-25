'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');
const I18N = require('../shared/i18n');

const IMAGE = new Set(['.png', '.jpg', '.jpeg']);
const SOURCES = new Set(['.zip', '.7z', '.psd', '.ai', '.svg', '.fig', '.sketch', '.indd', '.blend']);
const DOCS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.odt', '.rtf']);
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, details = {}) => Object.assign(new Error(code), { code, details });
function check(signal) { if (signal && signal.aborted) throw fail('cancelled'); }
function safeName(value, fallback = 'Delivery', limit = 160) {
  let text = String(value || '').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^[. ]+|[. ]+$/g, '');
  let result = '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (Buffer.byteLength(result + segment) > limit) break;
    result += segment;
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  return result || fallback;
}
function slug(value) { return safeName(value).toLowerCase().replace(/\s+/g, '-'); }
function defaults(template = 'client') {
  const req = (id, match, required) => ({ id, title: '', match, required, assigned: [] });
  const sets = {
    client: [req('assets', 'assets', true), req('sources', 'sources', true), req('invoice', 'invoice', true), req('instructions', 'instructions', false)],
    social: [req('assets', 'images', true), req('caption', 'text', true)],
    submission: [req('documents', 'documents', true)],
    research: [req('documents', 'documents', true), req('references', 'links', false), req('notes', 'text', false)],
    custom: []
  };
  return { template: sets[template] ? template : 'client', project: '', notes: '', requirements: sets[template] || sets.client,
    options: { naming: 'project', resize: 0, imageFormat: 'original', quality: 85, group: true, readme: true, index: true, deduplicate: false, maxMB: ['social', 'submission'].includes(template) ? 10 : 0, format: 'folder' } };
}
function normalize(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const base = defaults(value.template), options = value.options || {};
  return { template: base.template, project: String(value.project || '').slice(0, 300), notes: String(value.notes || '').slice(0, 12000),
    excluded: (Array.isArray(value.excluded) ? value.excluded : []).filter(p => typeof p === 'string').slice(0, 5000),
    requirements: (Array.isArray(value.requirements) ? value.requirements : base.requirements).filter(req => req && typeof req === 'object').slice(0, 30).map((req, i) => ({
      id: /^[a-zA-Z0-9_-]{1,80}$/.test(req.id || '') ? req.id : 'custom-' + i,
      title: String(req.title || '').slice(0, 160), required: !!req.required,
      match: ['assets', 'images', 'sources', 'invoice', 'instructions', 'documents', 'text', 'links', 'any', 'manual'].includes(req.match) ? req.match : 'manual',
      assigned: (Array.isArray(req.assigned) ? req.assigned : []).filter(p => typeof p === 'string').slice(0, 1000)
    })),
    options: {
      naming: ['original', 'slug', 'project'].includes(options.naming) ? options.naming : base.options.naming,
      resize: [0, 1024, 1920, 2560, 3840].includes(Number(options.resize)) ? Number(options.resize) : 0,
      imageFormat: ['original', 'png', 'jpg'].includes(options.imageFormat) ? options.imageFormat : 'original',
      quality: Math.max(30, Math.min(100, Number(options.quality) || 85)),
      group: typeof options.group === 'boolean' ? options.group : true, readme: typeof options.readme === 'boolean' ? options.readme : true, index: typeof options.index === 'boolean' ? options.index : true,
      deduplicate: !!options.deduplicate, maxMB: Math.max(0, Math.min(100000, Number(options.maxMB) || 0)),
      format: options.format === 'zip' ? 'zip' : 'folder'
    }
  };
}
function matches(req, file) {
  if (req.assigned.includes(file.root) || req.assigned.includes(file.source)) return true;
  const ext = path.extname(file.name).toLowerCase(), stem = path.basename(file.name, ext).toLowerCase();
  return ({ assets: IMAGE.has(ext) || ext === '.pdf', images: IMAGE.has(ext), sources: SOURCES.has(ext),
    invoice: /invoice|វិក្កយបត្រ/i.test(stem), instructions: /readme|instruction|ណែនាំ/i.test(stem),
    documents: DOCS.has(ext), text: ['.txt', '.md'].includes(ext), links: ['.url', '.webloc', '.inetloc'].includes(ext), any: true, manual: false })[req.match];
}
async function hash(file, signal) {
  check(signal); const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) { check(signal); digest.update(chunk); }
  return digest.digest('hex');
}
const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

class Delivery {
  constructor(dir, imageTools = null) {
    this.dir = dir; this.cache = path.join(dir, 'delivery-previews'); this.file = path.join(dir, 'deliveries.json'); this.images = imageTools;
    this.plans = new Map(); this.data = { recipes: [], history: [] };
    try { const data = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.data.recipes = Array.isArray(data.recipes) ? data.recipes : []; this.data.history = Array.isArray(data.history) ? data.history : []; } catch (_) { /* first use */ }
    fs.mkdirSync(this.cache, { recursive: true });
    this.ready = fsp.readdir(this.cache).then(names => Promise.all(names.filter(name => /^[0-9a-f-]{36}$/.test(name)).map(name => fsp.rm(path.join(this.cache, name), { recursive: true, force: true })))).catch(() => {});
  }
  save() { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2)); fs.renameSync(tmp, this.file); }
  saveRecipe(name, config) {
    name = String(name || '').trim().slice(0, 120); if (!name) throw fail('recipeName');
    const copy = normalize(config); copy.project = ''; copy.excluded = []; copy.requirements.forEach(req => { req.assigned = []; });
    const recipe = { id: crypto.randomUUID(), name, config: copy, created: Date.now() }; this.data.recipes.push(recipe); this.save(); return recipe;
  }
  async analyze(shelf, raw, { signal, progress = () => {}, language = 'en' } = {}) {
    await this.ready;
    const config = normalize(raw), id = crypto.randomUUID(), cache = path.join(this.cache, id);
    await fsp.mkdir(cache); const entries = [], issues = [], roots = [];
    const visit = async (source, root, relative = '') => {
      check(signal);
      let st; try { st = await fsp.lstat(source); } catch (_) { issues.push({ code: 'missingSource', blocking: true, name: path.basename(source), source }); return; }
      if (st.isSymbolicLink()) { issues.push({ code: 'symlink', blocking: true, name: path.basename(source), source }); return; }
      if (st.isDirectory()) {
        for await (const item of await fsp.opendir(source)) await visit(path.join(source, item.name), root, path.join(relative, item.name));
      } else if (st.isFile()) entries.push({ source, root, relative, name: path.basename(source), size: st.size, mtime: st.mtimeMs, inputHash: '' });
      else issues.push({ code: 'unsupportedFile', blocking: true, name: path.basename(source), source });
    };
    try {
      for (const item of shelf.items) { if (config.excluded.includes(item.p)) continue; const source = path.resolve(item.p); roots.push(source); await visit(source, source); }
      if (!entries.length) issues.push({ code: 'emptyDelivery', blocking: true });
      const duplicates = new Map();
      for (let i = 0; i < entries.length; i++) {
        const file = entries[i]; progress({ stage: 'checking', current: i + 1, total: entries.length });
        file.inputHash = await hash(file.source, signal);
        const st = await fsp.stat(file.source); if (st.size !== file.size || st.mtimeMs !== file.mtime) throw fail('sourceChanged', { name: file.name });
        const key = file.size + ':' + file.inputHash;
        if (duplicates.has(key)) file.duplicateOf = duplicates.get(key); else duplicates.set(key, file.source);
      }
      const duplicateCount = entries.filter(file => file.duplicateOf).length;
      if (duplicateCount) issues.push({ code: 'duplicates', blocking: false, count: duplicateCount });
      const drafts = entries.filter(file => /(?:^|[\s_-])(draft|wip|temp)(?:[\s_.-]|$)/i.test(file.name));
      if (drafts.length) issues.push({ code: 'drafts', blocking: false, count: drafts.length });
      const requirements = config.requirements.map(req => {
        const found = entries.filter(file => matches(req, file));
        const generated = req.match === 'instructions' && config.options.readme && config.notes.trim();
        return { ...req, files: found.map(file => file.source), met: !!(found.length || generated) };
      });
      const used = new Set(['readme.txt', 'index.html', 'delivery-manifest.json', 'font-license.txt']), output = [];
      const project = safeName(config.project || shelf.name);
      for (const file of entries) {
        check(signal);
        if (config.options.deduplicate && file.duplicateOf) continue;
        let ext = path.extname(file.name), stem = path.basename(file.name, ext), prepared = '', width = null, height = null;
        const canProcess = IMAGE.has(ext.toLowerCase()), transform = canProcess && (config.options.resize || config.options.imageFormat !== 'original');
        let size = file.size, outputHash = file.inputHash;
        if (transform) {
          if (!this.images) throw fail('imageUnavailable');
          if (file.size > 50 * 1024 * 1024) { issues.push({ code: 'imageTooLarge', blocking: true, name: file.name }); continue; }
          const result = await this.images.prepare(file.source, config.options);
          if (!result) { issues.push({ code: 'imageDecode', blocking: true, name: file.name }); continue; }
          ext = '.' + result.format; width = result.width; height = result.height; size = result.buffer.length;
          prepared = path.join(cache, crypto.randomUUID() + ext); await fsp.writeFile(prepared, result.buffer, { flag: 'wx' });
          outputHash = crypto.createHash('sha256').update(result.buffer).digest('hex');
        }
        if (config.options.naming !== 'original') stem = slug(stem);
        if (config.options.naming === 'project') stem = slug(project) + '-' + stem;
        stem = safeName(stem, 'file', 110); if (ext) ext = '.' + safeName(ext.slice(1), 'bin', 24);
        let filename = safeName(stem + ext, 'file');
        let group = '';
        if (config.options.group) group = canProcess ? 'Images' : SOURCES.has(ext.toLowerCase()) ? 'Source' : DOCS.has(ext.toLowerCase()) ? 'Documents' : 'Files';
        const rootFolder = file.relative ? safeName(path.basename(file.root)) : '';
        const nested = file.relative ? path.dirname(file.relative).split(path.sep).filter(part => part !== '.').map(part => safeName(part)) : [];
        const prefix = [group, rootFolder, ...nested].filter(Boolean);
        let relativeOutput = [...prefix, filename].join('/'), n = 2;
        while (used.has(relativeOutput.normalize('NFC').toLowerCase())) { filename = safeName(stem + '-' + n++ + ext); relativeOutput = [...prefix, filename].join('/'); }
        used.add(relativeOutput.normalize('NFC').toLowerCase());
        if (config.options.maxMB && size > config.options.maxMB * 1024 * 1024) issues.push({ code: 'sizeLimit', blocking: true, name: file.name, limit: config.options.maxMB });
        let thumbnail = '';
        if (canProcess && this.images) thumbnail = await this.images.thumbnail(prepared || file.source);
        output.push({ ...file, relativeOutput, prepared, outputHash, outputSize: size, width, height, thumbnail, changed: !!prepared || filename !== file.name });
      }
      for (const req of requirements) { const found = output.filter(file => matches(req, file)); req.files = found.map(file => file.source); req.met = !!(found.length || (req.match === 'instructions' && config.options.readme && config.notes.trim())); }
      const plan = { id, cache, config, project, shelf: clone(shelf), roots, entries, output, requirements, issues, language, created: Date.now(),
        canExport: output.length > 0 && !issues.some(issue => issue.blocking) && !requirements.some(req => req.required && !req.met) };
      this.plans.set(id, plan);
      // Keep a small bounded set of application-owned preview caches.
      for (const [oldId, old] of this.plans) if (this.plans.size > 3 && oldId !== id) { this.plans.delete(oldId); await fsp.rm(old.cache, { recursive: true, force: true }); }
      return this.publicPlan(plan);
    } catch (error) { await fsp.rm(cache, { recursive: true, force: true }); throw error; }
  }
  publicPlan(plan) {
    return { id: plan.id, config: plan.config, project: plan.project, requirements: plan.requirements, issues: plan.issues, canExport: plan.canExport,
      originalCount: plan.entries.length, count: plan.output.length, totalBytes: plan.output.reduce((n, file) => n + file.outputSize, 0),
      files: plan.output.map(({ source, name, size, relativeOutput, outputSize, width, height, thumbnail, changed }) => ({ source, name, size, relativeOutput, outputSize, width, height, thumbnail, changed })),
      generated: [plan.config.options.readme && 'README.txt', plan.config.options.index && 'index.html', plan.config.options.index && plan.language === 'km' && 'font-license.txt', 'delivery-manifest.json'].filter(Boolean) };
  }
  async export(planId, parent, { signal, progress = () => {} } = {}) {
    const plan = this.plans.get(planId); if (!plan) throw fail('expiredPlan'); if (!plan.canExport) throw fail('notReady');
    const destination = await fsp.realpath(parent);
    for (const source of plan.roots) {
      const st = await fsp.stat(source).catch(() => null);
      if (st && st.isDirectory() && inside(await fsp.realpath(source), destination)) throw fail('destinationInsideSource');
    }
    const jobId = crypto.randomUUID(), stage = path.join(destination, '.dragshelf-' + jobId), zipTmp = stage + '.zip.tmp';
    let published = '', entry;
    await fsp.mkdir(stage);
    try {
      for (let i = 0; i < plan.output.length; i++) {
        check(signal); const file = plan.output[i]; progress({ stage: 'exporting', current: i + 1, total: plan.output.length });
        const current = await fsp.lstat(file.source); if (!current.isFile() || current.isSymbolicLink() || await hash(file.source, signal) !== file.inputHash) throw fail('sourceChanged', { name: file.name });
        const out = path.join(stage, ...file.relativeOutput.split('/'));
        await fsp.mkdir(path.dirname(out), { recursive: true });
        await pipeline(fs.createReadStream(file.prepared || file.source), fs.createWriteStream(out, { flags: 'wx' }), { signal });
        if (await hash(out, signal) !== file.outputHash) throw fail('sourceChanged', { name: file.name });
      }
      const t = (key, values) => I18N.t(plan.language, key, values);
      const fileLines = plan.output.map(file => '- ' + file.relativeOutput).join('\n');
      if (plan.config.options.readme) await fsp.writeFile(path.join(stage, 'README.txt'), `${plan.project}\n\n${plan.config.notes}\n\n${t('deliveryContents')}\n${fileLines}\n\n${t('originalsSafe')}\n`, { flag: 'wx' });
      if (plan.config.options.index) {
        let font = ''; if (plan.language === 'km') {
          font = fs.readFileSync(path.join(__dirname, '../renderer/fonts/NotoSansKhmer.ttf')).toString('base64');
          await fsp.copyFile(path.join(__dirname, '../renderer/fonts/OFL.txt'), path.join(stage, 'font-license.txt'), fs.constants.COPYFILE_EXCL);
        }
        const cards = plan.output.map(file => `<article>${file.thumbnail ? `<img src="${file.thumbnail}" alt="">` : `<div class="type">${escape(path.extname(file.name).slice(1).toUpperCase())}</div>`}<a href="${file.relativeOutput.split('/').map(encodeURIComponent).join('/')}">${escape(file.relativeOutput)}</a><small>${escape(file.name)}</small></article>`).join('');
        const html = `<!doctype html><html lang="${plan.language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${escape(plan.project)}</title><style>${font ? `@font-face{font-family:Khmer;src:url(data:font/ttf;base64,${font})}` : ''}body{font-family:Khmer,system-ui,sans-serif;background:#fbfbf6;color:#242520;margin:40px;line-height:1.8}h1{margin:0}p{white-space:pre-wrap}.files{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px}article{min-width:0}img,.type{width:100%;height:150px;object-fit:contain;background:#eeeee4;border-radius:14px}.type{display:grid;place-items:center;font-weight:700}a,small{display:block;overflow-wrap:anywhere}a{color:#242520}small{color:#62645a}</style><h1>${escape(plan.project)}</h1><p>${escape(plan.config.notes)}</p><p>${escape(t('originalsSafe'))}</p><div class="files">${cards}</div></html>`;
        await fsp.writeFile(path.join(stage, 'index.html'), html, { flag: 'wx' });
      }
      const manifest = { version: 1, created: new Date().toISOString(), project: plan.project, recipe: plan.config.template,
        files: plan.output.map(file => ({ originalName: file.name, originalSha256: file.inputHash, output: file.relativeOutput, bytes: file.outputSize, sha256: file.outputHash, width: file.width, height: file.height })) };
      await fsp.writeFile(path.join(stage, 'delivery-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
      check(signal);
      let target = path.join(destination, plan.project + (plan.config.options.format === 'zip' ? '.zip' : '')), suffix = 2;
      while (fs.existsSync(target)) target = path.join(destination, `${plan.project} (${suffix++})${plan.config.options.format === 'zip' ? '.zip' : ''}`);
      if (plan.config.options.format === 'zip') {
        const archive = new yazl.ZipFile();
        const add = async (dir, prefix = '') => { for await (const file of await fsp.opendir(dir)) { check(signal); const relative = prefix + file.name; if (file.isDirectory()) await add(path.join(dir, file.name), relative + '/'); else archive.addFile(path.join(dir, file.name), relative); } };
        await add(stage);
        const writing = pipeline(archive.outputStream, fs.createWriteStream(zipTmp, { flags: 'wx' }), { signal }); archive.end(); await writing; check(signal);
        await fsp.copyFile(zipTmp, target, fs.constants.COPYFILE_EXCL); published = target;
      } else { await fsp.rename(stage, target); published = target; }
      entry = { id: crypto.randomUUID(), created: Date.now(), output: published, format: plan.config.options.format, project: plan.project, count: plan.output.length,
        config: clone(plan.config), shelf: clone(plan.shelf) };
      this.data.history.unshift(entry); this.data.history = this.data.history.slice(0, 50);
      let warning = ''; try { this.save(); } catch (_) { warning = 'historyNotSaved'; }
      return { id: entry.id, output: published, count: plan.output.length, format: entry.format, warning };
    } finally {
      // These paths are generated by this export, never supplied by a renderer.
      await fsp.rm(stage, { recursive: true, force: true }).catch(() => {});
      await fsp.rm(zipTmp, { force: true }).catch(() => {});
    }
  }
}
module.exports = { Delivery, defaults, normalize, safeName, matches, hash };
