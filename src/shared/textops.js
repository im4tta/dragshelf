// Split / merge helpers for text items. Shared by the main process, the shelf and the unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TextOps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // "\n", "\t" and "\\" typed into the separator field mean the real characters.
  function unescapeSeparator(sep) {
    return String(sep == null ? '' : sep).replace(/\\(n|t|r|\\)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' })[c]);
  }
  function tidy(parts, opts) {
    if (opts.trim !== false) parts = parts.map(p => p.trim());
    if (opts.skipEmpty !== false) parts = parts.filter(p => p !== '');
    if (opts.unique) parts = [...new Set(parts)];
    return parts;
  }
  // Text → parts, cut at every separator (a regular expression when opts.regex).
  function splitParts(text, separator, opts = {}) {
    const sep = unescapeSeparator(separator);
    const parts = opts.regex ? String(text).split(new RegExp(separator)) : sep === '' ? Array.from(String(text)) : String(text).split(sep);
    return tidy(parts, opts);
  }
  const split = (text, separator, opts) => splitParts(text, separator, opts).join('\n');
  // Lines (or several texts) → one text joined with the separator.
  function mergeParts(parts, separator, opts = {}) {
    const wrap = opts.wrap || '';
    return tidy(parts, opts).map(p => wrap + p + wrap).join(unescapeSeparator(separator));
  }
  const merge = (text, separator, opts) => mergeParts(String(text).split(/\r?\n/), separator, opts);
  // What a short copied text is, so the shelf can offer the right action.
  function detect(text) {
    const t = String(text || '').trim();
    if (!t) return { kind: 'text' };
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) || /^(rgb|hsl)a?\([\d\s.,%\/-]+\)$/i.test(t)) return { kind: 'color', value: t };
    if (/^https?:\/\/\S+$/i.test(t)) return { kind: 'link', value: t };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return { kind: 'email', value: t };
    if (/^\+?[\d\s().-]{7,20}$/.test(t) && (t.match(/\d/g) || []).length >= 7) return { kind: 'phone', value: t.replace(/[^\d+]/g, '') };
    if (/^[\[{]/.test(t)) { try { JSON.parse(t); return { kind: 'json' }; } catch (_) { /* not JSON */ } }
    if (/(^|\n)\s*(function|const|let|var|import|export|class|def|return|public|#include|SELECT|<\w+[^>]*>)\b|[;{}]\s*$/m.test(t) && t.split('\n').length > 1) return { kind: 'code' };
    return { kind: 'text' };
  }
  // Snippet placeholders filled in when a text item is copied or quick-pasted.
  function expand(text, values = {}) {
    const d = values.now || new Date(), z = n => String(n).padStart(2, '0');
    const map = { date: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`, time: `${z(d.getHours())}:${z(d.getMinutes())}`, year: String(d.getFullYear()), clipboard: values.clipboard || '', ...(values.extra || {}) };
    map.datetime = `${map.date} ${map.time}`;
    return String(text).replace(/\{(date|time|datetime|year|clipboard)\}/g, (_, k) => map[k]);
  }
  return { unescapeSeparator, splitParts, split, mergeParts, merge, detect, expand };
});
