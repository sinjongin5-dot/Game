/**
 * 검투사 모델 생성기. 피부 + 방어구(청동 투구, 정강이받이, 어깨 보호대, 가죽, 천) + 글라디우스 + 스쿠툼 방패 → GLB
 * 실행: npx tsx tools/gen-gladiator.ts
 */
import { HUMAN_BONES, HUMAN_BONE_INDEX as B } from '../src/rig/humanRig';
import {
  type Prim, type V3, type SD, type PartSpec,
  capsule, ellipsoid, sphere, scaled, segT, makeField, bbOfCapsule, roundBox, ring, plane, inter,
} from './lib/sdf';
import { surfaceNets } from './lib/surfacenets';
import { packWeights, writeGlb, type PartOut, type MatSpec } from './lib/glb';
import { cone, lathe, srgb, newMesh, mergeInto, toArrays, v3, mulberry32, type RawMesh } from './lib/shapes';

const NB = HUMAN_BONES.length;
const bone = (n: string) => B[n];

const C = {
  skin: srgb(0xa87650),
  skinDark: srgb(0x93664a),
  leather: srgb(0x4a2d1a),
  leatherLight: srgb(0x6b4528),
  bronze: srgb(0xb08040),
  iron: srgb(0x5b5d60),
  cloth: srgb(0x7d201a),
  clothDark: srgb(0x4e120f),
  linen: srgb(0xb9a98a),
  dark: srgb(0x050403),
};

function cap(a: V3, b: V3, r1: number, r2: number, bA: number, bB: number | undefined, color: V3, extra: Partial<Prim> = {}): Prim {
  return { sd: capsule(a, b, r1, r2), boneA: bA, boneB: bB, tfn: bB !== undefined ? segT(a, b) : undefined, color, bb: bbOfCapsule(a, b, Math.max(r1, r2) + 0.03), ...extra };
}
function ell(c: V3, r: V3, bn: number, color: V3, extra: Partial<Prim> = {}, ypr?: V3): Prim {
  const m = Math.max(...r) + 0.03;
  return { sd: ellipsoid(c, r, ypr), boneA: bn, color, bb: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m], ...extra };
}
function sph(c: V3, r: number, bn: number, color: V3, extra: Partial<Prim> = {}): Prim {
  return { sd: sphere(c, r), boneA: bn, color, bb: [c[0] - r - 0.03, c[1] - r - 0.03, c[2] - r - 0.03, c[0] + r + 0.03, c[1] + r + 0.03, c[2] + r + 0.03], ...extra };
}
const mx = (v: V3, s: number): V3 => [v[0] * s, v[1], v[2]];
const S_ = (s: number) => (s > 0 ? 'L' : 'R');

