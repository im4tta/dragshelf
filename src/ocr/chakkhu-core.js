// Ported from im4tta/tools123 lib/chakkhu-core.ts (MIT), itself a port of the Chakkhu reference reader
// (muyleanging/Chakkhu-OCR-Khmer-ONNX, Apache-2.0, by Ing Muyleang). Generated with esbuild; keep in sync.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var chakkhu_core_exports = {};
__export(chakkhu_core_exports, {
  BLANK: () => BLANK,
  BOS: () => BOS,
  EOS: () => EOS,
  LINE_HEIGHT: () => LINE_HEIGHT,
  MAX_LINE_WIDTH: () => MAX_LINE_WIDTH,
  PAD: () => PAD,
  beamSearch: () => beamSearch,
  ctcGreedy: () => ctcGreedy,
  ctcLogProb: () => ctcLogProb,
  decodeIds: () => decodeIds,
  decodeLimit: () => decodeLimit,
  editRatio: () => editRatio,
  khnormal: () => khnormal,
  lineConfidence: () => lineConfidence,
  normalizeText: () => normalizeText,
  pickBest: () => pickBest,
  pilResizeBilinear: () => pilResizeBilinear,
  prepareLine: () => prepareLine,
  rgbaToGrey: () => rgbaToGrey,
  roundHalfEven: () => roundHalfEven,
  sameIds: () => sameIds
});
module.exports = __toCommonJS(chakkhu_core_exports);
const PAD = 0;
const BOS = 1;
const EOS = 2;
const BLANK = 4;
const FIRST_TEXT_ID = 5;
const LINE_HEIGHT = 64;
const MAX_LINE_WIDTH = 4096;
const MIN_LINE_WIDTH = 16;
function rgbaToGrey(data, imageWidth, x1, y1, x2, y2) {
  const w = x2 - x1;
  const h = y2 - y1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y1 + y) * imageWidth + (x1 + x)) * 4;
      out[y * w + x] = data[i] * 19595 + data[i + 1] * 38470 + data[i + 2] * 7471 + 32768 >> 16;
    }
  }
  return out;
}
const PRECISION_BITS = 32 - 8 - 2;
function resampleCoeffs(inSize, outSize) {
  const scale = inSize / outSize;
  const filterScale = Math.max(scale, 1);
  const support = 1 * filterScale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const pre = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const ss = 1 / filterScale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const d = Math.abs((x + xmin - center + 0.5) * ss);
      const w = d < 1 ? 1 - d : 0;
      pre[x] = w;
      ww += w;
    }
    for (let x = 0; x < xmax; x++) {
      const k = ww !== 0 ? pre[x] / ww : pre[x];
      kk[xx * ksize + x] = k < 0 ? Math.trunc(-0.5 + k * (1 << PRECISION_BITS)) : Math.trunc(0.5 + k * (1 << PRECISION_BITS));
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, bounds, kk };
}
function clip8(v) {
  if (v >= 1 << PRECISION_BITS << 8) return 255;
  if (v <= 0) return 0;
  return v >> PRECISION_BITS;
}
function pilResizeBilinear(src, w, h, nw, nh) {
  if (nw === w && nh === h) return src.slice();
  const horiz = resampleCoeffs(w, nw);
  const vert = resampleCoeffs(h, nh);
  const needHorizontal = nw !== w;
  const needVertical = nh !== h;
  let rows = src;
  let rowsH = h;
  const vBounds = vert.bounds.slice();
  if (needHorizontal) {
    const first = vBounds[0];
    const last = vBounds[nh * 2 - 2] + vBounds[nh * 2 - 1];
    if (needVertical) for (let i = 0; i < nh; i++) vBounds[i * 2] -= first;
    const from = needVertical ? first : 0;
    rowsH = needVertical ? last - first : h;
    const tmp = new Uint8Array(nw * rowsH);
    const half2 = 1 << PRECISION_BITS - 1;
    for (let yy = 0; yy < rowsH; yy++) {
      const rowOff = (yy + from) * w;
      for (let xx = 0; xx < nw; xx++) {
        const xmin = horiz.bounds[xx * 2];
        const xmax = horiz.bounds[xx * 2 + 1];
        const k = xx * horiz.ksize;
        let ss0 = half2;
        for (let x = 0; x < xmax; x++) ss0 += src[rowOff + x + xmin] * horiz.kk[k + x];
        tmp[yy * nw + xx] = clip8(ss0);
      }
    }
    rows = tmp;
  }
  if (!needVertical) return rows;
  const width = needHorizontal ? nw : w;
  const out = new Uint8Array(width * nh);
  const half = 1 << PRECISION_BITS - 1;
  for (let yy = 0; yy < nh; yy++) {
    const ymin = vBounds[yy * 2];
    const ymax = vBounds[yy * 2 + 1];
    const k = yy * vert.ksize;
    for (let xx = 0; xx < width; xx++) {
      let ss0 = half;
      for (let y = 0; y < ymax; y++) ss0 += rows[(y + ymin) * width + xx] * vert.kk[k + y];
      out[yy * width + xx] = clip8(ss0);
    }
  }
  return out;
}
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
function prepareLine(grey, w, h) {
  let width = Math.max(MIN_LINE_WIDTH, roundHalfEven(w * LINE_HEIGHT / Math.max(1, h)));
  let line = pilResizeBilinear(grey, w, h, width, LINE_HEIGHT);
  if (width > MAX_LINE_WIDTH) {
    line = pilResizeBilinear(line, width, LINE_HEIGHT, MAX_LINE_WIDTH, LINE_HEIGHT);
    width = MAX_LINE_WIDTH;
  }
  const paddedWidth = Math.ceil(width / 8) * 8;
  const pixels = new Float32Array(LINE_HEIGHT * paddedWidth).fill(1);
  for (let y = 0; y < LINE_HEIGHT; y++) {
    for (let x = 0; x < width; x++) pixels[y * paddedWidth + x] = line[y * width + x] / 255;
  }
  return { pixels, width, paddedWidth };
}
function ctcGreedy(lp, columns, vocab) {
  const seq = [];
  let prev = -1;
  for (let t = 0; t < columns; t++) {
    const base = t * vocab;
    let best = 0;
    for (let v = 1; v < vocab; v++) if (lp[base + v] > lp[base + best]) best = v;
    if (best !== prev && best !== BLANK) seq.push(best);
    prev = best;
  }
  return seq;
}
function logAddExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}
function ctcLogProb(lp, columns, vocab, target) {
  if (target.length > columns) return -Infinity;
  const states = 2 * target.length + 1;
  const ext = new Int32Array(states).fill(BLANK);
  for (let i = 0; i < target.length; i++) ext[2 * i + 1] = target[i];
  const canSkip = new Uint8Array(states);
  for (let s = 2; s < states; s++) canSkip[s] = ext[s] !== BLANK && ext[s] !== ext[s - 2] ? 1 : 0;
  let a = new Float64Array(states).fill(-Infinity);
  a[0] = lp[ext[0]];
  if (states > 1) a[1] = lp[ext[1]];
  let next = new Float64Array(states);
  for (let t = 1; t < columns; t++) {
    const base = t * vocab;
    for (let s = 0; s < states; s++) {
      let acc = a[s];
      if (s >= 1) acc = logAddExp(acc, a[s - 1]);
      if (s >= 2 && canSkip[s]) acc = logAddExp(acc, a[s - 2]);
      next[s] = acc === -Infinity ? -Infinity : acc + lp[base + ext[s]];
    }
    [a, next] = [next, a];
  }
  const last = states - 1;
  return target.length ? logAddExp(a[last], a[last - 1]) : a[last];
}
async function beamSearch(next, limit, k = 4) {
  let seqs = Array.from({ length: k }, () => [BOS]);
  let score = new Float64Array(k).fill(-Infinity);
  score[0] = 0;
  const finished = [];
  for (let step = 0; step < limit; step++) {
    const logp = await next(seqs);
    const vocab = logp[0].length;
    const top = [];
    for (let b = 0; b < k; b++) {
      if (score[b] === -Infinity) continue;
      const row = logp[b];
      for (let v = 0; v < vocab; v++) {
        if (v === PAD || v === BOS || v === BLANK) continue;
        const s = score[b] + row[v];
        if (top.length < 2 * k) {
          top.push({ s, beam: b, tok: v });
          top.sort((x, y) => y.s - x.s);
        } else if (s > top[top.length - 1].s) {
          top[top.length - 1] = { s, beam: b, tok: v };
          top.sort((x, y) => y.s - x.s);
        }
      }
    }
    const rows = [];
    const newIds = [];
    const newScore = new Float64Array(k).fill(-Infinity);
    let kept = 0;
    for (const { s, beam, tok } of top) {
      if (s === -Infinity) break;
      if (tok === EOS) {
        finished.push({ ids: seqs[beam].slice(1), score: s });
        continue;
      }
      if (kept < k) {
        rows.push(beam);
        newIds.push(tok);
        newScore[kept] = s;
        kept++;
      }
    }
    while (kept < k) {
      rows.push(0);
      newIds.push(PAD);
      kept++;
    }
    let bestAlive = -Infinity;
    for (const s of newScore) bestAlive = Math.max(bestAlive, s);
    const bestFinished = finished.reduce((m, f) => Math.max(m, f.score), -Infinity);
    if (finished.length >= k && bestFinished >= bestAlive || step + 1 >= limit) break;
    seqs = rows.map((r, i) => [...seqs[r], newIds[i]]);
    score = newScore;
  }
  return finished.sort((x, y) => y.score - x.score).slice(0, k).map((f) => f.ids);
}
function decodeLimit(draft) {
  return Math.trunc(1.5 * draft.length) + 4;
}
function pickBest(ctcScores, decoderScores, lam = 0.5) {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < ctcScores.length; i++) {
    const s = lam * ctcScores[i] + (1 - lam) * decoderScores[i];
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}
function sameIds(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function decodeIds(ids, vocab) {
  let text = "";
  for (const i of ids) if (i >= FIRST_TEXT_ID && i < vocab.length) text += vocab[i];
  return normalizeText(text);
}
const PY_WHITESPACE = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;
function normalizeText(text) {
  return khnormal(text).split(PY_WHITESPACE).filter(Boolean).join(" ");
}
const COENG = "\u17D2";
const RO = "\u179A";
const SHIFTERS = /* @__PURE__ */ new Set(["\u17C9", "\u17CA"]);
const ROBAT = "\u17CC";
const isVowel = (c) => c >= "\u17B6" && c <= "\u17C5";
const isBase = (c) => c >= "\u1780" && c <= "\u17B3";
const INVISIBLE = /[\u200B\u200C\u200D\u00AD\uFEFF\u17B4\u17B5]/g;
const REPLACE = [
  ["\u17A3", "\u17A2"],
  ["\u17A4", "\u17A2\u17B6"],
  ["\u17C1\u17B6", "\u17C4"],
  ["\u17C1\u17B8", "\u17BE"],
  ["\u17C1\u17C0", "\u17C0"]
];
const CLUSTER = /[\u1780-\u17B3](?:\u17D2[\u1780-\u17B3]|[\u17B6-\u17D1\u17D3\u17DD])*/g;
function once(xs) {
  return xs.filter((x, i) => xs.indexOf(x) === i);
}
function orderCluster(cluster) {
  const base = cluster[0];
  const rest = cluster.slice(1);
  const subs = [];
  const shift = [];
  const robat = [];
  const vowels = [];
  const signs = [];
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === COENG) {
      if (i + 1 < rest.length && isBase(rest[i + 1])) {
        subs.push(COENG + rest[i + 1]);
        i++;
      }
      continue;
    }
    if (SHIFTERS.has(c)) shift.push(c);
    else if (c === ROBAT) robat.push(c);
    else if (isVowel(c)) vowels.push(c);
    else signs.push(c);
  }
  const orderedSubs = [...subs.filter((s) => s[1] !== RO), ...subs.filter((s) => s[1] === RO)];
  return base + orderedSubs.join("") + once(shift).join("") + once(robat).join("") + once(vowels).join("") + once(signs).join("");
}
function khnormal(text) {
  let s = text.normalize("NFC").replace(INVISIBLE, "");
  for (const [a, b] of REPLACE) s = s.split(a).join(b);
  s = s.replace(/\u17D2{2,}/g, COENG);
  s = s.replace(CLUSTER, orderCluster);
  for (const [a, b] of REPLACE.slice(2)) s = s.split(a).join(b);
  return s;
}
function editRatio(a, b) {
  if (a === b) return 0;
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] !== y[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[y.length] / Math.max(x.length, y.length);
}
function lineConfidence(text, draftText, lp, columns, vocab) {
  if (columns < 1) return 0;
  let sum = 0;
  for (let t = 0; t < columns; t++) {
    let max = -Infinity;
    const base = t * vocab;
    for (let v = 0; v < vocab; v++) if (lp[base + v] > max) max = lp[base + v];
    sum += Math.exp(max);
  }
  const agree = 1 - editRatio(text, draftText);
  return Math.round(agree * (sum / columns) * 1e3) / 1e3;
}
