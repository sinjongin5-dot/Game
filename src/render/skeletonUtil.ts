import * as THREE from 'three';
import type { PoseRig } from '../animation/poseRig';

/** 로드한 glTF 장면에서 리그 이름과 같은 Bone 노드를 찾는다. 누락 시 예외 */
export function mapBones(root: THREE.Object3D, rig: PoseRig): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const name of rig.names) {
    const o = root.getObjectByName(name);
    if (!o) throw new Error(`본 누락: ${name}`);
    out.push(o);
  }
  return out;
}