function skinPrims(): Prim[] {
  const P: Prim[] = [];
  const sk = C.skin;
  // 몸통
  P.push(ell([0, 0.97, 0], [0.165, 0.115, 0.108], bone('hips'), sk));
  P.push({ ...cap([0, 1.03, 0], [0, 1.27, 0], 0.133, 0.147, bone('hips'), bone('spine2'), sk), sd: scaled(capsule([0, 1.03, 0], [0, 1.27, 0], 0.133, 0.147), [0, 1.15, 0], [1, 1, 0.8]) });
  P.push(ell([0, 1.42, 0.004], [0.192, 0.175, 0.122], bone('chest'), sk));
  P.push(ell([0, 1.17, 0.066], [0.085, 0.105, 0.05], bone('spine1'), sk));
  for (const s of [1, -1]) {
    P.push(ell([s * 0.09, 1.43, 0.083], [0.098, 0.076, 0.05], bone('chest'), sk, { sharp: 1.4 }, [s * 0.15, 0, 0]));
    P.push(ell([s * 0.145, 1.35, -0.05], [0.08, 0.14, 0.07], bone('spine2'), sk));
    P.push(sph([s * 0.2, 1.475, 0.0], 0.074, bone(`upperarm_${S_(s)}`), sk));
    P.push(cap([0, 1.525, -0.02], [s * 0.165, 1.5, 0.0], 0.052, 0.058, bone('chest'), bone(`clavicle_${S_(s)}`), sk));
    // 팔
    P.push(cap(mx([0.19, 1.49, 0], s), mx([0.27, 1.2, -0.01], s), 0.062, 0.052, bone(`upperarm_${S_(s)}`), bone(`forearm_${S_(s)}`), sk));
    P.push(ell(mx([0.228, 1.37, 0.02], s), [0.047, 0.08, 0.052], bone(`upperarm_${S_(s)}`), sk));
    P.push(cap(mx([0.27, 1.2, -0.01], s), mx([0.345, 0.95, 0.04], s), 0.052, 0.037, bone(`forearm_${S_(s)}`), bone(`hand_${S_(s)}`), sk));
    P.push(ell(mx([0.3, 1.1, 0.01], s), [0.04, 0.095, 0.042], bone(`forearm_${S_(s)}`), sk));
    // 주먹
    P.push(ell(mx([0.352, 0.9, 0.06], s), [0.043, 0.052, 0.052], bone(`hand_${S_(s)}`), sk, { sharp: 1.6 }));
    P.push(ell(mx([0.35, 0.872, 0.098], s), [0.038, 0.032, 0.03], bone(`hand_${S_(s)}`), sk, { sharp: 1.6 }));
    // 다리
    P.push(cap(mx([0.095, 0.93, 0], s), mx([0.105, 0.52, 0.015], s), 0.095, 0.064, bone(`thigh_${S_(s)}`), bone(`shin_${S_(s)}`), sk));
    P.push(ell(mx([0.115, 0.76, 0.045], s), [0.082, 0.17, 0.085], bone(`thigh_${S_(s)}`), sk));
    P.push(ell(mx([0.1, 0.74, -0.045], s), [0.072, 0.15, 0.07], bone(`thigh_${S_(s)}`), sk));
    P.push(cap(mx([0.105, 0.52, 0.015], s), mx([0.105, 0.1, -0.015], s), 0.062, 0.04, bone(`shin_${S_(s)}`), bone(`foot_${S_(s)}`), sk));
    P.push(ell(mx([0.105, 0.4, -0.035], s), [0.057, 0.105, 0.062], bone(`shin_${S_(s)}`), sk));
    P.push(cap(mx([0.105, 0.1, -0.015], s), mx([0.105, 0.05, 0.12], s), 0.042, 0.036, bone(`foot_${S_(s)}`), bone(`toe_${S_(s)}`), sk));
  }
  // 목, 머리
  P.push(cap([0, 1.545, 0.01], [0, 1.66, 0.02], 0.062, 0.057, bone('neck'), bone('head'), sk));
  P.push(ell([0, 1.745, 0.03], [0.09, 0.115, 0.105], bone('head'), sk));
  P.push(ell([0, 1.69, 0.06], [0.072, 0.062, 0.078], bone('head'), sk));
  P.push(sph([0, 1.722, 0.125], 0.02, bone('head'), sk));
  return P;
}

// ── 방어구 ──────────────────────────────────────────────────────────────
function helmetPrims(): Prim[] {
  const P: Prim[] = [];
  const b = C.bronze;
  const hb = bone('head');
  P.push(ell([0, 1.778, 0.02], [0.113, 0.122, 0.132], hb, b));
  P.push(ell([0, 1.72, 0.02], [0.135, 0.028, 0.15], hb, b, { sharp: 1.5 })); // 챙
  P.push(ell([0, 1.69, -0.088], [0.118, 0.056, 0.082], hb, b, {}, [0, 0.45, 0])); // 목덜미 보호대
  P.push(ell([0, 1.722, 0.068], [0.1, 0.112, 0.092], hb, b)); // 얼굴판
  for (const s of [1, -1]) P.push(ell([s * 0.088, 1.688, 0.05], [0.034, 0.07, 0.085], hb, b));
  P.push(cap([0, 1.862, 0.105], [0, 1.88, -0.115], 0.016, 0.016, hb, undefined, b, { sharp: 2 }));
  return P;
}

