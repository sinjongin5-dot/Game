// 전투 연출(검 궤적/충돌 섬광/패링/자세 붕괴/처형/보스 전조) 캡처. 사용: node tools/captures3.mjs [quality] [only]
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
const base = (px, pz, lz, extra = '') => `g.timeScale = 1; g.inputOverride = null; g.sim.ctx.phase = 'fight'; g.sim.victoryT = 0; pl.setMode(g.sim.player, 'free'); g.sim.player.hp = g.sim.player.hpMax = 1000; g.sim.ctx.hitstop = 0; g.sim.ctx.graceUntil = 1e9; g.sim.player.lockOn = true; g.sim.player.pos={x:${px},z:${pz}}; g.sim.player.yaw=0; g.sim.physics.teleport('player', g.sim.player.pos, 0);
  g.sim.lion.attack=null; g.sim.lion.pos={x:0,z:${lz}}; g.sim.lion.yaw=Math.PI; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.lion.mode='idle'; g.sim.lion.modeT=0; g.sim.lion.modeDur=1e9; g.sim.lion.y=0; g.sim.lion.invuln=false; g.sim.lion.hp = g.sim.lion.hpMax; g.sim.lion.poise = 0; g.sim.lion.staggerImmune = 0; g.sim.lion.executed = false; g.sim.ctx.grapple = null; g.sim.lion.phase = 1; g.sim.player.stamina = 100; g.sim.player.exhausted = false; g.sim.player.invulnT = 0; g.sim.player.riposteUntil = -1; g.__h0 = g.sim.stats.hitsLanded; g.__b0 = g.sim.stats.blocks; g.scene.cam.reset(g.sim); g.scene.vfx.clear(); ${extra}`;

/**
 * 가상 60Hz 진행: 실제 게임 루프 대신 시뮬레이션과 장면 갱신을 1/60초씩 직접 돌려, 소프트웨어 렌더링(≈2fps)에서도
 * 실제 플레이(60fps)와 같은 프레임 간격으로 검 궤적/이펙트가 만들어지게 한다. 조건이 맞으면 extra 프레임 더 진행 후 멈춰 캡처한다.
 */
async function capture(name, setupCode, cond, { extra = 0, side = { d: 6.5, h: 2.4 }, maxSec = 6 } = {}) {
  if (only && !only.split(',').some((o) => name.includes(o))) return;
  await setup(setupCode);
  const info = await page.evaluate(async ({ cond, extra, maxSec }) => {
    const g = window.__arena, sim = g.sim, sc = g.scene;
    g.timeScale = 0;
    const idle = { moveX: 0, moveY: 0, run: false, guard: false, cameraYaw: 0, pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false } };
    const step = () => { sim.step(g.inputOverride ? g.inputOverride() : idle); sc.handleEvents(sim.drainEvents(), sim); sc.update(sim, 1 / 60, 1, { dx: 0, dy: 0 }, true); g.ui.updateQte(sim.ctx.grapple, 1 / 60); };
    const test = new Function('g', 'return ' + cond);
    let n = 0;
    while (!test(g) && n < maxSec * 60) { step(); n++; }
    const ok = n < maxSec * 60;
    for (let i = 0; i < extra; i++) step();
    return { ok, n, trails: sc.vfx.trails.activeCount, impact: sc.vfx.lastImpact, pulse: +sc.vfx.pulse.toFixed(2), mood: +sc.cam.tension.toFixed(2) };
  }, { cond, extra, maxSec });
  await sleep(1800);
  await page.screenshot({ path: `captures/${name}.png` });
  if (side) {
    await page.evaluate((c) => {
      const g = window.__arena; const V = g.scene.cam.camera.position.constructor;
      const mx = c.focus ? g.sim.player.pos.x : (g.sim.player.pos.x + g.sim.lion.pos.x) / 2, mz = c.focus ? g.sim.player.pos.z : (g.sim.player.pos.z + g.sim.lion.pos.z) / 2;
      g.scene.cam.debugShot = { pos: new V(mx + c.d, c.h, mz - 1.5), look: new V(mx, 0.9, mz), fov: 55 };
    }, { d: side.d ?? 6.5, h: side.h ?? 2.4, focus: !!side.focus });
    await sleep(1800);
    await page.screenshot({ path: `captures/${name}_side.png` });
    await page.evaluate(() => { window.__arena.scene.cam.debugShot = null; });
  }
  await page.evaluate(() => { window.__arena.timeScale = 1; window.__arena.inputOverride = null; });
  console.log('captured', name, JSON.stringify(info));
}

