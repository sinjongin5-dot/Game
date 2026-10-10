/**
 * 숫사자 모델 생성기: SDF 해부학 볼륨 → 서피스넷 메싱 → 본 가중치 → 갈기 카드 → GLB.
 * 실행: npx tsx tools/gen-lion.ts
 */
import { LION_BONES, LION_BONE_INDEX as B } from '../src/rig/lionRig';
import {
  type Prim, type V3, type SD, type PartSpec,
  capsule, ellipsoid, sphere, scaled, segT, makeField, bbOfCapsule, polyTube,
} from './lib/sdf';
import { surfaceNets } from './lib/surfacenets';
import { packWeights, writeGlb, type PartOut, type MatSpec } from './lib/glb';
import { cone, uvSphere, ribbon, mulberry32, srgb, newMesh, mergeInto, toArrays, v3, type RawMesh } from './lib/shapes';

const NB = LION_BONES.length;

// ── 색상 팔레트 (sRGB hex → 선형) ─────────────────────────────────────────
const C = {
  back: srgb(0x9a6a3a),
  flank: srgb(0xb5844a),
  belly: srgb(0xd0aa72),
  chest: srgb(0xc29559),
  leg: srgb(0xb88650),
  paw: srgb(0xc19a62),
  muzzle: srgb(0xd6b583),
  bridge: srgb(0x8e6034),
  nose: srgb(0x2a1a18),
  lip: srgb(0x2d1d1a),
  earBack: srgb(0x2a1c14),
  elbow: srgb(0x6a4424),
  tuft: srgb(0x2a1a0e),
  tail: srgb(0xa9784a),
  cheek: srgb(0xc29a68),
  brow: srgb(0x7a5230),
  mouth: srgb(0x5a1f22),
  tongue: srgb(0xa04a50),
  eyeDark: srgb(0x1a1008),
};

function cap(a: V3, b: V3, r1: number, r2: number, bA: number, bB: number | undefined, color: V3, extra: Partial<Prim> = {}): Prim {
  return {
    sd: capsule(a, b, r1, r2),
    boneA: bA,
    boneB: bB,
    tfn: bB !== undefined ? segT(a, b) : undefined,
    color,
    bb: bbOfCapsule(a, b, Math.max(r1, r2) + 0.02),
    ...extra,
  };
}
function ell(c: V3, r: V3, bone: number, color: V3, extra: Partial<Prim> = {}, ypr?: V3): Prim {
  const m = Math.max(...r) + 0.02;
  return {
    sd: ellipsoid(c, r, ypr),
    boneA: bone,
    color,
    bb: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m],
    ...extra,
  };
}
function sph(c: V3, r: number, bone: number, color: V3, extra: Partial<Prim> = {}): Prim {
  return {
    sd: sphere(c, r),
    boneA: bone,
    color,
    bb: [c[0] - r - 0.02, c[1] - r - 0.02, c[2] - r - 0.02, c[0] + r + 0.02, c[1] + r + 0.02, c[2] + r + 0.02],
    ...extra,
  };
}

const bone = (n: string) => B[n];
const mx = (v: V3, s: number): V3 => [v[0] * s, v[1], v[2]];

