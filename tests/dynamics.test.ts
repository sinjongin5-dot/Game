import { describe, expect, it } from 'vitest';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../src/combat/attackData';
import { startLionAttack } from '../src/simulation/lion';
import { gainMomentum, onPerfectDodge, tryStartFury, updateMomentum } from '../src/simulation/momentum';
import { TUNING } from '../src/simulation/tuning';
import type { SimEvent } from '../src/simulation/state';
import { input, makeSim, run } from './helpers';

function place(dist: number, seed = 1337) {
  const s = makeSim({ seed });
  const c = s.ctx;
  c.player.pos = { x: 0, z: 0 }; c.player.yaw = 0;
  c.lion.pos = { x: 0, z: dist }; c.lion.yaw = Math.PI;
  s.physics.teleport('player', c.player.pos, 0);
  s.physics.teleport('lion', c.lion.pos, Math.PI);
  c.graceUntil = 1e9;
  c.player.hp = c.player.hpMax = 1000;
  return s;
}
const collect = (s: ReturnType<typeof place>, steps: number, inp: (i: number) => ReturnType<typeof input> = () => input()) => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < steps; i++) { s.step(inp(i)); ev.push(...s.drainEvents()); }
  return ev;
};

describe('완벽 회피 → 사자의 시간이 느려지는 역습', () => {
  it('공격 판정 직전 회피에 성공하면 witch 구간이 시작되고 사자 공격이 느리게 진행된다', () => {
    const s = place(1.7);
    startLionAttack(s.ctx, 'bite');
    s.ctx.lion.attack!.hold = 0;
    const ev: SimEvent[] = [];
    let dodged = false;
    let tLion0 = -1, tSim0 = 0;
    for (let i = 0; i < 200; i++) {
      const a = s.ctx.lion.attack;
      const press = !dodged && !!a && a.t >= 0.4;
      if (press) dodged = true;
      s.step(input({ moveX: 1, pressed: { dodge: press } }));
      ev.push(...s.drainEvents());
      if (s.ctx.witchT > 0 && tLion0 < 0 && s.ctx.lion.attack) { tLion0 = s.ctx.lion.attack.t; tSim0 = i; }
      if (tLion0 >= 0 && i === tSim0 + 20) break;
    }
    expect(ev.some((e) => e.type === 'dodgeSuccess')).toBe(true);
    expect(ev.some((e) => e.type === 'witchStart')).toBe(true);
    expect(ev.some((e) => e.type === 'callout' && e.kind === 'dodge')).toBe(true);
    expect(s.stats.perfectDodges).toBe(1);
    // 20스텝(0.33초) 동안 사자 공격 시간은 약 28% 만 진행
    if (s.ctx.lion.attack && tLion0 >= 0) expect(s.ctx.lion.attack.t - tLion0).toBeLessThan(0.33 * 0.5);
  });

  it('witch 구간은 지속 시간이 지나면 끝나고, 그 동안의 공격은 피해·경직이 커진다', () => {
    const base = place(1.2); base.ctx.lion.mode = 'idle'; base.ctx.lion.modeDur = 1e9;
    const w = place(1.2); w.ctx.lion.mode = 'idle'; w.ctx.lion.modeDur = 1e9;
    onPerfectDodge(w.ctx);
    expect(w.ctx.witchT).toBeCloseTo(TUNING.witch.dur, 2);
    const hitDmg = (s: ReturnType<typeof place>) => {
      s.step(input({ pressed: { light: true } }));
      const ev = collect(s, 60);
      return (ev.find((e) => e.type === 'playerHitLion') as Extract<SimEvent, { type: 'playerHitLion' }> | undefined);
    };
    const hb = hitDmg(base), hw = hitDmg(w);
    expect(hb && hw).toBeTruthy();
    expect(hw!.dmg).toBeGreaterThan(hb!.dmg);
    expect(hw!.witch).toBe(true);
    run(w, 1.3);
    expect(w.ctx.witchT).toBe(0);
  });
});