function bronzePrims(): Prim[] {
  const P: Prim[] = [];
  const b = C.bronze;
  const hb = bone('head');
  // (투구는 helmetPrims 로 분리)
  // 정강이받이
  for (const s of [1, -1]) {
    const a: V3 = mx([0.105, 0.5, 0.03], s), c: V3 = mx([0.105, 0.14, 0.0], s);
    const g = capsule(a, c, 0.077, 0.058);
    const clip = plane([0, 0.3, -0.004], [0, 0.22, -1]);
    P.push({ sd: inter(g, clip), boneA: bone(`shin_${S_(s)}`), color: b, bb: bbOfCapsule(a, c, 0.1), sharp: 2 });
    P.push(ell(mx([0.105, 0.52, 0.065], s), [0.062, 0.03, 0.03], bone(`shin_${S_(s)}`), b, { sharp: 2 }));
  }
  // 어깨 보호대(왼쪽)
  P.push(ell([0.215, 1.515, 0.0], [0.11, 0.058, 0.125], bone('upperarm_L'), b, { sharp: 2 }, [0, 0, -0.45]));
  P.push(ell([0.235, 1.455, 0.0], [0.1, 0.03, 0.115], bone('upperarm_L'), b, { sharp: 2 }, [0, 0, -0.5]));
  // 버클/팔레라
  P.push(roundBox([0, 1.02, 0.126], [0.042, 0.036, 0.012], 0.006, undefined) && { sd: roundBox([0, 1.02, 0.126], [0.042, 0.036, 0.012], 0.006), boneA: bone('hips'), color: b, bb: [-0.1, 0.95, 0.08, 0.1, 1.09, 0.17], sharp: 2 });
  P.push({ sd: ellipsoid([0, 1.385, 0.118], [0.05, 0.05, 0.014]), boneA: bone('chest'), color: b, bb: [-0.12, 1.3, 0.08, 0.12, 1.47, 0.16], sharp: 2 });
  return P;
}

function ironPrims(): Prim[] {
  const P: Prim[] = [];
  const a: V3 = [-0.19, 1.49, 0], b: V3 = [-0.27, 1.2, -0.01], c: V3 = [-0.345, 0.95, 0.04];
  // 연속 슬리브 (원통) + 분절 홈 링
  P.push({ sd: capsule(v3.lerp(a, b, 0.22) as V3, b, 0.078, 0.066), boneA: bone('upperarm_R'), color: C.iron, bb: [-0.4, 1.1, -0.15, 0, 1.55, 0.15], sharp: 3 });
  P.push({ sd: capsule(b, v3.lerp(b, c, 0.82) as V3, 0.068, 0.05), boneA: bone('forearm_R'), color: C.iron, bb: [-0.45, 0.9, -0.15, -0.1, 1.3, 0.15], sharp: 3 });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const seg = t < 0.5 ? 0 : 1;
    const tt = seg === 0 ? t / 0.5 : (t - 0.5) / 0.5;
    const p = seg === 0 ? v3.lerp(a, b, 0.26 + tt * 0.7) : v3.lerp(b, c, tt * 0.76 + 0.04);
    const axis = seg === 0 ? v3.sub(b, a) : v3.sub(c, b);
    const R = seg === 0 ? 0.078 - 0.01 * tt : 0.067 - 0.016 * tt;
    P.push({
      sd: ring(p as V3, axis as V3, R + 0.002, 0.0085), boneA: bone(seg === 0 ? 'upperarm_R' : 'forearm_R'), color: v3.mul(C.iron, 1.25),
      bb: [p[0] - R - 0.03, p[1] - R - 0.03, p[2] - R - 0.03, p[0] + R + 0.03, p[1] + R + 0.03, p[2] + R + 0.03], sharp: 4,
    });
  }
  return P;
}

let _skinSd: SD | null = null;
function skinSDF(): SD {
  if (!_skinSd) _skinSd = makeField({ name: 'skin', material: 'skin', prims: skinPrims(), T: 0.02 }).sd;
  return _skinSd;
}

