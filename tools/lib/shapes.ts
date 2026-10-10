import type { V3 } from './sdf';

export interface RawMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  colors?: number[];
}

export function newMesh(): RawMesh {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function mergeInto(dst: RawMesh, src: RawMesh) {
  const base = dst.positions.length / 3;
  dst.positions.push(...src.positions);
  dst.normals.push(...src.normals);
  dst.uvs.push(...src.uvs);
  for (const i of src.indices) dst.indices.push(i + base);
  if (src.colors) {
    dst.colors = dst.colors ?? [];
    dst.colors.push(...src.colors);
  }
}

export function toArrays(m: RawMesh) {
  return {
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    uvs: new Float32Array(m.uvs),
    indices: new Uint32Array(m.indices),
    colors: m.colors ? new Float32Array(m.colors) : undefined,
  };
}

export const v3 = {
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

/** 임의 축 기준 직교 기저 */
export function basisFromAxis(axis: V3): [V3, V3, V3] {
  const a = v3.norm(axis);
  const ref: V3 = Math.abs(a[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = v3.norm(v3.cross(ref, a));
  const w = v3.cross(a, u);
  return [u, w, a];
}

/** 회전체(lathe) — 축 방향 pts: [높이, 반지름][] */
export function lathe(base: V3, axis: V3, pts: [number, number][], segs = 20, mat?: (t: number) => number): RawMesh {
  const m = newMesh();
  const [u, w, a] = basisFromAxis(axis);
  for (let i = 0; i < pts.length; i++) {
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const r = pts[i][1];
      const p: V3 = [
        base[0] + a[0] * pts[i][0] + (u[0] * c + w[0] * sn) * r,
        base[1] + a[1] * pts[i][0] + (u[1] * c + w[1] * sn) * r,
        base[2] + a[2] * pts[i][0] + (u[2] * c + w[2] * sn) * r,
      ];
      m.positions.push(...p);
      // 노말: 프로파일 기울기
      const i0 = Math.max(0, i - 1), i1 = Math.min(pts.length - 1, i + 1);
      const dh = pts[i1][0] - pts[i0][0];
      const dr = pts[i1][1] - pts[i0][1];
      const rad: V3 = [u[0] * c + w[0] * sn, u[1] * c + w[1] * sn, u[2] * c + w[2] * sn];
      const nn = v3.norm(v3.add(v3.mul(rad, dh), v3.mul(a, -dr)));
      m.normals.push(...nn);
      m.uvs.push(s / segs, i / (pts.length - 1));
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const a0 = i * (segs + 1) + s, b0 = a0 + 1, c0 = a0 + segs + 1, d0 = c0 + 1;
      m.indices.push(a0, c0, b0, b0, c0, d0);
    }
  }
  void mat;
  return m;
}

export function cone(base: V3, tip: V3, r: number, segs = 8, bend?: V3): RawMesh {
  const axis = v3.sub(tip, base);
  const h = v3.len(axis);
  const [u, w, a] = basisFromAxis(axis);
  const m = newMesh();
  const rings = 4;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rr = r * (1 - t) * (1 - 0.15 * t);
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      let p: V3 = [
        base[0] + a[0] * h * t + (u[0] * c + w[0] * sn) * rr,
        base[1] + a[1] * h * t + (u[1] * c + w[1] * sn) * rr,
        base[2] + a[2] * h * t + (u[2] * c + w[2] * sn) * rr,
      ];
      if (bend) p = v3.add(p, v3.mul(bend, t * t));
      m.positions.push(...p);
      const rad: V3 = [u[0] * c + w[0] * sn, u[1] * c + w[1] * sn, u[2] * c + w[2] * sn];
      m.normals.push(...v3.norm(v3.add(rad, v3.mul(a, (r / h) * 0.8))));
      m.uvs.push(s / segs, t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a0 = i * (segs + 1) + s, b0 = a0 + 1, c0 = a0 + segs + 1, d0 = c0 + 1;
      m.indices.push(a0, c0, b0, b0, c0, d0);
    }
  }
  return m;
}

export function uvSphere(c: V3, r: V3, nu = 20, nv = 14, frontUV = false): RawMesh {
  const m = newMesh();
  for (let j = 0; j <= nv; j++) {
    const th = (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const ph = (i / nu) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      m.positions.push(c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]);
      const nn = v3.norm([x / r[0], y / r[1], z / r[2]]);
      m.normals.push(...nn);
      if (frontUV) {
        // 정면(+Z) 에서 본 평면 투영 UV
        m.uvs.push(0.5 + x * 0.5, 0.5 + y * 0.5);
      } else m.uvs.push(i / nu, j / nv);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1;
      m.indices.push(a, b, c2, b, d, c2);
    }
  }
  return m;
}

/** 곡선 리본 (갈기/천 가닥). pts: 중심선, width: 각 점에서 폭, side: 리본 폭 방향 기준 */
export function ribbon(pts: V3[], widths: number[], outward: V3, uvU0 = 0, uvU1 = 1): RawMesh {
  const m = newMesh();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const tan = v3.norm(v3.sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let side = v3.cross(tan, outward);
    if (v3.len(side) < 1e-4) side = v3.cross(tan, [0, 1, 0]);
    side = v3.norm(side);
    const nrm = v3.norm(v3.cross(side, tan));
    const w = widths[i] * 0.5;
    const l = v3.add(pts[i], v3.mul(side, -w));
    const r = v3.add(pts[i], v3.mul(side, w));
    m.positions.push(...l, ...r);
    m.normals.push(...nrm, ...nrm);
    m.uvs.push(uvU0, t, uvU1, t);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    m.indices.push(a, b, c, b, d, c);
  }
  return m;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const srgb = (hex: number): V3 => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};
