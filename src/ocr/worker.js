'use strict';
// Utility process that runs OCR off the main thread. Messages: { id, dir, image: { data, width, height }, mode }.
const { OcrEngine } = require('./engine');
let engine = null, engineDir = null, queue = Promise.resolve();
process.parentPort.on('message', ({ data: msg }) => {
  queue = queue.then(async () => {
    try {
      if (!engine || engineDir !== msg.dir) { engine = await OcrEngine.load(msg.dir); engineDir = msg.dir; }
      const image = { data: new Uint8Array(msg.image.data), width: msg.image.width, height: msg.image.height };
      const result = await engine.recognize(image, { mode: msg.mode, onProgress: (done, total) => process.parentPort.postMessage({ id: msg.id, progress: [done, total] }) });
      process.parentPort.postMessage({ id: msg.id, result });
    } catch (error) { process.parentPort.postMessage({ id: msg.id, error: error.message }); }
  });
});