describe('방패 밀치기', () => {
  it('방어 중 약공격 입력은 방패 밀치기가 되어 스태미나 14 를 쓰고 앞의 사자를 민다', () => {
    const s = place(1.3);
    s.ctx.lion.mode = 'idle'; s.ctx.lion.modeDur = 1e9;
    run(s, 0.3, input({ guard: true }));
    const st0 = s.player.stamina;
    s.step(input({ guard: true, pressed: { light: true } }));
    expect(s.player.attackId).toBe('bash');
    expect(st0 - s.player.stamina).toBeCloseTo(PLAYER_ATTACKS.bash.cost, 0);
    const ev = collect(s, 40, () => input({ guard: true }));
    const hit = ev.find((e) => e.type === 'playerHitLion') as Extract<SimEvent, { type: 'playerHitLion' }> | undefined;
    expect(hit?.bash).toBe(true);
    expect(ev.some((e) => e.type === 'callout' && e.kind === 'bash')).toBe(true);
    expect(s.ctx.lion.poise).toBeGreaterThanOrEqual(PLAYER_ATTACKS.bash.poise - 5);
    expect(ev.filter((e) => e.type === 'playerHitLion').length).toBe(1);
  });

  it('사자의 가벼운 공격(물기) 준비 중에 밀치면 공격이 끊기고 반격 기회가 생긴다', () => {
    const s = place(1.4);
    startLionAttack(s.ctx, 'bite');
    s.ctx.lion.attack!.hold = 0;
    s.ctx.lion.attack!.t = 0.1;
    run(s, 0.15, input({ guard: true }));
    expect(s.ctx.lion.attack).not.toBeNull();
    s.step(input({ guard: true, pressed: { light: true } }));
    const ev = collect(s, 30, () => input({ guard: true }));
    expect(ev.some((e) => e.type === 'playerHitLion')).toBe(true);
    expect(s.ctx.lion.attack).toBeNull();
    expect(s.ctx.lion.mode).toBe('recover');
    expect(s.player.hp).toBe(1000);
    expect(s.player.riposteUntil).toBeGreaterThan(s.ctx.time);
  });

  it('큰 기술(슈퍼아머)은 밀쳐도 끊기지 않는다', () => {
    const s = place(1.2);
    startLionAttack(s.ctx, 'whirl');
    s.ctx.lion.attack!.hold = 0;
    run(s, 0.2, input({ guard: true }));
    s.step(input({ guard: true, pressed: { light: true } }));
    collect(s, 20, () => input({ guard: true }));
    expect(s.ctx.lion.attack === null && s.ctx.lion.mode === 'recover').toBe(false);
  });

  it('방패 앞이 아닌 곳(등 뒤)의 사자는 밀치지 못한다', () => {
    const s = place(-1.4);
    s.ctx.lion.mode = 'idle'; s.ctx.lion.modeDur = 1e9;
    run(s, 0.3, input({ guard: true }));
    s.step(input({ guard: true, pressed: { light: true } }));
    const ev = collect(s, 40, () => input({ guard: true }));
    expect(ev.some((e) => e.type === 'playerHitLion')).toBe(false);
  });
});

describe('받아치기 (선제 타격이 사자의 공격을 끊는다)', () => {
  it('앞발 공격이 닿기 직전에 먼저 맞추면 그 공격이 끊기고 피해를 입지 않는다', () => {
    let ok = 0;
    for (const pt of [0.42, 0.46, 0.5, 0.54]) {
      const s = place(1.45);
      startLionAttack(s.ctx, 'swipe');
      s.ctx.lion.attack!.hold = 0;
      const ev: SimEvent[] = [];
      let pressed = false, after = 0;
      for (let i = 0; i < 160; i++) {
        const a = s.ctx.lion.attack;
        const press = !pressed && !!a && a.t >= pt;
        if (press) pressed = true;
        s.step(input({ pressed: { light: press } }));
        ev.push(...s.drainEvents());
        if (ev.some((e) => e.type === 'clash') && ++after > 40) break; // 끊긴 직후 사자의 회복 구간 동안만 본다
      }
      if (ev.some((e) => e.type === 'clash')) {
        ok++;
        expect(s.stats.clashes).toBe(1);
        expect(ev.some((e) => e.type === 'callout' && e.kind === 'clash')).toBe(true);
        expect(ev.some((e) => e.type === 'playerHit')).toBe(false);
        expect(s.player.hp).toBe(1000);
      }
    }
    expect(ok).toBeGreaterThanOrEqual(2);
  });

  it('공격이 한참 전(준비 초반)이거나 큰 기술(슈퍼아머)이면 받아치기가 아니라 일반 타격', () => {
    const s = place(1.2);
    startLionAttack(s.ctx, 'whirl');
    s.ctx.lion.attack!.hold = 0;
    s.step(input({ pressed: { light: true } }));
    const ev = collect(s, 30);
    expect(ev.some((e) => e.type === 'clash')).toBe(false);
  });
});

