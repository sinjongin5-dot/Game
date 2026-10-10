import { describe, expect, it } from 'vitest';
import { PLAYER_ATTACKS, clipTravel } from '../src/combat/attackData';
import { MOCAP, MOCAP_BONES } from '../src/animation/mocapData';
import { input, makeSim, run } from './helpers';

function place(sim: ReturnType<typeof makeSim>, dist: number, lionYaw = Math.PI) {
  const c = sim.ctx;
  c.player.pos = { x: 0, z: 0 };
  c.player.yaw = 0;
  c.lion.pos = { x: 0, z: dist };
  c.lion.yaw = lionYaw;
  sim.physics.teleport('player', c.player.pos, 0);
  sim.physics.teleport('lion', c.lion.pos, lionYaw);
  c.graceUntil = 1e9;
  c.lion.mode = 'idle';
  c.lion.modeDur = 1e9;
}

describe('모션 캡처 클립 (Mixamo → 검투사 리그)', () => {
  it('모든 클립의 회전은 단위 쿼터니언이고 프레임 수/뼈 수가 데이터와 일치한다', () => {
    for (const [name, c] of Object.entries(MOCAP)) {
      expect(c.q.length, name).toBe(c.frames * MOCAP_BONES.length * 4);
      expect(c.hips.length, name).toBe(c.frames * 3);
      expect(c.sword.length, name).toBe(c.frames * 6);
      for (let i = 0; i < c.q.length; i += 4) {
        const n = Math.hypot(c.q[i], c.q[i + 1], c.q[i + 2], c.q[i + 3]);
        expect(Math.abs(n - 1), `${name}[${i / 4}]`).toBeLessThan(2e-3);
      }
      for (let f = 0; f < c.frames; f++) {
        const n = Math.hypot(c.sword[f * 6 + 3], c.sword[f * 6 + 4], c.sword[f * 6 + 5]);
        expect(Math.abs(n - 1)).toBeLessThan(2e-3);
      }
    }
  });

  it('강공격 정의: 클립 구동, 유효 구간이 지속시간 안, 이동 곡선은 0→1 단조 증가', () => {
    const d = PLAYER_ATTACKS.heavy;
    expect(d.clip?.name).toBe('attack');
    expect(d.activeStart).toBeGreaterThan(0.5);
    expect(d.activeEnd).toBeLessThan(d.duration);
    let prev = -1;
    for (let t = 0; t <= d.duration; t += 0.02) {
      const p = clipTravel('attack', t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(prev - 0.01);
      prev = p;
    }
    expect(clipTravel('attack', d.duration)).toBeGreaterThan(0.95);
  });
});

describe('강공격(도약 내려찍기)', () => {
  it('사자 4m 앞에서 시전하면 사자 앞에 내려앉아 사자를 통과하지 않고, 한 번 맞힌다', () => {
    const s = makeSim();
    place(s, 4.0);
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { heavy: true } }));
    expect(s.player.mode).toBe('attack');
    const slams: unknown[] = [];
    let minD = 99;
    for (let i = 0; i < 60 * (PLAYER_ATTACKS.heavy.duration + 0.2); i++) {
      s.step(input());
      for (const e of s.drainEvents()) if (e.type === 'playerSlam') slams.push(e);
      minD = Math.min(minD, Math.hypot(s.lion.pos.x - s.player.pos.x, s.lion.pos.z - s.player.pos.z));
    }
    expect(slams.length).toBe(1);
    expect(minD).toBeGreaterThan(1.3);
    expect(s.player.pos.z).toBeGreaterThan(1.2); // 실제로 앞으로 뛰어나갔다
    expect(hp0 - s.lion.hp).toBeGreaterThanOrEqual(PLAYER_ATTACKS.heavy.damage);
  });

  it('사자가 뒤에 있으면 기본 거리만큼만 도약한다 (사자를 향해 돌지 않음)', () => {
    const s = makeSim();
    place(s, 5.0);
    s.ctx.player.yaw = Math.PI; // 사자를 등지고 있음
    s.physics.teleport('player', s.ctx.player.pos, Math.PI);
    s.step(input({ pressed: { heavy: true }, moveY: -1 }));
    run(s, PLAYER_ATTACKS.heavy.duration + 0.1);
    expect(Math.abs(s.player.pos.z + 2.0)).toBeLessThan(0.6);
  });

  it('유효 구간 밖에서는 피해가 없다 (사자가 닿지 않는 거리)', () => {
    const s = makeSim();
    place(s, 9.0);
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { heavy: true } }));
    run(s, PLAYER_ATTACKS.heavy.duration + 0.1);
    expect(s.lion.hp).toBe(hp0);
  });

  it('스태미나가 모자라면 시전되지 않는다', () => {
    const s = makeSim();
    place(s, 4.0);
    s.player.stamina = 10;
    s.step(input({ pressed: { heavy: true } }));
    expect(s.player.mode).toBe('free');
  });
});
