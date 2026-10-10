import * as THREE from 'three';
import type { BoneDef } from '../rig/types';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
export const AXIS = { X, Y, Z };

/**
 * 순수 수학 리그: 모든 뼈의 휴식 회전은 단위 회전이다.
 * 로컬 회전(localQ)과 부모 기준 오프셋(휴식 + 추가)으로 FK 를 계산하고, 2본 IK/조준 연산을 제공한다.
 * Three 의 Bone 과는 applyTo() 로만 연결되므로 Node 에서 테스트할 수 있다.
 */
export class PoseRig {
  readonly n: number;
  readonly names: string[];
  readonly index = new Map<string, number>();
  readonly parent: Int16Array;
  readonly restOffset: THREE.Vector3[];
  readonly extraOffset: THREE.Vector3[];
  readonly localQ: THREE.Quaternion[];
  readonly worldQ: THREE.Quaternion[];
  readonly worldP: THREE.Vector3[];
  readonly children: number[][];

  constructor(defs: BoneDef[]) {
    this.n = defs.length;
    this.names = defs.map((d) => d.name);
    defs.forEach((d, i) => this.index.set(d.name, i));
    this.parent = new Int16Array(this.n).fill(-1);
    this.restOffset = [];
    this.extraOffset = [];
    this.localQ = [];
    this.worldQ = [];
    this.worldP = [];
    this.children = defs.map(() => []);
    defs.forEach((d, i) => {
      const pi = d.parent ? this.index.get(d.parent)! : -1;
      this.parent[i] = pi;
      if (pi >= 0) this.children[pi].push(i);
      const pp = pi >= 0 ? defs[pi].pos : [0, 0, 0];
      this.restOffset.push(new THREE.Vector3(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]));
      this.extraOffset.push(new THREE.Vector3());
      this.localQ.push(new THREE.Quaternion());
      this.worldQ.push(new THREE.Quaternion());
      this.worldP.push(new THREE.Vector3());
    });
    this.fk();
  }

  id(name: string): number {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`unknown bone ${name}`);
    return i;
  }

  reset() {
    for (let i = 0; i < this.n; i++) {
      this.localQ[i].identity();
      this.extraOffset[i].set(0, 0, 0);
    }
  }

  fk() {
    for (let i = 0; i < this.n; i++) this.fkOne(i);
  }

  private fkOne(i: number) {
    const p = this.parent[i];
    if (p < 0) {
      this.worldQ[i].copy(this.localQ[i]);
      this.worldP[i].copy(this.extraOffset[i]).add(this.restOffset[i]);
    } else {
      this.worldQ[i].multiplyQuaternions(this.worldQ[p], this.localQ[i]);
      _v.copy(this.restOffset[i]).add(this.extraOffset[i]).applyQuaternion(this.worldQ[p]);
      this.worldP[i].copy(this.worldP[p]).add(_v);
    }
  }

  /** i 의 하위 트리 갱신 (bones 는 부모가 자식보다 앞선 순서라고 가정) */
  fkFrom(i: number) {
    this.fkOne(i);
    for (let k = i + 1; k < this.n; k++) {
      if (this.isDescendant(k, i)) this.fkOne(k);
    }
  }

  private isDescendant(k: number, anc: number): boolean {
    let p = this.parent[k];
    while (p >= 0) {
      if (p === anc) return true;
      p = this.parent[p];
    }
    return false;
  }

  /** 월드 회전을 직접 지정 (로컬 회전으로 환산) */
  setWorldQuat(i: number, q: THREE.Quaternion) {
    const p = this.parent[i];
    if (p < 0) this.localQ[i].copy(q);
    else this.localQ[i].copy(this.worldQ[p]).invert().multiply(q);
    this.fkFrom(i);
  }

  /** 로컬에 회전을 오른쪽 곱 (부모 프레임 기준 추가 회전이 아닌, 뼈 자신의 축 기준) */
  rotateLocal(i: number, q: THREE.Quaternion) {
    this.localQ[i].multiply(q);
  }
  /** 부모 프레임(=휴식 시 월드 축)에서의 회전을 왼쪽 곱 */
  rotateParentFrame(i: number, axis: THREE.Vector3, angle: number) {
    _q.setFromAxisAngle(axis, angle);
    this.localQ[i].premultiply(_q);
  }
  /** 월드 축 기준 회전을 뼈 회전에 적용 (월드 프레임 왼쪽 곱) */
  rotateWorld(i: number, axis: THREE.Vector3, angle: number) {
    _q.setFromAxisAngle(axis, angle);
    _q2.copy(this.worldQ[i]).premultiply(_q);
    this.setWorldQuat(i, _q2);
  }

  /** 뼈 i 에서 자식 c 로 향하는 현재 월드 방향 */
  dirTo(i: number, c: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.subVectors(this.worldP[c], this.worldP[i]).normalize();
  }

  /** 뼈 i 가 자식 c 를 target 방향으로 향하도록 회전 */
  aim(i: number, c: number, target: THREE.Vector3) {
    const cur = this.dirTo(i, c, _v);
    const want = _v2.subVectors(target, this.worldP[i]);
    if (want.lengthSq() < 1e-10) return;
    want.normalize();
    _q.setFromUnitVectors(cur, want);
    _q2.copy(this.worldQ[i]).premultiply(_q);
    this.setWorldQuat(i, _q2);
  }

  /** 2본 IK: a(루트) b(중간) c(끝). c 의 원점이 target 에 닿도록 a,b 회전. pole 은 관절이 꺾이는 방향 힌트(월드). */
  twoBone(a: number, b: number, c: number, target: THREE.Vector3, pole: THREE.Vector3): number {
    this.fkFrom(a);
    const A = this.worldP[a].clone();
    const l1 = this.restOffset[b].length() + this.extraOffset[b].length() * 0; // 길이는 고정
    const l2 = this.restOffset[c].length();
    const to = new THREE.Vector3().subVectors(target, A);
    let d = to.length();
    const dir = to.clone().normalize();
    const dMax = l1 + l2 - 1e-4, dMin = Math.abs(l1 - l2) + 1e-3;
    const dc = Math.min(dMax, Math.max(dMin, d));
    const cosA = (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
    if (perp.lengthSq() < 1e-8) perp.set(1, 0, 0);
    perp.normalize();
    const Bn = A.clone().add(dir.clone().multiplyScalar(l1 * cosA)).add(perp.multiplyScalar(l1 * sinA));
    const Cn = A.clone().add(dir.clone().multiplyScalar(dc));
    this.aim(a, b, Bn);
    this.aim(b, c, Cn);
    d = this.worldP[c].distanceTo(target);
    return d;
  }

  /** 뼈 i 를 두 벡터 기저로 지정: 뼈의 +Z 를 zAxis, +Y 를 가능한 한 yHint 에 맞춘다 */
  setBasis(i: number, zAxis: THREE.Vector3, yHint: THREE.Vector3) {
    const z = zAxis.clone().normalize();
    let x = new THREE.Vector3().crossVectors(yHint, z);
    if (x.lengthSq() < 1e-8) x = new THREE.Vector3().crossVectors(Y, z);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    _q.setFromRotationMatrix(m);
    this.setWorldQuat(i, _q);
  }
  /** 뼈의 +X 를 xAxis, +Y 를 yAxis (직교화) 로 */
  setBasisXY(i: number, xAxis: THREE.Vector3, yAxis: THREE.Vector3) {
    const x = xAxis.clone().normalize();
    const z = new THREE.Vector3().crossVectors(x, yAxis).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    _q.setFromRotationMatrix(m);
    this.setWorldQuat(i, _q);
  }

  /** Three 의 Bone 배열에 결과 적용 (bones 는 names 와 같은 이름의 Bone) */
  applyTo(bones: (THREE.Object3D | undefined)[]) {
    for (let i = 0; i < this.n; i++) {
      const b = bones[i];
      if (!b) continue;
      b.quaternion.copy(this.localQ[i]);
      if (i > 0) b.position.copy(this.restOffset[i]).add(this.extraOffset[i]);
    }
  }
}

export const easeInOut = (u: number) => u * u * (3 - 2 * u);
export const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
