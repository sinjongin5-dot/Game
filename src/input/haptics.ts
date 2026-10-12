import type { GameSim } from '../simulation/sim';
import type { SimEvent } from '../simulation/state';

/**
 * 컨트롤러 진동. 효과를 여러 개 겹쳐 재생할 수 있는 믹서(weak=고주파 모터, strong=저주파 모터)와,
 * 시뮬레이션 이벤트를 진동 패턴으로 바꾸는 디렉터로 이루어진다.
 * Chromium 계열은 gamepad.vibrationActuator.playEffect('dual-rumble') 를 지원한다. 지원하지 않는 브라우저에서는 조용히 무시한다.
 */
export interface Rumble {
  /** 시작 지연(초) */
  delay?: number;
  /** 지속(초) */
  dur: number;
  /** 고주파(약한) 모터 0..1 */
  weak: number;
  /** 저주파(강한) 모터 0..1 */
  strong: number;
  /** 시간에 따른 변화 */
  curve?: 'flat' | 'decay' | 'rise' | 'pulse';
}

interface Active extends Rumble { t0: number; id: number; fresh: boolean }

export interface ActuatorLike {
  playEffect?: (type: 'dual-rumble', params: { startDelay?: number; duration: number; weakMagnitude: number; strongMagnitude: number }) => Promise<unknown>;
  reset?: () => Promise<unknown>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 효과 하나의 시각 t(시작 기준 초)에서의 세기 배율 */
export function envelope(r: Rumble, t: number): number {
  const d = r.delay ?? 0;
  if (t < d || t > d + r.dur) return 0;
  const u = (t - d) / Math.max(1e-3, r.dur);
  switch (r.curve) {
    case 'decay': return Math.pow(1 - u, 1.4);
    case 'rise': return u;
    case 'pulse': return Math.sin(u * Math.PI);
    default: return 1;
  }
}

export class Haptics {
  /** 0 이면 끔, 1 이 기본 최대 */
  intensity = 1;
  private active: Active[] = [];
  private nextId = 1;
  private lastSent = { weak: -1, strong: -1, at: -1 };
  private clock = 0;
  /** 최근에 실제로 보낸 값 (진단/테스트) */
  last = { weak: 0, strong: 0 };
  sentCount = 0;
  /** 한 번에 보내는 효과 길이(ms): 짧게 계속 갱신하면 겹침/끊김 없이 따라간다 */
  readonly chunkMs = 120;
  /** 동시 활성 효과 최대 수 (넘으면 가장 오래된 것부터 버린다) */
  readonly maxActive = 24;

  constructor(private getActuator: () => ActuatorLike | null) {}

  get enabled() { return this.intensity > 0.001; }
  get activeCount() { return this.active.length; }

  play(r: Rumble | Rumble[]) {
    if (!this.enabled) return;
    for (const x of Array.isArray(r) ? r : [r]) {
      this.active.push({ ...x, t0: this.clock, id: this.nextId++, fresh: true });
      if (this.active.length > this.maxActive) this.active.shift();
    }
  }

  stop() {
    this.active.length = 0;
    this.send(0, 0, true);
  }

  /** 매 프레임 호출. dt: 경과 초 */
  tick(dt: number) {
    this.clock += dt;
    let weak = 0, strong = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      let t = this.clock - a.t0;
      // 프레임이 길어 효과 전체가 한 프레임 안에 지나가 버려도(저사양/탭 복귀) 최소한 시작 부분은 한 번 전달한다
      if (a.fresh) { a.fresh = false; if (t > (a.delay ?? 0) + a.dur) t = (a.delay ?? 0) + Math.min(0.02, a.dur * 0.2); }
      else if (t > (a.delay ?? 0) + a.dur) { this.active.splice(i, 1); continue; }
      const e = envelope(a, t);
      weak = Math.max(weak, a.weak * e);
      strong = Math.max(strong, a.strong * e);
    }
    weak = clamp01(weak * this.intensity);
    strong = clamp01(strong * this.intensity);
    const changed = Math.abs(weak - this.lastSent.weak) > 0.04 || Math.abs(strong - this.lastSent.strong) > 0.04;
    const stale = this.clock - this.lastSent.at > this.chunkMs / 1000 * 0.8;
    if (weak < 0.01 && strong < 0.01) {
      if (this.lastSent.weak > 0 || this.lastSent.strong > 0) this.send(0, 0, true);
      return;
    }
    if (changed || stale) this.send(weak, strong, false);
  }