function leatherPrims(): Prim[] {
  const P: Prim[] = [];
  const lc = C.leather;
  // 벨트
  P.push({ sd: scaled(ring([0, 1.02, 0], [0, 1, 0], 0.158, 0.024), [0, 1.02, 0], [1, 1, 0.8]), boneA: bone('hips'), color: lc, bb: [-0.2, 0.97, -0.17, 0.2, 1.07, 0.17] });
  // 가슴 대각 끈 (몸통 표면에 밀착하는 얇은 껍질)
  const torso = skinSDF();
  const strapAlong = (a: V3, b: V3, w: number, th: number): SD => {
    const line = capsule(a, b, w, w);
    return (x, y, z) => Math.max(Math.abs(torso(x, y, z) - 0.012) - (th + 0.004), line(x, y, z) - 0.0) ;
  };
  P.push({ sd: strapAlong([0.16, 1.52, 0.1], [-0.13, 1.16, 0.12], 0.02, 0.007), boneA: bone('chest'), boneB: bone('spine1'), tfn: segT([0.16, 1.52, 0.1], [-0.13, 1.16, 0.12]), color: C.leatherLight, bb: [-0.3, 1.1, -0.2, 0.3, 1.6, 0.25], sharp: 2 });
  P.push({ sd: strapAlong([-0.16, 1.52, 0.1], [0.13, 1.16, 0.12], 0.014, 0.006), boneA: bone('chest'), boneB: bone('spine1'), tfn: segT([-0.16, 1.52, 0.1], [0.13, 1.16, 0.12]), color: lc, bb: [-0.3, 1.1, -0.2, 0.3, 1.6, 0.25], sharp: 2 });
  // 손목/정강이 끈
  for (const s of [1, -1]) {
    const Sx = S_(s);
    P.push({ sd: ring(mx([0.336, 0.975, 0.045], s), [s * 0.075, -0.25, 0.05], 0.044, 0.012), boneA: bone(`hand_${Sx}`), color: lc, bb: [s * 0.3 - 0.1, 0.85, -0.05, s * 0.3 + 0.1, 1.05, 0.15], sharp: 2 });
    // 부츠
    const a: V3 = mx([0.105, 0.42, 0.0], s), c: V3 = mx([0.105, 0.11, -0.012], s);
    P.push(cap(a, c, 0.07, 0.054, bone(`shin_${Sx}`), bone(`foot_${Sx}`), C.leatherLight, { sharp: 2 }));
    P.push({ sd: ring(mx([0.105, 0.43, 0.0], s), [0, 1, 0], 0.067, 0.014), boneA: bone(`shin_${Sx}`), color: lc, bb: [s * 0.105 - 0.12, 0.38, -0.12, s * 0.105 + 0.12, 0.5, 0.12], sharp: 2 });
    P.push(cap(mx([0.105, 0.1, -0.012], s), mx([0.105, 0.055, 0.125], s), 0.052, 0.046, bone(`foot_${Sx}`), bone(`toe_${Sx}`), lc, { sharp: 2 }));
    P.push({ sd: roundBox(mx([0.105, 0.018, 0.045], s), [0.052, 0.014, 0.118], 0.008), boneA: bone(`foot_${Sx}`), boneB: bone(`toe_${Sx}`), tfn: (x, y, z) => (z - 0.0) / 0.16, color: srgb(0x2a1a10), bb: [s * 0.105 - 0.1, -0.03, -0.12, s * 0.105 + 0.1, 0.07, 0.25], sharp: 2 });
    // 샌들 끈 (발등)
    for (const z of [0.02, 0.07]) P.push({ sd: ring(mx([0.105, 0.065, z], s), [0, 0.1, 1], 0.05, 0.007), boneA: bone(`foot_${Sx}`), color: C.leatherLight, bb: [s * 0.105 - 0.1, 0.0, z - 0.08, s * 0.105 + 0.1, 0.13, z + 0.08], sharp: 2 });
  }
  return P;
}

function clothPrims(): Prim[] {
  const P: Prim[] = [];
  const hb = bone('hips');
  const slab = (c: V3, h: V3, ypr: V3, col: V3) => P.push({ sd: roundBox(c, h, 0.004, ypr), boneA: hb, color: col, bb: [c[0] - 0.3, c[1] - 0.3, c[2] - 0.3, c[0] + 0.3, c[1] + 0.3, c[2] + 0.3], sharp: 3 });
  slab([0, 0.86, 0.128], [0.105, 0.155, 0.012], [0, -0.12, 0], C.cloth);
  slab([0, 0.84, 0.15], [0.07, 0.12, 0.008], [0, -0.14, 0], C.clothDark);
  slab([0.152, 0.9, 0.03], [0.012, 0.12, 0.085], [0, 0, 0.1], C.cloth);
  slab([-0.152, 0.9, 0.03], [0.012, 0.12, 0.085], [0, 0, -0.1], C.cloth);
  slab([0, 0.88, -0.128], [0.105, 0.13, 0.012], [0, 0.12, 0], C.cloth);
  // 허리 띠
  P.push({ sd: scaled(ring([0, 1.0, 0], [0, 1, 0], 0.152, 0.02), [0, 1.0, 0], [1, 1, 0.8]), boneA: hb, color: C.clothDark, bb: [-0.2, 0.95, -0.17, 0.2, 1.05, 0.17], sharp: 3 });
  return P;
}

