'use strict';
// Khmer + English OCR for Drag Shelf, fully on-device.
// - Detection: KhmerOCR det.onnx (github.com/seanghay/KhmerOCR, MIT, Seanghay Yath) finds word boxes.
// - Recognition: Chakkhu ចក្ខុ (huggingface.co/muyleanging/Chakkhu-OCR-Khmer-ONNX, Apache-2.0, Ing Muyleang)
//   reads each line: encoder → CTC draft → decoder beam search, scored 0.5 · CTC + 0.5 · decoder.
// Ported from im4tta/tools123 (lib/khmer-ocr.ts, lib/chakkhu-ocr.ts, MIT). Runs on onnxruntime-web (WebAssembly)
// inside a Node utility process, so one small runtime works on Windows and macOS.
const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-web');
const C = require('./chakkhu-core');

ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
const SESSION_OPTS = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
const int64 = (values, dims) => new ort.Tensor('int64', BigInt64Array.from(values.map(v => BigInt(v))), dims);

function bilinearResizeCh(src, srcW, srcH, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH), xRatio = srcW / dstW, yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const fy = (y + 0.5) * yRatio - 0.5; let sy = Math.min(Math.max(Math.floor(fy), 0), srcH - 1);
    const wy = fy - sy, sy2 = sy + 1 < srcH ? sy + 1 : srcH - 1;
    for (let x = 0; x < dstW; x++) {
      const fx = (x + 0.5) * xRatio - 0.5; let sx = Math.min(Math.max(Math.floor(fx), 0), srcW - 1);
      const wx = fx - sx, sx2 = sx + 1 < srcW ? sx + 1 : srcW - 1;
      const top = src[sy * srcW + sx] * (1 - wx) + src[sy * srcW + sx2] * wx;
      const bottom = src[sy2 * srcW + sx] * (1 - wx) + src[sy2 * srcW + sx2] * wx;
      dst[y * dstW + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return dst;
}

function nms(boxes, iouThreshold) {
  const indices = boxes.map((_, i) => i).sort((a, b) => boxes[b].score - boxes[a].score);
  const areas = boxes.map(b => (b.x2 - b.x1) * (b.y2 - b.y1)), keep = [], suppressed = new Array(boxes.length).fill(false);
  for (const idx of indices) {
    if (suppressed[idx]) continue; keep.push(idx);
    const bi = boxes[idx];
    for (const oi of indices) {
      if (suppressed[oi] || oi === idx) continue;
      const bj = boxes[oi];
      const inter = Math.max(0, Math.min(bi.x2, bj.x2) - Math.max(bi.x1, bj.x1)) * Math.max(0, Math.min(bi.y2, bj.y2) - Math.max(bi.y1, bj.y1));
      const union = areas[idx] + areas[oi] - inter;
      if ((union > 0 ? inter / union : 0) > iouThreshold) suppressed[oi] = true;
    }
  }
  return keep;
}

function sortedLines(boxes, thresholdRatio) {
  if (!boxes.length) return [];
  const yOf = b => (b.classId === 0 ? b.y2 : b.y1);
  const sorted = [...boxes].sort((a, b) => yOf(a) - yOf(b));
  const lines = []; let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1], curr = sorted[i];
    if (Math.abs(yOf(curr) - yOf(prev)) < (prev.y2 - prev.y1) * thresholdRatio) current.push(curr);
    else { current.sort((a, b) => a.x1 - b.x1); lines.push(current); current = [curr]; }
  }
  current.sort((a, b) => a.x1 - b.x1); lines.push(current);
  return lines;
}

// Word boxes of one line → segments; a gap wider than 1.5 × the box height (a column gap) starts a new one.
function lineSegments(boxes) {
  const segments = [];
  for (const box of [...boxes].sort((a, b) => a.x1 - b.x1)) {
    const last = segments[segments.length - 1];
    if (last && box.x1 - last.x2 <= 1.5 * Math.max(box.y2 - box.y1, last.y2 - last.y1)) {
      segments[segments.length - 1] = { x1: Math.min(last.x1, box.x1), y1: Math.min(last.y1, box.y1), x2: Math.max(last.x2, box.x2), y2: Math.max(last.y2, box.y2), classId: last.classId, score: Math.max(last.score, box.score) };
    } else segments.push({ ...box });
  }
  return segments;
}

class OcrEngine {
  static async load(dir) {
    const read = name => fs.readFileSync(path.join(dir, name));
    const [det, encoder, decoder] = await Promise.all(['det.onnx', 'encoder.int8.onnx', 'decoder.int8.onnx'].map(n => ort.InferenceSession.create(read(n), SESSION_OPTS)));
    const vocab = JSON.parse(read('tokenizer.json').toString('utf8')).vocab;
    if (!Array.isArray(vocab)) throw new Error('Chakkhu tokenizer: no vocab');
    return Object.assign(new OcrEngine(), { det, encoder, decoder, vocab });
  }