const idleIn = "{moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:false,heavy:false,dodge:false,heal:false,lock:false}}";
const press = (k) => `{moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:${k === 'light'},heavy:${k === 'heavy'},dodge:false,heal:false,lock:false}}`;
void idleIn;
// 일반 공격: 궤적(빗나감) / 적중
await capture('fx3_light_trail', `${base(0, -3.4, 1.4)} g.sim.step(${press('light')});`, 'g.sim.player.mode === "attack" && g.sim.player.modeT >= 0.21', { side: { d: 3.6, h: 1.3, focus: true } });
await capture('fx3_light_hit', `${base(0, -2.0, 0)} g.sim.step(${press('light')});`, 'g.sim.stats.hitsLanded > g.__h0', { extra: 3, side: { d: 3.6, h: 1.3 } });
// 강공격: 궤적 / 적중
await capture('fx3_heavy_trail', `${base(0, -4.5, 0.6)} g.sim.step(${press('heavy')});`, 'g.sim.player.mode === "attack" && g.sim.player.modeT >= 0.8', { side: { d: 4.5, h: 1.4, focus: true } });
await capture('fx3_heavy_hit', `${base(0, -3.4, 0)} g.sim.step(${press('heavy')});`, 'g.sim.stats.hitsLanded > g.__h0', { extra: 4, side: { d: 4.2, h: 1.4 } });
// 패링 / 일반 방어
const guardLate = (t) => `g.inputOverride = () => ({moveX:0,moveY:0,run:false,guard:!!(g.sim.lion.attack && g.sim.lion.attack.t >= ${t}),cameraYaw:0,pressed:{light:false,heavy:false,dodge:false,heal:false,lock:false}});`;
await capture('fx3_parry', `${base(0, -2.0, 0, "m.startLionAttack(g.sim.ctx,'bite'); g.sim.lion.attack.hold=0;")} ${guardLate(0.42)}`, 'g.sim.stats.blocks > g.__b0', { extra: 4, side: { d: 3.4, h: 1.3, focus: true } });
await capture('fx3_guard', `${base(0, -2.0, 0, "m.startLionAttack(g.sim.ctx,'bite'); g.sim.lion.attack.hold=0;")} ${guardLate(0.05)}`, 'g.sim.stats.blocks > g.__b0', { extra: 4, side: { d: 3.4, h: 1.3, focus: true } });
// 자세 붕괴
await capture('fx3_stagger', `${base(0, -2.0, 0)} g.sim.lion.poise = 95; g.sim.step(${press('light')});`, 'g.sim.lion.mode === "stagger" && g.sim.lion.modeT > 0.25', { side: { d: 5.5, h: 1.6, focus: true } });
// 처형
await capture('fx3_exec_cine', `${base(0, -3.0, 0.2)} m.setLionMode(g.sim.lion, 'stagger', 1.7); g.simAdvance(0.3); g.sim.step(${press('heavy')});`, 'g.scene.cam.cineActive && g.sim.player.modeT >= 0.55', { side: null });
await capture('fx3_exec_hit', `${base(0, -3.0, 0.2)} m.setLionMode(g.sim.lion, 'stagger', 1.7); g.simAdvance(0.3); g.sim.step(${press('heavy')});`, 'g.sim.stats.hitsLanded > g.__h0', { extra: 4, side: { d: 4.5, h: 1.3 } });
// 보스 전조(긴장) / 보스 강공격
await capture('fx3_boss_tell', base(0, -4.5, 0.4, "m.startLionAttack(g.sim.ctx,'quake'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 0.85', { side: { d: 6.5, h: 2.0 } });
await capture('fx3_boss_slam', base(0, -4.5, 0.4, "m.startLionAttack(g.sim.ctx,'quake'); g.sim.lion.attack.hold=0;"), 'g.sim.lion.attack && g.sim.lion.attack.t >= 1.3', { side: { d: 6.5, h: 2.0 } });
// ── 상호작용(물어뜯기 막기) ──
const grapple = (device, extra = '') => `${base(0, -3, 0.5)} const gr = await import('/src/simulation/grapple.ts'); g.sim.setQte('normal'); g.sim.lion.cooldown.grapple = 0; g.ui.setDevice('${device}'); gr.startGrapple(g.sim.ctx); ${extra}`;
const pressRight = "g.inputOverride = () => { const gp = g.sim.ctx.grapple; const b = gp ? (gp.phase === 'counter' ? 'Y' : gp.prompts[gp.idx]) : ''; const on = gp && ((gp.phase === 'bite' && !gp.resolved && gp.t >= gp.winStart + 0.1) || gp.phase === 'counter' && gp.t > 0.5); return { moveX: 0, moveY: 0, run: false, guard: false, cameraYaw: 0, pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false, a: on && b === 'A', b: on && b === 'B', x: on && b === 'X', y: on && b === 'Y' } }; };";
await capture('fx4_grapple_prompt_pad', grapple('pad'), 'g.sim.ctx.grapple && g.sim.ctx.grapple.phase === "bite" && g.sim.ctx.grapple.t >= g.sim.ctx.grapple.winStart + 0.08', { side: { d: 3.2, h: 1.3, focus: true } });
await capture('fx4_grapple_prompt_key', grapple('kbm'), 'g.sim.ctx.grapple && g.sim.ctx.grapple.phase === "bite" && g.sim.ctx.grapple.t >= g.sim.ctx.grapple.winStart + 0.08', { side: null });
await capture('fx4_grapple_block', grapple('pad', pressRight), 'g.sim.ctx.grapple && g.sim.ctx.grapple.results[0] !== "pending"', { extra: 4, side: { d: 3.2, h: 1.3, focus: true } });
await capture('fx4_grapple_miss', grapple('pad'), 'g.sim.ctx.grapple && g.sim.ctx.grapple.results[0] === "miss"', { extra: 4, side: null });
await capture('fx4_grapple_counter_prompt', grapple('pad', pressRight), 'g.sim.ctx.grapple && g.sim.ctx.grapple.phase === "counter" && g.sim.ctx.grapple.t > 0.45', { maxSec: 12, side: null });
console.log(logs.filter((l) => !/KHR_parallel_shader_compile/.test(l)).join('\n') || '(콘솔 오류 없음)');
await browser.close();
