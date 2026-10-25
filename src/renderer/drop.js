'use strict';
window.DropFiles = {
  capture(dt) {
    // DataTransfer text is readable only during the synchronous drop event.
    const files = [...dt.files];
    const read = type => { try { return dt.getData(type) || ''; } catch (_) { return ''; } };
    return { files, payload: { files: files.map(file => ({ path: window.shelf.pathFor(file), name: file.name, size: file.size })), uriList: read('text/uri-list'), fileURL: read('public.file-url'), text: read('text/plain') } };
  },
  async resolve(snapshot) {
    const result = await window.shelf.invoke('drop:resolve', snapshot.payload);
    return { paths: result.paths, blobs: result.unresolved.map(index => snapshot.files[index]), uriList: snapshot.payload.uriList, text: snapshot.payload.text };
  }
};