function furPrims(): Prim[] {
  const P: Prim[] = [];
  // ── 몸통 ──
  P.push(ell([0, 0.96, -0.76], [0.25, 0.24, 0.28], bone('pelvis'), C.flank));
  P.push(cap([0, 0.94, -0.62], [0, 0.92, -0.05], 0.2, 0.2, bone('pelvis'), bone('spine1'), C.flank));
  P.push(cap([0, 0.93, -0.05], [0, 0.9, 0.42], 0.24, 0.29, bone('spine1'), bone('spine2'), C.flank));
  P.push(ell([0, 0.8, 0.52], [0.285, 0.33, 0.3], bone('spine2'), C.chest, { fur: 1.5 }));
  P.push(cap([0, 1.07, -0.55], [0, 1.12, 0.45], 0.14, 0.17, bone('pelvis'), bone('spine2'), C.back));
  // 복부 하단(밝은 색) — 배는 약간 올라가 있다
  P.push(cap([0, 0.74, -0.35], [0, 0.7, 0.2], 0.12, 0.14, bone('spine1'), undefined, C.belly, { fur: 0.8 }));
  // ── 목 ──
  P.push(cap([0, 1.08, 0.5], [0, 1.17, 0.86], 0.215, 0.185, bone('spine2'), bone('neck2'), C.back));
  P.push(cap([0, 1.17, 0.86], [0, 1.25, 1.06], 0.185, 0.15, bone('neck2'), bone('head'), C.back));
  // ── 앞다리 ──
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    P.push(ell([s * 0.17, 1.1, 0.45], [0.1, 0.15, 0.21], bone(`scap_${S}`), C.back));
    P.push({
      ...ell([s * 0.2, 0.93, 0.52], [0.125, 0.2, 0.19], bone(`scap_${S}`), C.flank),
      boneB: bone(`arm_${S}`),
      tfn: segT([0, 1.1, 0.5], [0, 0.78, 0.52]),
    });
    P.push(cap(mx([0.22, 0.86, 0.52], s), mx([0.21, 0.5, 0.38], s), 0.135, 0.092, bone(`arm_${S}`), bone(`fore_${S}`), C.leg, { fur: 0.8 }));
    P.push(sph(mx([0.2, 0.53, 0.31], s), 0.068, bone(`fore_${S}`), C.elbow, { fur: 1.6 }));
    P.push(cap(mx([0.21, 0.5, 0.38], s), mx([0.2, 0.2, 0.52], s), 0.095, 0.072, bone(`fore_${S}`), bone(`paw_${S}`), C.leg, { fur: 0.5 }));
    P.push(cap(mx([0.2, 0.15, 0.55], s), mx([0.2, 0.065, 0.68], s), 0.082, 0.084, bone(`paw_${S}`), bone(`toe_${S}`), C.paw, { fur: 0.28 }));
    for (const k of [-1, 0, 1]) {
      P.push(sph([s * 0.2 + k * 0.047, 0.046, 0.745 - Math.abs(k) * 0.015], 0.036 - Math.abs(k) * 0.004, bone(`toe_${S}`), C.paw, { fur: 0.2, sharp: 1.4 }));
    }
  }
  // ── 뒷다리 ──
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    P.push(cap(mx([0.25, 0.97, -0.72], s), mx([0.28, 0.62, -0.42], s), 0.16, 0.098, bone(`thigh_${S}`), bone(`knee_${S}`), C.flank));
    P.push(ell(mx([0.29, 0.86, -0.68], s), [0.1, 0.18, 0.19], bone(`thigh_${S}`), C.flank));
    P.push(sph(mx([0.29, 0.62, -0.38], s), 0.088, bone(`knee_${S}`), C.leg));
    P.push(cap(mx([0.28, 0.6, -0.4], s), mx([0.23, 0.35, -0.98], s), 0.09, 0.06, bone(`knee_${S}`), bone(`hock_${S}`), C.leg, { fur: 0.7 }));
    P.push(sph(mx([0.23, 0.35, -0.99], s), 0.06, bone(`hock_${S}`), C.elbow, { fur: 1.2 }));
    P.push(cap(mx([0.23, 0.35, -0.98], s), mx([0.22, 0.09, -0.8], s), 0.055, 0.052, bone(`hock_${S}`), bone(`hpaw_${S}`), C.leg, { fur: 0.45 }));
    P.push(cap(mx([0.22, 0.11, -0.8], s), mx([0.22, 0.065, -0.68], s), 0.066, 0.07, bone(`hpaw_${S}`), bone(`htoe_${S}`), C.paw, { fur: 0.28 }));
    for (const k of [-1, 0, 1]) {
      P.push(sph([s * 0.22 + k * 0.045, 0.045, -0.625 - Math.abs(k) * 0.012], 0.034 - Math.abs(k) * 0.004, bone(`htoe_${S}`), C.paw, { fur: 0.2, sharp: 1.4 }));
    }
  }
  // ── 꼬리 ──
  const tp: V3[] = [[0, 0.96, -1.08], [0, 0.86, -1.42], [0, 0.68, -1.74], [0, 0.48, -1.98], [0, 0.32, -2.12]];
  const tubePts: V3[] = [tp[0], tp[1], tp[2], tp[3], tp[4], [0, 0.22, -2.17]];
  const tube = polyTube(tubePts, [0.058, 0.05, 0.046, 0.043, 0.04, 0.04]);
  P.push({
    sd: tube.sd, chain: [0, 1, 2, 3, 4, 4].map((i) => bone(`tail${Math.min(i + 1, 5)}`)), chainT: tube.t,
    boneA: bone('tail1'), color: C.tail, fur: 0.7, bb: tube.bb, sharp: 1,
  });
  P.push(ell([0, 0.17, -2.2], [0.075, 0.17, 0.09], bone('tail5'), C.tuft, { fur: 3.0 }, [0, -0.5, 0]));
  // ── 머리 ──
  const hb = bone('head');
  P.push(ell([0, 1.3, 1.08], [0.19, 0.155, 0.215], hb, C.back));
  for (const s of [1, -1]) {
    P.push(ell([s * 0.152, 1.2, 1.2], [0.092, 0.11, 0.135], hb, C.cheek, { fur: 0.9 }));
    P.push(cap([s * 0.05, 1.385, 1.25], [s * 0.15, 1.35, 1.14], 0.04, 0.034, hb, undefined, C.brow, { fur: 0.4 }));
    P.push(ell([s * 0.078, 1.15, 1.44], [0.078, 0.064, 0.088], hb, C.muzzle, { fur: 0.3, sharp: 1.5 }));
    P.push(cap([s * 0.055, 1.115, 1.47], [s * 0.1, 1.105, 1.27], 0.038, 0.034, hb, undefined, C.lip, { fur: 0.2, sharp: 1.5 }));
    P.push(ell([s * 0.16, 1.47, 1.02], [0.066, 0.072, 0.034], bone(`ear_${s > 0 ? 'L' : 'R'}`), C.earBack, { fur: 0.35, sharp: 1.4 }, [s * 0.75, -0.15, s * 0.1]));
  }
  P.push({ ...cap([0, 1.21, 1.27], [0, 1.16, 1.47], 0.112, 0.098, hb, undefined, C.muzzle, { fur: 0.35 }), sd: scaled(capsule([0, 1.21, 1.27], [0, 1.16, 1.47], 0.112, 0.098), [0, 1.18, 1.37], [1.1, 1.06, 1]) });
  P.push(cap([0, 1.36, 1.15], [0, 1.24, 1.5], 0.05, 0.07, hb, undefined, C.bridge, { fur: 0.35 }));
  P.push(ell([0, 1.2, 1.545], [0.064, 0.044, 0.044], hb, C.nose, { fur: 0.0, sharp: 3.2 }));
  P.push(ell([0, 1.26, 1.34], [0.075, 0.06, 0.14], hb, C.bridge, { fur: 0.35 }));
  return P;
}

