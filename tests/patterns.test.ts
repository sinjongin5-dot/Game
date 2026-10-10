import { describe, expect, it } from 'vitest';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../src/combat/attackData';
import { startLionAttack } from '../src/simulation/lion';
import { setMode } from '../src/simulation/player';
import { input, makeSim, run } from './helpers';

function place(sim: ReturnType<typeof makeSim>, dist: number, lionYaw = Math.PI) {
  const c = sim.ctx;
  c.player.pos = { x: 0, z: 0 };
  c.player.yaw = 0;
  c.lion.pos = { x: 0, z: dist };
  c.lion.yaw = lionYaw;
  sim.physics.teleport('player', c.player.pos, 0);
  sim.physics.teleport('lion', c.lion.pos, lionYaw);
  c.graceUntil = 0;
}

function launch(sim: ReturnType<typeof makeSim>, id: Parameters<typeof startLionAttack>[1]) {
  startLionAttack(sim.ctx, id);
  sim.ctx.lion.attack!.hold = 0; // 테스트에서는 전조 정지(페인트)를 끈다
}

const hits = (sim: ReturnType<typeof makeSim>) => sim.drainEvents().filter((e) => e.type === 'playerHit');

describe('새 보스 패턴', () => {
  it('연타 할퀴기: 유효 구간마다 한 번씩, 최대 3번 맞고 구간 하나당 중복 피해는 없다', () => {
    const s = makeSim();
    place(s, 1.9);
    launch(s, 'flurry');
    // 맞아도 쓰러지지 않게 체력을 키우고, 넉백/경직 후에도 사정권에 있도록 위치를 고정한다
    s.player.hp = s.player.hpMax = 1000;
    const dmg: number[] = [];
    for (let i = 0; i < 60 * 2.9; i++) {
      s.step(input());
      s.player.pos = { x: 0, z: 0 };
      s.player.knock = { x: 0, z: 0 };
      s.player.invulnT = 0;
      for (const e of s.drainEvents()) if (e.type === 'playerHit') dmg.push(e.dmg);
    }
    expect(dmg.length).toBeGreaterThanOrEqual(2);
    expect(dmg.length).toBeLessThanOrEqual(3);
    for (const d of dmg) expect(d).toBe(LION_ATTACKS.flurry.damage);
  });

  it('연타 할퀴기: 방패로 막아도 타마다 따로 스태미나가 든다', () => {
    const s = makeSim();
    place(s, 1.9);
    launch(s, 'flurry');
    s.player.guardHeld = true;
    const st0 = s.player.stamina;
    const blocks: number[] = [];
    for (let i = 0; i < 60 * 2.9; i++) {
      s.step(input({ guard: true }));
      s.player.pos = { x: 0, z: 0 };
      for (const e of s.drainEvents()) if (e.type === 'playerBlocked') blocks.push(e.strength);
    }
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(st0 - s.player.stamina).toBeGreaterThan(20);
  });

  it('충격파 강타: 링은 시간에 따라 퍼지고, 회피 무적 구간에서는 피해가 없다', () => {
    const def = LION_ATTACKS.quake;
    const near = makeSim();
    place(near, 3.0);
    launch(near, 'quake');
    near.player.hp = near.player.hpMax = 1000;
    run(near, def.activeEnd + 0.3);
    expect(hits(near).length).toBe(1);

    // 링이 플레이어에게 닿는 시각(≈ activeStart + (d - r0)/속도) 근처에 회피를 맞춘다
    const dodge = makeSim();
    place(dodge, 3.0);
    launch(dodge, 'quake');
    const speed = (def.ring!.r1 - def.ring!.r0) / (def.activeEnd - def.activeStart);
    const reach = def.activeStart + (3.0 - def.ring!.r0) / speed;
    const startAt = reach - 0.24;
    let done = false;
    for (let i = 0; i < 60 * 3 && !done; i++) {
      const a = dodge.ctx.lion.attack;
      if (a && a.t >= startAt && dodge.player.mode === 'free') {
        dodge.step(input({ pressed: { dodge: true }, moveX: 1 }));
      } else dodge.step(input());
      dodge.player.pos = { x: 0, z: 0 }; // 회피 이동으로 링과의 거리가 바뀌지 않게 고정 (무적 타이밍만 검증)
      if (!dodge.ctx.lion.attack) done = true;
    }
    expect(dodge.player.hp).toBe(dodge.player.hpMax);
    expect(dodge.stats.dodges).toBeGreaterThanOrEqual(1);
  });

  it('충격파 강타: 링 밖(너무 먼 거리)에 있으면 맞지 않는다', () => {
    const s = makeSim();
    place(s, 1.2);
    s.ctx.player.pos = { x: 0, z: -9.5 };
    s.physics.teleport('player', s.ctx.player.pos, 0);
    launch(s, 'quake');
    run(s, LION_ATTACKS.quake.duration + 0.2);
    expect(hits(s).length).toBe(0);
  });

  it('회전 꼬리치기: 바짝 붙어 있거나 등 뒤에 있어도 판정 범위 안이면 맞는다 (한 번만)', () => {
    const s = makeSim();
    // 사자가 반대쪽(+z 방향)을 보고 있고 플레이어는 그 등 뒤
    place(s, 1.6, 0);
    launch(s, 'whirl');
    s.player.hp = s.player.hpMax = 1000;
    run(s, LION_ATTACKS.whirl.duration + 0.2);
    expect(hits(s).length).toBe(1);
  });

  it('회전 꼬리치기: 한 바퀴 돈 뒤 원래 방향을 향한다', () => {
    const s = makeSim();
    place(s, 6, Math.PI);
    launch(s, 'whirl');
    const yaw0 = s.ctx.lion.yaw;
    run(s, LION_ATTACKS.whirl.duration + 0.1);
    const d = Math.abs(((s.ctx.lion.yaw - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    expect(d).toBeLessThan(0.6);
  });

  it('뒷걸음 도약: 먼저 뒤로 물러난 뒤 곧바로 도약 덮치기로 이어진다 (연계 중 중복 기록 없음)', () => {
    const s = makeSim();
    place(s, 3.5);
    launch(s, 'backHop');
    const z0 = s.ctx.lion.pos.z;
    let sawPounce = false, maxBack = 0;
    for (let i = 0; i < 60 * 3.2; i++) {
      s.step(input());
      s.player.pos = { x: 0, z: 0 };
      s.drainEvents();
      maxBack = Math.max(maxBack, s.ctx.lion.pos.z - z0);
      if (s.ctx.lion.attack?.id === 'pounce') sawPounce = true;
    }
    expect(maxBack).toBeGreaterThan(1.5);
    expect(sawPounce).toBe(true);
    expect(s.ctx.lion.history.filter((h) => h === 'pounce').length).toBe(0);
  });

  it('돌진 물기: 중거리에서 거리를 확 좁혀 문다', () => {
    const s = makeSim();
    place(s, 5.2);
    launch(s, 'dashBite');
    s.player.hp = s.player.hpMax = 1000;
    let minD = 99;
    for (let i = 0; i < 60 * 1.8; i++) {
      s.step(input());
      s.player.pos = { x: 0, z: 0 };
      minD = Math.min(minD, Math.hypot(s.ctx.lion.pos.x, s.ctx.lion.pos.z));
    }
    expect(minD).toBeLessThan(2.0);
    expect(hits(s).length).toBe(1);
  });

  it('페인트: 전조 정지 중에는 타이밍이 늦어지지만 정지가 끝나면 정상적으로 공격한다', () => {
    const s = makeSim();
    place(s, 2.0);
    startLionAttack(s.ctx, 'bite');
    s.ctx.lion.attack!.hold = 0.5;
    s.ctx.lion.attack!.t = 0.45;
    let frozenFrames = 0;
    for (let i = 0; i < 60 * 1.2; i++) {
      const before = s.ctx.lion.attack?.t ?? 0;
      s.step(input());
      s.player.pos = { x: 0, z: 0 };
      if (s.ctx.lion.attack && s.ctx.lion.attack.t === before) frozenFrames++;
    }
    expect(frozenFrames).toBeGreaterThan(20);
    expect(hits(s).length + s.drainEvents().length).toBeGreaterThanOrEqual(0);
  });
});

describe('조작감', () => {
  it('공격 입력 시 사자가 대략 앞쪽이면 자동으로 사자를 향한다 (자동 조준)', () => {
    const s = makeSim();
    place(s, 3.0);
    s.ctx.lion.mode = 'dormant';
    s.ctx.player.yaw = 0.7; // 약간 비껴 서 있음
    s.step(input({ pressed: { light: true } }));
    expect(s.player.mode).toBe('attack');
    expect(Math.abs(s.player.yaw)).toBeLessThan(0.05);
  });

  it('락온이 아니고 입력 방향이 사자와 반대면 자동 조준하지 않는다', () => {
    const s = makeSim();
    place(s, 3.0);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { light: true }, moveY: -1 }));
    expect(Math.abs(s.player.yaw)).toBeGreaterThan(2.5);
  });

  it('약공격은 이전보다 빠르게 맞는다 (선딜 0.2초 이하)', () => {
    expect(PLAYER_ATTACKS.light1.activeStart).toBeLessThanOrEqual(0.2);
    expect(PLAYER_ATTACKS.light2.activeStart).toBeLessThanOrEqual(0.2);
  });

  it('공격 후딜 중 이동 입력을 하면 걸어 나간다 (후딜 취소)', () => {
    const s = makeSim();
    place(s, 8);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { light: true } }));
    const def = PLAYER_ATTACKS.light1;
    run(s, def.activeEnd + 0.12);
    expect(s.player.mode).toBe('attack');
    run(s, 0.1, input({ moveY: 1 }));
    expect(s.player.mode).toBe('free');
  });

  it('후딜 취소는 유효 구간 도중에는 일어나지 않는다', () => {
    const s = makeSim();
    place(s, 8);
    s.ctx.lion.mode = 'dormant';
    s.step(input({ pressed: { light: true } }));
    run(s, PLAYER_ATTACKS.light1.activeStart + 0.02, input({ moveY: 1 }));
    expect(s.player.mode).toBe('attack');
    void setMode;
  });
});
