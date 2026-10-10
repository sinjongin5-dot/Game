import * as THREE from 'three';
import { HUMAN_BONES } from '../rig/humanRig';
import { MOCAP, MOCAP_BONES, type MocapClip } from './mocapData';
import type { PoseRig } from './poseRig';

export type MocapName = keyof typeof MOCAP;

export const MOCAP_HIPS_REST_Y = HUMAN_BONES[1].pos[1];

/** 상체만 덮어쓸 때 쓰는 뼈 (다리/히프는 절차적 보행을 유지) */
export const UPPER_BODY = new Set([
  'spine1', 'spine2', 'chest', 'clavicle_L', 'upperarm_L', 'forearm_L', 'hand_L', 'clavicle_R', 'upperarm_R', 'forearm_R', 'hand_R',
]);

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

export interface MocapSample {
  /** 뼈 순서는 MOCAP_BONES. 로컬 회전 */
  q: THREE.Quaternion[];
  hips: THREE.Vector3;
  travel: { x: number; z: number };
}

/** 베이크된 클립에서 시간 t(초)의 포즈를 보간해 읽는다 (프레임 사이는 slerp). 마지막 프레임을 넘으면 마지막 포즈에 머문다. */
export class MocapSampler {
  readonly clip: MocapClip;
  private cache: MocapSample = { q: MOCAP_BONES.map(() => new THREE.Quaternion()), hips: new THREE.Vector3(), travel: { x: 0, z: 0 } };

  constructor(name: MocapName) {
    this.clip = MOCAP[name];
  }

  get duration() { return this.clip.frames / this.clip.fps; }

  sample(t: number): MocapSample {
    const c = this.clip;
    const f = Math.min(Math.max(t * c.fps, 0), c.frames - 1);
    const i0 = Math.floor(f), i1 = Math.min(c.frames - 1, i0 + 1), u = f - i0;
    const nb = MOCAP_BONES.length;
    for (let b = 0; b < nb; b++) {
      const o0 = (i0 * nb + b) * 4, o1 = (i1 * nb + b) * 4;
      qa.set(c.q[o0], c.q[o0 + 1], c.q[o0 + 2], c.q[o0 + 3]);
      qb.set(c.q[o1], c.q[o1 + 1], c.q[o1 + 2], c.q[o1 + 3]);
      this.cache.q[b].copy(qa).slerp(qb, u);
    }
    const h0 = i0 * 3, h1 = i1 * 3;
    this.cache.hips.set(
      c.hips[h0] + (c.hips[h1] - c.hips[h0]) * u,
      c.hips[h0 + 1] + (c.hips[h1 + 1] - c.hips[h0 + 1]) * u,
      c.hips[h0 + 2] + (c.hips[h1 + 2] - c.hips[h0 + 2]) * u,
    );
    const t0 = i0 * 2, t1 = i1 * 2;
    this.cache.travel.x = c.travel[t0] + (c.travel[t1] - c.travel[t0]) * u;
    this.cache.travel.z = c.travel[t0 + 1] + (c.travel[t1 + 1] - c.travel[t0 + 1]) * u;
    return this.cache;
  }

  /** 검 키(주먹 위치/칼날 방향)를 보간해 읽는다 */
  sword(t: number, out: { hand: THREE.Vector3; dir: THREE.Vector3 }) {
    const c = this.clip;
    const f = Math.min(Math.max(t * c.fps, 0), c.frames - 1);
    const i0 = Math.floor(f), i1 = Math.min(c.frames - 1, i0 + 1), u = f - i0;
    const a = i0 * 6, b = i1 * 6;
    out.hand.set(c.sword[a] + (c.sword[b] - c.sword[a]) * u, c.sword[a + 1] + (c.sword[b + 1] - c.sword[a + 1]) * u, c.sword[a + 2] + (c.sword[b + 2] - c.sword[a + 2]) * u);
    out.dir.set(c.sword[a + 3] + (c.sword[b + 3] - c.sword[a + 3]) * u, c.sword[a + 4] + (c.sword[b + 4] - c.sword[a + 4]) * u, c.sword[a + 5] + (c.sword[b + 5] - c.sword[a + 5]) * u).normalize();
  }

  /**
   * 포즈를 리그에 쓴다. mask 가 있으면 해당 뼈만, weight<1 이면 현재 리그 값과 섞는다(slerp).
   * hips 는 mask 가 없을 때(전신) 또는 withHips 일 때만 적용한다.
   */
  apply(rig: PoseRig, t: number, opts: { mask?: Set<string>; weight?: number; withHips?: boolean } = {}) {
    const s = this.sample(t);
    const w = opts.weight ?? 1;
    for (let b = 0; b < MOCAP_BONES.length; b++) {
      const name = MOCAP_BONES[b];
      if (opts.mask && !opts.mask.has(name)) continue;
      const id = rig.id(name);
      if (w >= 0.999) rig.localQ[id].copy(s.q[b]);
      else rig.localQ[id].slerp(s.q[b], w);
    }
    if (!opts.mask || opts.withHips) {
      const h = rig.extraOffset[rig.id('hips')];
      if (w >= 0.999) h.copy(s.hips); else h.lerp(s.hips, w);
    }
    rig.fk();
  }
}
