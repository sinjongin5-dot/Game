import type { V2 } from './math';

/** 콜로세움 결투장 기하. 렌더와 물리가 같은 정의를 쓴다. */
export const ARENA = {
  a: 15, // x 반경
  b: 12, // z 반경
  wallHeight: 4.2,
  gateHalfWidth: 1.9,
  /** 플레이어 입장 문 (남쪽, -z) / 사자 문 (북쪽, +z) */
  playerGate: { x: 0, z: -12 },
  lionGate: { x: 0, z: 12 },
  pillars: [
    { x: -7.2, z: 3.6, r: 0.85, h: 1.4 },
    { x: 7.6, z: -4.4, r: 0.85, h: 1.1 },
    { x: -9.5, z: -5.8, r: 0.6, h: 0.7 },
  ],
  playerStart: { x: 0, z: -8.2 },
  lionStart: { x: 0, z: 5.8 },
} as const;

export function insideEllipse(p: V2, margin = 0): boolean {
  const a = ARENA.a - margin, b = ARENA.b - margin;
  return (p.x * p.x) / (a * a) + (p.z * p.z) / (b * b) <= 1;
}

/** 타원 내부로 클램프 (근사: 반경 방향 스케일) */
export function clampToEllipse(p: V2, margin: number): V2 {
  const a = ARENA.a - margin, b = ARENA.b - margin;
  const q = (p.x * p.x) / (a * a) + (p.z * p.z) / (b * b);
  if (q <= 1) return { x: p.x, z: p.z };
  const s = 1 / Math.sqrt(q);
  return { x: p.x * s, z: p.z * s };
}

/** 타원 위 각도 → 점 */
export function ellipsePoint(theta: number, off = 0): V2 {
  return { x: (ARENA.a + off) * Math.cos(theta), z: (ARENA.b + off) * Math.sin(theta) };
}

/** 점에서 가장 가까운 벽까지의 대략적 거리 (안쪽 양수) */
export function wallDistance(p: V2): number {
  const q = Math.sqrt((p.x * p.x) / (ARENA.a * ARENA.a) + (p.z * p.z) / (ARENA.b * ARENA.b));
  // 방향 벡터 상의 타원 반경
  const r = Math.hypot(p.x, p.z);
  if (r < 1e-6) return Math.min(ARENA.a, ARENA.b);
  const ex = p.x / r, ez = p.z / r;
  const rad = 1 / Math.sqrt((ex * ex) / (ARENA.a * ARENA.a) + (ez * ez) / (ARENA.b * ARENA.b));
  void q;
  return rad - r;
}