function crestPrims(): Prim[] {
  const hb = bone('head');
  const P: Prim[] = [];
  P.push(ell([0, 1.9, -0.01], [0.02, 0.075, 0.14], hb, C.cloth, { sharp: 3 }));
  P.push(ell([0, 1.9, -0.1], [0.024, 0.06, 0.085], hb, C.clothDark, { sharp: 3 }));
  return P;
}

function helmetCarves() {
  const out: PartSpec['carves'] = [];
  for (const s of [1, -1]) {
    out!.push({ sd: roundBox([s * 0.036, 1.746, 0.148], [0.024, 0.0075, 0.06], 0.003), color: C.dark });
  }
  for (const x of [-0.035, 0, 0.035]) out!.push({ sd: roundBox([x, 1.69, 0.135], [0.0045, 0.026, 0.05], 0.002), color: C.dark });
  out!.push({ sd: roundBox([0, 1.763, 0.15], [0.006, 0.02, 0.06], 0.002), color: C.dark });
  return out;
}

interface Region { bb: [number, number, number, number, number, number]; h: number }

function meshField(spec: PartSpec, regions: Region[]) {
  const field = makeField(spec);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const r of regions) {
    const m = surfaceNets(field.sd, r.bb, r.h);
    const base = pos.length / 3;
    for (const v of m.positions) pos.push(v);
    for (const v of m.normals) nor.push(v);
    for (const i of m.indices) idx.push(i + base);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) };
}

function skinPart(name: string, material: string, spec: PartSpec, mesh: ReturnType<typeof meshField>, extras?: Record<string, unknown>, hardSkin = false): PartOut {
  const field = makeField(spec);
  const n = mesh.positions.length / 3;
  const w = new Float32Array(NB);
  const col = new Float32Array(4);
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    field.attrs(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2], NB, w, col);
    if (hardSkin) {
      // 방어구는 주된 뼈에 거의 고정 (부드러운 변형을 억제해 형태 유지)
      let mi = 0;
      for (let k = 1; k < NB; k++) if (w[k] > w[mi]) mi = k;
      w.fill(0); w[mi] = 1;
    }
    packWeights(w, NB, joints, weights, i);
    colors.set(col, i * 4);
  }
  return { name, material, positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, colors, joints, weights, extras };
}

function rigid(name: string, material: string, boneName: string, m: RawMesh, extras?: Record<string, unknown>): PartOut {
  const a = toArrays(m);
  return { name, material, positions: a.positions, normals: a.normals, indices: a.indices, uvs: a.uvs, rigidBone: boneName, extras };
}

// ── 글라디우스 ────────────────────────────────────────────────────────────
function buildSword(F: V3): { blade: RawMesh; hilt: RawMesh; grip: RawMesh } {
  const blade = newMesh();
  const hilt = newMesh();
  const grip = newMesh();
  // 칼날: z 축을 따라 단면 6각형 링
  const len = 0.56, z0 = F[2] + 0.078;
  const rings = 26;
  const secs = 6;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // 폭: 근처 .028, 중간부 유지, 끝은 잎새형으로 좁아짐
    const wHalf = t < 0.6 ? 0.036 - 0.004 * t : 0.0336 * Math.pow(1 - (t - 0.6) / 0.4, 0.7) + 0.0008;
    const th = (t < 0.9 ? 0.0052 : 0.0052 * (1 - (t - 0.9) / 0.1)) + 0.0004;
    const z = z0 + t * len;
    // 단면 (x, y): 양날 + 홈(fuller)
    const prof: [number, number][] = [
      [0, th], [wHalf * 0.55, th * 0.7], [wHalf, 0], [wHalf * 0.55, -th * 0.7], [0, -th], [-wHalf * 0.55, -th * 0.7], [-wHalf, 0], [-wHalf * 0.55, th * 0.7],
    ];
    const fuller = t > 0.04 && t < 0.72 ? 0.0015 : 0;
    for (let k = 0; k < prof.length; k++) {
      let [px, py] = prof[k];
      if (k === 0) py -= fuller; if (k === 4) py += fuller;
      blade.positions.push(F[0] + px, F[1] + py, z);
      const nn = v3.norm([px * 0.6, Math.sign(py) * 1.0 + py * 40, 0.1 * (t > 0.88 ? 1 : 0)]);
      blade.normals.push(nn[0], nn[1], nn[2]);
      blade.uvs.push(k / prof.length, t);
    }
  }
  const ps = 8;
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < ps; k++) {
      const a = i * ps + k, b = i * ps + (k + 1) % ps, c = a + ps, d = b + ps;
      blade.indices.push(a, c, b, b, c, d);
    }
  }
  // 칼끝 캡
  {
    const base = blade.positions.length / 3;
    blade.positions.push(F[0], F[1], z0 + len + 0.004);
    blade.normals.push(0, 0, 1);
    blade.uvs.push(0.5, 1);
    for (let k = 0; k < ps; k++) blade.indices.push(rings * ps + k, base, rings * ps + (k + 1) % ps);
  }
  // 손잡이 (가죽/나무 홈 새김)
  mergeInto(grip, lathe([F[0], F[1], F[2] - 0.075], [0, 0, 1], [[0, 0.012], [0.01, 0.0135], [0.025, 0.0125], [0.04, 0.0135], [0.055, 0.0125], [0.07, 0.0135], [0.1, 0.0125], [0.15, 0.011], [0.15, 0]], 12));
  // 크로스가드, 포멜
  mergeInto(hilt, lathe([F[0], F[1], F[2] + 0.07], [0, 0, 1], [[0, 0.016], [0.008, 0.02], [0.012, 0.016], [0.012, 0]], 14));
  mergeInto(hilt, lathe([F[0], F[1], F[2] - 0.095], [0, 0, 1], [[0, 0], [0.004, 0.012], [0.014, 0.02], [0.026, 0.021], [0.036, 0.012], [0.04, 0]], 14));
  return { blade, hilt, grip };
}

