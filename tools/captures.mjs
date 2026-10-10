// 대표 화면 캡처 (고품질). 개발 서버 필요. 사용: node tools/captures.mjs [quality]
import { launch, sleep } from './harness.mjs';
const quality = process.argv[2] ?? 'high';
const { browser, page, logs } = await launch({ quality, w: 1280, h: 720 });
await page.waitForSelector('#title:not(.hidden)', { timeout: 240000 });
await sleep(2500);
await page.screenshot({ path: 'captures/shot_01_title.png' });
await page.click('#btn-start'); await sleep(500);
await page.evaluate(() => window.__arena.simAdvance(11.2));
await sleep(6000); await page.screenshot({ path: 'captures/shot_02_intro_lion.png' });
await page.keyboard.press('Enter'); await sleep(2500);
const freeze = async (name, wait = 9000) => {
  await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 1e6; });
  await sleep(wait);
  await page.screenshot({ path: `captures/${name}.png` });
  await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 0; });
};
const setup = (code) => page.evaluate(async (c) => { const g = window.__arena; const m = await import('/src/simulation/lion.ts'); const pl = await import('/src/simulation/player.ts'); await (new Function('g', 'm', 'pl', 'return (async()=>{' + c + '})()'))(g, m, pl); }, code);
const base = `g.sim.ctx.graceUntil = 1e9; g.sim.player.lockOn = true; g.sim.player.pos={x:0,z:-4}; g.sim.player.yaw=0; g.sim.physics.teleport('player', g.sim.player.pos, 0);
  g.sim.lion.attack=null; g.sim.lion.pos={x:0.3,z:0.6}; g.sim.lion.yaw=Math.PI; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.lion.mode='idle'; g.sim.lion.modeT=0; g.sim.lion.modeDur=1e9; g.sim.lion.y=0; g.scene.cam.reset(g.sim);`;
const ONLY_END = process.argv[3] === 'end';
if (!ONLY_END) {
// 1) 일반 전투: 락온 + 앞발 준비 동작
await setup(base + `m.startLionAttack(g.sim.ctx,'swipe'); g.sim.ctx.graceUntil=0; g.simAdvance(0.72);`);
await freeze('shot_03_combat_windup');
// 2) 앞발 타격과 방패 방어
await setup(base + `g.sim.player.guardHeld=true; g.sim.player.guardUpT=0.5; g.sim.lion.pos={x:0,z:-1.9}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); m.startLionAttack(g.sim.ctx,'swipe'); g.sim.ctx.graceUntil=0; g.sim.lion.attack.t=0.7;
 for (let i=0;i<14;i++) g.sim.step({moveX:0,moveY:0,run:false,guard:true,cameraYaw:0,pressed:{light:false,heavy:false,dodge:false,heal:false,lock:false}}); g.simAdvance(0);`);
await freeze('shot_04_block', 8000);
// 3) 사자 도약 (공중)
await setup(base + `g.sim.lion.pos={x:0,z:3.5}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); m.startLionAttack(g.sim.ctx,'pounce'); g.sim.ctx.graceUntil=0; g.simAdvance(1.25);`);
await freeze('shot_05_pounce');
// 4) 플레이어 공격 적중
await setup(base + `g.sim.lion.mode='dormant'; g.sim.lion.pos={x:0,z:-1.9}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.player.guardHeld=false;
 g.sim.step({moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:true,heavy:false,dodge:false,heal:false,lock:false}}); g.simAdvance(0.27);`);
await freeze('shot_06_player_hit', 8000);
// 5) 2페이즈 포효
await setup(base + `g.sim.lion.hp = g.sim.lion.hpMax*0.5; g.sim.lion.pendingPhase2=true; g.sim.lion.pos={x:0,z:2.2}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.ctx.graceUntil=0; g.sim.lion.modeDur=0.05; g.simAdvance(0.9);`);
await freeze('shot_07_phase2');
// 6) 돌진
await setup(base + `g.sim.lion.pos={x:0,z:9}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); m.startLionAttack(g.sim.ctx,'charge'); g.sim.ctx.graceUntil=0; g.simAdvance(2.0);`);
await freeze('shot_08_charge');
// 7) 회복
await setup(base + `g.sim.lion.mode='dormant'; g.sim.lion.pos={x:0,z:6}; g.sim.physics.teleport('lion', g.sim.lion.pos, Math.PI); g.sim.player.hp=40; g.sim.step({moveX:0,moveY:0,run:false,guard:false,cameraYaw:0,pressed:{light:false,heavy:false,dodge:false,heal:true,lock:false}}); g.simAdvance(0.5);`);
await freeze('shot_09_heal', 8000);
}
// 8) 사망 → 사망 화면, 승리 → 승리 화면 (봇이 실제 전투 규칙으로 진행)
const bot = (seed, skill, aggr) => page.evaluate(async ({ seed, skill, aggr }) => {
  const g = window.__arena; const { Bot } = await import('/tests/bot.ts');
  g.sim.ctx.hitstop = 0; g.sim.reset({ skipIntro: true, seed }); g.scene.resetForNewAttempt(g.sim); g.director.reset(); g.state = 'fight'; g.ui.showHud(true);
  window.__bot = new Bot(g.sim, { skill, aggression: aggr });
  if (skill < 0.5) g.sim.player.hp = 30;
  g.inputOverride = () => window.__bot.next();
}, { seed, skill, aggr });
const until = async (target, maxSec) => { for (let t = 0; t < maxSec; t += 4) { await page.evaluate(() => window.__arena.simAdvance(4, () => window.__bot.next())); await sleep(500); if ((await page.evaluate(() => window.__arena.state)) === target) return true; } return false; };
await bot(100, 0.0, 0.9);
// 사망 직후 쓰러지는 연기를 보기 위해 사망 1.3초 시점에서 정지 캡처
for (let t = 0; t < 240; t += 2) { await page.evaluate(() => window.__arena.simAdvance(2, () => window.__bot.next())); if (await page.evaluate(() => window.__arena.sim.player.mode === 'dead')) break; }
await page.evaluate(() => window.__arena.simAdvance(1.3, () => window.__bot.next()));
await freeze('shot_10_death_anim', 8000);
await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 0; });
await until('dead', 30); await sleep(6000); await page.screenshot({ path: 'captures/shot_11_death_screen.png' });
if (await page.isVisible('#btn-retry')) { await page.click('#btn-retry'); await sleep(1500); }
await bot(4, 0.9, 0.8);
// 사자 사망 직후 장면
for (let t = 0; t < 400; t += 2) { await page.evaluate(() => window.__arena.simAdvance(2, () => window.__bot.next())); if (await page.evaluate(() => window.__arena.sim.lion.mode === 'dying')) break; }
await page.evaluate(() => window.__arena.simAdvance(1.2, () => window.__bot.next()));
await freeze('shot_12_lion_dying', 8000);
await page.evaluate(() => { window.__arena.sim.ctx.hitstop = 0; });
await until('victory', 40); await sleep(6000); await page.screenshot({ path: 'captures/shot_13_victory.png' });
console.log(logs.filter((l) => !/KHR/.test(l)).join('\n'));
await browser.close();