  private send(weak: number, strong: number, stopNow: boolean) {
    this.last = { weak, strong };
    this.lastSent = { weak, strong, at: this.clock };
    const act = this.getActuator();
    if (!act) return;
    try {
      if (stopNow && weak === 0 && strong === 0) { void act.reset?.(); return; }
      this.sentCount++;
      void act.playEffect?.('dual-rumble', { startDelay: 0, duration: this.chunkMs, weakMagnitude: weak, strongMagnitude: strong })?.catch?.(() => undefined);
    } catch { /* 진동 실패는 게임에 영향 없음 */ }
  }
}

// ── 이벤트 → 진동 패턴 ──────────────────────────────────────────────────────

/** 거리에 따라 약해지는 배율 (보스의 충격은 멀수록 약하게 느껴진다) */
const near = (d: number) => Math.max(0.25, 1 / (1 + d / 6));

export const PATTERNS = {
  /** 메뉴 이동/확인 */
  menuTick: { dur: 0.03, weak: 0.18, strong: 0 } as Rumble,
  menuConfirm: { dur: 0.06, weak: 0.3, strong: 0.12 } as Rumble,
  swingLight: { dur: 0.05, weak: 0.12, strong: 0 } as Rumble,
  swingHeavy: [{ dur: 0.1, weak: 0.1, strong: 0.28, curve: 'decay' }] as Rumble[],
  hitLight: { dur: 0.07, weak: 0.5, strong: 0.2, curve: 'decay' } as Rumble,
  hitFinisher: { dur: 0.12, weak: 0.55, strong: 0.5, curve: 'decay' } as Rumble,
  hitHeavy: [{ dur: 0.18, weak: 0.7, strong: 0.85, curve: 'decay' }, { delay: 0.05, dur: 0.12, weak: 0.3, strong: 0.5 }] as Rumble[],
  hitExecute: [{ dur: 0.45, weak: 1, strong: 1, curve: 'decay' }, { delay: 0.1, dur: 0.25, weak: 0.5, strong: 0.7 }] as Rumble[],
  guard: { dur: 0.1, weak: 0.55, strong: 0.45, curve: 'decay' } as Rumble,
  /** 패링: 날카로운 "딱" 두 번 (고주파 중심) */
  parry: [{ dur: 0.045, weak: 1, strong: 0.35 }, { delay: 0.07, dur: 0.05, weak: 0.8, strong: 0.7, curve: 'decay' }] as Rumble[],
  guardBreak: { dur: 0.36, weak: 0.7, strong: 1, curve: 'decay' } as Rumble,
  playerHit: { dur: 0.22, weak: 0.55, strong: 0.85, curve: 'decay' } as Rumble,
  playerHitHeavy: [{ dur: 0.38, weak: 0.7, strong: 1, curve: 'decay' }] as Rumble[],
  dodgeSuccess: { dur: 0.08, weak: 0.35, strong: 0.1 } as Rumble,
  stagger: [{ dur: 0.28, weak: 0.5, strong: 0.85, curve: 'decay' }, { delay: 0.3, dur: 0.12, weak: 0.4, strong: 0.2 }] as Rumble[],
  roar: { dur: 0.9, weak: 0.15, strong: 0.55, curve: 'pulse' } as Rumble,
  death: { dur: 0.9, weak: 0.4, strong: 0.9, curve: 'decay' } as Rumble,
  victory: [{ dur: 0.3, weak: 0.6, strong: 0.5, curve: 'decay' }, { delay: 0.35, dur: 0.3, weak: 0.5, strong: 0.4, curve: 'decay' }] as Rumble[],
  /** 물어뜯기 상호작용 */
  grappleStart: [{ dur: 0.35, weak: 0.5, strong: 1, curve: 'decay' }] as Rumble[],
  qtePrompt: { dur: 0.04, weak: 0.3, strong: 0 } as Rumble,
  qteSuccess: [{ dur: 0.05, weak: 0.9, strong: 0.5 }] as Rumble[],
  qtePerfect: [{ dur: 0.05, weak: 1, strong: 0.7 }, { delay: 0.06, dur: 0.07, weak: 0.6, strong: 0.9, curve: 'decay' }] as Rumble[],
  qteMiss: [{ dur: 0.3, weak: 0.5, strong: 1, curve: 'decay' }] as Rumble[],
  counter: [{ dur: 0.5, weak: 1, strong: 1, curve: 'decay' }] as Rumble[],
  witch: [{ dur: 0.18, weak: 0.4, strong: 0.15 }, { delay: 0.2, dur: 0.9, weak: 0.1, strong: 0.2, curve: 'decay' }] as Rumble[],
  clash: [{ dur: 0.06, weak: 1, strong: 0.5 }, { delay: 0.08, dur: 0.14, weak: 0.5, strong: 0.8, curve: 'decay' }] as Rumble[],
  bash: [{ dur: 0.16, weak: 0.5, strong: 0.9, curve: 'decay' }] as Rumble[],
  furyStart: [{ dur: 0.9, weak: 0.5, strong: 1, curve: 'decay' }, { delay: 0.05, dur: 0.4, weak: 1, strong: 0.4 }] as Rumble[],
  heartbeat: [{ dur: 0.09, weak: 0.1, strong: 0.55, curve: 'decay' }, { delay: 0.16, dur: 0.08, weak: 0.08, strong: 0.4, curve: 'decay' }] as Rumble[],
};