// ── 스쿠툼 방패 ───────────────────────────────────────────────────────────
function buildShield(F: V3) {
  // 로컬: 법선 +X, 높이 Y, 폭 Z. 핸드 중심(F)에서 +X 로 0.07 앞쪽
  const W = 0.5, H = 0.78, R = 0.5, T = 0.024;
  const face = newMesh(), back = newMesh(), side = newMesh(), boss = newMesh();
  const nu = 36, nv = 54;
  const cx = F[0] + 0.065, cy = F[1] + 0.05, cz = F[2];
  const edge = (z: number, y: number) => Math.min(W / 2 - Math.abs(z), H / 2 - Math.abs(y));
  const surf = (z: number, y: number, front: boolean): V3 => {
    const sag = R - Math.sqrt(R * R - z * z);
    const ridge = 0.01 * Math.exp(-Math.pow(z / 0.02, 2));
    const lip = 0.011 * (1 - Math.min(1, Math.max(0, (edge(z, y) - 0.012) / 0.012))) * (edge(z, y) < 0.034 ? 1 : 0);
    const x = cx - sag + ridge + lip - (front ? 0 : T);
    return [x, cy + y, cz + z];
  };
  const normalAt = (z: number, y: number, front: boolean): V3 => {
    const e = 0.003;
    const a = surf(z + e, y, front), b = surf(z - e, y, front), c = surf(z, y + e, front), d = surf(z, y - e, front);
    let n = v3.norm(v3.cross(v3.sub(a, b), v3.sub(c, d))); // z × y → -x
    n = v3.mul(n, -1); // → +x
    return front ? n : v3.mul(n, -1);
  };
  for (const front of [true, false]) {
    const mesh = front ? face : back;
    for (let j = 0; j <= nv; j++) {
      const y = -H / 2 + (j / nv) * H;
      for (let i = 0; i <= nu; i++) {
        const z = -W / 2 + (i / nu) * W;
        mesh.positions.push(...surf(z, y, front));
        mesh.normals.push(...normalAt(z, y, front));
        mesh.uvs.push(1 - i / nu, 1 - j / nv);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        if (front) mesh.indices.push(a, c, b, b, c, d);
        else mesh.indices.push(a, b, c, b, d, c);
      }
    }
  }
  // 옆면 (테두리 벽)
  const loop: [number, number][] = [];
  const ps = 40;
  for (let i = 0; i < ps; i++) loop.push([-W / 2 + (i / ps) * W, -H / 2]);
  for (let i = 0; i < ps; i++) loop.push([W / 2, -H / 2 + (i / ps) * H]);
  for (let i = 0; i < ps; i++) loop.push([W / 2 - (i / ps) * W, H / 2]);
  for (let i = 0; i < ps; i++) loop.push([-W / 2, H / 2 - (i / ps) * H]);
  for (let k = 0; k < loop.length; k++) {
    const [z, y] = loop[k];
    const a = surf(z, y, true), b = surf(z, y, false);
    const out = v3.norm([0, y === -H / 2 ? -1 : y === H / 2 ? 1 : 0, z === -W / 2 ? -1 : z === W / 2 ? 1 : 0]);
    side.positions.push(...a, ...b);
    side.normals.push(...out, ...out);
    side.uvs.push(0, 0, 0, 0);
  }
  for (let k = 0; k < loop.length; k++) {
    const k2 = (k + 1) % loop.length;
    const a = k * 2, b = a + 1, c = k2 * 2, d = c + 1;
    side.indices.push(a, c, b, b, c, d, a, b, c, b, d, c);
  }
  // 보스
  {
    const bc = surf(0, 0, true);
    mergeInto(boss, lathe([bc[0] - 0.006, bc[1], bc[2]], [1, 0, 0], [[0, 0.092], [0.006, 0.097], [0.015, 0.084], [0.03, 0.052], [0.04, 0.022], [0.044, 0]], 28));
  }
  const handle = lathe([F[0] - 0.035, F[1], F[2] - 0.11], [0, 0, 1], [[0, 0.012], [0.05, 0.016], [0.17, 0.016], [0.22, 0.012]], 10);
  return { face, back, side, boss, handle };
}

