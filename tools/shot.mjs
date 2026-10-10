// 사용: node tools/shot.mjs "<url>" out.png [width height] [waitExpr]
import { chromium } from 'playwright-core';
const [url, out, w = '1280', h = '720', wait = 'window.__ready===true'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--enable-webgl'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { if (['error','warning'].includes(m.type())) console.log('[console.'+m.type()+']', m.text().slice(0,300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url);
await p.waitForFunction(wait, null, { timeout: 120000 });
await p.waitForTimeout(500);
await p.screenshot({ path: out });
await b.close();
