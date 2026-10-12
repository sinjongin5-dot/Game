import { describe, expect, it } from 'vitest';
import { applyDeadzone, emptyPadFrame, GamepadInput, mapPad, PAD, RepeatGate, type PadSnapshot } from '../src/input/gamepad';
import { envelope, Haptics, HapticsDirector, PATTERNS, type ActuatorLike } from '../src/input/haptics';
import { makeSim } from './helpers';
import type { SimEvent } from '../src/simulation/state';

const snap = (over: { axes?: number[]; down?: number[]; values?: Record<number, number> } = {}): PadSnapshot => {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const v = over.values?.[i] ?? (over.down?.includes(i) ? 1 : 0);
    return { pressed: v > 0.5, value: v };
  });
  return { connected: true, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', axes: over.axes ?? [0, 0, 0, 0], buttons };
};

describe('게임패드 매핑', () => {
  it('데드존 안의 스틱 입력은 0 이고 바깥은 0..1 로 펴진다 (스틱 드리프트 방지)', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const f = applyDeadzone(1, 0);
    expect(f.x).toBeCloseTo(1, 5);
    const h = applyDeadzone(0.6, 0);
    expect(h.x).toBeGreaterThan(0.45); expect(h.x).toBeLessThan(0.6);
  });

  it('왼쪽 스틱은 이동(위 = 앞), 오른쪽 스틱은 시점', () => {
    const f = mapPad(null, snap({ axes: [0.0, -1, 1, 0] }), 1 / 60);
    expect(f.moveY).toBeCloseTo(1, 2);
    expect(Math.abs(f.moveX)).toBeLessThan(0.01);
    expect(f.lookDx).toBeGreaterThan(5);
    expect(f.lookDy).toBe(0);
    const still = mapPad(null, snap({ axes: [0.05, 0.05, -0.1, 0.1] }), 1 / 60);
    expect(still.moveX).toBe(0); expect(still.lookDx).toBe(0);
  });

  it('전투 버튼 매핑: RB 약공격, RT/Y 강공격, B 회피, X 회복, R3 락온 (눌림 에지만)', () => {
    const empty = snap();
    expect(mapPad(empty, snap({ down: [PAD.RB] }), 0.016).pressed.light).toBe(true);
    expect(mapPad(snap({ down: [PAD.RB] }), snap({ down: [PAD.RB] }), 0.016).pressed.light).toBe(false); // 누르고 있기만 하면 에지 아님
    expect(mapPad(empty, snap({ values: { [PAD.RT]: 0.9 } }), 0.016).pressed.heavy).toBe(true);
    expect(mapPad(empty, snap({ values: { [PAD.RT]: 0.2 } }), 0.016).pressed.heavy).toBe(false);
    expect(mapPad(empty, snap({ down: [PAD.Y] }), 0.016).pressed.heavy).toBe(true);
    expect(mapPad(empty, snap({ down: [PAD.B] }), 0.016).pressed.dodge).toBe(true);
    expect(mapPad(empty, snap({ down: [PAD.X] }), 0.016).pressed.heal).toBe(true);
    expect(mapPad(empty, snap({ down: [PAD.R3] }), 0.016).pressed.lock).toBe(true);
  });

  it('방패는 LB 또는 LT 를 누르고 있는 동안, 달리기는 A 를 누르고 있는 동안', () => {
    expect(mapPad(null, snap({ down: [PAD.LB] }), 0.016).guard).toBe(true);
    expect(mapPad(null, snap({ values: { [PAD.LT]: 0.8 } }), 0.016).guard).toBe(true);
    expect(mapPad(null, snap(), 0.016).guard).toBe(false);
    expect(mapPad(null, snap({ down: [PAD.A] }), 0.016).run).toBe(true);
  });

  it('상호작용용 A/B/X/Y 눌림 에지가 각각 전달된다', () => {
    const e = snap();
    const f = mapPad(e, snap({ down: [PAD.A, PAD.Y] }), 0.016);
    expect(f.pressed.a && f.pressed.y).toBe(true);
    expect(f.pressed.b || f.pressed.x).toBe(false);
  });

  it('메뉴 입력: A 확인, B 뒤로, Start', () => {
    const f = mapPad(snap(), snap({ down: [PAD.A, PAD.START] }), 0.016);
    expect(f.menu.confirm && f.menu.start).toBe(true);
    expect(mapPad(snap(), snap({ down: [PAD.B] }), 0.016).menu.back).toBe(true);
  });

  it('연결이 끊긴 컨트롤러는 빈 프레임', () => {
    const f = mapPad(null, { ...snap(), connected: false }, 0.016);
    expect(f).toEqual(emptyPadFrame());
  });

  it('메뉴 방향 반복: 처음 즉시, 유지하면 지연 후 일정 간격', () => {
    const g = new RepeatGate();
    expect(g.step(true, 0.016)).toBe(true);
    let n = 0;
    for (let i = 0; i < 60; i++) if (g.step(true, 0.016)) n++; // 약 0.96초
    expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(6);
    expect(g.step(false, 0.016)).toBe(false);
    expect(g.step(true, 0.016)).toBe(true); // 뗐다가 다시 누르면 즉시
  });

  it('GamepadInput 이 가짜 Gamepad 를 읽어 연결/해제와 D-패드 메뉴 입력을 만든다', () => {
    const pad = { connected: true, id: 'fake', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) } as unknown as Gamepad;
    let pads: (Gamepad | null)[] = [pad];
    const gi = new GamepadInput();
    gi.getPads = () => pads;
    let connected = 0, disconnected = 0;
    gi.onConnect = () => connected++; gi.onDisconnect = () => disconnected++;
    gi.poll(0.016);
    expect(connected).toBe(1);
    (pad.buttons[PAD.DOWN] as { pressed: boolean; value: number }).pressed = true;
    expect(gi.poll(0.016).menu.down).toBe(true);
    expect(gi.current()).toBe(pad);
    pads = [null];
    gi.poll(0.016);
    expect(disconnected).toBe(1);
    expect(gi.current()).toBeNull();
  });
});

