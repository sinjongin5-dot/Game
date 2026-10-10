// 신규 패턴/이펙트 캡처. 개발 서버 필요. 사용: node tools/captures2.mjs [quality] [only]
// 소프트웨어 렌더링(≈2fps)에서도 순간을 잡기 위해, 게임 시간을 1/16 속도로 늦춰 두고 조건이 맞는 프레임에서 멈춘다.
import { launch, sleep } from './harness.mjs';
const quality = process.argv[2] ?? 'medium';
const only = process.argv[3] ?? '';
const { browser, page, logs } = await launch({ quality, w: 1280, h: 720 });
await page.waitForSelector('#title:not(.hidden)', { timeout: 240000 });
await sleep(1500);
await page.click('#btn-start'); await sleep(500);
await page.evaluate(() => window.__arena.simAdvance(11.2));
await sleep(2500);
await page.keyboard.press('Enter'); await sleep(2500);

const setup = (code) => page.evaluate(async (c) => {
  const g = window.__arena; const m = await import('/src/simulation/lion.ts'); const pl = await import('/src/simulation/player.ts');
  await (new Function('g', 'm', 'pl', 'return (async()=>{' + c + '})()'))(g, m, pl);
}, code);
const base = (px, pz, lz, extra = '') => `g.timeScale = 1; g.sim.ctx.hitstop = 0; g.sim.ctx.graceUntil = 1e9; g.sim.player.lockOn = true; g.sim.player.hp = g.sim.player.hpMax = 1000; g.sim.player.pos={x:${px},z:${pz}}; g.sim.player.yaw=0; g.sim.physics.teleport('player', g.sim.player.pos, 0);
  g.sim.lion.attack=null; g.sim.lion.pos={x:0,z:${lz}}; g.sim.lion.yaw=Math.PI; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.lion.mode='idle'; g.sim.lion.modeT=0; g.sim.lion.modeDur=1e9; g.sim.lion.y=0; g.sim.lion.invuln=false; g.scene.cam.reset(g.sim); ${extra}`;

/** 슬로 모션으로 진행시키다가 cond(JS 식)가 참이 되면 완전히 멈추고 캡처한다 */
async function capture(name, setupCode, cond, { slow = 0.06, preAdvance = 0, wait = 3500, side = { d: 6.5, h: 2.4 } } = {}) {
  if (only && !name.includes(only)) return;
  await setup(setupCode + (preAdvance ? `g.simAdvance(${preAdvance});` : ''));
  await page.evaluate((s) => { window.__arena.timeScale = s; }, slow);
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate((c) => { const g = window.__arena; return !!(new Function('g', 'return ' + c)(g)); }, cond);
    if (ok) break;
    if (Date.now() - t0 > 90000) { console.log('timeout', name); break; }
    await sleep(120);
  }
  await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 1e6; });
  await sleep(wait);
  await page.screenshot({ path: `captures/${name}.png` });
  if (side) {
    // 옆에서 본 시점: 이펙트가 가려지지 않은 상태를 확인한다
    await page.evaluate((c) => {
      const g = window.__arena; const V = g.scene.cam.camera.position.constructor;
      const mx = (g.sim.player.pos.x + g.sim.lion.pos.x) / 2, mz = (g.sim.player.pos.z + g.sim.lion.pos.z) / 2;
      g.scene.cam.debugShot = { pos: new V(mx + c.d, c.h, mz - 1.5), look: new V(mx, 0.9, mz), fov: 55 };
    }, { d: side.d ?? 6.5, h: side.h ?? 2.4 });
    await sleep(2500);
    await page.screenshot({ path: `captures/${name}_side.png` });
    await page.evaluate(() => { window.__arena.scene.cam.debugShot = null; });
  }
  await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 0; window.__arena.timeScale = 1; });
  console.log('captured', name);
}

await capture('fx_quake_ring', base(0, -4.5, 0.4, "m.startLionAttack(g.sim.ctx,'quake'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 1.22', { preAdvance: 0.99 });
await capture('fx_flurry_claw', base(0, -2.4, 0, "m.startLionAttack(g.sim.ctx,'flurry'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 1.2', { preAdvance: 1.0 });
await capture('fx_whirl', base(0, -2.2, 0, "m.startLionAttack(g.sim.ctx,'whirl'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 1.12', { preAdvance: 0.9 });
await capture('fx_dashbite', base(0, -6.5, 0.5, "m.startLionAttack(g.sim.ctx,'dashBite'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 0.86', { preAdvance: 0.5 });
await capture('fx_backhop', base(0, -3.5, 0, "m.startLionAttack(g.sim.ctx,'backHop'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 0.34', { preAdvance: 0.1 });
await capture('fx_player_hit', base(0, -2.1, 0, "g.sim.player.lockOn=true; m.startLionAttack(g.sim.ctx,'swipe'); g.sim.lion.attack.hold=0; g.sim.lion.attack.t = 0.6;"), 'g.sim.stats.damageTaken > 0', { slow: 0.08 });
await capture('fx_lion_hit', `${base(0, -2.0, 0)} g.sim.step({moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:true,heavy:false,dodge:false,heal:false,lock:false}});`, 'g.sim.stats.hitsLanded > 0', { slow: 0.08 });
await capture('fx_player_attack', `${base(0, -3.0, 2.5)} g.sim.ctx.graceUntil = 1e9; g.sim.step({moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:true,heavy:false,dodge:false,heal:false,lock:false}});`, 'g.sim.player.mode === "attack" && g.sim.player.modeT >= 0.14', { slow: 0.04, side: { d: 3.4, h: 1.2 } });
await capture('fx_phase2_embers', base(0, -4.5, 0.4, "g.sim.lion.hp = g.sim.lion.hpMax*0.5; g.sim.lion.pendingPhase2 = true; g.sim.lion.modeDur = 0.05; g.sim.ctx.graceUntil = 0;"), 'g.sim.lion.phase === 2 && g.sim.lion.mode === "roar" && g.sim.lion.modeT > 1.2', { slow: 0.25, preAdvance: 0.2 });

if (!only || 'claw_trail'.includes(only) || only.includes('claw')) {
  await setup(base(0, -2.4, 0, "m.startLionAttack(g.sim.ctx,'flurry'); g.sim.lion.attack.hold=0;") + 'g.simAdvance(0.5);');
  await page.evaluate(() => { window.__arena.timeScale = 0.09; });
  const t0 = Date.now();
  for (;;) {
    const t = await page.evaluate(() => window.__arena.sim.lion.attack?.t ?? -1);
    if (t >= 0.78 || Date.now() - t0 > 60000) break;
    await sleep(60);
  }
  await page.screenshot({ path: 'captures/fx_claw_trail.png' });
  await page.evaluate(() => { window.__arena.timeScale = 1; });
  console.log('captured fx_claw_trail');
}
console.log(logs.filter((l) => !/KHR_parallel_shader_compile/.test(l)).join('\n') || '(콘솔 오류 없음)');
await browser.close();
