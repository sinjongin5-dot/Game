/**
 * 공격 타임라인 데이터. 시뮬레이션(판정)과 애니메이션(IK 목표)이 같은 데이터를 읽는다.
 * 좌표: 캐릭터 로컬 (x=왼쪽 +, y=위, z=앞), 단위 미터. 시간: 해당 동작 시작부터 초.
 */
import type { V3 } from '../simulation/math';

export type PlayerAttackId = 'light1' | 'light2' | 'light3' | 'heavy';

export interface SwordKey {
  t: number;
  /** 검 쥔 주먹 중심 위치 */
  hand: [number, number, number];
  /** 칼날 방향 (정규화 전) */
  dir: [number, number, number];
  /** 몸통 비틀림(+ = 왼쪽), 앞으로 숙임(+) */
  twist: number;
  lean: number;
}

export interface PlayerAttackDef {
  id: PlayerAttackId;
  duration: number;
  cost: number;
  damage: number;
  poise: number;
  activeStart: number;
  activeEnd: number;
  /** 이 시간 이후 다음 공격 입력(버퍼)을 받아 연계 */
  comboAt: number;
  /** 이 시간 이후 회피/방어로 취소 가능 */
  cancelAt: number;
  lunge: { start: number; end: number; distance: number };
  /** 이 시간까지는 락온 방향으로 느리게 회전 가능 */
  trackUntil: number;
  hitstop: number;
  keys: SwordKey[];
  next?: PlayerAttackId;
  swingSound: number;
}

export const SWORD = { bladeStart: 0.075, bladeLen: 0.56, hitRadius: 0.07 };

