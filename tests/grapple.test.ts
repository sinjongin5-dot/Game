import { describe, expect, it } from 'vitest';
import { startGrapple } from '../src/simulation/grapple';
import { startLionAttack } from '../src/simulation/lion';
import { TUNING } from '../src/simulation/tuning';
import type { QteButton, QteMode, SimEvent } from '../src/simulation/state';
import { input, makeSim, run } from './helpers';

const G = TUNING.grapple;
const face = (b: QteButton) => input({ pressed: { [b.toLowerCase()]: true } });

function setup(qte: QteMode = 'normal') {
  const s = makeSim();
  s.setQte(qte);
  const c = s.ctx;
  c.player.pos = { x: 0, z: 0 }; c.player.yaw = 0;
  c.lion.pos = { x: 0, z: 2.2 }; c.lion.yaw = Math.PI;
  s.physics.teleport('player', c.player.pos, 0);
  s.physics.teleport('lion', c.lion.pos, Math.PI);
  c.graceUntil = 1e9;
  c.player.hp = c.player.hpMax = 1000;
  c.lion.hp = c.lion.hpMax = 900;
  return s;
}

type Policy = (g: NonNullable<ReturnType<typeof setup>['ctx']['grapple']>, idx: number) => QteButton | null;

/** 포획이 끝날 때까지 정책대로 입력하며 진행하고 이벤트를 모은다 */
function play(s: ReturnType<typeof setup>, bite: Policy, counter: (t: number) => boolean = () => true, maxSteps = 900) {
  const ev: SimEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const g = s.ctx.grapple;
    let inp = input();
    if (g) {
      if (g.phase === 'bite' && !g.resolved) { const b = bite(g, g.idx); if (b) inp = face(b); }
      else if (g.phase === 'counter' && counter(g.t)) inp = face(g.counterBtn);
    }
    s.step(inp);
    ev.push(...s.drainEvents());
    if (!s.ctx.grapple && ev.some((e) => e.type === 'grappleEnd')) break;
  }
  return ev;
}

const inWindow = (g: { t: number; winStart: number; winEnd: number }, frac = 0.5) => g.t >= g.winStart + (g.winEnd - g.winStart) * frac;
const ends = (ev: SimEvent[]) => ev.find((e) => e.type === 'grappleEnd') as Extract<SimEvent, { type: 'grappleEnd' }> | undefined;

