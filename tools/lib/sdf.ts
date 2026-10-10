/** 부호 있는 거리장(SDF) 기반 모델링 도구. 음수 = 내부. 단위: 미터. */
export type V3 = [number, number, number];
export type SD = (x: number, y: number, z: number) => number;

export interface Prim {
  sd: SD;
  /** 본 가중치: tfn(0..1) 으로 boneA→boneB 보간. tfn 이 없으면 boneA 100%. */
  boneA: number;
  boneB?: number;
  tfn?: SD;
  /** 체인 스키닝: bones[i]..bones[i+1] 사이를 chainT(0..n-1) 로 보간 */
  chain?: number[];
  chainT?: SD;
  color: V3;
  /** 털 길이 배수 (정점 색상 알파로 출력). 기본 1 */
  fur?: number;
  /** 블렌딩 날카로움 배수. 클수록 이웃과 덜 섞인다. */
  sharp?: number;
  /** 대략적 경계 (컬링용) [minx,miny,minz,maxx,maxy,maxz] */
  bb?: [number, number, number, number, number, number];
}

const sqrt = Math.sqrt;

export function sphere(c: V3, r: number): SD {
  return (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    return sqrt(dx * dx + dy * dy + dz * dz) - r;
  };
}

/** 근사 타원체 (iq). rot: 선택적 3x3 (로컬→월드 회전의 전치 = 월드→로컬). */
export function ellipsoid(c: V3, r: V3, yawPitchRoll?: V3): SD {
  const m = yawPitchRoll ? rotMatrix(yawPitchRoll) : null;
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (m) {
      const qx = m[0] * px + m[1] * py + m[2] * pz;
      const qy = m[3] * px + m[4] * py + m[5] * pz;
      const qz = m[6] * px + m[7] * py + m[8] * pz;
      px = qx; py = qy; pz = qz;
    }
    const k0 = sqrt((px / r[0]) ** 2 + (py / r[1]) ** 2 + (pz / r[2]) ** 2);
    const k1 = sqrt((px / (r[0] * r[0])) ** 2 + (py / (r[1] * r[1])) ** 2 + (pz / (r[2] * r[2])) ** 2);
    if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
    return (k0 * (k0 - 1)) / k1;
  };
}

/** 월드→로컬 회전 행렬 (yaw=Y축, pitch=X축, roll=Z축; 적용 순서 Y*X*Z 의 전치). */
function rotMatrix(ypr: V3): number[] {
  const [yaw, pitch, roll] = ypr;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry * Rx * Rz  (로컬→월드)
  const rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]) => {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    return o;
  };
  const R = mul(ry, mul(rx, rz));
  // 전치 → 월드→로컬
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}

/** 둥근 원뿔(테이퍼드 캡슐). */
export function capsule(a: V3, b: V3, r1: number, r2: number = r1): SD {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** 축 정렬 후 비등방 스케일을 적용 (중심 c 기준). */
export function scaled(sd: SD, c: V3, s: V3): SD {
  const m = Math.min(s[0], s[1], s[2]);
  return (x, y, z) => sd(c[0] + (x - c[0]) / s[0], c[1] + (y - c[1]) / s[1], c[2] + (z - c[2]) / s[2]) * m;
}

export function roundBox(c: V3, h: V3, r: number, ypr?: V3): SD {
  const m = ypr ? rotMatrix(ypr) : null;
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (m) {
      const qx = m[0] * px + m[1] * py + m[2] * pz;
      const qy = m[3] * px + m[4] * py + m[5] * pz;
      const qz = m[6] * px + m[7] * py + m[8] * pz;
      px = qx; py = qy; pz = qz;
    }
    const dx = Math.abs(px) - h[0] + r, dy = Math.abs(py) - h[1] + r, dz = Math.abs(pz) - h[2] + r;
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0);
    return sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(dx, dy, dz), 0) - r;
  };
}

