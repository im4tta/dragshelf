'use strict';
// The OCR models are not bundled (≈50 MB) to keep the installers small: they download once, on first use,
// from pinned revisions and are verified by SHA-256 before use.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAKKHU = 'https://huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX/resolve/7a2c283f9f2e73198d822f9e6baf3a396df3bd01/';
const KHMEROCR = 'https://cdn.jsdelivr.net/gh/im4tta/tools123@a50a6361320abd05021ddb6707de71c8cf59f651/public/models/khmerocr/';
const MODELS = [
  { name: 'det.onnx', url: KHMEROCR + 'det.onnx', size: 10867112, sha256: '61fb440d2eecd561a4d5ccd41e3be5a14a882643f1ac0e1f05f9f53ff9098e67' },
  { name: 'encoder.int8.onnx', url: CHAKKHU + 'encoder.int8.onnx', size: 25877062, sha256: 'b1d740ee67ca2600ddb2dc4d59da60234a8d90a2d50b2d5790a0547504a6d909' },
  { name: 'decoder.int8.onnx', url: CHAKKHU + 'decoder.int8.onnx', size: 12999851, sha256: 'a91d989fa8465078e0c8a4ed7f5077785369abc76b86a4ff7f84ec8047701463' },
  { name: 'tokenizer.json', url: CHAKKHU + 'tokenizer.json', size: 45814, sha256: '42dad64377998f2dc5176553c5bdc4cd7384e826c9e9cf554aa955e6a861fe58' },
];
const TOTAL_BYTES = MODELS.reduce((n, m) => n + m.size, 0);

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function installed(dir) { return MODELS.every(m => { try { return fs.statSync(path.join(dir, m.name)).size === m.size; } catch (_) { return false; } }); }

// fetchImpl(url) → Response (Electron's net.fetch in the app, a stub in tests). onProgress(received, total).
async function download(dir, fetchImpl, onProgress = () => {}) {
  fs.mkdirSync(dir, { recursive: true });
  let received = MODELS.filter(m => fs.existsSync(path.join(dir, m.name))).reduce((n, m) => n + m.size, 0);
  onProgress(received, TOTAL_BYTES);
  for (const m of MODELS) {
    const target = path.join(dir, m.name);
    if (fs.existsSync(target) && fs.statSync(target).size === m.size && sha256(target) === m.sha256) continue;
    const part = target + '.part';
    const res = await fetchImpl(m.url);
    if (!res.ok) throw new Error(`${m.name}: HTTP ${res.status}`);
    const out = fs.createWriteStream(part);
    try {
      for await (const chunk of res.body) { out.write(chunk); received += chunk.length; onProgress(Math.min(received, TOTAL_BYTES), TOTAL_BYTES); }
    } finally { await new Promise(r => out.end(r)); }
    if (sha256(part) !== m.sha256) { fs.rmSync(part, { force: true }); throw new Error(`${m.name}: checksum mismatch`); }
    fs.renameSync(part, target);
  }
  return dir;
}
function remove(dir) { for (const m of MODELS) fs.rmSync(path.join(dir, m.name), { force: true }); }

module.exports = { MODELS, TOTAL_BYTES, installed, download, remove };
