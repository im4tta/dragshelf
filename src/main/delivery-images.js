'use strict';
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');
module.exports = {
  async prepare(file, options) {
    let image = nativeImage.createFromPath(file); if (image.isEmpty()) return null;
    let { width, height } = image.getSize();
    if (options.resize && Math.max(width, height) > options.resize) {
      const ratio = options.resize / Math.max(width, height); width = Math.max(1, Math.round(width * ratio)); height = Math.max(1, Math.round(height * ratio));
      image = image.resize({ width, height, quality: 'best' });
    }
    const format = options.imageFormat === 'original' ? (/\.jpe?g$/i.test(file) ? 'jpg' : 'png') : options.imageFormat;
    return { format, width, height, buffer: format === 'jpg' ? image.toJPEG(options.quality) : image.toPNG() };
  },
  async thumbnail(file) {
    try { if (fs.statSync(file).size > 50 * 1024 * 1024) return ''; const image = nativeImage.createFromPath(file); if (image.isEmpty()) return ''; const size = image.getSize(), ratio = Math.min(1, 240 / Math.max(size.width, size.height)); return image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)) }).toDataURL(); } catch (_) { return ''; }
  }
};