/**
 * 시뮬레이션 이벤트를 진동으로 번역한다. 카메라 흔들림 설정(shake)이 0 이면 큰 충격 진동도 약하게 한다는 식의 연동은 하지 않고,
 * 진동은 별도 설정(intensity)으로만 조절한다.
 */
export class HapticsDirector {
  private hbT = 0;
  constructor(private h: Haptics) {}

  reset() { this.hbT = 0; this.h.stop(); }

  scaled(r: Rumble | Rumble[], k: number): Rumble[] {
    return (Array.isArray(r) ? r : [r]).map((x) => ({ ...x, weak: Math.min(1, x.weak * k), strong: Math.min(1, x.strong * k) }));
  }

  handle(events: SimEvent[], sim: GameSim) {
    const h = this.h;
    const P = PATTERNS;
    const dist = (x: number, z: number) => Math.hypot(x - sim.player.pos.x, z - sim.player.pos.z);
    for (const e of events) {
      switch (e.type) {
        case 'playerSwing': h.play(e.id === 'heavy' ? P.swingHeavy : P.swingLight); break;
        case 'playerHitLion':
          if (e.invuln) { h.play(P.guard); break; }
          if (e.bash) { h.play(P.bash); break; }
          if (e.execute) h.play(P.hitExecute);
          else if (e.heavy) h.play(P.hitHeavy);
          else if (e.finisher || e.riposte) h.play(P.hitFinisher);
          else h.play(P.hitLight);
          break;
        case 'playerBlocked':
          if (e.broke) h.play(P.guardBreak);
          else if (e.parry) h.play(P.parry);
          else h.play(this.scaled(P.guard, 0.7 + e.strength * 0.5));
          break;
        case 'playerHit': h.play(e.heavy ? P.playerHitHeavy : P.playerHit); break;
        case 'dodgeSuccess': h.play(P.dodgeSuccess); break;
        case 'witchStart': h.play(P.witch); break;
        case 'clash': h.play(P.clash); break;
        case 'furyStart': h.play(P.furyStart); break;
        case 'lionStagger': h.play(P.stagger); break;
        case 'lionRoar': h.play(this.scaled(P.roar, e.phase2 ? 1 : 0.7)); break;
        case 'lionSlam': h.play(this.scaled([{ dur: 0.5, weak: 0.5, strong: 1, curve: 'decay' }, { delay: 0.12, dur: 0.3, weak: 0.3, strong: 0.7 }], near(dist(e.pos.x, e.pos.z)) * 1.4)); break;
        case 'lionLand': h.play(this.scaled([{ dur: 0.3, weak: 0.4, strong: 0.9, curve: 'decay' }], near(dist(e.pos.x, e.pos.z)) * (e.power ?? 1) * 1.3)); break;
        case 'lionWallHit': h.play(this.scaled([{ dur: 0.45, weak: 0.5, strong: 1, curve: 'decay' }], near(dist(e.pos.x, e.pos.z)) * 1.4)); break;
        case 'playerSlam': h.play(this.scaled([{ dur: 0.25, weak: 0.5, strong: 0.9, curve: 'decay' }], 1)); break;
        case 'playerDeath': h.play(P.death); break;
        case 'victory': h.play(P.victory); break;
        case 'grappleStart': h.play(P.grappleStart); break;
        case 'qtePrompt': h.play(P.qtePrompt); break;
        case 'qteResult': h.play(e.ok ? (e.perfect ? P.qtePerfect : P.qteSuccess) : P.qteMiss); break;
        case 'grappleCounterPrompt': h.play(P.qtePerfect); break;
        case 'grappleCounter': h.play(P.counter); break;
        default: break;
      }
    }
  }

  /** 매 프레임: 지속 효과(체력이 낮을 때 심장 박동) */
  update(dt: number, sim: GameSim) {
    const p = sim.player;
    if (sim.phase === 'fight' && p.hp / p.hpMax < 0.25 && p.mode !== 'dead') {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.hbT = 1.15; this.h.play(PATTERNS.heartbeat); }
    } else this.hbT = 0;
  }
}
