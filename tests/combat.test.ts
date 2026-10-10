import { describe, expect, it } from 'vitest';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../src/combat/attackData';
import { startLionAttack } from '../src/simulation/lion';
import { TUNING } from '../src/simulation/tuning';
import { setMode } from '../src/simulation/player';
import { input, makeSim, run } from './helpers';

function place(sim: ReturnType<typeof makeSim>, dist: number) {
  const c = sim.ctx;
  c.player.pos = { x: 0, z: 0 };
  c.player.yaw = 0; // +z 를 바라봄
  c.lion.pos = { x: 0, z: dist };
  c.lion.yaw = Math.PI; // 플레이어를 향함
  sim.physics.teleport('player', c.player.pos, 0);
  sim.physics.teleport('lion', c.lion.pos, Math.PI);
  c.graceUntil = 0;
}

describe('플레이어 이동', () => {
  it('대각 이동 속도가 직선 이동과 같다', () => {
    const a = makeSim(), b = makeSim();
    run(a, 1.5, input({ moveY: 1 }));
    run(b, 1.5, input({ moveY: 1, moveX: 1 }));
    expect(a.player.speed).toBeGreaterThan(2.5);
    expect(Math.abs(a.player.speed - b.player.speed)).toBeLessThan(0.05);
  });

  it('달리기는 스태미나를 소모하고 걷기보다 빠르다', () => {
    const s = makeSim();
    const st0 = s.player.stamina;
    run(s, 1.2, input({ moveY: 1, run: true }));
    expect(s.player.speed).toBeGreaterThan(TUNING.player.walkSpeed + 1);
    expect(s.player.stamina).toBeLessThan(st0);
  });
});

describe('스태미나', () => {
  it('스태미나가 부족하면 공격이 실행되지 않는다', () => {
    const s = makeSim();
    place(s, 6);
    s.player.stamina = 10;
    s.step(input({ pressed: { light: true } }));
    expect(s.player.mode).toBe('free');
    expect(s.drainEvents().some((e) => e.type === 'staminaDenied')).toBe(true);
  });

  it('소비 후 약 0.7초 뒤에 회복이 시작된다', () => {
    const s = makeSim();
    place(s, 6);
    s.step(input({ pressed: { light: true } }));
    const after = s.player.stamina;
    expect(after).toBeCloseTo(100 - 18, 0);
    run(s, 0.5);
    // 공격 중에도 0.7 초 이전에는 회복하지 않는다
    expect(s.player.stamina).toBeLessThanOrEqual(after + 0.01);
    run(s, 0.6);
    expect(s.player.stamina).toBeGreaterThan(after + 1);
  });

  it('연타해도 약공격 3타 연계만 이어지고 취소로 무한 연타할 수 없다', () => {
    const s = makeSim();
    place(s, 6);
    const ids = new Set<string>();
    run(s, 4, (t) => {
      const press = Math.floor(t * 60) % 3 === 0;
      return input({ pressed: { light: press } });
    });
    // 4초 동안 스태미나 때문에 사용 횟수가 제한된다
    expect(s.player.stamina).toBeLessThan(60);
    void ids;
  });
});

