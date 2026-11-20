'use strict';
// Windows CI: copy an image with the real Windows clipboard API (as Snipping Tool / Print Screen tools do: a bitmap,
// no web "image/png"), press the shelf's paste button, and check a PNG with the right pixels lands on the shelf.
// Also records which clipboard formats Electron reported, to diagnose new screenshot tools.
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
if (process.platform !== 'win32') { console.log('skip: Windows clipboard formats only'); process.exit(0); }
const root = path.join(__dirname, '..'), ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-clipimg-'));
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ language: 'en', guideDone: true, asked: true }));
const ps = `Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = New-Object System.Drawing.Bitmap 4, 3
for ($x = 0; $x -lt 4; $x++) { for ($y = 0; $y -lt 3; $y++) { $b.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 0, 0)) } }
[System.Windows.Forms.Clipboard]::SetImage($b)`;
(async () => {
  const app = await electron.launch({ ...(process.env.DRAGSHELF_TEST_EXE ? { executablePath: process.env.DRAGSHELF_TEST_EXE } : {}), args: [root], env: { ...process.env, DRAGSHELF_TEST: '1', DRAGSHELF_USER_DATA: ud } });
  try {
    const shelf = await app.firstWindow(); await shelf.waitForFunction(() => window.__t && window.__t.state());
    execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { stdio: 'inherit' });
    const types = await app.evaluate(async ({ clipboard }) => (await clipboard.read()).flatMap(e => e.types));
    console.log('clipboard formats:', types.join(' | '));
    await shelf.evaluate(() => window.__t.openPanel('history')); await shelf.click('#pasteBtn');
    await shelf.waitForFunction(() => window.__t.state().shelves[0].items.length === 1, null, { timeout: 10000 });
    const file = await app.evaluate(() => global.__test.store().cur.items[0].p);
    assert.match(path.basename(file), /^Image .*\.png$/);
    const info = await app.evaluate(({ nativeImage }, p) => { const img = nativeImage.createFromPath(p); return { size: img.getSize(), px: [...img.toBitmap().subarray(0, 4)] }; }, file);
    assert.deepEqual(info.size, { width: 4, height: 3 }); assert.deepEqual(info.px, [0, 0, 255, 255]);
    console.log('PASS Windows clipboard image → shelf PNG', info);
  } finally { await app.close().catch(() => {}); fs.rmSync(ud, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
