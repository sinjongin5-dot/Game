import { describe, expect, it } from 'vitest';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../src/combat/attackData';
import { canExecute } from '../src/simulation/execution';
import { setLionMode, startLionAttack } from '../src/simulation/lion';
import { TUNING } from '../src/simulation/tuning';
import type { SimEvent } from '../src/simulation/state';
import { input, makeSim, run } from './helpers';

function place(sim: ReturnType<typeof makeSim>, dist: number) {
  const c = sim.ctx;
  c.player.pos = { x: 0, z: 0 };
  c.player.yaw = 0;
  c.lion.pos = { x: 0, z: dist };
  c.lion.yaw = Math.PI;
  sim.physics.teleport('player', c.player.pos, 0);
  sim.physics.teleport('lion', c.lion.pos, Math.PI);
  c.graceUntil = 1e9;
  c.player.hp = c.player.hpMax = 1000;
}

/** 사자 공격 유효 구간 직전에 방패를 들어 정확한 타이밍(패링 창)이 되도록 한다 */
function parryAttempt(id: Parameters<typeof startLionAttack>[1], dist: number, early = 0) {
  const s = makeSim();
  place(s, dist);
  startLionAttack(s.ctx, id);
  s.ctx.lion.attack!.hold = 0;
  const def = LION_ATTACKS[id];
  const ev: SimEvent[] = [];
  const raiseAt = def.activeStart - 0.2 - early;
  for (let i = 0; i < 400; i++) {
    const t = s.ctx.lion.attack?.t ?? 99;
    s.step(input({ guard: t >= raiseAt }));
    ev.push(...s.drainEvents());
    if (ev.some((e) => e.type === 'playerBlocked')) break;
  }
  return { s, ev };
}

describe('패링', () => {
  it('정확한 타이밍의 가드는 가벼운 공격(물기)을 끊고 사자를 회복 상태로 보낸다', () => {
    const { s, ev } = parryAttempt('bite', 1.9);
    const b = ev.find((e) => e.type === 'playerBlocked');
    expect(b && b.type === 'playerBlocked' && b.parry).toBe(true);
    expect(b && b.type === 'playerBlocked' && b.interrupted).toBe(true);
    expect(s.ctx.lion.attack).toBeNull();
    expect(s.ctx.lion.mode).toBe('recover');
    expect(s.ctx.player.hp).toBe(1000);
    expect(s.ctx.lion.poise).toBeGreaterThanOrEqual(TUNING.parry.poiseLight - 1);
  });

  it('너무 일찍 든 가드는 패링이 아니라 일반 방어이고 공격은 끊기지 않는다', () => {
    const { ev } = parryAttempt('bite', 1.9, 0.5);
    const b = ev.find((e) => e.type === 'playerBlocked');
    expect(b).toBeTruthy();
    expect(b && b.type === 'playerBlocked' && b.parry).toBeFalsy();
    expect(b && b.type === 'playerBlocked' && b.interrupted).toBeFalsy();
  });

  it('도약/충격파 같은 큰 기술은 패링 타이밍이어도 끊기지 않는다 (슈퍼아머)', () => {
    const { s, ev } = parryAttempt('whirl', 1.6);
    const b = ev.find((e) => e.type === 'playerBlocked');
    expect(b).toBeTruthy();
    expect(b && b.type === 'playerBlocked' && b.parry).toBeFalsy();
    expect(s.ctx.lion.mode).not.toBe('recover');
  });

  it('패링 후 반격은 반격 보너스(피해 증가)를 받고 한 번만 쓰인다', () => {
    const { s } = parryAttempt('bite', 1.9);
    const c = s.ctx;
    expect(c.player.riposteUntil).toBeGreaterThan(c.time);
    c.lion.pos = { x: 0, z: 1.25 };
    s.physics.teleport('lion', c.lion.pos, Math.PI);
    c.player.invulnT = 0;
    c.player.mode = 'free';
    c.player.knock = { x: 0, z: 0 };
    s.drainEvents();
    s.step(input({ pressed: { light: true } }));
    const hits: Extract<SimEvent, { type: 'playerHitLion' }>[] = [];
    for (let i = 0; i < 60; i++) { s.step(input()); for (const e of s.drainEvents()) if (e.type === 'playerHitLion') hits.push(e); }
    expect(hits.length).toBe(1);
    expect(hits[0].riposte).toBe(true);
    expect(hits[0].dmg).toBeGreaterThanOrEqual(Math.round(PLAYER_ATTACKS.light1.damage * TUNING.parry.riposteDamage) - 1);
    expect(c.player.riposteUntil).toBe(-1);
  });
});

