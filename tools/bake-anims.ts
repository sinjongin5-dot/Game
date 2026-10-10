/**
 * Mixamo FBX 모션 → 이 게임의 검투사 리그용 클립으로 리타게팅/베이크한다.
 *
 * 사용: npx tsx tools/bake-anims.ts   (입력: assets-src/mocap/*.fbx, 출력: src/animation/mocapData.ts)
 *
 * 리타게팅 방법 (뼈 방향 기반):
 *   - Mixamo 는 T 자세, 우리 리그는 팔을 내린 자세라 휴식 자세가 다르다.
 *   - 뼈마다 D(t) = 애니메이션 월드 회전 × 휴식 월드 회전⁻¹ 을 구하고,
 *     우리 뼈의 휴식 방향을 Mixamo 휴식 방향으로 돌리는 최소 회전 F 를 곱해 Q(t) = D(t)·F 를 월드 회전으로 쓴다.
 *   - 손(검/방패를 쥔 손)은 쥐는 각도 보정 G 를 한 번 곱한다 (준비 자세에서 검 방향/방패 면이 우리 모델과 맞도록).
 *   - 우리 리그의 휴식 회전은 모두 단위 회전이므로 부모 기준 로컬 회전은 Q(parent)⁻¹·Q(bone) 이다.
 *   - 히프 위치는 키 비율로 축소하고, 발이 지면 높이에 오도록 상수 보정한다. 공격처럼 시뮬레이션이 이동을 맡는 클립은
 *     수평 이동(루트 모션)을 따로 빼 travel 곡선으로 저장한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PoseRig } from '../src/animation/poseRig';
import { HUMAN_BONES } from '../src/rig/humanRig';
import { SWORD_IDLE } from '../src/combat/attackData';

const SRC_DIR = process.argv[2] ?? 'assets-src/mocap';
const OUT = 'src/animation/mocapData.ts';

// 우리 뼈 → Mixamo 뼈 (mixamorig 접두어 제외)
const MAP: Record<string, string> = {
  hips: 'Hips', spine1: 'Spine', spine2: 'Spine1', chest: 'Spine2', neck: 'Neck', head: 'Head',
  clavicle_L: 'LeftShoulder', upperarm_L: 'LeftArm', forearm_L: 'LeftForeArm', hand_L: 'LeftHand',
  thigh_L: 'LeftUpLeg', shin_L: 'LeftLeg', foot_L: 'LeftFoot', toe_L: 'LeftToeBase',
  clavicle_R: 'RightShoulder', upperarm_R: 'RightArm', forearm_R: 'RightForeArm', hand_R: 'RightHand',
  thigh_R: 'RightUpLeg', shin_R: 'RightLeg', foot_R: 'RightFoot', toe_R: 'RightToeBase',
};
// 방향 기준(자식): Mixamo 쪽
const MIX_CHILD: Record<string, string> = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToe_End',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToe_End',
};
// 방향 기준(자식): 우리 쪽 (끝 뼈는 부모→자신 방향 사용)
const OUR_CHILD: Record<string, string | null> = {
  hips: 'spine1', spine1: 'spine2', spine2: 'chest', chest: 'neck', neck: 'head', head: null,
  clavicle_L: 'upperarm_L', upperarm_L: 'forearm_L', forearm_L: 'hand_L', hand_L: null,
  thigh_L: 'shin_L', shin_L: 'foot_L', foot_L: 'toe_L', toe_L: null,
  clavicle_R: 'upperarm_R', upperarm_R: 'forearm_R', forearm_R: 'hand_R', hand_R: null,
  thigh_R: 'shin_R', shin_R: 'foot_R', foot_R: 'toe_R', toe_R: null,
};

const OUR = new PoseRig(HUMAN_BONES);      // 베이크 중 포즈를 취하는 리그
const OUR_REST = new PoseRig(HUMAN_BONES); // 휴식 자세 기준 (절대 포즈를 취하지 않는다)
const NAMES = Object.keys(MAP); // 우리 뼈 순서 (부모가 자식보다 앞서도록 정렬 확인)
NAMES.sort((a, b) => OUR.id(a) - OUR.id(b));

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HAND_OFFSET_R = V(-0.007, -0.05, 0.02);

function loadFbx(file: string) {
  const buf = fs.readFileSync(file);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '') as THREE.Group & { animations: THREE.AnimationClip[] };
}

function ourRestDir(name: string): THREE.Vector3 {
  const id = OUR_REST.id(name);
  const child = OUR_CHILD[name];
  if (child) return OUR_REST.worldP[OUR_REST.id(child)].clone().sub(OUR_REST.worldP[id]).normalize();
  const p = OUR_REST.parent[id];
  return OUR_REST.worldP[id].clone().sub(OUR_REST.worldP[p]).normalize();
}

interface ClipOut {
  fps: number; frames: number; q: number[]; hips: number[]; travel: number[]; sword: number[];
}

/** 하나의 FBX 를 베이크한다. G: 손 쥐는 각도 보정(없으면 단위) */
function bake(obj: ReturnType<typeof loadFbx>, grip: { R: THREE.Quaternion; L: THREE.Quaternion }, opts: { stripTravel: boolean; yaw?: 'none' | 'first' | 'frame' }) {
  const clip = obj.animations[0];
  const mix = (n: string) => obj.getObjectByName(`mixamorig${n}`)!;
  // 휴식 자세 (애니메이션 적용 전)
  obj.updateMatrixWorld(true);
  const restQ: Record<string, THREE.Quaternion> = {};
  const restP: Record<string, THREE.Vector3> = {};
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  for (const m of Object.values(MAP)) { restQ[m] = wq(mix(m)); restP[m] = wp(mix(m)); }
  const F: Record<string, THREE.Quaternion> = {};
  for (const [ours, m] of Object.entries(MAP)) {
    const child = MIX_CHILD[m];
    const dm = wp(mix(child)).sub(restP[m]).normalize();
    F[ours] = new THREE.Quaternion().setFromUnitVectors(ourRestDir(ours), dm);
  }
  const hipsRest = restP.Hips.clone();
  const scale = HUMAN_BONES[1].pos[1] / hipsRest.y; // 0.98 / 94.55

  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const fps = 30;
  const frames = Math.max(2, Math.ceil(clip.duration * fps - 1e-6));
  const q: number[] = [], hips: number[] = [], travel: number[] = [], sword: number[] = [];
  let yShift = 0;
  let yaw0 = 0;
  const hipsAt0 = { x: 0, z: 0 };
  const worldQ: Record<string, THREE.Quaternion> = {};
  for (let f = 0; f < frames; f++) {
    mixer.setTime(f / fps);
    obj.updateMatrixWorld(true);
    // 우리 뼈 월드 회전
    for (const ours of NAMES) {
      const m = MAP[ours];
      const D = wq(mix(m)).multiply(restQ[m].clone().invert());
      let Q = D.multiply(F[ours]);
      if (ours === 'hand_R') Q = Q.multiply(grip.R);
      if (ours === 'hand_L') Q = Q.multiply(grip.L);
      worldQ[ours] = Q;
    }
    // 히프의 바라보는 방향(yaw)을 제거해 정면을 향하게 한다 (first: 첫 프레임 값으로 고정, frame: 프레임마다)
    const mode = opts.yaw ?? 'none';
    let NY = new THREE.Quaternion();
    if (mode !== 'none') {
      const fwd = V(0, 0, 1).applyQuaternion(worldQ.hips);
      const yawNow = Math.atan2(fwd.x, fwd.z);
      if (f === 0) yaw0 = yawNow;
      NY = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -(mode === 'first' ? yaw0 : yawNow));
      for (const ours of NAMES) worldQ[ours] = NY.clone().multiply(worldQ[ours]);
    }
    // 로컬 회전
    for (const ours of NAMES) {
      const id = OUR.id(ours);
      const p = OUR.parent[id];
      const pn = p >= 0 ? OUR.names[p] : null;
      const loc = pn && worldQ[pn] ? worldQ[pn].clone().invert().multiply(worldQ[ours]) : worldQ[ours].clone();
      if (loc.w < 0) { loc.x *= -1; loc.y *= -1; loc.z *= -1; loc.w *= -1; }
      OUR.localQ[id].copy(loc);
      q.push(+loc.x.toFixed(5), +loc.y.toFixed(5), +loc.z.toFixed(5), +loc.w.toFixed(5));
    }
    // 히프 위치
    const hp = wp(mix('Hips'));
    if (f === 0) { hipsAt0.x = hp.x; hipsAt0.z = hp.z; }
    const tv = V((hp.x - hipsAt0.x) * scale, 0, (hp.z - hipsAt0.z) * scale).applyQuaternion(NY);
    const tx = tv.x, tz = tv.z;
    travel.push(+tx.toFixed(4), +tz.toFixed(4));
    const hx = opts.stripTravel ? 0 : tx, hz = opts.stripTravel ? 0 : tz;
    const hy = hp.y * scale;
    OUR.extraOffset[OUR.id('hips')].set(hx, hy - HUMAN_BONES[1].pos[1], hz);
    OUR.fk();
    if (f === 0) {
      const ankle = Math.min(OUR.worldP[OUR.id('foot_L')].y, OUR.worldP[OUR.id('foot_R')].y);
      yShift = 0.1 - ankle; // 서 있는 첫 프레임에서 발목이 지면 위 0.1m 가 되도록
    }
    hips.push(+hx.toFixed(4), +(hy - HUMAN_BONES[1].pos[1] + yShift).toFixed(4), +hz.toFixed(4));
    // 검 키: 주먹 중심 위치/칼날 방향 (히프 보정 반영)
    OUR.extraOffset[OUR.id('hips')].set(hx, hy - HUMAN_BONES[1].pos[1] + yShift, hz);
    OUR.fk();
    const hq = OUR.worldQ[OUR.id('hand_R')];
    const fist = OUR.worldP[OUR.id('hand_R')].clone().add(HAND_OFFSET_R.clone().applyQuaternion(hq));
    const dir = V(0, 0, 1).applyQuaternion(hq);
    sword.push(+fist.x.toFixed(4), +fist.y.toFixed(4), +fist.z.toFixed(4), +dir.x.toFixed(4), +dir.y.toFixed(4), +dir.z.toFixed(4));
  }
  return { fps, frames, q, hips, travel, sword } as ClipOut;
}