function furCarves() {
  const out: PartSpec['carves'] = [];
  for (const s of [1, -1]) {
    out!.push({ sd: sphere([s * 0.096, 1.322, 1.262], 0.039), color: [0.01, 0.006, 0.004] });
    out!.push({ sd: ellipsoid([s * 0.03, 1.19, 1.585], [0.016, 0.011, 0.02], [s * 0.3, 0, 0]), color: [0.002, 0.001, 0.001] });
    out!.push({ sd: capsule([s * 0.12, 1.115, 1.24], [s * 0.056, 1.108, 1.505], 0.0055), color: C.lip });
    // 눈물 자국
    out!.push({ sd: capsule([s * 0.108, 1.29, 1.3], [s * 0.1, 1.205, 1.42], 0.0045), color: [0.06, 0.035, 0.02] });
  }
  out!.push({ sd: capsule([0, 1.165, 1.598], [0, 1.115, 1.52], 0.006), color: C.lip });
  return out;
}

function jawPrims(): Prim[] {
  const P: Prim[] = [];
  const jb = bone('jaw');
  for (const s of [1, -1]) {
    P.push(cap([s * 0.09, 1.09, 1.2], [s * 0.05, 1.062, 1.4], 0.052, 0.045, jb, undefined, C.cheek, { fur: 0.5 }));
  }
  P.push(ell([0, 1.055, 1.44], [0.065, 0.045, 0.06], jb, C.muzzle, { fur: 0.3 }));
  P.push(cap([-0.09, 1.09, 1.2], [0.09, 1.09, 1.2], 0.052, 0.052, jb, undefined, C.cheek, { fur: 0.9 }));
  return P;
}

