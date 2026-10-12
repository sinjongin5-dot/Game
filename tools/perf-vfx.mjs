// 전투 연출 CPU 비용 측정(렌더 제외): 가상 60Hz 로 시뮬레이션+장면 갱신을 돌려 스텝당 JS 시간(ms)과 드로콜을 본다.
// GPU 시간은 이 환경(소프트웨어 렌더)에서 의미가 없어 측정하지 않는다.
import { launch, sleep } from './harness.mjs';
const { browser, page, logs } = await launch({ quality: process.argv[2] ?? 'high', w: 1280, h: 720 });
await page.waitForSelector('#title:not(.hidden)', { timeout: 240000 });
await sleep(1500);
await page.click('#btn-start'); await sleep(500);
await page.evaluate(() => window.__arena.simAdvance(11.2));
await sleep(2500);
await page.keyboard.press('Enter'); await sleep(2500);
const r = await page.evaluate(async () => {
  const g = window.__arena, sim = g.sim, sc = g.scene;
  const m = await import('/src/simulation/lion.ts'); const pl = await import('/src/simulation/player.ts');
  g.timeScale = 0; g.inputOverride = null; sim.ctx.phase = 'fight'; pl.setMode(sim.player, 'free'); sim.ctx.graceUntil = 0; sim.player.lockOn = true;
  sim.player.hp = sim.player.hpMax = 1e6; sim.lion.hp = sim.lion.hpMax = 1e6;
  const pressedSeq = ['light', 'light', 'light', 'heavy', 'dodge'];
  let k = 0, steps = 0; const times = [];
  const idle = () => ({ moveX: 0, moveY: 0, run: false, guard: false, cameraYaw: 0, pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false } });
  const t0 = performance.now();
  for (let i = 0; i < 1800; i++) {
    const inp = idle();
    if (i % 40 === 0) inp.pressed[pressedSeq[k++ % pressedSeq.length]] = true;
    inp.guard = i % 300 > 250;
    if (i % 20 === 0) { sim.lion.invuln = false; sim.player.pos = { x: 0, z: -4 }; sim.physics.teleport('player', sim.player.pos, 0); sim.player.yaw = 0; sim.player.stamina = 100; sim.lion.mode = 'idle'; sim.lion.modeDur = 1e9; sim.lion.pos = { x: sim.player.pos.x, z: sim.player.pos.z + 1.9 }; sim.physics.teleport('lion', sim.lion.pos, Math.PI); sim.lion.yaw = Math.PI; }
    const a = performance.now();
    sim.step(inp); sc.handleEvents(sim.drainEvents(), sim); sc.update(sim, 1 / 60, 1, { dx: 0, dy: 0 }, true);
    times.push(performance.now() - a); steps++;
  }
  times.sort((a, b) => a - b);
  const st = sc.render(16);
  return { steps, avgMs: +(times.reduce((a, b) => a + b, 0) / steps).toFixed(3), p95: +times[Math.floor(steps * 0.95)].toFixed(3), max: +times[steps - 1].toFixed(2), calls: st.calls, tris: st.tris, geometries: st.geometries, textures: st.textures, hits: sim.stats.hitsLanded, blocks: sim.stats.blocks, dbg: { inv: sim.lion.invuln, pm: sim.player.mode, ce: sim.ctx.controlEnabled, phase: sim.ctx.phase, ppos: sim.player.pos, lpos: sim.lion.pos, lm: sim.lion.mode } };
});
console.log(JSON.stringify(r));
console.log(logs.filter((l) => !/KHR_parallel/.test(l)).join('\n') || '(no console errors)');
await browser.close();
