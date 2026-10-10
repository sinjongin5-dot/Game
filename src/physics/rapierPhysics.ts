import RAPIER from '@dimforge/rapier3d-compat';
import { ARENA } from '../simulation/arena';
import { TUNING } from '../simulation/tuning';
import type { V2, V3 } from '../simulation/math';
import type { CharId, Physics } from './types';

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

interface Char {
  body: RAPIER.RigidBody;
  main: RAPIER.Collider;
  extra: RAPIER.Collider[];
  kcc: RAPIER.KinematicCharacterController;
  yaw: number;
  y: number;
}

/**
 * Rapier 기반 충돌: 타원 외벽(직육면체 조각), 기둥, 문 창살(전투 중 닫힘), 캐릭터 간 충돌.
 * 캐릭터 이동은 KinematicCharacterController 로 해결한다.
 */
export class RapierPhysics implements Physics {
  readonly name = 'rapier';
  private world: RAPIER.World;
  private chars = {} as Record<CharId, Char>;
  private gateColliders: RAPIER.Collider[] = [];
  private wallColliders: RAPIER.Collider[] = [];
  private gatesClosed = false;
  private lionHandles = new Set<number>();
  private playerHandles = new Set<number>();

  static async create(): Promise<RapierPhysics> {
    await initRapier();
    return new RapierPhysics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = TUNING.dt;
    this.buildStatic();
    this.chars.player = this.makePlayer();
    this.chars.lion = this.makeLion();
    this.world.step();
  }

  private buildStatic() {
    const N = 96;
    const a = ARENA.a + 0.0, b = ARENA.b + 0.0;
    const thick = 0.7;
    // 문 구간은 건너뛴다 (남/북)
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      const tm = (t0 + t1) / 2;
      const mx = a * Math.cos(tm), mz = b * Math.sin(tm);
      const inGate = Math.abs(mx) < ARENA.gateHalfWidth + 0.2 && Math.abs(Math.abs(mz) - b) < 2;
      const p0 = { x: a * Math.cos(t0), z: b * Math.sin(t0) };
      const p1 = { x: a * Math.cos(t1), z: b * Math.sin(t1) };
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const ang = Math.atan2(p1.x - p0.x, p1.z - p0.z); // 접선 방향 yaw (z 축 기준)
      // 바깥 법선
      const nx = (b * Math.cos(tm)) / Math.hypot(b * Math.cos(tm), a * Math.sin(tm));
      const nz = (a * Math.sin(tm)) / Math.hypot(b * Math.cos(tm), a * Math.sin(tm));
      const cx = mx + nx * (thick / 2), cz = mz + nz * (thick / 2);
      const desc = RAPIER.ColliderDesc.cuboid(thick / 2, ARENA.wallHeight / 2, segLen / 2 + 0.06)
        .setTranslation(cx, ARENA.wallHeight / 2, cz)
        .setRotation(this.quatY(ang));
      const col = this.world.createCollider(desc);
      if (inGate) this.gateColliders.push(col);
      else this.wallColliders.push(col);
    }
    // 문 구간 콜라이더는 기본 비활성 (입장 연출 중 통과)
    for (const g of this.gateColliders) g.setEnabled(false);
    // 기둥
    for (const p of ARENA.pillars) {
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(p.h / 2 + 1, p.r).setTranslation(p.x, p.h / 2, p.z));
    }
    // 바닥
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0));
  }

  private quatY(yaw: number) {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  }

  private makePlayer(): Char {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.9, 0));
    const r = TUNING.player.radius;
    const main = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, r), body);
    const kcc = this.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setSlideEnabled(true);
    kcc.setApplyImpulsesToDynamicBodies(false);
    this.playerHandles.add(main.handle);
    return { body, main, extra: [], kcc, yaw: 0, y: 0.9 };
  }

  private makeLion(): Char {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.6, 5));
    // 몸통(주 충돌체) + 머리 + 엉덩이
    const main = this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.6, TUNING.arena.lionRadius * 0.9), body);
    const head = this.world.createCollider(RAPIER.ColliderDesc.ball(0.36).setTranslation(0, 0.1, 1.25), body);
    const rump = this.world.createCollider(RAPIER.ColliderDesc.ball(0.5).setTranslation(0, 0, -0.85), body);
    const kcc = this.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setSlideEnabled(true);
    this.lionHandles.add(main.handle);
    this.lionHandles.add(head.handle);
    this.lionHandles.add(rump.handle);
    return { body, main, extra: [head, rump], kcc, yaw: 0, y: 0.6 };
  }

  moveCharacter(id: CharId, pos: V2, delta: V2): V2 {
    const c = this.chars[id];
    const own = id === 'lion' ? this.lionHandles : this.playerHandles;
    // 목표 위치가 소프트 한계(타원) 바깥이면 캐릭터 컨트롤러가 벽에서 막는다.
    c.kcc.computeColliderMovement(
      c.main,
      { x: delta.x, y: 0, z: delta.z },
      undefined,
      undefined,
      (col) => !own.has(col.handle),
    );
    const m = c.kcc.computedMovement();
    const np = { x: pos.x + m.x, z: pos.z + m.z };
    c.body.setNextKinematicTranslation({ x: np.x, y: c.y, z: np.z });
    // 다음 이동 계산에 최신 위치가 반영되도록 즉시 갱신
    c.body.setTranslation({ x: np.x, y: c.y, z: np.z }, false);
    return np;
  }

  teleport(id: CharId, pos: V2, yaw: number): void {
    const c = this.chars[id];
    c.yaw = yaw;
    c.body.setTranslation({ x: pos.x, y: c.y, z: pos.z }, true);
    c.body.setRotation(this.quatY(yaw), true);
    c.body.setNextKinematicTranslation({ x: pos.x, y: c.y, z: pos.z });
    c.body.setNextKinematicRotation(this.quatY(yaw));
  }

  setYaw(id: CharId, yaw: number): void {
    const c = this.chars[id];
    c.yaw = yaw;
    c.body.setNextKinematicRotation(this.quatY(yaw));
    c.body.setRotation(this.quatY(yaw), false);
  }

  step(): void {
    this.world.step();
  }

  setGatesClosed(closed: boolean): void {
    if (closed === this.gatesClosed) return;
    this.gatesClosed = closed;
    for (const g of this.gateColliders) g.setEnabled(closed);
  }

  raycast(origin: V3, dir: V3, maxDist: number): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    // 캐릭터를 제외하고 정적 벽만 검사
    const hit = this.world.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined, (col) => !this.lionHandles.has(col.handle) && !this.playerHandles.has(col.handle));
    return hit ? hit.timeOfImpact : null;
  }

  dispose(): void {
    this.world.free();
  }
}
