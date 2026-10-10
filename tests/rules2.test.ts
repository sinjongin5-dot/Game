import { describe, expect, it } from 'vitest';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../src/combat/attackData';
import { startLionAttack } from '../src/simulation/lion';
import { forward } from '../src/simulation/math';
import { RapierPhysics } from '../src/physics/rapierPhysics';
import { GameSim } from '../src/simulation/sim';
import { input, makeSim, run } from './helpers';

function place(sim: ReturnType<typeof makeSim>, dist: number) {
  const c = sim.ctx;
  c.player.pos = { x: 0, z: 0 }; c.player.yaw = 0;
  c.lion.pos = { x: 0, z: dist }; c.lion.yaw = Math.PI;
  sim.physics.teleport('player', c.player.pos, 0);
  sim.physics.teleport('lion', c.lion.pos, Math.PI);
  c.graceUntil = 0;
}

describe('이동/회피/락온', () => {
  it('무입력 회피는 바라보는 방향의 뒤로 물러난다 (백스텝)', () => {
    const s = makeSim();
    place(s, 9);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { dodge: true } }));
    run(s, 0.8);
    expect(s.player.pos.z).toBeLessThan(-2.5);
    expect(Math.abs(s.player.pos.x)).toBeLessThan(0.1);
  });

  it('입력 방향으로 회피하며 그 방향을 바라본다', () => {
    const s = makeSim();
    place(s, 9);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ moveX: 1, pressed: { dodge: true }, cameraYaw: 0 })); // +x(오른쪽) 은 월드 -x
    run(s, 0.8);
    expect(s.player.pos.x).toBeLessThan(-3);
  });

  it('락온 중에는 사자 쪽을 계속 바라본다', () => {
    const s = makeSim();
    place(s, 6);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { lock: true } }));
    run(s, 1.5, input({ moveX: 1, cameraYaw: 0 }));
    const f = forward(s.player.yaw);
    const to = { x: s.lion.pos.x - s.player.pos.x, z: s.lion.pos.z - s.player.pos.z };
    const l = Math.hypot(to.x, to.z);
    expect((f.x * to.x + f.z * to.z) / l).toBeGreaterThan(0.97);
  });
});

describe('약공격 연계/강공격', () => {
  it('약공격 3연계는 순서대로 진행되고 3타 이후 끝난다', () => {
    const s = makeSim();
    place(s, 9);
    s.ctx.lion.mode = 'dormant';
    const seen: string[] = [];
    for (let i = 0; i < 60 * 3; i++) {
      const t = i / 60;
      // 약 0.45초마다 공격 버튼을 누른다
      const press = i % 27 === 0;
      s.step(input({ pressed: { light: press } }));
      if (s.player.attackId && seen[seen.length - 1] !== s.player.attackId) seen.push(s.player.attackId);
      void t;
    }
    expect(seen.slice(0, 3)).toEqual(['light1', 'light2', 'light3']);
  });

  it('공격 도중에는 강공격 입력으로 모든 행동을 취소할 수 없다', () => {
    const s = makeSim();
    place(s, 9);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { light: true } }));
    run(s, 0.1);
    s.step(input({ pressed: { heavy: true } }));
    expect(s.player.attackId).toBe('light1');
  });

  it('공격 데이터의 유효 구간은 지속시간 안에 있다', () => {
    for (const d of Object.values(PLAYER_ATTACKS)) {
      expect(d.activeStart).toBeGreaterThan(0.1);
      expect(d.activeEnd).toBeLessThan(d.duration);
      expect(d.keys[d.keys.length - 1].t).toBeCloseTo(d.duration, 2);
    }
    for (const d of Object.values(LION_ATTACKS)) {
      if (d.kind === 'none') { expect(d.comboAt).toBeDefined(); continue; }
      expect(d.activeEnd).toBeLessThanOrEqual(d.duration + 0.01);
      expect(d.windup).toBeGreaterThanOrEqual(0.4);
      for (const [ws, we] of d.windows ?? []) { expect(ws).toBeGreaterThanOrEqual(d.activeStart - 1e-6); expect(we).toBeLessThanOrEqual(d.activeEnd + 1e-6); }
    }
  });
});

describe('사자 AI', () => {
  it('준비 동작(0.6~1.1초 수준) 없이 즉시 공격하지 않는다', () => {
    for (const id of ['swipe', 'bite', 'pounce', 'charge'] as const) {
      expect(LION_ATTACKS[id].activeStart).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('도약 목표는 준비 도중 확정되어 이후 플레이어가 움직이면 빗나간다', () => {
    const s = makeSim();
    place(s, 6);
    startLionAttack(s.ctx, 'pounce');
    s.ctx.lion.attack!.hold = 0;
    s.ctx.lion.attack!.t = 0.0;
    const hp0 = s.player.hp;
    // 확정 시점(0.7s) 이후 옆으로 이동
    for (let i = 0; i < 60 * 2.6; i++) {
      const t = i / 60;
      s.step(input({ moveX: t > 0.7 ? 1 : 0, run: t > 0.7, cameraYaw: Math.atan2(s.lion.pos.x - s.player.pos.x, s.lion.pos.z - s.player.pos.z) }));
    }
    expect(s.player.hp).toBe(hp0);
  });

  it('사망한 플레이어에게는 더 이상 공격하지 않고, 사자 사망 시 판정이 사라진다', () => {
    const s = makeSim();
    place(s, 2);
    s.lion.hp = 1;
    s.ctx.lion.mode = 'idle';
    startLionAttack(s.ctx, 'bite');
    s.ctx.lion.attack!.hold = 0;
    s.lion.hp = 0;
    s.step();
    expect(s.lion.mode).toBe('dying');
    expect(s.lion.attack).toBeNull();
    run(s, 6);
    expect(s.phase).toBe('victory');
    expect(s.player.hp).toBe(100);
  });
});

describe('재시작 누수 방지', () => {
  it('reset 을 여러 번 반복해도 Rapier 객체/이벤트가 누적되지 않는다', async () => {
    const sim = new GameSim(await RapierPhysics.create(), { skipIntro: true });
    const sizes: number[] = [];
    for (let k = 0; k < 4; k++) {
      run(sim, 5, input({ moveY: 1, pressed: { light: true } }));
      sim.reset({ skipIntro: true });
      sizes.push(sim.ctx.events.length);
      expect(sim.player.hp).toBe(100);
      expect(sim.lion.hp).toBe(sim.lion.hpMax);
      expect(sim.lion.phase).toBe(1);
      expect(sim.ctx.time).toBe(0);
      expect(sim.ctx.hitstop).toBe(0);
      expect(sim.stats.attempts).toBe(k + 2);
    }
    expect(new Set(sizes).size).toBe(1);
    sim.dispose();
  });

  it('같은 시드/입력이면 결과가 결정적으로 같다', async () => {
    const a = new GameSim(await RapierPhysics.create(), { skipIntro: true, seed: 9 });
    const b = new GameSim(await RapierPhysics.create(), { skipIntro: true, seed: 9 });
    for (let i = 0; i < 60 * 20; i++) {
      const inp = input({ moveY: Math.sin(i / 50) > 0 ? 1 : 0, guard: i % 200 > 100, cameraYaw: 0 });
      a.step(inp); b.step(inp);
    }
    expect(JSON.stringify(a.lion.pos)).toBe(JSON.stringify(b.lion.pos));
    expect(a.player.hp).toBe(b.player.hp);
    a.dispose(); b.dispose();
  });
});