/** 토러스 (axis 방향 고리). */
export function ring(c: V3, axis: V3, R: number, r: number): SD {
  const l = Math.hypot(...axis);
  const ax = axis[0] / l, ay = axis[1] / l, az = axis[2] / l;
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const h = px * ax + py * ay + pz * az;
    const rx = px - ax * h, ry = py - ay * h, rz = pz - az * h;
    const rad = sqrt(rx * rx + ry * ry + rz * rz);
    return sqrt((rad - R) ** 2 + h * h) - r;
  };
}

/** 평면 반공간: 법선 n 방향이 바깥(양수). */
export function plane(p: V3, n: V3): SD {
  const l = Math.hypot(...n);
  const nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
  return (x, y, z) => (x - p[0]) * nx + (y - p[1]) * ny + (z - p[2]) * nz;
}

export const inter = (...f: SD[]): SD => (x, y, z) => {
  let m = -Infinity;
  for (const g of f) m = Math.max(m, g(x, y, z));
  return m;
};
export const uni = (...f: SD[]): SD => (x, y, z) => {
  let m = Infinity;
  for (const g of f) m = Math.min(m, g(x, y, z));
  return m;
};
export const sub = (a: SD, b: SD): SD => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
export const offset = (a: SD, d: number): SD => (x, y, z) => a(x, y, z) - d;

/** 좌우 대칭 */
export const mirrorX = (a: SD): SD => (x, y, z) => a(Math.abs(x), y, z);

export interface Carve {
  sd: SD;
  /** 카빙된 안쪽 표면에 칠할 색 */
  color?: V3;
  /** 값이 클수록 부드러운 모서리 */
  soft?: number;
}

export interface FieldResult {
  d: number;
  /** 본 가중치 (정규화되지 않음) 누적용 */
}

export interface PartSpec {
  name: string;
  material: string;
  prims: Prim[];
  carves?: Carve[];
  /** 블렌딩 온도 (미터). 클수록 부드럽게 합쳐진다. */
  T: number;
  /** 최종 교집합 클립 (양수 = 제거) */
  clip?: SD;
}

export interface Field {
  sd: SD;
  /** 위치에서 본 가중치/색 평가 */
  attrs(x: number, y: number, z: number, nBones: number, outW: Float32Array, outColor: Float32Array): void; // outColor: rgba
}