/** 휴식(단위) 쿼터니언으로 한 번 베이크한 뒤, 특정 프레임의 손 월드 회전으로 grip 보정 G 를 구한다. */
function worldHandQ(file: string, frame: number, side: 'R' | 'L'): THREE.Quaternion {
  // grip = identity 로 베이크한 결과에서 해당 프레임의 손 월드 회전을 읽는다 (애니메이션 평가가 객체를 변형하므로 새로 읽는다)
  const out = bake(loadFbx(file), { R: new THREE.Quaternion(), L: new THREE.Quaternion() }, { stripTravel: false, yaw: 'first' });
  const names = NAMES;
  const qs = new Map<string, THREE.Quaternion>();
  const world = new Map<string, THREE.Quaternion>();
  names.forEach((n, i) => qs.set(n, new THREE.Quaternion(out.q[(frame * names.length + i) * 4], out.q[(frame * names.length + i) * 4 + 1], out.q[(frame * names.length + i) * 4 + 2], out.q[(frame * names.length + i) * 4 + 3])));
  for (const n of names) {
    const p = OUR.parent[OUR.id(n)];
    const pn = p >= 0 ? OUR.names[p] : null;
    world.set(n, pn && world.has(pn) ? world.get(pn)!.clone().multiply(qs.get(n)!) : qs.get(n)!.clone());
  }
  return world.get(side === 'R' ? 'hand_R' : 'hand_L')!;
}

