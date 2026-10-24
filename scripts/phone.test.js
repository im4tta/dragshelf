'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { PhoneServer } = require('../src/main/phone');
test('phone shutdown is safe when close synchronously re-enters stop', () => {
  const phone = new PhoneServer('unused'); let closes = 0, connectionCloses = 0;
  phone.server = { close() { closes++; phone.stop(); }, closeAllConnections() { connectionCloses++; } };
  assert.doesNotThrow(() => phone.stop());
  assert.equal(closes, 1); assert.equal(connectionCloses, 1); assert.equal(phone.running, false);
  assert.doesNotThrow(() => phone.stop());
});
test('phone server can repeatedly start and stop without retaining its old server', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-phone-'));
  const previous = process.env.DRAGSHELF_FAKE_IP; process.env.DRAGSHELF_FAKE_IP = '127.0.0.1';
  const phone = new PhoneServer(dir);
  t.after(() => { phone.stop(); if (previous === undefined) delete process.env.DRAGSHELF_FAKE_IP; else process.env.DRAGSHELF_FAKE_IP = previous; fs.rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; i < 3; i++) {
    const info = await phone.start(); assert.match(info.url, /^http:\/\/127\.0\.0\.1:/);
    const server = phone.server, closed = new Promise(resolve => server.once('close', resolve));
    phone.stop(); phone.stop(); await closed;
    assert.equal(server.listening, false); assert.equal(phone.running, false); assert.equal(phone.url, '');
  }
});