/** 입속 (구개 + 혀) */
function mouthPrims(): Prim[] {
  const P: Prim[] = [];
  P.push(ell([0, 1.118, 1.34], [0.082, 0.02, 0.125], bone('head'), C.mouth));
  P.push(ell([0, 1.085, 1.32], [0.047, 0.02, 0.12], bone('jaw'), C.tongue));
  P.push(ell([0, 1.095, 1.2], [0.085, 0.05, 0.05], bone('jaw'), C.mouth));
  return P;
}

interface Region { bb: [number, number, number, number, number, number]; h: number }

function meshField(spec: PartSpec, regions: Region[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
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

function skinPart(name: string, material: string, spec: PartSpec, mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, extras?: Record<string, unknown>): PartOut {
  const field = makeField(spec);
  const n = mesh.positions.length / 3;
  const w = new Float32Array(NB);
  const col = new Float32Array(4);
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    field.attrs(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2], NB, w, col);
    packWeights(w, NB, joints, weights, i);
    colors.set(col, i * 4);
  }
  return { name, material, positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, colors, joints, weights, extras };
}

/** 강체 메시(리지드)를 본에 붙인다. 위치는 모델 공간. */
function rigid(name: string, material: string, bone: string, m: RawMesh, color?: V3): PartOut {
  const a = toArrays(m);
  let colors: Float32Array | undefined;
  if (color) {
    colors = new Float32Array((a.positions.length / 3) * 4);
    for (let i = 0; i < colors.length; i += 4) { colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2]; colors[i + 3] = 1; }
  }
  return { name, material, positions: a.positions, normals: a.normals, indices: a.indices, uvs: a.uvs, colors, rigidBone: bone };
}