describe('진동(햅틱)', () => {
  const fake = () => {
    const calls: { weak: number; strong: number; duration: number }[] = [];
    let resets = 0;
    const act: ActuatorLike = {
      playEffect: (_t, p) => { calls.push({ weak: p.weakMagnitude, strong: p.strongMagnitude, duration: p.duration * 1000 }); return Promise.resolve(); },
      reset: () => { resets++; return Promise.resolve(); },
    };
    return { act, calls, resets: () => resets };
  };

  it('효과를 재생하면 컨트롤러에 dual-rumble 이 전달되고 시간이 지나면 멈춘다', () => {
    const f = fake();
    const h = new Haptics(() => f.act);
    h.play(PATTERNS.hitLight);
    h.tick(0.016);
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].weak).toBeGreaterThan(0.3);
    for (let i = 0; i < 20; i++) h.tick(0.016);
    expect(h.activeCount).toBe(0);
    expect(f.resets()).toBeGreaterThan(0);
  });

  it('세기 설정 0 이면 아무것도 보내지 않고, 0.5 면 절반으로 줄어든다', () => {
    const off = fake(); const h0 = new Haptics(() => off.act); h0.intensity = 0; h0.play(PATTERNS.guardBreak); h0.tick(0.016);
    expect(off.calls.length).toBe(0);
    const a = fake(), b = fake();
    const ha = new Haptics(() => a.act), hb = new Haptics(() => b.act); hb.intensity = 0.5;
    ha.play({ dur: 0.2, weak: 0.8, strong: 0.8 }); hb.play({ dur: 0.2, weak: 0.8, strong: 0.8 });
    ha.tick(0.016); hb.tick(0.016);
    expect(b.calls[0].weak).toBeCloseTo(a.calls[0].weak * 0.5, 2);
  });

  it('겹친 효과는 모터별 최대값으로 섞이고 1 을 넘지 않는다', () => {
    const f = fake();
    const h = new Haptics(() => f.act);
    h.play([{ dur: 0.2, weak: 0.9, strong: 0.1 }, { dur: 0.2, weak: 0.2, strong: 1 }, { dur: 0.2, weak: 5, strong: 5 }]);
    h.tick(0.016);
    expect(f.calls[0].weak).toBeLessThanOrEqual(1);
    expect(f.calls[0].strong).toBeLessThanOrEqual(1);
  });

  it('감쇠 곡선: 시작이 가장 세고 끝에서 0', () => {
    const r = { dur: 1, weak: 1, strong: 1, curve: 'decay' as const };
    expect(envelope(r, 0)).toBeCloseTo(1, 3);
    expect(envelope(r, 0.5)).toBeLessThan(0.5);
    expect(envelope(r, 1.01)).toBe(0);
    expect(envelope({ ...r, delay: 0.3 }, 0.1)).toBe(0);
  });

  it('동시 효과 수에 상한이 있고 stop() 은 즉시 진동을 끈다', () => {
    const f = fake();
    const h = new Haptics(() => f.act);
    for (let i = 0; i < 100; i++) h.play({ dur: 1, weak: 0.1, strong: 0.1 });
    expect(h.activeCount).toBeLessThanOrEqual(h.maxActive);
    h.stop();
    expect(h.activeCount).toBe(0);
    expect(f.resets()).toBeGreaterThan(0);
  });

  it('actuator 가 없거나 예외를 던져도 게임에 영향이 없다', () => {
    const h = new Haptics(() => null);
    h.play(PATTERNS.parry); h.tick(0.016);
    const bad = new Haptics(() => ({ playEffect: () => { throw new Error('x'); } }));
    bad.play(PATTERNS.parry);
    expect(() => bad.tick(0.016)).not.toThrow();
  });

  it('이벤트별 진동: 처형 > 강타 > 약타, 패링은 고주파(weak) 중심의 날카로운 이중 타격, 피격은 저주파(strong) 중심', () => {
    const peak = (ev: SimEvent) => {
      const f = fake();
      const h = new Haptics(() => f.act);
      const d = new HapticsDirector(h);
      d.handle([ev], makeSim());
      h.tick(0.001);
      return f.calls[0] ?? { weak: 0, strong: 0 };
    };
    const hit = (o: object) => ({ type: 'playerHitLion', pos: { x: 0, y: 1, z: 0 }, dmg: 10, heavy: false, head: false, stunned: false, invuln: false, dir: { x: 0, y: 0, z: 1 }, killing: false, combo: 0, ...o }) as SimEvent;
    const light = peak(hit({})), heavy = peak(hit({ heavy: true })), exec = peak(hit({ heavy: true, execute: true }));
    expect(heavy.strong).toBeGreaterThan(light.strong);
    expect(exec.strong).toBeGreaterThanOrEqual(heavy.strong);
    const parry = peak({ type: 'playerBlocked', strength: 0.5, pos: { x: 0, y: 1, z: 0 }, broke: false, attack: 'bite', perfect: true, parry: true });
    expect(parry.weak).toBeGreaterThan(parry.strong);
    const taken = peak({ type: 'playerHit', dmg: 20, pos: { x: 0, y: 1, z: 0 }, heavy: false, attack: 'bite' });
    expect(taken.strong).toBeGreaterThan(taken.weak);
    const miss = peak({ type: 'qteResult', idx: 0, ok: false, perfect: false, button: 'A', pos: { x: 0, y: 1, z: 0 } });
    const ok = peak({ type: 'qteResult', idx: 0, ok: true, perfect: false, button: 'A', pos: { x: 0, y: 1, z: 0 } });
    expect(miss.strong).toBeGreaterThan(ok.strong);
  });

  it('보스의 충격은 멀수록 약하게 느껴진다', () => {
    const run = (x: number) => {
      const f = fake(); const h = new Haptics(() => f.act); const d = new HapticsDirector(h);
      const s = makeSim(); s.ctx.player.pos = { x: 0, z: 0 };
      d.handle([{ type: 'lionSlam', pos: { x, z: 0 } }], s); h.tick(0.001);
      return f.calls[0].strong;
    };
    expect(run(1)).toBeGreaterThan(run(12));
  });

  it('체력이 25% 미만이면 심장 박동 진동이 반복된다', () => {
    const f = fake(); const h = new Haptics(() => f.act); const d = new HapticsDirector(h);
    const s = makeSim(); s.ctx.player.hp = 10;
    let sent = 0;
    for (let i = 0; i < 240; i++) { d.update(1 / 60, s); h.tick(1 / 60); }
    sent = f.calls.length;
    expect(sent).toBeGreaterThan(3);
  });
});
