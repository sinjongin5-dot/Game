// 그래픽 확인용 스냅샷: node tools/look.mjs <quality> <out.png> [scene]  (scene: arena | title | close | wide)
import { launch, sleep } from './harness.mjs';
const quality = process.argv[2] ?? 'high';
const out = process.argv[3] ?? 'captures/look.png';
const which = process.argv[4] ?? 'arena';
const { browser, page, logs } = await launch({ quality, w: 1280, h: 720 });
await page.waitForSelector('#title:not(.hidden)', { timeout: 300000 });
await sleep(2000);
if (which === 'title') { await page.screenshot({ path: out }); console.log('title', out); }
else {
  await page.click('#btn-start'); await sleep(500);
  await page.evaluate(() => window.__arena.simAdvance(11.2));
  await sleep(1500);
  await page.keyboard.press('Enter'); await sleep(2500);
  const setup = (code) => page.evaluate(async (c) => { const g = window.__arena; const m = await import('/src/simulation/lion.ts'); await (new Function('g', 'm', 'return (async()=>{' + c + '})()'))(g, m); }, code);
  const pos = which === 'close' ? [0, -2.4, 0.3] : which === 'wide' ? [-5, -4, 4] : [0, -4, 0.6];
  await setup(`g.sim.ctx.graceUntil = 1e9; g.sim.player.lockOn = true; g.sim.player.pos={x:${pos[0]},z:${pos[1]}}; g.sim.player.yaw=0; g.sim.physics.teleport('player', g.sim.player.pos, 0);
    g.sim.lion.attack=null; g.sim.lion.pos={x:${pos[2] === 4 ? 3 : 0.3},z:${pos[2] === 4 ? 3 : pos[2]}}; g.sim.lion.yaw=Math.PI; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.lion.mode='idle'; g.sim.lion.modeT=0; g.sim.lion.modeDur=1e9; g.sim.lion.y=0; g.scene.cam.reset(g.sim); g.sim.ctx.hitstop = 1e6;`);
  await sleep(+(process.argv[5] ?? 9000));
  await page.screenshot({ path: out });
  console.log('shot', out);
}
console.log(logs.filter((l) => !/KHR_parallel/.test(l)).join('\n') || '(no console errors)');
await browser.close();
