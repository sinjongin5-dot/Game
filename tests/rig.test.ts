import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PoseRig } from '../src/animation/poseRig';
import { HUMAN_BONES } from '../src/rig/humanRig';
import { LION_BONES } from '../src/rig/lionRig';

describe('PoseRig', () => {
  it('휴식 자세의 월드 위치가 리그 정의와 같다', () => {
    for (const defs of [HUMAN_BONES, LION_BONES]) {
      const rig = new PoseRig(defs);
      defs.forEach((d, i) => {
        expect(rig.worldP[i].distanceTo(new THREE.Vector3(...d.pos))).toBeLessThan(1e-5);
      });
    }
  });

  it('2본 IK 가 도달 가능한 목표에 닿는다 (사람 다리/팔, 사자 앞다리)', () => {
    const rig = new PoseRig(HUMAN_BONES);
    const target = new THREE.Vector3(0.12, 0.35, 0.3);
    const err = rig.twoBone(rig.id('thigh_L'), rig.id('shin_L'), rig.id('foot_L'), target, new THREE.Vector3(0, 0, 1));
    expect(err).toBeLessThan(1e-3);
    // 무릎은 앞으로 꺾인다
    expect(rig.worldP[rig.id('shin_L')].z).toBeGreaterThan(rig.worldP[rig.id('thigh_L')].z);

    const lion = new PoseRig(LION_BONES);
    const t2 = new THREE.Vector3(0.2, 0.3, 0.9);
    const e2 = lion.twoBone(lion.id('arm_L'), lion.id('fore_L'), lion.id('paw_L'), t2, new THREE.Vector3(0, 0, -1));
    expect(e2).toBeLessThan(1e-3);
  });

  it('도달 불가능한 목표는 최대한 뻗고 NaN 을 만들지 않는다', () => {
    const rig = new PoseRig(HUMAN_BONES);
    const err = rig.twoBone(rig.id('upperarm_R'), rig.id('forearm_R'), rig.id('hand_R'), new THREE.Vector3(-3, 2, 3), new THREE.Vector3(0, -1, 0));
    expect(Number.isFinite(err)).toBe(true);
    for (const p of rig.worldP) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  });

  it('뼈 길이는 IK 후에도 보존된다', () => {
    const rig = new PoseRig(HUMAN_BONES);
    const a = rig.id('thigh_R'), b = rig.id('shin_R');
    const L0 = rig.worldP[a].distanceTo(rig.worldP[b]);
    rig.twoBone(a, b, rig.id('foot_R'), new THREE.Vector3(-0.1, 0.4, 0.25), new THREE.Vector3(0, 0, 1));
    expect(Math.abs(rig.worldP[a].distanceTo(rig.worldP[b]) - L0)).toBeLessThan(1e-5);
  });
});