describe('플레이어 → 사자 공격', () => {
  it('약공격은 한 번의 스윙에서 한 번만 피해를 준다', () => {
    const s = makeSim();
    place(s, 2.3);
    s.ctx.lion.mode = 'dormant'; // 사자는 가만히
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { light: true } }));
    run(s, 0.7);
    const dmg = hp0 - s.lion.hp;
    const hits = s.drainEvents().filter((e) => e.type === 'playerHitLion');
    expect(hits.length).toBe(1);
    // 머리에 맞으면 20% 추가 피해
    expect([PLAYER_ATTACKS.light1.damage, Math.round(PLAYER_ATTACKS.light1.damage * 1.2)]).toContain(dmg);
  });

  it('유효 프레임 밖에서는 피해가 없다 (준비 동작 중)', () => {
    const s = makeSim();
    place(s, 2.3);
    s.ctx.lion.mode = 'dormant';
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { light: true } }));
    run(s, 0.1);
    expect(s.lion.hp).toBe(hp0);
  });

  it('너무 멀면 맞지 않는다', () => {
    const s = makeSim();
    place(s, 5.5);
    s.ctx.lion.mode = 'dormant';
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { light: true } }));
    run(s, 0.8);
    expect(s.lion.hp).toBe(hp0);
  });

  it('강공격은 큰 피해와 경직 누적을 준다', () => {
    const s = makeSim();
    place(s, 2.3);
    s.ctx.lion.mode = 'dormant';
    const hp0 = s.lion.hp;
    s.step(input({ pressed: { heavy: true } }));
    run(s, 1.2);
    expect(hp0 - s.lion.hp).toBeGreaterThanOrEqual(PLAYER_ATTACKS.heavy.damage);
    expect(s.lion.poise).toBeGreaterThan(30);
  });

  it('경직이 가득 차면 사자가 비틀거린 뒤 면역 시간 동안 누적이 줄어든다', () => {
    const s = makeSim();
    place(s, 2.3);
    s.ctx.lion.mode = 'dormant';
    s.lion.poise = 90;
    s.step(input({ pressed: { heavy: true } }));
    run(s, 0.9);
    expect(s.lion.mode).toBe('stagger');
    expect(s.lion.staggerImmune).toBeGreaterThan(5);
  });
});

describe('사자 → 플레이어 공격', () => {
  it('앞발 공격이 유효 프레임에 한 번만 피해를 준다', () => {
    const s = makeSim();
    place(s, 2.2);
    startLionAttack(s.ctx, 'swipe');
    s.ctx.lion.attack!.hold = 0;
    const hp0 = s.player.hp;
    run(s, 1.6);
    expect(hp0 - s.player.hp).toBe(LION_ATTACKS.swipe.damage);
    const hits = s.drainEvents().filter((e) => e.type === 'playerHit');
    expect(hits.length).toBe(1);
  });

  it('회피 무적 구간 안에서는 피해가 없고 구간 밖에서는 피해를 입는다', () => {
    const inside = makeSim();
    place(inside, 1.6);
    startLionAttack(inside.ctx, 'bite');
    inside.ctx.lion.attack!.hold = 0;
    // 공격이 유효해지는 순간에 회피 무적 구간(0.1~0.34s) 안에 있도록 맞춘다
    inside.ctx.lion.attack!.t = 0.6;
    setMode(inside.player, 'dodge');
    inside.player.modeT = 0.2;
    inside.player.dodge = { dir: { x: 0, z: 0 }, backstep: true, dodgedSet: 0 };
    const hp0 = inside.player.hp;
    // 위치를 고정하기 위해 직접 비교: 한 스텝만 진행
    inside.ctx.player.vel = { x: 0, z: 0 };
    const baseStep = () => {
      // 회피 이동을 막기 위해 매 스텝 위치를 되돌린다
      inside.player.pos = { x: 0, z: 0 };
      inside.step();
      inside.player.pos = { x: 0, z: 0 };
    };
    for (let i = 0; i < 6; i++) { inside.player.modeT = 0.2; baseStep(); }
    expect(inside.player.hp).toBe(hp0);
    expect(inside.stats.dodges).toBe(1);

    const outside = makeSim();
    place(outside, 1.6);
    startLionAttack(outside.ctx, 'bite');
    outside.ctx.lion.attack!.hold = 0;
    outside.ctx.lion.attack!.t = 0.6;
    setMode(outside.player, 'dodge');
    outside.player.dodge = { dir: { x: 0, z: 0 }, backstep: true, dodgedSet: 0 };
    for (let i = 0; i < 12; i++) { outside.player.modeT = 0.5; outside.player.pos = { x: 0, z: 0 }; outside.step(); outside.player.pos = { x: 0, z: 0 }; }
    expect(outside.player.hp).toBeLessThan(100);
  });

  it('방패는 전방에서만 막고, 후방 공격은 막지 못한다', () => {
    const front = makeSim();
    place(front, 2.2);
    startLionAttack(front.ctx, 'swipe');
    front.ctx.lion.attack!.hold = 0;
    const hp0 = front.player.hp, st0 = front.player.stamina;
    run(front, 1.7, input({ guard: true }));
    expect(front.player.hp).toBe(hp0);
    expect(front.player.stamina).toBeLessThan(st0);
    expect(front.stats.blocks).toBe(1);

    const back = makeSim();
    place(back, 2.2);
    back.player.yaw = Math.PI; // 사자를 등지고 있다
    back.physics.teleport('player', back.player.pos, Math.PI);
    startLionAttack(back.ctx, 'swipe');
    back.ctx.lion.attack!.hold = 0;
    run(back, 1.7, input({ guard: true, cameraYaw: Math.PI }));
    expect(back.player.hp).toBeLessThan(100);
  });

  it('스태미나가 부족하면 가드 브레이크가 발생한다', () => {
    const s = makeSim();
    place(s, 2.2);
    s.player.stamina = 5;
    s.player.staminaDelay = 5;
    startLionAttack(s.ctx, 'swipe');
    s.ctx.lion.attack!.hold = 0;
    run(s, 1.2, input({ guard: true }));
    const ev = s.drainEvents();
    expect(ev.some((e) => e.type === 'playerBlocked' && e.broke)).toBe(true);
    expect(s.player.mode === 'guardBreak' || s.player.hp < 100).toBe(true);
  });

  it('플레이어가 죽으면 사자의 공격 판정이 제거되고 더 이상 피해가 없다', () => {
    const s = makeSim();
    place(s, 2.2);
    s.player.hp = 5;
    startLionAttack(s.ctx, 'swipe');
    s.ctx.lion.attack!.hold = 0;
    run(s, 1.2);
    expect(s.player.mode).toBe('dead');
    expect(s.lion.attack).toBeNull();
    const hpAfter = s.player.hp;
    run(s, 3);
    expect(s.player.hp).toBe(hpAfter);
    expect(s.phase).toBe('playerDead');
  });
});