function handBasisR(dir: THREE.Vector3, hint = V(0, 1, 0)) {
  const z = dir.clone().normalize();
  let h = hint.clone();
  if (Math.abs(z.y) > 0.92) h = V(0, 0, 1).multiplyScalar(z.y > 0 ? -1 : 1);
  const x = new THREE.Vector3().crossVectors(h, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function shieldBasis(normal: THREE.Vector3, up: THREE.Vector3) {
  const x = normal.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function main() {
  const files: Record<string, string> = {
    attack: 'attack.fbx', block: 'block.fbx', death: 'death.fbx', sheath: 'sheath.fbx', turn180: 'turn180.fbx',
  };
  const objs: Record<string, ReturnType<typeof loadFbx>> = {};
  for (const [k, f] of Object.entries(files)) objs[k] = loadFbx(path.join(SRC_DIR, f));

  // 손 쥐는 각도 보정
  //  - 오른손(검): 준비 자세 첫 프레임에서 칼날 방향이 SWORD_IDLE 이 되도록
  //  - 왼손(방패): 방패를 든 마지막 프레임에서 방패 면이 정면(우리 높은 방어 자세)을 향하도록
  const idleDir = V(SWORD_IDLE.dir.x, SWORD_IDLE.dir.y, SWORD_IDLE.dir.z);
  const blockFile = path.join(SRC_DIR, files.block);
  const qR0 = worldHandQ(blockFile, 0, 'R');  // block 은 'first' 정면화 기준
  const GR = qR0.clone().invert().multiply(handBasisR(idleDir));
  const qLend = worldHandQ(blockFile, Math.ceil(objs.block.animations[0].duration * 30 - 1e-6) - 1, 'L');
  const GL = qLend.clone().invert().multiply(shieldBasis(V(0.1, 0.08, 1), V(0, 1, 0.08)));
  const grip = { R: GR, L: GL };

  const clips: Record<string, ClipOut & { duration: number; strip: boolean }> = {};
  for (const [k, o] of Object.entries(objs)) {
    const strip = k === 'attack' || k === 'turn180';
    // block/sheath: 옆을 보는 대치 자세라 첫 프레임 방향을 정면으로 돌린다. turn180: 회전은 시뮬레이션이 하므로 프레임마다 회전을 뺀다.
    const yaw = k === 'block' || k === 'sheath' ? 'first' : k === 'turn180' ? 'frame' : 'none';
    const c = bake(o, grip, { stripTravel: strip, yaw });
    clips[k] = { ...c, duration: +(c.frames / c.fps).toFixed(4), strip };
    console.log(k, 'frames', c.frames, 'duration', clips[k].duration, 'travel end', c.travel.slice(-2));
  }
  const body = `/* 자동 생성: tools/bake-anims.ts (Mixamo FBX → 검투사 리그). 직접 수정하지 마세요. */
export const MOCAP_BONES = ${JSON.stringify(NAMES)} as const;
export interface MocapClip { fps: number; frames: number; duration: number; strip: boolean; q: number[]; hips: number[]; travel: number[]; sword: number[] }
export const MOCAP: Record<'attack' | 'block' | 'death' | 'sheath' | 'turn180', MocapClip> = ${JSON.stringify(clips)};
`;
  fs.writeFileSync(OUT, body);
  console.log('wrote', OUT, (body.length / 1024).toFixed(0), 'KB');
}
main();
