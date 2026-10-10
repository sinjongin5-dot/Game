// Re-runs the connector-room search in a real browser and bakes the result into src/annex_pre.json.
//   NODE_PATH=/opt/node-tools/node_modules node tools/bake_annex.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.addInitScript(() => { window.__ANNEX_GEN = true; });
  await p.goto('file://' + path.join(root, 'gearheart_stage_03_1.html'));
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => { const o = {}; for (let c = 1; c <= 8; c++) { const d = window.__annexDesign(c); if (d.ok) o[c] = { a: d.a.rows, s: d.s.rows, e: d.e.rows }; } return o; });
  fs.writeFileSync(path.join(root, 'src', 'annex_pre.json'), JSON.stringify(out));
  console.log('baked chapters:', Object.keys(out).join(','));
  await b.close();
})();