describe('기세 게이지와 폭발 모드', () => {
  it('맞출수록 오르고 100 에서 멈추며, 가득 찼을 때만 폭발이 발동한다', () => {
    const s = place(1.2);
    expect(tryStartFury(s.ctx)).toBe(false);
    for (let i = 0; i < 40; i++) gainMomentum(s.ctx, 'heavy');
    expect(s.player.momentum).toBe(100);
    expect(tryStartFury(s.ctx)).toBe(true);
    const ev = s.drainEvents();
    expect(ev.some((e) => e.type === 'furyStart')).toBe(true);
    expect(s.stats.furies).toBe(1);
    expect(tryStartFury(s.ctx)).toBe(false); // 이미 발동 중
  });

  it('입력(R/D-패드↑)으로 폭발: 스태미나 소모가 절반, 피해 ×1.25, 명중마다 체력이 조금 회복되고 9초 뒤 끝난다', () => {
    const s = place(1.2);
    s.ctx.lion.mode = 'idle'; s.ctx.lion.modeDur = 1e9;
    s.player.momentum = 100;
    s.step(input({ pressed: { fury: true } }));
    expect(s.player.furyT).toBeGreaterThan(8.9);
    const st0 = s.player.stamina;
    s.step(input({ pressed: { light: true } }));
    expect(st0 - s.player.stamina).toBeLessThanOrEqual(PLAYER_ATTACKS.light1.cost * TUNING.fury.costMul + 0.5);
    s.player.hp = 500;
    const ev = collect(s, 50);
    const hit = ev.find((e) => e.type === 'playerHitLion') as Extract<SimEvent, { type: 'playerHitLion' }> | undefined;
    expect(hit?.fury).toBe(true);
    expect(hit!.dmg).toBe(Math.round(PLAYER_ATTACKS.light1.damage * TUNING.fury.damage));
    expect(s.player.hp).toBeGreaterThan(500);
    run(s, 9.5);
    expect(s.player.furyT).toBe(0);
    expect(s.player.momentum).toBe(0);
  });

  it('피해를 받으면 연속 타격이 끊기고 기세가 깎이며, 가만히 있으면 서서히 식는다', () => {
    const s = place(3);
    s.ctx.lion.mode = 'dormant';
    s.player.momentum = 80; s.player.combo = 7; s.player.comboT = 0;
    s.ctx.lion.mode = 'idle'; s.ctx.lion.modeDur = 1e9;
    startLionAttack(s.ctx, 'swipe'); s.ctx.lion.pos = { x: 0, z: 1.2 }; s.physics.teleport('lion', s.ctx.lion.pos, Math.PI);
    s.ctx.lion.attack!.hold = 0;
    collect(s, 120);
    expect(s.player.hp).toBeLessThan(1000);
    expect(s.player.momentum).toBeLessThan(80 * (1 - TUNING.momentum.lossOnHit) + 1);
    expect(s.player.combo).toBe(0);
    const t = place(3); t.ctx.lion.mode = 'dormant';
    t.player.momentum = 50;
    for (let i = 0; i < Math.round((TUNING.momentum.idleDelay + 2) * 60); i++) updateMomentum(t.ctx, 1 / 60);
    expect(t.player.momentum).toBeLessThan(50);
  });

  it('연속 타격 수가 올라가고 5타마다 콜아웃, 시간이 지나면 초기화된다', () => {
    const s = place(1.2);
    s.ctx.lion.mode = 'idle'; s.ctx.lion.modeDur = 1e9;
    const ev: SimEvent[] = [];
    for (let k = 0; k < 8; k++) {
      s.ctx.lion.hp = s.ctx.lion.hpMax; s.ctx.lion.poise = 0; s.ctx.lion.staggerImmune = 99;
      s.player.stamina = 100;
      s.step(input({ pressed: { light: true } }));
      ev.push(...collect(s, 40));
      if (s.player.mode !== 'free') run(s, 0.8);
    }
    expect(s.player.combo).toBeGreaterThanOrEqual(5);
    expect(ev.some((e) => e.type === 'callout' && e.kind === 'combo' && e.n === 5)).toBe(true);
    expect(s.stats.maxCombo).toBeGreaterThanOrEqual(5);
    run(s, TUNING.momentum.comboWindow + 0.5);
    expect(s.player.combo).toBe(0);
  });
});

describe('사자의 연계 템포', () => {
  it('1페이즈에서도 앞발·물기 뒤에 연계(swipeBite/pounceSwat)가 가끔 이어진다', () => {
    let combos = 0, tries = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = makeSim({ seed });
      s.ctx.lion.pos = { x: 0, z: 3 };
      startLionAttack(s.ctx, 'swipe');
      tries++;
      if (s.ctx.lion.attack!.combo) combos++;
    }
    expect(combos).toBeGreaterThan(3);
    expect(combos).toBeLessThan(tries * 0.5);
    expect(LION_ATTACKS.swipeBite.kind).toBe('bite');
  });
});
