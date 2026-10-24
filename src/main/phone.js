'use strict';
// "Photos from phone": a tiny LAN-only HTTP server. Scan the QR code, pick photos, they land on the shelf.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const QRCode = require('qrcode');
const { sanitize, uniqueIn } = require('./stash');

const MAX_BYTES = 400 * 1024 * 1024;

const PAGE = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Drag Shelf</title>
<style>
:root{color-scheme:dark}
body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:28px 20px;background:#242520;color:#f4f5ee;text-align:center}
h1{font-size:22px;margin:8px 0 6px}p{color:#8d8f83;margin:0 0 22px}
label{display:block;margin:0 auto;padding:18px;border-radius:16px;background:#f5c63a;color:#242520;font-size:18px;font-weight:600;max-width:340px}
#log{text-align:left;max-width:340px;margin:18px auto;font-size:15px;line-height:1.8;word-break:break-all}
.ok{color:#f5c63a}.bad{color:#ff6b6b}
</style></head><body>
<h1>Send photos to your Mac</h1><p>They go straight to your computer over this Wi-Fi.</p>
<label>Choose photos or videos<input id=f type=file accept="image/*,video/*" multiple hidden></label><div id=log></div>
<script>
var f=document.getElementById('f'),log=document.getElementById('log');
f.onchange=async function(){for(const x of f.files){const d=document.createElement('div');d.textContent='Sending '+x.name+' …';log.appendChild(d);
try{const r=await fetch(location.pathname.replace(/\\/$/,'')+'/up?name='+encodeURIComponent(x.name),{method:'POST',body:x});
d.textContent=(r.ok?'✓ Sent ':'✕ Failed ')+x.name;d.className=r.ok?'ok':'bad'}catch(e){d.textContent='✕ Failed '+x.name;d.className='bad'}}f.value=''};
</script></body></html>`;

function isPrivate(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '::1') return true;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/); if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
function lanIp() {
  if (process.env.DRAGSHELF_FAKE_IP) return process.env.DRAGSHELF_FAKE_IP;   // used by the screenshot script
  const nets = os.networkInterfaces(); let fallback = '';
  for (const [name, list] of Object.entries(nets)) for (const n of list || []) {
    if (n.family !== 'IPv4' || n.internal || !isPrivate(n.address)) continue;
    if (/^(en|eth|wl)/i.test(name)) return n.address;
    fallback = fallback || n.address;
  }
  return fallback;
}

class PhoneServer extends EventEmitter {
  constructor(stashDir) { super(); this.dir = path.join(stashDir, 'Phone'); this.server = null; this.count = 0; this.url = ''; }
  get running() { return !!this.server; }
  async start() {
    if (this.server) return this.info();
    const ip = lanIp(); if (!ip) throw new Error('no-network');
    fs.mkdirSync(this.dir, { recursive: true });
    const token = crypto.randomBytes(10).toString('hex'); this.count = 0;
    this.server = http.createServer((req, res) => this._handle(req, res, token));
    this.server.requestTimeout = 0;
    await new Promise((ok, bad) => { this.server.once('error', bad); this.server.listen(0, '0.0.0.0', ok); });
    this.url = `http://${ip}:${this.server.address().port}/${token}`;
    return this.info();
  }
  async info() {
    const qr = await QRCode.toString(this.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    return { url: this.url, qr, count: this.count };
  }
  stop() { if (this.server) { this.server.close(); this.server.closeAllConnections && this.server.closeAllConnections(); this.server = null; } }

  _handle(req, res, token) {
    const reply = (code, body, type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' }); res.end(body); };
    if (!isPrivate(req.socket.remoteAddress)) return req.socket.destroy();
    const u = new URL(req.url, 'http://x'); const base = '/' + token;
    if (req.method === 'GET' && (u.pathname === base || u.pathname === base + '/')) return reply(200, PAGE, 'text/html');
    if (req.method === 'POST' && u.pathname === base + '/up') {
      const len = Number(req.headers['content-length'] || 0);
      if (!len || len > MAX_BYTES) return reply(413, 'bad size');
      const dest = uniqueIn(this.dir, sanitize(u.searchParams.get('name') || '') || 'photo.jpg');
      const ws = fs.createWriteStream(dest, { flags: 'wx' }); let got = 0;
      req.on('data', c => { got += c.length; });
      req.on('aborted', () => { ws.destroy(); fs.unlink(dest, () => {}); });
      ws.on('error', () => reply(500, 'disk'));
      ws.on('finish', () => {
        if (got !== len) { fs.unlink(dest, () => {}); return reply(400, 'incomplete'); }
        this.count++; reply(200, 'ok'); this.emit('file', dest, this.count);
      });
      return req.pipe(ws);
    }
    reply(404, 'not found');
  }
}
module.exports = { PhoneServer, isPrivate };