export const PLAYER_ATTACKS: Record<PlayerAttackId, PlayerAttackDef> = {
  light1: {
    id: 'light1', duration: 0.64, cost: 18, damage: 24, poise: 12,
    activeStart: 0.22, activeEnd: 0.34, comboAt: 0.38, cancelAt: 0.5,
    lunge: { start: 0.12, end: 0.34, distance: 0.7 }, trackUntil: 0.16, hitstop: 0.06, next: 'light2', swingSound: 0.2,
    keys: [
      { t: 0.0, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
      { t: 0.09, hand: [-0.34, 1.42, 0.26], dir: [-0.1, 0.8, 0.55], twist: -0.3, lean: 0.0 },
      { t: 0.17, hand: [-0.46, 1.55, 0.2], dir: [-0.2, 0.9, 0.3], twist: -0.55, lean: -0.03 },
      { t: 0.25, hand: [-0.12, 1.36, 0.5], dir: [0.4, 0.35, 1.0], twist: 0.0, lean: 0.14 },
      { t: 0.31, hand: [0.12, 1.1, 0.62], dir: [0.85, -0.1, 0.65], twist: 0.5, lean: 0.28 },
      { t: 0.36, hand: [0.2, 1.0, 0.58], dir: [1.0, -0.2, 0.4], twist: 0.62, lean: 0.3 },
      { t: 0.5, hand: [-0.05, 1.0, 0.5], dir: [0.4, 0.1, 1], twist: 0.25, lean: 0.12 },
      { t: 0.64, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
    ],
  },
  light2: {
    id: 'light2', duration: 0.62, cost: 18, damage: 26, poise: 12,
    activeStart: 0.2, activeEnd: 0.32, comboAt: 0.36, cancelAt: 0.5,
    lunge: { start: 0.1, end: 0.32, distance: 0.6 }, trackUntil: 0.14, hitstop: 0.06, next: 'light3', swingSound: 0.18,
    keys: [
      { t: 0.0, hand: [0.0, 1.0, 0.5], dir: [0.4, 0.1, 1], twist: 0.25, lean: 0.1 },
      { t: 0.1, hand: [0.2, 1.22, 0.42], dir: [1.0, 0.1, 0.2], twist: 0.6, lean: 0.05 },
      { t: 0.16, hand: [0.26, 1.24, 0.38], dir: [1.0, 0.1, 0.1], twist: 0.7, lean: 0.04 },
      { t: 0.24, hand: [-0.05, 1.2, 0.62], dir: [0.2, 0.0, 1.0], twist: 0.1, lean: 0.18 },
      { t: 0.3, hand: [-0.34, 1.12, 0.52], dir: [-0.9, 0.0, 0.5], twist: -0.5, lean: 0.2 },
      { t: 0.36, hand: [-0.42, 1.1, 0.42], dir: [-1.0, 0.05, 0.25], twist: -0.62, lean: 0.18 },
      { t: 0.5, hand: [-0.3, 1.06, 0.4], dir: [-0.2, 0.2, 1], twist: -0.25, lean: 0.08 },
      { t: 0.62, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
    ],
  },
  light3: {
    id: 'light3', duration: 0.88, cost: 20, damage: 38, poise: 18,
    activeStart: 0.34, activeEnd: 0.46, comboAt: 0.52, cancelAt: 0.7,
    lunge: { start: 0.24, end: 0.46, distance: 0.95 }, trackUntil: 0.24, hitstop: 0.08, swingSound: 0.3,
    keys: [
      { t: 0.0, hand: [-0.3, 1.06, 0.4], dir: [-0.1, 0.2, 1], twist: -0.2, lean: 0.05 },
      { t: 0.14, hand: [-0.25, 1.5, 0.15], dir: [-0.05, 1.0, 0.3], twist: -0.3, lean: -0.1 },
      { t: 0.28, hand: [-0.2, 1.72, 0.08], dir: [-0.05, 1.0, 0.1], twist: -0.35, lean: -0.15 },
      { t: 0.38, hand: [-0.12, 1.4, 0.55], dir: [0.0, 0.1, 1.0], twist: 0.1, lean: 0.25 },
      { t: 0.45, hand: [-0.08, 1.0, 0.7], dir: [0.0, -0.45, 1.0], twist: 0.2, lean: 0.4 },
      { t: 0.54, hand: [-0.08, 0.95, 0.68], dir: [0.0, -0.6, 1.0], twist: 0.2, lean: 0.42 },
      { t: 0.7, hand: [-0.15, 1.0, 0.5], dir: [0.0, 0.1, 1], twist: 0.08, lean: 0.2 },
      { t: 0.88, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
    ],
  },
  heavy: {
    id: 'heavy', duration: 1.2, cost: 32, damage: 74, poise: 46,
    activeStart: 0.54, activeEnd: 0.68, comboAt: 9, cancelAt: 0.98,
    lunge: { start: 0.46, end: 0.68, distance: 1.1 }, trackUntil: 0.4, hitstop: 0.12, swingSound: 0.5,
    keys: [
      { t: 0.0, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
      { t: 0.2, hand: [-0.42, 1.55, 0.05], dir: [-0.3, 1.0, -0.1], twist: -0.55, lean: -0.1 },
      { t: 0.42, hand: [-0.5, 1.78, -0.05], dir: [-0.4, 1.0, -0.3], twist: -0.75, lean: -0.22 },
      { t: 0.52, hand: [-0.36, 1.62, 0.3], dir: [-0.1, 0.7, 0.8], twist: -0.3, lean: 0.1 },
      { t: 0.6, hand: [-0.02, 1.15, 0.7], dir: [0.3, -0.2, 1.0], twist: 0.35, lean: 0.4 },
      { t: 0.69, hand: [0.12, 0.8, 0.74], dir: [0.4, -0.7, 0.8], twist: 0.6, lean: 0.46 },
      { t: 0.9, hand: [0.08, 0.85, 0.62], dir: [0.3, -0.5, 1.0], twist: 0.4, lean: 0.36 },
      { t: 1.2, hand: [-0.27, 1.02, 0.4], dir: [0.05, 0.25, 1], twist: 0, lean: 0 },
    ],
  },
};

export const LIGHT_CHAIN: PlayerAttackId[] = ['light1', 'light2', 'light3'];

// ─────────────────────────────────────────────────────────────────────────────
// 사자 공격

export type LionAttackId = 'swipe' | 'bite' | 'pounce' | 'charge' | 'rear' | 'swipeBite' | 'pounceSwat';
export type LionHitKind = 'paw' | 'bite' | 'body';

export interface LionVolumeKey { t: number; p: [number, number, number] }

export interface LionAttackDef {
  id: LionAttackId;
  kind: LionHitKind;
  /** 총 길이(초) */
  duration: number;
  /** 준비 동작 종료(= 유효 시작 직전) */
  windup: number;
  activeStart: number;
  activeEnd: number;
  /** 이 시간까지만 제한적으로 플레이어를 향해 회전 */
  trackUntil: number;
  trackRate: number;
  damage: number;
  /** 방패로 막을 때 스태미나 */
  blockCost: number;
  poiseHit: boolean;
  /** 경직(플레이어 피격) 종류 */
  heavyHit: boolean;
  range: [number, number];
  bearingMax: number;
  cooldown: number;
  radius: number;
  /** 앞발/머리 위치 경로 (사자 로컬). body 는 사용 안 함 */
  path?: LionVolumeKey[];
  /** 반격 가능 구간 (표시/AI 튜닝 용) */
  counterWindow: [number, number];
}

export const LION_ATTACKS: Record<LionAttackId, LionAttackDef> = {
  swipe: {
    id: 'swipe', kind: 'paw', duration: 1.55, windup: 0.78, activeStart: 0.78, activeEnd: 0.96,
    trackUntil: 0.5, trackRate: 2.2, damage: 20, blockCost: 26, poiseHit: true, heavyHit: false,
    range: [1.1, 3.1], bearingMax: 1.0, cooldown: 3.0, radius: 0.3,
    // 사자의 오른발 기준 경로 (왼발은 x 반전)
    path: [
      { t: 0.0, p: [-0.22, 0.2, 0.55] },
      { t: 0.32, p: [-0.26, 0.9, 0.8] },
      { t: 0.7, p: [-0.3, 1.38, 0.9] },
      { t: 0.78, p: [-0.28, 1.4, 0.95] },
      { t: 0.87, p: [-0.05, 1.0, 1.45] },
      { t: 0.96, p: [0.28, 0.6, 1.35] },
      { t: 1.15, p: [0.1, 0.35, 1.0] },
      { t: 1.55, p: [-0.2, 0.2, 0.55] },
    ],
    counterWindow: [1.0, 1.5],
  },
  bite: {
    id: 'bite', kind: 'bite', duration: 1.5, windup: 0.62, activeStart: 0.62, activeEnd: 0.8,
    trackUntil: 0.38, trackRate: 2.0, damage: 28, blockCost: 30, poiseHit: true, heavyHit: false,
    range: [1.0, 2.8], bearingMax: 0.7, cooldown: 3.6, radius: 0.32,
    path: [
      { t: 0.0, p: [0, 1.15, 1.35] },
      { t: 0.3, p: [0, 0.95, 0.95] },
      { t: 0.55, p: [0, 0.9, 0.78] },
      { t: 0.62, p: [0, 0.95, 0.85] },
      { t: 0.7, p: [0, 1.0, 1.7] },
      { t: 0.8, p: [0, 0.95, 1.8] },
      { t: 1.0, p: [0, 1.05, 1.4] },
      { t: 1.5, p: [0, 1.2, 1.35] },
    ],
    counterWindow: [0.85, 1.4],
  },
  pounce: {
    id: 'pounce', kind: 'body', duration: 2.6, windup: 0.95, activeStart: 1.18, activeEnd: 1.72,
    trackUntil: 0.7, trackRate: 2.4, damage: 36, blockCost: 48, poiseHit: true, heavyHit: true,
    range: [3.2, 8.5], bearingMax: 0.6, cooldown: 5.5, radius: 0.55, counterWindow: [1.8, 2.5],
  },
  charge: {
    id: 'charge', kind: 'body', duration: 4.0, windup: 1.15, activeStart: 1.35, activeEnd: 3.3,
    trackUntil: 0.9, trackRate: 2.2, damage: 34, blockCost: 55, poiseHit: true, heavyHit: true,
    range: [7.0, 18], bearingMax: 0.5, cooldown: 7.0, radius: 0.55, counterWindow: [3.0, 4.0],
  },
  rear: {
    id: 'rear', kind: 'paw', duration: 1.7, windup: 0.85, activeStart: 0.85, activeEnd: 1.02,
    trackUntil: 0.25, trackRate: 1.0, damage: 18, blockCost: 24, poiseHit: true, heavyHit: false,
    range: [0.8, 3.2], bearingMax: Math.PI, cooldown: 4.5, radius: 0.32,
    path: [
      { t: 0.0, p: [-0.22, 0.2, 0.55] },
      { t: 0.5, p: [-0.3, 1.1, 0.7] },
      { t: 0.85, p: [-0.3, 1.2, 0.9] },
      { t: 0.93, p: [0.1, 0.95, 1.4] },
      { t: 1.02, p: [0.35, 0.6, 1.25] },
      { t: 1.3, p: [0.1, 0.3, 0.9] },
      { t: 1.7, p: [-0.22, 0.2, 0.55] },
    ],
    counterWindow: [1.1, 1.65],
  },
  // 2페이즈 연계
  swipeBite: {
    id: 'swipeBite', kind: 'bite', duration: 1.0, windup: 0.42, activeStart: 0.42, activeEnd: 0.58,
    trackUntil: 0.1, trackRate: 1.4, damage: 30, blockCost: 32, poiseHit: true, heavyHit: false,
    range: [0.8, 3.0], bearingMax: 0.8, cooldown: 0, radius: 0.34,
    path: [
      { t: 0.0, p: [0, 1.1, 1.3] },
      { t: 0.2, p: [0, 0.95, 0.95] },
      { t: 0.4, p: [0, 0.9, 0.85] },
      { t: 0.46, p: [0, 0.95, 1.4] },
      { t: 0.54, p: [0, 0.95, 1.85] },
      { t: 0.7, p: [0, 1.05, 1.5] },
      { t: 1.0, p: [0, 1.2, 1.35] },
    ],
    counterWindow: [0.7, 1.0],
  },
  pounceSwat: {
    id: 'pounceSwat', kind: 'paw', duration: 1.0, windup: 0.4, activeStart: 0.4, activeEnd: 0.54,
    trackUntil: 0.12, trackRate: 1.6, damage: 22, blockCost: 28, poiseHit: true, heavyHit: false,
    range: [0.5, 3.0], bearingMax: 1.2, cooldown: 0, radius: 0.32,
    path: [
      { t: 0.0, p: [0.22, 0.2, 0.55] },
      { t: 0.2, p: [0.3, 1.0, 0.8] },
      { t: 0.4, p: [0.3, 1.1, 0.9] },
      { t: 0.46, p: [0.0, 0.75, 1.5] },
      { t: 0.54, p: [-0.3, 0.45, 1.3] },
      { t: 0.75, p: [-0.1, 0.3, 0.9] },
      { t: 1.0, p: [0.22, 0.2, 0.55] },
    ],
    counterWindow: [0.6, 1.0],
  },
};

/** 키 보간 (Catmull-Rom). 시간 t 에서 값. */
export function sampleKeys<T extends { t: number }>(keys: T[], t: number, get: (k: T) => number[]): number[] {
  if (t <= keys[0].t) return get(keys[0]).slice();
  const last = keys[keys.length - 1];
  if (t >= last.t) return get(last).slice();
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = (t - k1.t) / (k2.t - k1.t);
  const p0 = get(k0), p1 = get(k1), p2 = get(k2), p3 = get(k3);
  const u2 = u * u, u3 = u2 * u;
  return p1.map((_, c) => {
    // 비균일 간격 보정된 Catmull-Rom (접선 스케일)
    const m1 = (p2[c] - p0[c]) * 0.5 * ((k2.t - k1.t) / Math.max(1e-6, (k2.t - k0.t) * 0.5 + 1e-6)) * 0.5 * 2;
    const m2 = (p3[c] - p1[c]) * 0.5 * ((k2.t - k1.t) / Math.max(1e-6, (k3.t - k1.t) * 0.5 + 1e-6)) * 0.5 * 2;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return h00 * p1[c] + h10 * m1 + h01 * p2[c] + h11 * m2;
  });
}

export function sampleSword(def: PlayerAttackDef, t: number): { hand: V3; dir: V3; twist: number; lean: number } {
  const r = sampleKeys(def.keys, t, (k) => [...k.hand, ...k.dir, k.twist, k.lean]);
  const dl = Math.hypot(r[3], r[4], r[5]) || 1;
  return { hand: { x: r[0], y: r[1], z: r[2] }, dir: { x: r[3] / dl, y: r[4] / dl, z: r[5] / dl }, twist: r[6], lean: r[7] };
}

export function sampleLionPath(def: LionAttackDef, t: number, mirror: boolean): V3 {
  const r = sampleKeys(def.path!, t, (k) => k.p);
  return { x: mirror ? -r[0] : r[0], y: r[1], z: r[2] };
}

/** 아이들(가드 자세) 검 자세 */
export const SWORD_IDLE: { hand: V3; dir: V3 } = { hand: { x: -0.27, y: 1.02, z: 0.4 }, dir: { x: 0.05, y: 0.25, z: 1 } };