describe('물어뜯기 포획 (상호작용)', () => {
  it('시작하면 사자가 달라붙고 플레이어는 방패를 든 채 제자리에 묶인다', () => {
    const s = setup();
    expect(startGrapple(s.ctx)).toBe(true);
    const ev = s.drainEvents();
    expect(ev.some((e) => e.type === 'grappleStart')).toBe(true);
    const d = Math.hypot(s.lion.pos.x - s.player.pos.x, s.lion.pos.z - s.player.pos.z);
    expect(d).toBeCloseTo(G.dist, 1);
    const p0 = { ...s.player.pos };
    run(s, 0.5, input({ moveY: 1, run: true }));
    expect(Math.hypot(s.player.pos.x - p0.x, s.player.pos.z - p0.z)).toBeLessThan(0.01);
    expect(s.player.guardHeld).toBe(true);
    expect(s.ctx.grapple).not.toBeNull();
  });

  it('세 번 모두 정확히 막으면 피해 0, 반격 입력으로 사자를 밀치고 처형 일격으로 이어진다', () => {
    const s = setup();
    startGrapple(s.ctx);
    const hp0 = s.player.hp;
    const ev = play(s, (g) => (inWindow(g, 0.3) ? g.prompts[g.idx] : null));
    const results = ev.filter((e) => e.type === 'qteResult') as Extract<SimEvent, { type: 'qteResult' }>[];
    expect(results.length).toBe(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(s.player.hp).toBe(hp0);
    expect(ev.some((e) => e.type === 'grappleCounterPrompt')).toBe(true);
    expect(ends(ev)?.outcome).toBe('counter');
    expect(ev.some((e) => e.type === 'executionStart')).toBe(true);
    expect(s.lion.mode === 'stagger').toBe(true);
    expect(s.player.executing).toBe(true);
    expect(s.stats.counters).toBe(1);
    expect(s.stats.qteSuccess).toBe(3);
    // 처형 일격이 정확히 한 번 명중한다
    const hits: SimEvent[] = [];
    for (let i = 0; i < 150; i++) { s.step(input()); for (const e of s.drainEvents()) if (e.type === 'playerHitLion') hits.push(e); }
    expect(hits.length).toBe(1);
    expect(s.lion.hp).toBeLessThan(900);
    expect(s.player.hp).toBe(hp0);
  });

  it('창의 막바지에 누르면 완벽(perfect), 앞쪽이면 일반 성공', () => {
    const late = setup(); startGrapple(late.ctx);
    const e1 = play(late, (g) => (g.t >= g.winEnd - 0.04 ? g.prompts[g.idx] : null), () => false);
    const early = setup(); startGrapple(early.ctx);
    const e2 = play(early, (g) => (g.t >= g.winStart + 0.01 ? g.prompts[g.idx] : null), () => false);
    const r1 = e1.filter((e) => e.type === 'qteResult') as Extract<SimEvent, { type: 'qteResult' }>[];
    const r2 = e2.filter((e) => e.type === 'qteResult') as Extract<SimEvent, { type: 'qteResult' }>[];
    expect(r1.every((r) => r.ok && r.perfect)).toBe(true);
    expect(r2.every((r) => r.ok && !r.perfect)).toBe(true);
  });

  it('잘못된 버튼/놓침은 그 물기만 피해(14)를 입고, 세 번 다 놓치면 총 42 피해 후 놓아 준다', () => {
    const s = setup(); startGrapple(s.ctx);
    const ev = play(s, () => null);
    expect(ends(ev)?.outcome).toBe('released');
    expect(1000 - s.player.hp).toBe(G.damage * 3);
    expect((ev.filter((e) => e.type === 'qteResult') as { ok: boolean }[]).every((r) => !r.ok)).toBe(true);
    expect(s.player.mode === 'dead').toBe(false);
    expect(s.lion.mode).toBe('recover');

    const w = setup(); startGrapple(w.ctx);
    const wrong = play(w, (g, i) => (inWindow(g, 0.5) ? (['A', 'B', 'X', 'Y'].find((b) => b !== g.prompts[i]) as QteButton) : null));
    expect(1000 - w.player.hp).toBe(G.damage * 3);
    expect(ends(wrong)?.outcome).toBe('released');
  });

  it('일부만 막으면 막은 물기는 피해가 없고 반격 기회 없이 끝난다', () => {
    const s = setup(); startGrapple(s.ctx);
    const ev = play(s, (g, i) => (i === 1 && inWindow(g, 0.3) ? g.prompts[i] : null));
    expect(1000 - s.player.hp).toBe(G.damage * 2);
    expect(ev.some((e) => e.type === 'grappleCounterPrompt')).toBe(false);
    expect(ends(ev)?.outcome).toBe('released');
  });

  it('창이 열리기 전의 이른 정답 입력은 무시되고(막지 못함), 같은 물기를 이후에 다시 누르면 성공한다', () => {
    const s = setup(); startGrapple(s.ctx);
    let pressedEarly = false;
    const ev = play(s, (g) => {
      if (g.idx === 0 && g.t < g.winStart - 0.02 && !pressedEarly && g.t > 0.05) { pressedEarly = true; return g.prompts[0]; }
      return inWindow(g, 0.3) ? g.prompts[g.idx] : null;
    }, () => false);
    expect(pressedEarly).toBe(true);
    const r = ev.filter((e) => e.type === 'qteResult') as { ok: boolean }[];
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it('같은 버튼이 연속해서 나오지 않는다', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = makeSim({ seed }); s.setQte('normal');
      s.ctx.player.pos = { x: 0, z: 0 }; s.ctx.lion.pos = { x: 0, z: 2 };
      startGrapple(s.ctx);
      const p = s.ctx.grapple!.prompts;
      expect(p[0]).not.toBe(p[1]); expect(p[1]).not.toBe(p[2]);
    }
  });

  it('여유 모드는 입력 창이 더 넓다', () => {
    const win = (m: QteMode) => { const s = setup(m); startGrapple(s.ctx); run(s, G.intro + 0.05); const g = s.ctx.grapple!; return g.winEnd - g.winStart; };
    expect(win('easy')).toBeGreaterThan(win('normal') * 1.3);
  });

  it('포획 직후에는 쿨다운으로 다시 붙잡히지 않는다', () => {
    const s = setup();
    startGrapple(s.ctx);
    play(s, () => null);
    expect(startGrapple(s.ctx)).toBe(false);
  });

  it('도약이 명중하면 포획이 시작되고, 설정을 끄면 일반 피해가 들어간다', () => {
    for (const mode of ['normal', 'off'] as QteMode[]) {
      const s = setup(mode);
      s.ctx.lion.pos = { x: 0, z: 3.4 }; s.physics.teleport('lion', s.ctx.lion.pos, Math.PI);
      startLionAttack(s.ctx, 'pounce');
      s.ctx.lion.attack!.hold = 0;
      const ev: SimEvent[] = [];
      for (let i = 0; i < 240; i++) { s.step(input()); ev.push(...s.drainEvents()); if (ev.some((e) => e.type === 'grappleStart' || e.type === 'playerHit')) break; }
      if (mode === 'normal') { expect(ev.some((e) => e.type === 'grappleStart')).toBe(true); expect(s.player.hp).toBe(1000); }
      else { expect(ev.some((e) => e.type === 'grappleStart')).toBe(false); expect(ev.some((e) => e.type === 'playerHit')).toBe(true); expect(s.player.hp).toBeLessThan(1000); }
    }
  });

  it('포획 중 체력이 바닥나면 사망 처리되고 포획이 정리된다', () => {
    const s = setup();
    s.ctx.player.hp = 10;
    startGrapple(s.ctx);
    const ev = play(s, () => null);
    expect(ends(ev)?.outcome).toBe('dead');
    expect(s.ctx.grapple).toBeNull();
    expect(s.player.mode).toBe('dead');
    expect(s.phase).toBe('playerDead');
  });

  it('반격 입력을 놓치면 반격 없이 놓아 준다', () => {
    const s = setup(); startGrapple(s.ctx);
    const ev = play(s, (g) => (inWindow(g, 0.3) ? g.prompts[g.idx] : null), () => false);
    expect(ends(ev)?.outcome).toBe('released');
    expect(ev.some((e) => e.type === 'executionStart')).toBe(false);
    expect(s.player.hp).toBe(1000);
  });
});