export function makeField(spec: PartSpec): Field {
  const prims = spec.prims;
  const n = prims.length;
  const T = spec.T;
  const d = new Float64Array(n);
  const carves = spec.carves ?? [];

  const sd: SD = (x, y, z) => {
    let dmin = Infinity;
    for (let i = 0; i < n; i++) {
      const p = prims[i];
      const bb = p.bb;
      let di: number;
      if (bb && (x < bb[0] || x > bb[3] || y < bb[1] || y > bb[4] || z < bb[2] || z > bb[5])) {
        // 경계 밖: 경계까지 거리를 하한으로 사용 (정확하지 않지만 단조)
        const ex = Math.max(bb[0] - x, 0, x - bb[3]);
        const ey = Math.max(bb[1] - y, 0, y - bb[4]);
        const ez = Math.max(bb[2] - z, 0, z - bb[5]);
        const lb = sqrt(ex * ex + ey * ey + ez * ez);
        if (lb > 6 * T / (p.sharp ?? 1) + 0.05) {
          d[i] = Infinity;
          continue;
        }
      }
      di = p.sd(x, y, z);
      d[i] = di;
      if (di < dmin) dmin = di;
    }
    // soft union
    let s = 0;
    for (let i = 0; i < n; i++) {
      const di = d[i];
      if (di === Infinity) continue;
      const k = prims[i].sharp ?? 1;
      const e = (di - dmin) * k / T;
      if (e < 12) s += Math.exp(-e);
    }
    let f = dmin - T * Math.log(Math.max(s, 1e-12));
    // 날카로운 프림이 부드럽게 팽창하는 문제를 줄이기 위해 dmin 쪽으로 약간 끌어당긴다 (T 가 작을수록 영향 적음)
    for (const c of carves) {
      const cd = c.sd(x, y, z);
      f = Math.max(f, -cd);
    }
    if (spec.clip) f = Math.max(f, spec.clip(x, y, z));
    return f;
  };

  const attrs = (x: number, y: number, z: number, nBones: number, outW: Float32Array, outColor: Float32Array) => {
    outW.fill(0);
    let dmin = Infinity;
    for (let i = 0; i < n; i++) {
      const di = prims[i].sd(x, y, z);
      d[i] = di;
      if (di < dmin) dmin = di;
    }
    let tot = 0;
    let cr = 0, cg = 0, cb = 0, cf = 0;
    for (let i = 0; i < n; i++) {
      const p = prims[i];
      const k = p.sharp ?? 1;
      const e = (d[i] - dmin) * k / T;
      if (e > 8) continue;
      const w = Math.exp(-e);
      tot += w;
      cr += p.color[0] * w; cg += p.color[1] * w; cb += p.color[2] * w; cf += (p.fur ?? 1) * w;
      if (p.chain && p.chainT) {
        const n1 = p.chain.length - 1;
        const t = Math.min(n1, Math.max(0, p.chainT(x, y, z)));
        const i0 = Math.min(n1 - 1, Math.floor(t));
        const f = t - i0;
        outW[p.chain[i0]] += w * (1 - f);
        outW[p.chain[i0 + 1]] += w * f;
      } else if (p.boneB !== undefined && p.tfn) {
        const t = Math.min(1, Math.max(0, p.tfn(x, y, z)));
        outW[p.boneA] += w * (1 - t);
        outW[p.boneB] += w * t;
      } else {
        outW[p.boneA] += w;
      }
    }
    for (let i = 0; i < nBones; i++) outW[i] /= tot;
    // 카빙 면 색
    let cc: V3 | null = null;
    let cbest = 0.012;
    for (const c of carves) {
      if (!c.color) continue;
      const cd = Math.abs(c.sd(x, y, z));
      if (cd < cbest) { cbest = cd; cc = c.color; }
    }
    if (cc) {
      const a = 1 - cbest / 0.012;
      outColor[0] = (cr / tot) * (1 - a) + cc[0] * a;
      outColor[1] = (cg / tot) * (1 - a) + cc[1] * a;
      outColor[2] = (cb / tot) * (1 - a) + cc[2] * a;
    } else {
      outColor[0] = cr / tot; outColor[1] = cg / tot; outColor[2] = cb / tot;
    }
    outColor[3] = cf / tot;
  };

  return { sd, attrs };
}

/** 선분 파라미터 t (0..1) 함수 */
export function segT(a: V3, b: V3): SD {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  return (x, y, z) => ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2;
}

export function bbOfCapsule(a: V3, b: V3, r: number): [number, number, number, number, number, number] {
  return [
    Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r,
    Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r,
  ];
}

/** 폴리라인 + 반지름 (하드 유니온, 마디 없는 매끈한 관). 파라미터 t = 구간 인덱스 + 구간 내 보간 */
export function polyTube(pts: V3[], radii: number[]): { sd: SD; t: SD; bb: [number, number, number, number, number, number] } {
  const segs = pts.length - 1;
  const caps: SD[] = [];
  for (let i = 0; i < segs; i++) caps.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  const sd: SD = (x, y, z) => {
    let m = Infinity;
    for (let i = 0; i < segs; i++) m = Math.min(m, caps[i](x, y, z));
    return m;
  };
  const t: SD = (x, y, z) => {
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[i + 1];
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const l2 = bx * bx + by * by + bz * bz;
      let u = ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2;
      u = Math.min(1, Math.max(0, u));
      const dx = x - (a[0] + bx * u), dy = y - (a[1] + by * u), dz = z - (a[2] + bz * u);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bi = i; bt = u; }
    }
    return bi + bt;
  };
  let mn: V3 = [Infinity, Infinity, Infinity], mxx: V3 = [-Infinity, -Infinity, -Infinity];
  const rm = Math.max(...radii) + 0.03;
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k] - rm); mxx[k] = Math.max(mxx[k], p[k] + rm); }
  return { sd, t, bb: [mn[0], mn[1], mn[2], mxx[0], mxx[1], mxx[2]] };
}