function buildFlask(F: V3): RawMesh {
  const m = lathe([F[0], F[1] - 0.02, F[2] + 0.015], [0, 1, 0], [
    [0, 0.0], [0.004, 0.026], [0.02, 0.04], [0.05, 0.045], [0.085, 0.036], [0.105, 0.016], [0.13, 0.012], [0.142, 0.016], [0.146, 0.0],
  ], 20);
  return m;
}

async function main() {
  const t0 = Date.now();
  const parts: PartOut[] = [];
  const skin: PartSpec = { name: 'skin', material: 'skin', prims: skinPrims(), T: 0.02 };
  const skinMesh = meshField(skin, [{ bb: [-0.5, -0.02, -0.2, 0.5, 1.95, 0.24], h: 0.0125 }]);
  parts.push(skinPart('skin', 'skin', skin, skinMesh, { role: 'skin' }));
  console.log('skin', skinMesh.positions.length / 3, 'verts', Date.now() - t0, 'ms');

  const bronze: PartSpec = { name: 'bronze', material: 'bronze', prims: bronzePrims(), T: 0.006 };
  const bronzeMesh = meshField(bronze, [
    { bb: [-0.24, 0.08, -0.08, 0.24, 0.58, 0.12], h: 0.008 },
    { bb: [0.08, 1.4, -0.16, 0.36, 1.6, 0.16], h: 0.008 },
    { bb: [-0.12, 0.96, 0.08, 0.12, 1.1, 0.16], h: 0.005 },
    { bb: [-0.14, 1.32, 0.08, 0.14, 1.45, 0.16], h: 0.005 },
  ]);
  parts.push(skinPart('bronze', 'bronze', bronze, bronzeMesh, { role: 'bronze' }, true));

  const helmet: PartSpec = { name: 'helmet', material: 'bronze', prims: helmetPrims(), carves: helmetCarves(), T: 0.012 };
  const helmetMesh = meshField(helmet, [{ bb: [-0.17, 1.62, -0.19, 0.17, 1.9, 0.21], h: 0.0055 }]);
  parts.push(skinPart('helmet', 'bronze', helmet, helmetMesh, { role: 'bronze' }, true));

  const iron: PartSpec = { name: 'iron', material: 'iron', prims: ironPrims(), T: 0.004 };
  const ironMesh = meshField(iron, [{ bb: [-0.42, 0.9, -0.16, -0.1, 1.55, 0.16], h: 0.0065 }]);
  parts.push(skinPart('iron', 'iron', iron, ironMesh, { role: 'iron' }, true));

  const leather: PartSpec = { name: 'leather', material: 'leather', prims: leatherPrims(), T: 0.008 };
  const leatherMesh = meshField(leather, [
    { bb: [-0.22, 0.95, -0.19, 0.22, 1.1, 0.19], h: 0.008 },
    { bb: [-0.2, 1.15, 0.04, 0.2, 1.55, 0.14], h: 0.007 },
    { bb: [-0.24, -0.04, -0.12, 0.24, 0.5, 0.3], h: 0.008 },
    { bb: [-0.42, 0.85, -0.06, 0.42, 1.06, 0.16], h: 0.008 },
  ]);
  parts.push(skinPart('leather', 'leather', leather, leatherMesh, { role: 'leather' }, true));

  const cloth: PartSpec = { name: 'cloth', material: 'cloth', prims: clothPrims(), T: 0.004 };
  const clothMesh = meshField(cloth, [{ bb: [-0.25, 0.64, -0.2, 0.25, 1.06, 0.2], h: 0.0075 }]);
  parts.push(skinPart('cloth', 'cloth', cloth, clothMesh, { role: 'cloth' }));

  const crest: PartSpec = { name: 'crest', material: 'cloth', prims: crestPrims(), T: 0.004 };
  const crestMesh = meshField(crest, [{ bb: [-0.06, 1.8, -0.2, 0.06, 1.99, 0.17], h: 0.006 }]);
  parts.push(skinPart('crest', 'cloth', crest, crestMesh, { role: 'cloth' }, true));

  // 검 (오른손 주먹 중심 기준)
  const FR: V3 = [-0.352, 0.9, 0.06];
  const sw = buildSword(FR);
  parts.push(rigid('sword_blade', 'steel', 'hand_R', sw.blade, { role: 'sword' }));
  parts.push(rigid('sword_hilt', 'bronze_rigid', 'hand_R', sw.hilt, { role: 'sword' }));
  parts.push(rigid('sword_grip', 'wood', 'hand_R', sw.grip, { role: 'sword' }));
  // 방패
  const FL: V3 = [0.352, 0.9, 0.06];
  const sh = buildShield(FL);
  parts.push(rigid('shield_face', 'shield_face', 'hand_L', sh.face, { role: 'shield' }));
  parts.push(rigid('shield_back', 'wood', 'hand_L', sh.back, { role: 'shield' }));
  parts.push(rigid('shield_rim', 'bronze_rigid', 'hand_L', sh.side, { role: 'shield' }));
  parts.push(rigid('shield_boss', 'bronze_rigid', 'hand_L', sh.boss, { role: 'shield' }));
  parts.push(rigid('shield_handle', 'leather_rigid', 'hand_L', sh.handle, { role: 'shield' }));
  // 회복 병
  parts.push(rigid('flask', 'glass', 'hand_L', buildFlask(FL), { role: 'flask' }));

  const mat = (c: V3, rough: number, metal = 0, extra: Partial<MatSpec> = {}): MatSpec => ({ color: [c[0], c[1], c[2], 1], rough, metal, ...extra });
  const materials: Record<string, MatSpec> = {
    skin: mat([1, 1, 1], 0.62, 0, { extras: { kind: 'skin' } }),
    bronze: mat([1, 1, 1], 0.38, 0.9, { extras: { kind: 'bronze' } }),
    bronze_rigid: mat(C.bronze, 0.36, 0.9, { extras: { kind: 'bronze' } }),
    iron: mat([1, 1, 1], 0.5, 0.85, { extras: { kind: 'iron' } }),
    steel: mat(srgb(0xa9adb0), 0.28, 1.0, { extras: { kind: 'steel' } }),
    leather: mat([1, 1, 1], 0.78, 0, { extras: { kind: 'leather' } }),
    leather_rigid: mat(C.leather, 0.8, 0, { extras: { kind: 'leather' } }),
    cloth: mat([1, 1, 1], 0.95, 0, { extras: { kind: 'cloth' } }),
    wood: mat(srgb(0x5a3a22), 0.75, 0, { extras: { kind: 'wood' } }),
    shield_face: mat([1, 1, 1], 0.7, 0.05, { extras: { kind: 'shield_face' } }),
    glass: mat(srgb(0xb9702a), 0.12, 0, { extras: { kind: 'glass' } }),
  };
  const res = await writeGlb({
    bones: HUMAN_BONES, materials, parts, path: 'public/assets/models/gladiator.glb', compress: false,
    extras: { generator: 'tools/gen-gladiator.ts', license: 'original work for this project (see ASSET_LICENSES.md)' },
  });
  console.log(`gladiator.glb ${(res.bytes / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  void cone; void mulberry32;
}

main().catch((e) => { console.error(e); process.exit(1); });
