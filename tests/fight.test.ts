import { describe, expect, it } from 'vitest';
import { GameSim } from '../src/simulation/sim';
import { RapierPhysics } from '../src/physics/rapierPhysics';
import { ARENA } from '../src/simulation/arena';
import { emptyInput } from '../src/simulation/state';
import { Bot } from './bot';

async function fight(seed: number, skill: number, maxSec = 420) {
  const sim = new GameSim(await RapierPhysics.create(), { skipIntro: true, seed });
  const bot = new Bot(sim, { skill, aggression: 0.8 });
  const used: Record<string, number> = {};
  let phase2Events = 0, wall = 0;
  let outside = 0;
  for (let i = 0; i < maxSec * 60; i++) {
    sim.step(bot.next());
    for (const e of sim.drainEvents()) {
      if (e.type === 'lionWindup') used[e.attack] = (used[e.attack] ?? 0) + 1;
      if (e.type === 'phase2') phase2Events++;
      if (e.type === 'lionWallHit') wall++;
    }
    const q = (sim.player.pos.x / ARENA.a) ** 2 + (sim.player.pos.z / ARENA.b) ** 2;
    const q2 = (sim.lion.pos.x / ARENA.a) ** 2 + (sim.lion.pos.z / ARENA.b) ** 2;
    if (q > 1.0 || q2 > 1.0) outside++;
    if (sim.phase === 'playerDead' || sim.phase === 'victory') { if (sim.deathT > 4 || sim.victoryT > 6) break; }
  }
  const r = { phase: sim.phase, time: sim.stats.time, hp: sim.player.hp, lionHp: sim.lion.hp, used, phase2Events, wall, outside, stats: { ...sim.stats } };
  sim.dispose();
  return r;
}

describe('Rapier 물리 + 전체 전투 시뮬레이션', () => {
  it('플레이어는 벽 밖으로 나가지 못하고 사자를 통과하지 못한다', async () => {
    const sim = new GameSim(await RapierPhysics.create(), { skipIntro: true });
    sim.ctx.lion.mode = 'dormant';
    // 벽 쪽으로 계속 달린다
    for (let i = 0; i < 60 * 8; i++) sim.step({ ...emptyInput(), moveX: 1, moveY: 0.2, run: true, cameraYaw: 0 });
    const p = sim.player.pos;
    const q = (p.x / ARENA.a) ** 2 + (p.z / ARENA.b) ** 2;
    expect(q).toBeLessThan(1.0);
    expect(Math.abs(p.x)).toBeGreaterThan(10);
    // 사자 방향으로 달려도 겹치지 않는다
    sim.ctx.player.pos = { x: 0, z: -2 }; sim.physics.teleport('player', { x: 0, z: -2 }, 0);
    sim.ctx.lion.pos = { x: 0, z: 1.5 }; sim.physics.teleport('lion', { x: 0, z: 1.5 }, Math.PI);
    for (let i = 0; i < 120; i++) sim.step({ ...emptyInput(), moveY: 1, cameraYaw: 0 });
    const d = Math.hypot(sim.player.pos.x - sim.lion.pos.x, sim.player.pos.z - sim.lion.pos.z);
    expect(d).toBeGreaterThan(0.9);
    sim.dispose();
  });

  it('봇이 끝까지 싸울 수 있고(승/패 모두 도달 가능) 모든 패턴이 발동한다', async () => {
    const results = [];
    for (const [seed, skill] of [[20, 0.97], [22, 0.97], [25, 0.97], [2, 0.95], [3, 0.92], [5, 0.85], [7, 0.5], [8, 0.2]] as [number, number][]) results.push(await fight(seed, skill));
    // eslint-disable-next-line no-console
    console.log(results.map((r) => `${r.phase} t=${r.time.toFixed(0)}s hp=${r.hp.toFixed(0)} lion=${r.lionHp.toFixed(0)} used=${JSON.stringify(r.used)} p2=${r.phase2Events} wall=${r.wall} out=${r.outside} d=${r.stats.dodges} b=${r.stats.blocks}`).join('\n'));
    for (const r of results) {
      expect(r.outside).toBe(0);
      expect(r.phase2Events).toBeLessThanOrEqual(1);
      expect(['victory', 'playerDead', 'fight']).toContain(r.phase);
    }
    expect(results.some((r) => r.phase === 'victory')).toBe(true);
    const all = new Set(results.flatMap((r) => Object.keys(r.used)));
    for (const id of ['swipe', 'bite', 'pounce']) expect(all.has(id)).toBe(true);
  }, 600000);
});