  // image: { data: RGBA Uint8Array, width, height } → lines of word boxes.
  async detect({ data, width: w, height: h }) {
    const TARGET = 1024, ratio = Math.min(TARGET / w, TARGET / h);
    const nw = Math.max(1, Math.floor(w * ratio)), nh = Math.max(1, Math.floor(h * ratio));
    const input = new Float32Array(3 * TARGET * TARGET);
    for (let c = 0; c < 3; c++) {
      const ch = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) ch[i] = data[i * 4 + c] / 255;
      const resized = bilinearResizeCh(ch, w, h, nw, nh), base = c * TARGET * TARGET;
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) input[base + y * TARGET + x] = resized[y * nw + x];
    }
    const out = await this.det.run({ [this.det.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, TARGET, TARGET]) });
    const o = out[this.det.outputNames[0]], n = o.dims[2], d = o.data, boxes = [];
    for (let i = 0; i < n; i++) {
      const cx = d[i], cy = d[n + i], bw = d[2 * n + i], bh = d[3 * n + i], c0 = d[4 * n + i], c1 = d[5 * n + i];
      const score = Math.max(c0, c1); if (score < 0.25) continue;
      const clampX = v => Math.max(0, Math.min(v, w)), clampY = v => Math.max(0, Math.min(v, h));
      boxes.push({ x1: clampX((cx - bw / 2) / ratio), y1: clampY((cy - bh / 2) / ratio), x2: clampX((cx + bw / 2) / ratio), y2: clampY((cy + bh / 2) / ratio), classId: c1 > c0 ? 1 : 0, score });
    }
    return sortedLines(nms(boxes, 0.45).map(i => boxes[i]), 0.5);
  }

  async readLine(grey, w, h, mode) {
    if (w < 1 || h < 1) return { text: '', confidence: 0 };
    const line = C.prepareLine(grey, w, h);
    const enc = await this.encoder.run({ images: new ort.Tensor('float32', line.pixels, [1, 1, C.LINE_HEIGHT, line.paddedWidth]), widths: int64([line.width], [1]) });
    const { memory, mem_pad: memPad, ctc_logp: ctc } = enc;
    const vocabSize = ctc.dims[2], columns = Number(enc.lens.data[0]), lp = ctc.data;
    const draft = C.ctcGreedy(lp, columns, vocabSize);
    let ids = draft;
    if (mode !== 'fast') {
      const guesses = (await C.beamSearch(rows => this.nextToken(rows, memory, memPad), C.decodeLimit(draft))).map(g => [...g]);
      if (!guesses.some(g => C.sameIds(g, draft))) guesses.push(draft);
      const decoderScores = await this.sequenceLogProbs(guesses, memory, memPad);
      ids = guesses[C.pickBest(guesses.map(g => C.ctcLogProb(lp, columns, vocabSize, g)), decoderScores)];
    }
    const text = C.decodeIds(ids, this.vocab);
    return { text, confidence: C.lineConfidence(text, ids === draft ? text : C.decodeIds(draft, this.vocab), lp, columns, vocabSize) };
  }

  repeat(memory, memPad, n) {
    const m = memory.data, p = memPad.data, mem = new Float32Array(m.length * n), pad = new Uint8Array(p.length * n);
    for (let i = 0; i < n; i++) { mem.set(m, i * m.length); pad.set(p, i * p.length); }
    return { memory: new ort.Tensor('float32', mem, [n, memory.dims[1], memory.dims[2]]), mem_pad: new ort.Tensor('bool', pad, [n, memPad.dims[1]]) };
  }
  async nextToken(rows, memory, memPad) {
    const n = rows.length, len = rows[0].length;
    const out = await this.decoder.run({ ids: int64(rows.flat(), [n, len]), ...this.repeat(memory, memPad, n) });
    const vocab = out.logp.dims[2], data = out.logp.data;
    return rows.map((_, r) => data.slice((r * len + len - 1) * vocab, (r * len + len) * vocab));
  }
  async sequenceLogProbs(guesses, memory, memPad) {
    const n = guesses.length, L = Math.max(1, ...guesses.map(g => g.length)), input = [], target = [];
    for (const g of guesses) {
      const row = [...g, ...new Array(L - g.length).fill(C.PAD)];
      input.push(C.BOS, ...row); const tgt = [...row, C.PAD]; tgt[g.length] = C.EOS; target.push(tgt);
    }
    const out = await this.decoder.run({ ids: int64(input, [n, L + 1]), ...this.repeat(memory, memPad, n) });
    const vocab = out.logp.dims[2], data = out.logp.data;
    return target.map((tgt, r) => { let sum = 0; for (let t = 0; t <= L; t++) if (tgt[t] !== C.PAD) sum += data[(r * (L + 1) + t) * vocab + tgt[t]]; return sum; });
  }

  // Full page: detect lines, read each segment; returns plain text, one row per detected line.
  async recognize(image, { mode = 'best', onProgress } = {}) {
    const lines = await this.detect(image), rows = [];
    const regions = lines.flatMap((boxes, line) => lineSegments(boxes.filter(b => b.classId !== 0)).map(box => ({ box, line })));
    let done = 0, confidence = 0, read = 0;
    for (const { box, line } of regions) {
      const x1 = Math.round(box.x1), y1 = Math.round(box.y1), x2 = Math.round(box.x2), y2 = Math.round(box.y2);
      const r = await this.readLine(C.rgbaToGrey(image.data, image.width, x1, y1, x2, y2), x2 - x1, y2 - y1, mode);
      if (r.text) { (rows[line] = rows[line] ? rows[line] + ' ' + r.text : r.text); confidence += r.confidence; read++; }
      if (onProgress) onProgress(++done, regions.length);
    }
    return { text: rows.filter(Boolean).join('\n'), confidence: read ? Math.round((confidence / read) * 1000) / 1000 : 0, lines: rows.filter(Boolean).length };
  }
}

module.exports = { OcrEngine, lineSegments, sortedLines, nms };
