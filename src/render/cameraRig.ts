import * as THREE from 'three';
import type { GameSim } from '../simulation/sim';
import { ARENA } from '../simulation/arena';
import { angleDiff, clamp, forward as fwd2 } from '../simulation/math';

export interface CameraSettings {
  sensitivity: number; // 1 = 기본
  shake: number; // 0..1
  invertY: boolean;
}

interface Shot { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

const lerp = THREE.MathUtils.lerp;
const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));

/** 3인칭 전투 카메라 + 연출 카메라 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.08, 400);
  yaw = 0;
  pitch = 0.22;
  private dist = 5.4;
  private pivot = new THREE.Vector3(0, 1.5, -8);
  private lookOffset = 0;
  private lockBlend = 0;
  private trauma = 0;
  private kickVec = new THREE.Vector3();
  private fovKick = 0;
  private rollKick = 0;
  private shakeT = 0;
  private fovCur = 58;
  private blend = 1; // 연출 → 게임플레이 블렌드 (1 = 게임플레이)
  private blendFrom: Shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 58 };
  private lastShot: Shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 58 };
  private deathT = 0;
  private victoryAng = 0;
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  /** 마지막 프레임에서 카메라가 벽에 의해 당겨졌는가 (진단용) */
  clipped = false;
  /** 진단/캡처용: 설정하면 모든 카메라 로직을 우회한다 */
  debugShot: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;

  constructor(public settings: CameraSettings) {}

  addTrauma(t: number) {
    this.trauma = Math.min(1, this.trauma + t * this.settings.shake);
  }

  /**
   * 타격 방향으로 카메라를 순간적으로 밀어 넣는다 (스프링처럼 되돌아옴).
   * dir 은 월드 방향(정규화 불필요), amount 는 미터.
   */
  kick(dir: THREE.Vector3, amount: number) {
    const k = amount * this.settings.shake;
    if (k <= 0) return;
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 1e-6) return;
    this.kickVec.addScaledVector(d.normalize(), k);
    if (this.kickVec.length() > 0.55) this.kickVec.setLength(0.55);
  }

  /** 화면 확대(+) / 축소(-) 펀치 (도 단위). 빠르게 원래 FOV 로 복귀한다. */
  punchFov(deg: number, roll = 0) {
    const k = this.settings.shake;
    this.fovKick = THREE.MathUtils.clamp(this.fovKick + deg * k, -9, 9);
    this.rollKick = THREE.MathUtils.clamp(this.rollKick + roll * k, -0.08, 0.08);
  }

  /** 씬 전환/재시작 시 카메라 상태 초기화 */
  reset(sim: GameSim) {
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 5.4;
    this.lookOffset = 0;
    this.lockBlend = 0;
    this.trauma = 0;
    this.kickVec.set(0, 0, 0);
    this.fovKick = 0;
    this.rollKick = 0;
    this.deathT = 0;
    this.victoryAng = 0;
    this.pivot.set(sim.player.pos.x, 1.5, sim.player.pos.z);
    this.blend = 1;
  }

  startBlendFromCurrent() {
    this.blendFrom.pos.copy(this.lastShot.pos);
    this.blendFrom.look.copy(this.lastShot.look);
    this.blendFrom.fov = this.lastShot.fov;
    this.blend = 0;
  }

  /** 타이틀 화면: 터널 안에서 햇빛이 드는 경기장 쪽을 본다 */
  title(t: number) {
    const drift = Math.sin(t * 0.12) * 0.25;
    const pos = new THREE.Vector3(1.05 + drift, 1.35 + Math.sin(t * 0.2) * 0.03, -18.4);
    const look = new THREE.Vector3(-0.1, 1.55, -9.0);
    this.apply({ pos, look, fov: 44 }, 0);
  }

  /** 입장 연출 */
  intro(sim: GameSim, dt: number) {
    const t = sim.introT;
    const p = sim.player.pos;
    const l = sim.lion.pos;
    let shot: Shot;
    if (t < 3.4) {
      // 터널에서 걸어 나오는 플레이어를 뒤에서 낮게 따라간다
      const u = t / 3.4;
      const pos = new THREE.Vector3(0.9 - 0.6 * u, 1.55 + 0.25 * u, p.z - 3.6 + 0.5 * u);
      const look = new THREE.Vector3(0, 1.5, p.z + 5);
      shot = { pos, look, fov: lerp(46, 56, u) };
    } else if (t < 5.8) {
      // 닫히는 창살과 문 앞의 플레이어
      const u = (t - 3.4) / 2.4;
      const pos = new THREE.Vector3(4.6 - 0.8 * u, 1.35, -5.5 + 0.4 * u);
      const look = new THREE.Vector3(lerp(0.6, 0.0, u), 1.7, ARENA.playerGate.z + (u < 0.45 ? 0 : 0) + 1);
      shot = { pos, look, fov: 52 };
      const pl = new THREE.Vector3(p.x, 1.5, p.z);
      if (u > 0.6) look.lerp(pl, (u - 0.6) * 2.5);
    } else if (t < 9.3) {
      // 맞은편 문이 열리고 사자가 걸어 나온다 (낮은 앵글)
      const u = (t - 5.8) / 3.5;
      const pos = new THREE.Vector3(lerp(-3.5, -2.2, u), 0.85, lerp(-3.2, -2.2, u));
      const lookY = lerp(1.7, 1.15, u);
      const look = new THREE.Vector3(lerp(0, l.x, 0.6 * u), lookY, lerp(ARENA.lionGate.z - 0.5, l.z, 0.75));
      shot = { pos, look, fov: lerp(40, 46, u) };
    } else {
      // 포효: 사자 정면 근접 → 플레이어 시점으로 복귀
      const u = clamp((t - 9.3) / 3, 0, 1);
      const away = new THREE.Vector3(p.x - l.x, 0, p.z - l.z).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x);
      const pos = new THREE.Vector3(l.x, 0, l.z).addScaledVector(away, 4.9 - 0.9 * u).addScaledVector(side, 1.6 - 0.8 * u);
      pos.y = lerp(1.35, 1.7, u);
      const look = new THREE.Vector3(l.x, lerp(1.3, 1.5, u), l.z);
      shot = { pos, look, fov: lerp(36, 50, u) };
    }
    this.apply(shot, dt);
  }

  /** 전투 중 카메라 */
  gameplay(sim: GameSim, look: { dx: number; dy: number }, dt: number, raycast: (o: THREE.Vector3, d: THREE.Vector3, max: number) => number | null, controlEnabled: boolean) {
    const p = sim.player;
    const l = sim.lion;
    const s = this.settings;
    const lock = p.lockOn && l.mode !== 'dead' && l.mode !== 'dying';
    this.lockBlend = damp(this.lockBlend, lock ? 1 : 0, 5, dt);

    if (controlEnabled) {
      const k = 0.0022 * s.sensitivity;
      if (lock) {
        this.lookOffset = clamp(this.lookOffset + look.dx * k * 0.5, -0.6, 0.6);
      } else {
        this.yaw -= look.dx * k;
        this.pitch = clamp(this.pitch + look.dy * k * (s.invertY ? -1 : 1), -0.45, 1.0);
      }
    }
    if (lock) {
      const toLion = Math.atan2(l.pos.x - p.pos.x, l.pos.z - p.pos.z);
      this.yaw += angleDiff(toLion + this.lookOffset, this.yaw) * (1 - Math.exp(-7 * dt));
      this.lookOffset = damp(this.lookOffset, 0, 0.9, dt);
    } else {
      this.lookOffset = damp(this.lookOffset, 0, 3, dt);
    }
    const sep = Math.hypot(l.pos.x - p.pos.x, l.pos.z - p.pos.z);
    // 목표 거리/피치: 락온 시 사자와 함께 프레임에 들어오게
    const close = clamp((7 - sep) / 4.5, 0, 1); // 가까울수록 높이 들어 올려 사자가 플레이어에 가려지지 않게
    const lockDist = clamp(4.6 + 0.28 * Math.max(0, sep - 3), 4.6, 8.2) + 0.5 * close;
    const lockPitch = clamp(0.15 + 0.11 * close + 0.004 * sep, 0.15, 0.4);
    const targetDist = lerp(5.0, lockDist, this.lockBlend);
    const targetPitch = lerp(this.pitch, lockPitch, this.lockBlend);

    // 피벗 (플레이어 가슴 높이), 약간의 지연
    const py = 1.5 - (p.mode === 'dead' ? 0.9 : 0);
    this.pivot.x = damp(this.pivot.x, p.pos.x, 22, dt);
    this.pivot.z = damp(this.pivot.z, p.pos.z, 22, dt);
    this.pivot.y = damp(this.pivot.y, py, 8, dt);

    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-f.z, 0, f.x); // 카메라 오른쪽
    // 가까이 붙을수록 카메라를 오른쪽 어깨 너머로 빼서, 플레이어 몸에 사자의 준비 동작이 가려지지 않게 한다
    const shoulder = 0.62 + 1.25 * this.lockBlend * clamp((6.5 - sep) / 4, 0, 1);
    const dir = new THREE.Vector3(-f.x * Math.cos(targetPitch), Math.sin(targetPitch), -f.z * Math.cos(targetPitch));
    const origin = this.pivot.clone().addScaledVector(right, shoulder * 0.55);
    // 벽 충돌: 피벗에서 목표 위치까지 레이캐스트
    const wantDist = targetDist;
    const hit = raycast(origin, dir, wantDist + 0.35);
    let allowed = wantDist;
    this.clipped = false;
    if (hit !== null && hit < wantDist + 0.35) {
      allowed = Math.max(1.5, hit - 0.35);
      this.clipped = allowed < wantDist - 0.02;
    }
    // 가까워질 땐 빠르게, 멀어질 땐 천천히 (부드러운 복귀)
    this.dist = allowed < this.dist ? damp(this.dist, allowed, 28, dt) : damp(this.dist, allowed, 2.4, dt);
    const pos = origin.clone().addScaledVector(dir, this.dist).addScaledVector(right, shoulder * 0.45);
    // 항상 아레나 안쪽 + 바닥 위
    pos.y = Math.max(0.5, pos.y);
    // 시선 목표
    const chest = new THREE.Vector3(p.pos.x, 1.45, p.pos.z);
    const lionChest = new THREE.Vector3(l.pos.x, 1.0 + l.y * 0.6, l.pos.z);
    const lookT = chest.clone().lerp(lionChest, 0.62 * this.lockBlend);
    lookT.addScaledVector(right, 0.5 * (1 - this.lockBlend));
    lookT.y += (1 - this.lockBlend) * 0.1;
    this.tmpLook.copy(lookT);
    this.tmpPos.copy(pos);
    // 사망/승리 연출
    if (p.mode === 'dead' || sim.phase === 'playerDead') {
      this.deathT += dt;
      const u = clamp(this.deathT / 3, 0, 1);
      this.tmpPos.y += u * 1.6;
      this.tmpPos.addScaledVector(dir, -0.6 * u);
      this.tmpLook.y = lerp(this.tmpLook.y, 0.6, u);
    } else this.deathT = 0;
    let fov = 54 + (p.running ? 2.5 * (s.shake > 0 ? 1 : 0) : 0) - this.lockBlend * 2;
    if (sim.phase === 'victory') {
      this.victoryAng += dt * 0.18;
      const r = 6.2;
      const c = new THREE.Vector3(p.pos.x, 0, p.pos.z);
      this.tmpPos.set(c.x + Math.sin(this.yaw + this.victoryAng + Math.PI) * r, 1.9 + 0.5 * Math.sin(this.victoryAng * 2), c.z + Math.cos(this.yaw + this.victoryAng + Math.PI) * r);
      // 항상 경기장 안쪽에서 바라보게 한다 (벽/터널 뒤로 넘어가지 않도록)
      const qx = this.tmpPos.x / (ARENA.a - 2.2), qz = this.tmpPos.z / (ARENA.b - 2.2);
      const q = Math.hypot(qx, qz);
      if (q > 1) { this.tmpPos.x /= q; this.tmpPos.z /= q; }
      this.tmpLook.set(c.x, 1.3, c.z);
      fov = 50;
    }
    this.fovCur = damp(this.fovCur, fov, 4, dt);
    const shot: Shot = { pos: this.tmpPos, look: this.tmpLook, fov: this.fovCur };
    this.apply(shot, dt);
  }

  private apply(shot: Shot, dt: number) {
    if (this.debugShot) shot = this.debugShot;
    // 연출 → 게임플레이 블렌드
    let pos = shot.pos, look = shot.look, fov = shot.fov;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.9);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      pos = this.blendFrom.pos.clone().lerp(shot.pos, k);
      look = this.blendFrom.look.clone().lerp(shot.look, k);
      fov = lerp(this.blendFrom.fov, shot.fov, k);
    }
    this.lastShot.pos.copy(pos);
    this.lastShot.look.copy(look);
    this.lastShot.fov = fov;
    // 흔들림
    this.shakeT += dt;
    const tr = this.trauma * this.trauma;
    const sx = (Math.sin(this.shakeT * 53.0) + Math.sin(this.shakeT * 31.7 + 1.3)) * 0.5;
    const sy = (Math.sin(this.shakeT * 47.0 + 2.1) + Math.sin(this.shakeT * 27.3)) * 0.5;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const c = this.camera;
    c.position.copy(pos);
    c.position.x += sx * tr * 0.12;
    c.position.y += sy * tr * 0.1;
    // 타격 킥: 스프링처럼 빠르게 복귀
    c.position.add(this.kickVec);
    this.kickVec.multiplyScalar(Math.exp(-11 * dt));
    this.fovKick *= Math.exp(-9 * dt);
    this.rollKick *= Math.exp(-8 * dt);
    c.lookAt(look);
    c.rotateZ(sx * tr * 0.025 + this.rollKick);
    const fovOut = fov - this.fovKick;
    if (Math.abs(c.fov - fovOut) > 0.01) {
      c.fov = fovOut;
      c.updateProjectionMatrix();
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 카메라 전방(수평) 방향 yaw (sim 입력용) */
  get forwardYaw() { return this.yaw; }
}
void fwd2;
