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
  return { unescapeSeparator, splitParts, split, mergeParts, merge };
});
