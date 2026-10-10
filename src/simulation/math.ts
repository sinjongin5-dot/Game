/** 시뮬레이션용 경량 벡터/각도 도구. 규약: yaw=0 은 +Z, 양의 yaw 는 +X 쪽(캐릭터의 왼쪽)으로 회전. */
export interface V2 { x: number; z: number }
export interface V3 { x: number; y: number; z: number }

export const v2 = (x = 0, z = 0): V2 => ({ x, z });
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const len2 = (a: V2) => Math.hypot(a.x, a.z);
export const sub2 = (a: V2, b: V2): V2 => ({ x: a.x - b.x, z: a.z - b.z });
export const add2 = (a: V2, b: V2): V2 => ({ x: a.x + b.x, z: a.z + b.z });
export const scale2 = (a: V2, s: number): V2 => ({ x: a.x * s, z: a.z * s });
export const dot2 = (a: V2, b: V2) => a.x * b.x + a.z * b.z;
export const dist2 = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export function norm2(a: V2): V2 {
  const l = Math.hypot(a.x, a.z);
  return l < 1e-9 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
}
export const forward = (yaw: number): V2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const leftOf = (yaw: number): V2 => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
export const yawOf = (d: V2) => Math.atan2(d.x, d.z);

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
export const angleDiff = (to: number, from: number) => wrapAngle(to - from);
export function approachAngle(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(cur + Math.sign(d) * maxStep);
}
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function approach(cur: number, target: number, maxStep: number): number {
  if (cur < target) return Math.min(target, cur + maxStep);
  return Math.max(target, cur - maxStep);
}

/** 로컬(x=왼쪽 +, z=앞쪽 +) → 월드(x,z) */
export function localToWorld2(origin: V2, yaw: number, lx: number, lz: number): V2 {
  const f = forward(yaw), l = leftOf(yaw);
  return { x: origin.x + l.x * lx + f.x * lz, z: origin.z + l.z * lx + f.z * lz };
}
export function worldToLocal2(origin: V2, yaw: number, p: V2): { x: number; z: number } {
  const f = forward(yaw), l = leftOf(yaw);
  const dx = p.x - origin.x, dz = p.z - origin.z;
  return { x: dx * l.x + dz * l.z, z: dx * f.x + dz * f.z };
}
export function localToWorld3(origin: V2, baseY: number, yaw: number, p: V3): V3 {
  const w = localToWorld2(origin, yaw, p.x, p.z);
  return { x: w.x, y: baseY + p.y, z: w.z };
}

/** 선분(a,b) 과 점 p 사이의 최단 거리의 제곱, 파라미터 t 반환 */
export function segPointDist(a: V3, b: V3, p: V3): { d2: number; t: number } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 < 1e-12 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2;
  t = clamp(t, 0, 1);
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return { d2: dx * dx + dy * dy + dz * dz, t };
}

/** 선분 vs 선분 최단 거리 제곱 (Ericson) */
export function segSegDist2(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;
  let s: number, t: number;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) { s = t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  return (c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2 + (c1.z - c2.z) ** 2;
}

/** 결정론적 난수 (시뮬레이션 재현용) */
export class Rng {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  reseed(seed: number) { this.s = seed >>> 0 || 1; }
}
