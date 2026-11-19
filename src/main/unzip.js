'use strict';
// Reads every file in a ZIP (small archives only: backups). Resolves to [{ name, data: Buffer }].
const yauzl = require('yauzl');
const MAX_ENTRY = 512 * 1024 * 1024;
function readZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: false, validateEntrySizes: true }, (err, zip) => {
      if (err) return reject(err);
      const out = [];
      zip.on('error', reject);
      zip.on('end', () => resolve(out));
      zip.on('entry', entry => {
        if (/\/$/.test(entry.fileName) || entry.uncompressedSize > MAX_ENTRY) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          const parts = [];
          stream.on('data', c => parts.push(c)).on('error', reject).on('end', () => { out.push({ name: entry.fileName, data: Buffer.concat(parts) }); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}
module.exports = { readZip };