// ── 갈기 ─────────────────────────────────────────────────────────────────
function buildMane(): PartOut {
  const rnd = mulberry32(20260610);
  const mesh = newMesh();
  const cols: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  const bonesAlong = [
    { s: -0.35, b: bone('head') },
    { s: 0.0, b: bone('head') },
    { s: 0.28, b: bone('neck2') },
    { s: 0.62, b: bone('neck1') },
    { s: 1.0, b: bone('spine2') },
  ];
  const weightsAt = (s: number): [number, number][] => {
    const clamped = Math.max(bonesAlong[0].s, Math.min(1, s));
    for (let i = 0; i < bonesAlong.length - 1; i++) {
      const a = bonesAlong[i], b = bonesAlong[i + 1];
      if (clamped >= a.s && clamped <= b.s) {
        const t = (clamped - a.s) / (b.s - a.s);
        return [[a.b, 1 - t], [b.b, t]];
      }
    }
    return [[bone('spine2'), 1]];
  };
  const axisP = (s: number): V3 => v3.lerp([0, 1.23, 1.1], [0, 1.02, 0.4], s);
  const axisT = v3.norm(v3.sub([0, 1.02, 0.4], [0, 1.23, 1.1]));
  const upN: V3 = v3.norm(v3.cross([1, 0, 0], axisT)); // 축에 수직, 위쪽
  const N = 2400;
  for (let n = 0; n < N; n++) {
    const s = -0.28 + rnd() * 1.28;
    // 위쪽/옆쪽 우선, 아래(가슴)도 포함
    const phi = rnd() * Math.PI * 2;
    const rr = (0.17 + 0.13 * Math.max(s, 0)) * (0.85 + 0.3 * rnd());
    const dirN: V3 = v3.add(v3.mul([1, 0, 0], Math.cos(phi)), v3.mul(upN, Math.sin(phi)));
    const root = v3.add(axisP(Math.max(s, -0.1)), v3.mul(dirN, rr));
    if (s < 0) root[2] += s * 0.22; // 얼굴 쪽으로 약간 앞으로
    // 얼굴 앞으로 튀어나오지 않게
    const L = (0.3 + 0.28 * rnd() + 0.2 * Math.max(0, s)) * (1.0 + 0.35 * Math.max(0, -Math.sin(phi))); // 가슴 쪽 더 길게
    const outW = 0.45 + 0.9 * (1 - Math.min(1, Math.max(0, (s + 0.1) / 0.55)));
    let d = v3.norm(v3.add(v3.add(v3.mul(dirN, outW), v3.mul(axisT, 0.9)), [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3]));
    const segs = 6;
    const pts: V3[] = [root];
    const widths: number[] = [];
    let p = root;
    const step = L / segs;
    const phase = rnd() * 6.28, amp = 0.012 + 0.03 * rnd(), freq = 1.4 + 1.6 * rnd();
    const sideV = v3.norm(v3.cross(d, dirN));
    for (let k = 0; k < segs; k++) {
      // 중력 + 약한 곡률 + 물결
      d = v3.norm(v3.add(d, [(rnd() - 0.5) * 0.1, -0.2 - 0.12 * (k / segs), 0.0]));
      p = v3.add(p, v3.mul(d, step));
      const wob = Math.sin(phase + (k + 1) * freq) * amp * ((k + 1) / segs);
      pts.push(v3.add(p, v3.mul(sideV, wob)));
    }
    const w0 = 0.06 + 0.07 * rnd();
    for (let k = 0; k <= segs; k++) widths.push(w0 * (1 - 0.82 * Math.pow(k / segs, 1.2)));
    const rib = ribbon(pts, widths, dirN, 0, 1);
    // 색상: 뿌리 → 중간 → 끝
    const tone = rnd();
    const darkTip = rnd() < 0.55 + 0.25 * Math.min(1, Math.max(0, s));
    const rootC = v3.mul(srgb(0x4a2d16), 0.9 + 0.3 * tone);
    const midC = v3.lerp(srgb(0x75481f), srgb(0x2e1b0d), tone * 0.8);
    const tipC = darkTip ? v3.lerp(srgb(0x2a170a), srgb(0x120a05), rnd()) : v3.lerp(srgb(0xc19a5a), srgb(0x8a5a2a), rnd());
    const vcount = rib.positions.length / 3;
    for (let i = 0; i < vcount; i++) {
      const t = rib.uvs[i * 2 + 1];
      const c = t < 0.4 ? v3.lerp(rootC, midC, t / 0.4) : v3.lerp(midC, tipC, (t - 0.4) / 0.6);
      cols.push(c[0], c[1], c[2], 1);
      const wl = weightsAt(s);
      const jj = [wl[0][0], wl[1][0], 0, 0];
      const ww = [wl[0][1], wl[1][1], 0, 0];
      joints.push(...jj);
      weights.push(...ww);
    }
    // 정점마다 개별 랜덤 값 (U 가 아닌 카드 ID 로 알파 줄무늬 변화) → uv.x 에 카드 오프셋 추가
    const cardId = Math.floor(rnd() * 5000);
    for (let i = 0; i < vcount; i++) rib.uvs[i * 2] = rib.uvs[i * 2] * 0.98 + cardId;
    mergeInto(mesh, rib);
  }
  // 얼굴을 감싸는 러프 (짧고 바깥/뒤로)
  for (let n = 0; n < 700; n++) {
    const phi = rnd() * Math.PI * 2;
    const cx = 0, cy = 1.24, cz = 1.17;
    const root: V3 = [cx + Math.cos(phi) * (0.2 + 0.05 * rnd()), cy + Math.sin(phi) * (0.19 + 0.05 * rnd()) - 0.02, cz - 0.05 + 0.06 * rnd() + (Math.sin(phi) < -0.4 ? 0.1 : 0)];
    const dirN: V3 = v3.norm([Math.cos(phi), Math.sin(phi) * 0.9, 0]);
    let d = v3.norm(v3.add(v3.add(v3.mul(dirN, 0.8), [0, 0, -0.7]), [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3]));
    const L = 0.14 + 0.2 * rnd() + (Math.sin(phi) < -0.3 ? 0.14 : 0);
    const segs = 5;
    const pts: V3[] = [root];
    let p = root;
    const phase = rnd() * 6.28;
    for (let k = 0; k < segs; k++) {
      d = v3.norm(v3.add(d, [(rnd() - 0.5) * 0.1, -0.2, 0]));
      p = v3.add(p, v3.mul(d, L / segs));
      pts.push(v3.add(p, [Math.sin(phase + k) * 0.01, 0, 0]));
    }
    const w0 = 0.035 + 0.035 * rnd();
    const widths = pts.map((_, k) => w0 * (1 - 0.8 * Math.pow(k / segs, 1.2)));
    const rib = ribbon(pts, widths, dirN, 0, 1);
    const tone = rnd();
    const rootC = v3.mul(srgb(0x5a3719), 0.9 + 0.3 * tone);
    const tipC = rnd() < 0.5 ? v3.lerp(srgb(0xb88a4c), srgb(0x7c5128), rnd()) : v3.lerp(srgb(0x3a2410), srgb(0x1c1008), rnd());
    const vcount = rib.positions.length / 3;
    const cardId = Math.floor(rnd() * 5000);
    for (let i = 0; i < vcount; i++) {
      const t = rib.uvs[i * 2 + 1];
      const c = v3.lerp(rootC, tipC, Math.min(1, t * 1.2));
      cols.push(c[0], c[1], c[2], 1);
      joints.push(bone('head'), 0, 0, 0);
      weights.push(1, 0, 0, 0);
      rib.uvs[i * 2] = rib.uvs[i * 2] * 0.98 + cardId;
    }
    mergeInto(mesh, rib);
  }
  const a = toArrays(mesh);
  return {
    name: 'mane', material: 'mane', positions: a.positions, normals: a.normals, indices: a.indices, uvs: a.uvs,
    colors: new Float32Array(cols), joints: new Uint16Array(joints), weights: new Float32Array(weights),
    extras: { role: 'mane' },
  };
}