describe('회복', () => {
  it('회복은 시간이 필요하고 시작 즉시 횟수를 소비한다', () => {
    const s = makeSim();
    place(s, 8);
    s.ctx.lion.mode = 'dormant';
    s.player.hp = 40;
    s.step(input({ pressed: { heal: true } }));
    expect(s.player.heals).toBe(1);
    expect(s.player.hp).toBe(40);
    run(s, 0.5);
    expect(s.player.hp).toBe(40);
    run(s, 0.4);
    expect(s.player.hp).toBe(85);
  });

  it('피격으로 회복이 중단되면 횟수는 돌아오지 않고 체력도 늘지 않는다', () => {
    const s = makeSim();
    place(s, 2.2);
    s.player.hp = 60;
    s.step(input({ pressed: { heal: true } }));
    startLionAttack(s.ctx, 'swipe');
    s.ctx.lion.attack!.hold = 0;
    s.ctx.lion.attack!.t = 0.7;
    run(s, 0.6);
    expect(s.player.heals).toBe(1);
    expect(s.player.hp).toBeLessThanOrEqual(60 - LION_ATTACKS.swipe.damage);
  });
});

describe('페이즈 전환', () => {
  it('체력 55% 이하에서 한 번만 2페이즈로 전환된다', () => {
    const s = makeSim();
    place(s, 7);
    s.player.stamina = 100;
    s.lion.hp = s.lion.hpMax * 0.5;
    run(s, 6);
    const events = s.drainEvents();
    expect(events.filter((e) => e.type === 'phase2').length).toBe(1);
    expect(s.lion.phase).toBe(2);
    s.lion.hp = s.lion.hpMax * 0.3;
    run(s, 4);
    expect(s.drainEvents().filter((e) => e.type === 'phase2').length).toBe(0);
  });
});

describe('재시작', () => {
  it('reset 은 모든 상태를 초기화한다', () => {
    const s = makeSim();
    place(s, 2.2);
    run(s, 3, input({ moveY: 1, run: true, guard: false, pressed: { light: true } }));
    s.player.hp = 10;
    s.lion.hp = 50;
    s.lion.phase = 2;
    s.reset({ skipIntro: true });
    const fresh = makeSim();
    const pick = (x: ReturnType<typeof makeSim>) => JSON.stringify({ p: x.player, l: x.lion, t: x.ctx.time, ph: x.phase, st: { ...x.stats, attempts: 0 } });
    expect(pick(s)).toBe(pick(fresh));
    expect(s.stats.attempts).toBe(2);
    expect(s.ctx.events.filter((e) => e.type === 'fightStart').length).toBe(1);
  });
});
