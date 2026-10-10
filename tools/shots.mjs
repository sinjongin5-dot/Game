// 사용: node tools/shots.mjs list.json  (list: [{url, out, w, h}])
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--enable-webgl'] });
for (const it of list) {
  const p = await b.newPage({ viewport: { width: it.w ?? 720, height: it.h ?? 420 } });
  p.on('pageerror', (e) => console.log('[pageerror]', it.out, e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[console.error]', it.out, m.text().slice(0, 200)); });
  const t0 = Date.now();
  try {
    await p.goto(it.url);
    await p.waitForFunction('window.__ready===true', null, { timeout: 90000 });
    await p.waitForTimeout(200);
    await p.screenshot({ path: it.out });
    console.log('ok', it.out, Date.now() - t0, 'ms');
  } catch (e) { console.log('FAIL', it.out, String(e).slice(0, 150)); }
  await p.close();
}
await b.close();