describe('피해 중복 방지', () => {
  it('하나의 공격은 아무리 많은 판정 프레임이 겹쳐도 한 번만 명중한다', () => {
    const s = makeSim();
    place(s, 1.25);
    s.step(input({ pressed: { heavy: true } }));
    let hits = 0;
    for (let i = 0; i < 200; i++) { s.step(input()); for (const e of s.drainEvents()) if (e.type === 'playerHitLion' && !e.invuln) hits++; }
    expect(hits).toBeLessThanOrEqual(1);
  });
});

describe('처형', () => {
  function staggered() {
    const s = makeSim();
    place(s, 2.6);
    s.ctx.lion.attack = null;
    setLionMode(s.ctx.lion, 'stagger', 1.7);
    return s;
  }

  it('사자가 경직 중이고 사정거리 안이면 강공격 입력이 처형이 된다', () => {
    const s = staggered();
    run(s, 0.3);
    expect(canExecute(s.ctx)).toBe(true);
    s.drainEvents();
    s.step(input({ pressed: { heavy: true } }));
    const ev = s.drainEvents();
    expect(ev.some((e) => e.type === 'executionStart')).toBe(true);
    expect(s.player.executing).toBe(true);
    expect(s.player.invulnT).toBeGreaterThan(0.5);
    expect(s.player.stamina).toBe(100); // 처형은 스태미나를 쓰지 않는다
  });

  it('처형은 검 궤적과 관계없이 정확히 한 번 명중하고 큰 피해를 준다', () => {
    const s = staggered();
    run(s, 0.3);
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { heavy: true } }));
    const hits: Extract<SimEvent, { type: 'playerHitLion' }>[] = [];
    for (let i = 0; i < 150; i++) { s.step(input()); for (const e of s.drainEvents()) if (e.type === 'playerHitLion') hits.push(e); }
    const ex = hits.filter((e) => e.execute);
    expect(ex.length).toBe(1);
    expect(hp0 - s.lion.hp).toBe(Math.round(Math.max(TUNING.execute.minDamage, s.lion.hpMax * TUNING.execute.hpFrac)));
    expect(hits.length).toBe(1);
  });

  it('처형 동작 중에는 사자가 경직을 유지하고 플레이어는 무적이다', () => {
    const s = staggered();
    run(s, 0.3);
    s.step(input({ pressed: { heavy: true } }));
    for (let i = 0; i < 40; i++) {
      s.step(input());
      expect(s.lion.mode === 'stagger' || s.lion.mode === 'stunned').toBe(true);
      expect(s.player.invulnT).toBeGreaterThan(0);
    }
    expect(s.player.hp).toBe(1000);
  });

  it('같은 경직 동안 두 번 처형할 수 없다', () => {
    const s = staggered();
    run(s, 0.3);
    s.step(input({ pressed: { heavy: true } }));
    run(s, 0.1);
    expect(s.lion.executed).toBe(true);
    expect(canExecute(s.ctx)).toBe(false);
  });

  it('경직이 끝나가거나(남은 시간 부족) 너무 멀면 처형되지 않고 일반 강공격이 나간다', () => {
    const s = staggered();
    s.ctx.lion.modeT = 1.5;
    expect(canExecute(s.ctx)).toBe(false);
    const f = makeSim();
    place(f, 8);
    setLionMode(f.ctx.lion, 'stagger', 1.7);
    run(f, 0.3);
    expect(canExecute(f.ctx)).toBe(false);
  });

  it('처형으로 사자를 쓰러뜨리면 정상적으로 승리 처리된다', () => {
    const s = staggered();
    s.ctx.lion.hp = 50;
    run(s, 0.3);
    s.step(input({ pressed: { heavy: true } }));
    run(s, 2.5);
    expect(['dying', 'dead']).toContain(s.lion.mode);
    expect(s.phase).toBe('victory');
  });
});

describe('달리기 공격', () => {
  it('달리다가 처음 휘두른 약공격만 달리기 공격이 되어 피해가 커진다', () => {
    const s = makeSim();
    place(s, 7);
    s.ctx.lion.mode = 'dormant';
    run(s, 1.0, input({ moveY: 1, run: true }));
    expect(s.player.running).toBe(true);
    s.step(input({ moveY: 1, run: true, pressed: { light: true } }));
    expect(s.player.runAttack).toBe(true);
    const f = makeSim();
    place(f, 7);
    f.step(input({ pressed: { light: true } }));
    expect(f.player.runAttack).toBe(false);
  });
});