async function main() {
  const t0 = Date.now();
  const fur: PartSpec = { name: 'fur', material: 'fur', prims: furPrims(), carves: furCarves(), T: 0.03 };
  const furHead: PartSpec = { ...fur, T: 0.02 };
  const furLimb: PartSpec = { ...fur, T: 0.026 };

  const bodyRegion: Region[] = [{ bb: [-0.52, 0.44, -1.16, 0.52, 1.52, 1.0], h: 0.034 }];
  const legRegion: Region[] = [{ bb: [-0.42, -0.01, -1.12, 0.42, 0.52, 0.9], h: 0.02 }];
  const tailRegion: Region[] = [{ bb: [-0.14, 0.04, -2.4, 0.14, 1.05, -1.0], h: 0.02 }];
  const headRegion: Region[] = [{ bb: [-0.26, 0.98, 0.9, 0.26, 1.56, 1.7], h: 0.0145 }];

  const body = meshField(fur, bodyRegion);
  const legs = meshField(furLimb, legRegion);
  const tail = meshField(fur, tailRegion);
  const head = meshField(furHead, headRegion);
  const merge = (...ms: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }[]) => {
    let np = 0, ni = 0;
    for (const m of ms) { np += m.positions.length; ni += m.indices.length; }
    const positions = new Float32Array(np), normals = new Float32Array(np), indices = new Uint32Array(ni);
    let po = 0, io = 0, vb = 0;
    for (const m of ms) {
      positions.set(m.positions, po); normals.set(m.normals, po);
      for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vb;
      po += m.positions.length; io += m.indices.length; vb += m.positions.length / 3;
    }
    return { positions, normals, indices };
  };
  const furMesh = merge(body, legs, tail, head);
  console.log('fur verts', furMesh.positions.length / 3, 'tris', furMesh.indices.length / 3, `${Date.now() - t0}ms`);

  const jawSpec: PartSpec = { name: 'jaw', material: 'fur', prims: jawPrims(), T: 0.014 };
  const jawMesh = meshField(jawSpec, [{ bb: [-0.15, 0.99, 1.1, 0.15, 1.16, 1.55], h: 0.0095 }]);
  const mouthSpec: PartSpec = { name: 'mouth', material: 'mouth', prims: mouthPrims(), T: 0.01 };
  const mouthMesh = meshField(mouthSpec, [{ bb: [-0.13, 1.05, 1.14, 0.13, 1.15, 1.5], h: 0.0085 }]);

  const parts: PartOut[] = [];
  parts.push(skinPart('lion_fur', 'fur', fur, furMesh, { role: 'fur' }));
  parts.push(skinPart('lion_jaw', 'fur', jawSpec, jawMesh, { role: 'fur' }));
  parts.push(skinPart('lion_mouth', 'mouth', mouthSpec, mouthMesh, { role: 'mouth' }));
  parts.push(buildMane());

  // 눈 (구형 + 정면 UV)
  for (const s of [1, -1]) {
    const e = uvSphere([s * 0.096, 1.322, 1.262], [0.031, 0.031, 0.031], 18, 12, true);
    // 눈 방향: 약간 바깥/앞
    parts.push(rigid(`eye_${s > 0 ? 'L' : 'R'}`, 'eye', 'head', e));
  }
  // 송곳니 + 앞니
  const teethUp = newMesh();
  const teethLow = newMesh();
  for (const s of [1, -1]) {
    mergeInto(teethUp, cone([s * 0.055, 1.12, 1.47], [s * 0.057, 1.052, 1.474], 0.0135, 8, [0, 0, 0.006]));
    mergeInto(teethLow, cone([s * 0.045, 1.07, 1.43], [s * 0.047, 1.13, 1.435], 0.012, 8, [0, 0, 0.004]));
    for (const k of [0.015, 0.032]) {
      mergeInto(teethUp, cone([s * k, 1.125, 1.495], [s * k, 1.102, 1.499], 0.0078, 6));
      mergeInto(teethLow, cone([s * k, 1.07, 1.465], [s * k, 1.092, 1.467], 0.0072, 6));
    }
  }
  parts.push(rigid('teeth_up', 'ivory', 'head', teethUp));
  parts.push(rigid('teeth_low', 'ivory', 'jaw', teethLow));
  // 발톱
  for (const [bn, zs, yz, lenC] of [['toe_L', 0.77, 0.046, 0.05], ['toe_R', 0.77, 0.046, 0.05], ['htoe_L', -0.6, 0.046, 0.04], ['htoe_R', -0.6, 0.046, 0.04]] as [string, number, number, number][]) {
    const cl = newMesh();
    const left = bn.endsWith('L');
    const sx = left ? 1 : -1;
    const bx = bn.startsWith('h') ? 0.22 : 0.2;
    const dir = bn.startsWith('h') ? -1 : 1;
    void dir;
    for (const k of [-1, 0, 1]) {
      const x = sx * bx + k * (bn.startsWith('h') ? 0.045 : 0.047);
      const zb = bn.startsWith('h') ? -0.625 - Math.abs(k) * 0.012 : 0.745 - Math.abs(k) * 0.015;
      void zs;
      const zd = 1;
      mergeInto(cl, cone([x, yz + 0.0, zb + 0.025 * zd], [x, yz - 0.03, zb + (0.025 + lenC) * zd], 0.011, 6, [0, -0.02, 0.0]));
    }
    parts.push(rigid(`claws_${bn}`, 'claw', bn, cl));
  }

  const mat = (c: V3, rough: number, metal = 0, extra: Partial<MatSpec> = {}): MatSpec => ({ color: [c[0], c[1], c[2], 1], rough, metal, ...extra });
  const materials: Record<string, MatSpec> = {
    fur: mat([1, 1, 1], 0.9, 0, { extras: { kind: 'fur' } }),
    mane: mat([1, 1, 1], 0.85, 0, { doubleSided: true, alphaMode: 'MASK', extras: { kind: 'mane' } }),
    mouth: mat([1, 1, 1], 0.45, 0, { extras: { kind: 'mouth' } }),
    eye: mat([1, 1, 1], 0.08, 0, { extras: { kind: 'eye' } }),
    ivory: mat(srgb(0xe6dcc0), 0.4, 0, { extras: { kind: 'ivory' } }),
    claw: mat(srgb(0xd8caa8), 0.45, 0, { extras: { kind: 'claw' } }),
  };

  const res = await writeGlb({
    bones: LION_BONES,
    materials,
    parts,
    path: 'public/assets/models/lion.glb',
    compress: true,
    extras: { generator: 'tools/gen-lion.ts', license: 'original work for this project (CC0-equivalent, see ASSET_LICENSES.md)' },
  });
  console.log(`lion.glb ${(res.bytes / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
