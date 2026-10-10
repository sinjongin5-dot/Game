import * as THREE from 'three';
import { HUMAN_BONES } from '../rig/humanRig';
import { PLAYER_ATTACKS, SWORD_IDLE, sampleSword, type PlayerAttackId } from '../combat/attackData';
import { PoseRig, AXIS, easeInOut, easeOutCubic, clamp01 } from './poseRig';
import { MocapSampler, UPPER_BODY, type MocapName } from './mocap';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, x: number) => easeInOut(clamp01((x - a) / (b - a)));

/** 렌더 쪽이 시뮬레이션 상태에서 조립해 넘기는 읽기 전용 뷰 */
export interface PlayerView {
  mode: 'free' | 'attack' | 'dodge' | 'guardBreak' | 'hit' | 'heal' | 'dead' | 'victory' | 'scripted';
  modeT: number;
  attackId: PlayerAttackId | null;
  guardHeld: boolean;
  guardUp: boolean;
  guardUpT: number;
  guardImpact: number;
  moveLocal: { x: number; z: number };
  speed: number;
  running: boolean;
  healApplied: boolean;
  hitDirLocal: { x: number; z: number };
  hitHeavy: boolean;
  dodgeBackstep: boolean;
  lookYaw: number; // 사자 방향 (몸 기준 yaw, +왼쪽)
  staminaFrac: number;
  hpFrac: number;
  time: number;
  deadT: number;
  victoryT: number;
}

const HAND_OFFSET_R = new THREE.Vector3(-0.007, -0.05, 0.02);
const HAND_OFFSET_L = new THREE.Vector3(0.007, -0.05, 0.02);

export interface FootEvent { side: 'L' | 'R'; kind: 'plant' | 'lift'; x: number; z: number; strength: number }

export class GladiatorAnimator {
  readonly rig = new PoseRig(HUMAN_BONES);
  private id = (n: string) => this.rig.id(n);
  private ids = {
    hips: 0, spine1: 0, spine2: 0, chest: 0, neck: 0, head: 0,
    thighL: 0, shinL: 0, footL: 0, toeL: 0, thighR: 0, shinR: 0, footR: 0, toeR: 0,
    clavL: 0, upL: 0, foreL: 0, handL: 0, clavR: 0, upR: 0, foreR: 0, handR: 0,
  };
  // 걸음
  private phase = 0;
  private restBlend = 1;
  private lastSpeed = 0;
  private footWasStance = { L: true, R: true };
  private footPos = { L: V(0.13, 0.1, 0.12), R: V(-0.13, 0.1, -0.1) };
  private footPosFrozen = { L: V(0.13, 0.1, 0.12), R: V(-0.13, 0.1, -0.1) };
  private atk = { active: false, id: '' as string, lastT: 0, travel: 0, snapL: V(), snapR: V(), crouch: 0, planted: false };
  private smoothLean = 0;
  private smoothSide = 0;
  private breath = 0;
  /** 이번 프레임에 발생한 발 접지 이벤트 (먼지/발소리) */
  footEvents: FootEvent[] = [];
  flaskVisible = false;
  /** 모델 전체에 적용할 추가 회전/위치(구르기 등)는 hips 로 처리하므로 없음 */
  swordTipWorld = V();
  swordBaseWorld = V();

  constructor() {
    const g = this.ids;
    g.hips = this.id('hips'); g.spine1 = this.id('spine1'); g.spine2 = this.id('spine2'); g.chest = this.id('chest');
    g.neck = this.id('neck'); g.head = this.id('head');
    g.thighL = this.id('thigh_L'); g.shinL = this.id('shin_L'); g.footL = this.id('foot_L'); g.toeL = this.id('toe_L');
    g.thighR = this.id('thigh_R'); g.shinR = this.id('shin_R'); g.footR = this.id('foot_R'); g.toeR = this.id('toe_R');
    g.clavL = this.id('clavicle_L'); g.upL = this.id('upperarm_L'); g.foreL = this.id('forearm_L'); g.handL = this.id('hand_L');
    g.clavR = this.id('clavicle_R'); g.upR = this.id('upperarm_R'); g.foreR = this.id('forearm_R'); g.handR = this.id('hand_R');
  }

  reset() {
    this.phase = 0;
    this.restBlend = 1;
    this.footPos.L.set(0.13, 0.1, 0.12);
    this.footPos.R.set(-0.13, 0.1, -0.1);
    this.footPosFrozen.L.copy(this.footPos.L);
    this.footPosFrozen.R.copy(this.footPos.R);
    this.smoothLean = 0;
    this.smoothSide = 0;
    this.act = null;
    this.fade = null;
    this.guardSmooth = 0;
    this.turnT = null;
    this.swordHidden = false;
    this.atk.active = false;
  }

  // ── 하위 자세 도우미 ────────────────────────────────────────────────────────
  private setHips(y: number, pitch: number, yaw: number, roll: number) {
    const r = this.rig;
    const h = this.ids.hips;
    r.extraOffset[h].set(0, y - 0.98, 0);
    r.localQ[h].setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  }

  private spine(twist: number, lean: number, side = 0) {
    const r = this.rig;
    const { spine1, spine2, chest } = this.ids;
    const w = [0.25, 0.35, 0.4];
    [spine1, spine2, chest].forEach((b, i) => {
      r.localQ[b].setFromEuler(new THREE.Euler(lean * w[i], twist * w[i], side * w[i], 'YXZ'));
    });
  }

  private handBasisR(dir: THREE.Vector3, rollHint: THREE.Vector3): THREE.Quaternion {
    const z = dir.clone().normalize();
    let hint = rollHint.clone();
    if (Math.abs(z.y) > 0.92) hint = V(0, 0, 1).multiplyScalar(z.y > 0 ? -1 : 1);
    const x = new THREE.Vector3().crossVectors(hint, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  /** 오른손(검) 지정: fist 위치 + 칼날 방향 */
  private swordArm(fist: THREE.Vector3, dir: THREE.Vector3, rollHint = V(0, 1, 0)) {
    const r = this.rig;
    const { upR, foreR, handR } = this.ids;
    r.fk();
    const q = this.handBasisR(dir, rollHint);
    const wrist = fist.clone().sub(HAND_OFFSET_R.clone().applyQuaternion(q));
    r.twoBone(upR, foreR, handR, wrist, V(-0.5, -0.3, -1));
    r.setWorldQuat(handR, q);
  }

  /** 왼손(방패): fist 위치, 방패 법선(바깥), 위쪽 */
  private shieldArm(fist: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3) {
    const r = this.rig;
    const { upL, foreL, handL } = this.ids;
    r.fk();
    const x = normal.clone().normalize();
    const z = new THREE.Vector3().crossVectors(x, up).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const wrist = fist.clone().sub(HAND_OFFSET_L.clone().applyQuaternion(q));
    r.twoBone(upL, foreL, handL, wrist, V(0.6, -0.3, -1));
    r.setWorldQuat(handL, q);
  }

  private head(lookYaw: number, pitch: number, tilt = 0) {
    const r = this.rig;
    const y = clamp(lookYaw, -1.0, 1.0);
    r.localQ[this.ids.neck].setFromEuler(new THREE.Euler(pitch * 0.4, y * 0.45, tilt * 0.4, 'YXZ'));
    r.localQ[this.ids.head].setFromEuler(new THREE.Euler(pitch * 0.6, y * 0.55, tilt * 0.6, 'YXZ'));
  }

  // ── 걸음 ───────────────────────────────────────────────────────────────────
  private computeFeet(dt: number, vx: number, vz: number, speed: number, hipDrop: number, wide: number) {
    const idleL = V(0.14 + wide, 0.1, 0.14), idleR = V(-0.14 - wide, 0.1, -0.11);
    const moving = speed > 0.12;
    this.footEvents.length = 0;
    if (moving) {
      const dx = vx / speed, dz = vz / speed;
      const Lc = 0.95 + 0.3 * speed; // 한 주기(같은 발) 이동 거리
      const beta = clamp(0.64 - 0.045 * (speed - 1.5), 0.36, 0.66);
      this.phase = (this.phase + (speed * dt) / Lc) % 1;
      const S = beta * Lc * 0.92; // 지지 구간 이동 폭
      const h = 0.07 + 0.026 * speed;
      for (const side of ['L', 'R'] as const) {
        let ph = (this.phase + (side === 'R' ? 0.5 : 0)) % 1;
        let s: number, lift = 0, heel = 0, pitch = 0;
        const stance = ph < beta;
        if (stance) {
          const u = ph / beta;
          s = S / 2 - S * u;
          const ramp = clamp((u - 0.62) / 0.38, 0, 1);
          heel = 0.04 * ramp;
          pitch = 0.55 * ramp;
          void heel;
        } else {
          const u = (ph - beta) / (1 - beta);
          s = -S / 2 + S * easeInOut(u);
          lift = h * Math.pow(Math.sin(Math.PI * u), 0.85);
          pitch = lerp(0.5, -0.2, easeInOut(u));
        }
        const p = this.footPos[side];
        const lat = side === 'L' ? 0.115 : -0.115;
        p.set(lat + dx * s * 0.9 * (Math.abs(dx) > 0.6 ? 1 : 1) - (side === 'L' ? 1 : -1) * 0, 0.1 + lift + (stance ? 0.04 * clamp((ph / beta - 0.62) / 0.38, 0, 1) : 0), dz * s);
        // 옆 이동 시 발 간격을 약간 벌린다
        p.x += dx * s * 0.0;
        (p as any)._pitch = pitch;
        (p as any)._stance = stance;
        // 접지/이탈 이벤트
        if (stance && !this.footWasStance[side]) this.footEvents.push({ side, kind: 'plant', x: p.x, z: p.z, strength: clamp(speed / 5.6, 0.2, 1) });
        if (!stance && this.footWasStance[side]) this.footEvents.push({ side, kind: 'lift', x: p.x, z: p.z, strength: clamp(speed / 5.6, 0.2, 1) });
        this.footWasStance[side] = stance;
        this.footPosFrozen[side].copy(p);
      }
      this.restBlend = Math.max(0, this.restBlend - dt * 5);
    } else {
      this.restBlend = Math.min(1, this.restBlend + dt * 4.0);
    }
    // 정지 시 자연스러운 위치로 재배치 (한 발씩 시차를 두고)
    for (const side of ['L', 'R'] as const) {
      const delay = side === 'R' ? 0.15 : 0;
      const b = easeInOut(clamp01((this.restBlend - delay) / (1 - delay)));
      const idle = side === 'L' ? idleL : idleR;
      const frozen = this.footPosFrozen[side];
      if (!moving) {
        const p = this.footPos[side];
        p.lerpVectors(frozen, idle, b);
        p.y = 0.1 + 0.05 * Math.sin(Math.PI * b);
        (p as any)._pitch = -0.1 * Math.sin(Math.PI * b);
        (p as any)._stance = b >= 1;
        if (b >= 1 && !this.footWasStance[side]) {
          this.footEvents.push({ side, kind: 'plant', x: p.x, z: p.z, strength: 0.25 });
          this.footWasStance[side] = true;
        } else if (b < 1 && b > 0 && this.footWasStance[side]) this.footWasStance[side] = false;
      }
    }
    void hipDrop;
    this.lastSpeed = speed;
  }

  /**
   * 공격 중 발놀림: 방패 쪽(왼발)이 먼저 크게 내딛고, 몸이 그 위로 미끄러져 들어가며, 오른발이 끌려 따라온다.
   * 몸이 실제로 움직인 거리(travel)만큼 앞발을 뒤로 밀어 지면에 고정된 것처럼 보이게 한다.
   */
  private attackFeet(dt: number, v: PlayerView) {
    const def = PLAYER_ATTACKS[v.attackId!];
    const a = this.atk;
    if (!a.active || a.id !== v.attackId || v.modeT < a.lastT - 1e-4) {
      a.active = true; a.id = v.attackId!; a.travel = 0; a.planted = false;
      a.snapL.copy(this.footPos.L); a.snapR.copy(this.footPos.R);
    }
    a.lastT = v.modeT;
    a.travel += Math.max(0, v.moveLocal.z) * dt;
    const t = v.modeT;
    const ls = def.lunge.start, le = def.lunge.end;
    const reach = clamp(def.lunge.distance * 0.8, 0.18, 0.5);
    const idleL = V(0.16, 0.1, 0.14), idleR = V(-0.2, 0.1, -0.12);
    const swing = smooth(0, Math.max(0.06, ls), t); // 앞발을 내딛는 구간
    const rec = smooth(le, def.duration, t);          // 회복: 제자리로 복귀
    // 왼발(앞): 내딛기 → 착지(지면 고정) → 복귀
    const planted = t >= ls;
    // 몸이 앞발을 지나치면 발이 뒤로 빠져 보이지 않게 일정 위치에서 몸과 함께 미끄러진다
    const zPlanted = Math.max(idleL.z + reach - a.travel, idleL.z - 0.1);
    const zSwing = idleL.z + reach * swing;
    let zL = planted ? zPlanted : zSwing;
    zL = lerp(zL, idleL.z, rec);
    const yL = 0.1 + (planted ? 0 : 0.14 * Math.sin(Math.PI * swing));
    // 오른발(뒤): 끌려 따라온다 (살짝 들림)
    const follow = smooth(ls, le + 0.08, t);
    const zR = lerp(idleR.z + 0.12 * follow, idleR.z, rec);
    const yR = 0.1 + 0.05 * Math.sin(Math.PI * follow) * (1 - rec);
    const L = this.footPos.L, R = this.footPos.R;
    L.set(idleL.x, yL, zL); R.set(idleR.x, yR, zR);
    // 시작 순간에는 직전 보행 자세에서 부드럽게 이어 받는다
    const blend = smooth(0, 0.07, t);
    if (blend < 1) { L.lerpVectors(a.snapL, L, blend); R.lerpVectors(a.snapR, R, blend); }
    (L as any)._pitch = planted ? -0.05 : 0.25 * Math.sin(Math.PI * swing);
    (R as any)._pitch = 0.1;
    (L as any)._stance = planted; (R as any)._stance = true;
    // 착지 순간 발소리/먼지
    this.footEvents.length = 0;
    if (planted && !a.planted) {
      a.planted = true;
      this.footEvents.push({ side: 'L', kind: 'plant', x: L.x, z: L.z, strength: clamp(0.35 + def.lunge.distance * 0.45, 0.3, 0.8) });
    }
    this.footWasStance.L = true; this.footWasStance.R = true;
    this.footPosFrozen.L.copy(L); this.footPosFrozen.R.copy(R);
    this.restBlend = 0; // 공격이 끝나면 frozen 자세에서 기본 자세로 부드럽게 복귀
    a.crouch = smooth(ls - 0.05, le, t) * (1 - rec);
  }

  private legs(hipsY: number) {
    const r = this.rig;
    const g = this.ids;
    r.fk();
    for (const side of ['L', 'R'] as const) {
      const p = this.footPos[side] as THREE.Vector3 & { _pitch?: number };
      const thigh = side === 'L' ? g.thighL : g.thighR;
      const shin = side === 'L' ? g.shinL : g.shinR;
      const foot = side === 'L' ? g.footL : g.footR;
      const target = V(p.x, p.y, p.z);
      r.twoBone(thigh, shin, foot, target, V(side === 'L' ? 0.1 : -0.1, 0, 1));
      // 발 방향: 약간 바깥쪽 + 피치
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p._pitch ?? 0, side === 'L' ? 0.12 : -0.16, 0, 'YXZ'));
      r.setWorldQuat(foot, q);
    }
    void hipsY;
  }

  private armsDefault(t: number, speed: number, blockBlend: number) {
    // 검: 준비 자세 (살짝 흔들림), 방패: 낮은 가드
    const sway = Math.sin(this.phase * Math.PI * 2) * Math.min(1, speed / 3) * 0.05;
    const bob = Math.sin(t * 1.7) * 0.006;
    const hand = V(SWORD_IDLE.hand.x, SWORD_IDLE.hand.y + bob, SWORD_IDLE.hand.z + sway);
    const dir = V(SWORD_IDLE.dir.x, SWORD_IDLE.dir.y, SWORD_IDLE.dir.z);
    this.swordArm(hand, dir);
    const low = { f: V(0.37, 0.96 + bob, 0.2 - sway), n: V(0.92, 0.05, 0.38), u: V(0, 1, 0) };
    const high = { f: V(0.26, 1.28, 0.52), n: V(0.1, 0.08, 1), u: V(0, 1, 0.08) };
    const f = low.f.clone().lerp(high.f, blockBlend);
    const n = low.n.clone().lerp(high.n, blockBlend).normalize();
    const u = low.u.clone().lerp(high.u, blockBlend).normalize();
    this.shieldArm(f, n, u);
  }

  // ── 모션 캡처 레이어 ────────────────────────────────────────────────────────
  private samplers: Record<MocapName, MocapSampler> = {
    attack: new MocapSampler('attack'), block: new MocapSampler('block'), death: new MocapSampler('death'), sheath: new MocapSampler('sheath'), turn180: new MocapSampler('turn180'),
  };
  private act: { name: MocapName; upper: boolean; t: number; w: number } | null = null;
  private fade: { name: MocapName; upper: boolean; t: number; w: number } | null = null;
  private guardSmooth = 0;
  /** 180도 회전 연출 경과 시간 (null = 재생 안 함). 시뮬레이션 yaw 가 급격히 돌 때 렌더 쪽이 시작시킨다. */
  turnT: number | null = null;
  static readonly TURN_SPEED = 3.4;
  /** 납검이 끝나 검이 칼집에 들어간 상태 */
  swordHidden = false;

  startTurn() { if (this.turnT === null) this.turnT = 0; }

  /** 프레임 갱신: 절차적 자세를 만든 뒤 모션 캡처 레이어를 덮어쓴다 */
  update(dt: number, v: PlayerView) {
    this.poseProcedural(dt, v);
    this.applyClips(dt, v);
    this.updateSwordMarks();
  }

  private wantLayer(dt: number, v: PlayerView): { name: MocapName; upper: boolean; t: number; w: number } | null {
    const sm01 = (a: number, b: number, x: number) => easeInOut(clamp01((x - a) / (b - a)));
    if (v.mode === 'attack' && v.attackId) {
      const def = PLAYER_ATTACKS[v.attackId];
      if (def.clip) return { name: def.clip.name, upper: false, t: v.modeT * def.clip.speed, w: sm01(0, 0.07, v.modeT) };
    }
    if (v.mode === 'dead') return { name: 'death', upper: false, t: v.deadT, w: sm01(0, 0.1, v.deadT) };
    if (v.mode === 'victory' && v.victoryT > 1.5) return { name: 'sheath', upper: false, t: v.victoryT - 1.5, w: sm01(0, 0.25, v.victoryT - 1.5) };
    if (this.turnT !== null) {
      this.turnT += dt;
      const dur = this.samplers.turn180.duration / GladiatorAnimator.TURN_SPEED;
      if (this.turnT >= dur || v.mode !== 'free') this.turnT = null;
      else return { name: 'turn180', upper: false, t: this.turnT * GladiatorAnimator.TURN_SPEED, w: sm01(0, 0.05, this.turnT) * (1 - sm01(dur - 0.07, dur, this.turnT)) };
    }
    // 방어: 방패를 들어 올리는 동작을 상체에만 얹는다 (걸으면서도 방어 가능)
    const target = v.guardHeld && v.mode === 'free' ? 1 : 0;
    this.guardSmooth += clamp(target - this.guardSmooth, -dt / 0.22, dt / 0.14);
    if (this.guardSmooth > 0.01 && v.mode === 'free') {
      return { name: 'block', upper: true, t: this.guardSmooth * (this.samplers.block.duration - 1 / 30), w: Math.min(1, this.guardSmooth * 3) };
    }
    return null;
  }

  private applyClips(dt: number, v: PlayerView) {
    const want = this.wantLayer(dt, v);
    if (want) {
      if (this.act && this.act.name !== want.name) { this.fade = { ...this.act }; }
      this.act = want;
    } else if (this.act) {
      this.fade = { ...this.act };
      this.act = null;
    }
    if (this.fade) {
      // 레이어가 끝나면 마지막 자세에서 절차적 자세로 서서히 돌아온다
      this.fade.w -= dt / 0.16;
      if (this.fade.w <= 0 || (this.act && this.act.name === this.fade.name)) this.fade = null;
    }
    this.swordHidden = !!(this.act && this.act.name === 'sheath' && this.act.t > 1.0) || !!(this.fade && this.fade.name === 'sheath' && this.fade.w > 0);
    const r = this.rig;
    if (this.fade && this.fade.w > 0) this.samplers[this.fade.name].apply(r, this.fade.t, { mask: this.fade.upper ? UPPER_BODY : undefined, weight: this.fade.w });
    if (this.act && this.act.w > 0) {
      this.samplers[this.act.name].apply(r, this.act.t, { mask: this.act.upper ? UPPER_BODY : undefined, weight: this.act.w });
      // 방패에 맞은 반동: 방어 레이어 위에 가슴을 살짝 젖힌다
      if (this.act.upper && v.guardImpact > 0.01) {
        const g = this.ids;
        r.localQ[g.chest].multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-v.guardImpact * 0.22, 0, 0)));
        r.fk();
      }
    }
  }

  private poseProcedural(dt: number, v: PlayerView) {
    const r = this.rig;
    r.reset();
    this.flaskVisible = false;
    this.breath += dt * (1.1 + (1 - v.staminaFrac) * 1.4 + v.speed * 0.15);
    const breath = Math.sin(this.breath * Math.PI * 2 * 0.5);
    const g = this.ids;
    let hipsY = 0.98;
    let lookYaw = v.lookYaw;
    let guardBlend = 0;

    const gaitSpeed = v.mode === 'dead' || v.mode === 'hit' && false ? 0 : v.speed;
    const tall = 0.045; // 평소 무릎 여유 (살짝 굽힌 자세)

    switch (v.mode) {
      case 'dead': {
        this.poseDead(v);
        r.applyTo([]);
        return;
      }
      case 'dodge': {
        this.poseDodge(dt, v);
        return;
      }
      default:
        break;
    }

    // 지지 폭/자세 변화
    const guarding = v.guardHeld || v.mode === 'attack';
    const wide = guarding ? 0.03 : 0.0;
    // 보행 위상 갱신 및 발 목표
    if (v.mode === 'attack' && v.attackId && !PLAYER_ATTACKS[v.attackId].clip) this.attackFeet(dt, v);
    else {
      this.atk.active = false;
      this.computeFeet(dt, v.moveLocal.x, v.moveLocal.z, gaitSpeed, 0, wide);
    }
    const bobA = 0.018 + 0.011 * gaitSpeed;
    const bob = gaitSpeed > 0.12 ? bobA * (1 - Math.cos(this.phase * Math.PI * 4)) * 0.5 : 0;
    hipsY = 0.98 - tall - 0.02 * (guarding ? 1 : 0) - bob + breath * 0.003 - (v.mode === 'attack' ? 0.055 * this.atk.crouch : 0);
    // 지지 발이 지면 위 높이를 유지하도록 골반 높이 보정 없이 IK 가 처리
    let leanF = 0.045 + 0.016 * Math.min(gaitSpeed, 6);
    let twist = 0;
    let side = Math.sin(this.phase * Math.PI * 2) * 0.03 * Math.min(1, gaitSpeed / 3);
    const hipTwist = -Math.sin(this.phase * Math.PI * 2) * 0.12 * Math.min(1, gaitSpeed / 3);

    // 모드별 상체 처리
    const t = v.modeT;
    let handled = false;
    switch (v.mode) {
      case 'attack': {
        const def = PLAYER_ATTACKS[v.attackId!];
        const s = sampleSword(def, t);
        twist = s.twist;
        leanF += s.lean;
        this.setHips(hipsY - 0.03 * s.lean * 2, 0, hipTwist * 0.4 - s.twist * 0.18, 0);
        this.spine(twist, leanF, side);
        r.fk();
        this.swordArm(V(s.hand.x, s.hand.y, s.hand.z), V(s.dir.x, s.dir.y, s.dir.z));
        // 방패는 낮게 몸 앞에 유지
        const nBlock = v.guardHeld ? 1 : 0.0;
        this.shieldPoseLow(nBlock, v);
        handled = true;
        break;
      }
      case 'heal': {
        this.poseHeal(v, hipsY, leanF, twist, side, hipTwist);
        handled = true;
        break;
      }
      case 'guardBreak':
      case 'hit': {
        this.poseHit(v, hipsY, leanF, side, hipTwist);
        handled = true;
        break;
      }
      case 'victory': {
        this.poseVictory(v, hipsY, breath);
        handled = true;
        lookYaw = 0;
        break;
      }
      default: break;
    }
    if (!handled) {
      guardBlend = v.guardHeld ? smooth(0, 0.14, v.guardUpT) : 0;
      // 방어 충격 반응
      const imp = v.guardImpact;
      const recoil = imp * 0.14;
      this.setHips(hipsY - imp * 0.04, imp * -0.05, hipTwist, 0);
      this.spine(twist + (v.guardHeld ? 0.1 : 0) + hipTwist * -1.6, leanF * (v.guardHeld ? 1.3 : 1) - imp * 0.22 + breath * 0.008, side);
      r.fk();
      this.armsDefault(v.time, gaitSpeed, guardBlend);
      if (imp > 0.01) {
        // 방패를 뒤로 밀리게
        this.shieldArm(V(0.28, 1.3 - imp * 0.03, 0.5 - recoil), V(0.12, 0.08, 1), V(0, 1, 0.08));
      }
    }
    this.head(lookYaw, v.mode === 'victory' ? -0.25 : 0.04, 0);
    r.fk();
    this.legs(hipsY);
    // 머리 방향이 몸통 회전에 상쇄되도록
    this.updateSwordMarks();
  }

  private shieldPoseLow(block: number, v: PlayerView) {
    const f = V(0.36, 1.0, 0.24).lerp(V(0.26, 1.28, 0.52), block);
    const n = V(0.9, 0.05, 0.4).lerp(V(0.1, 0.08, 1), block).normalize();
    const imp = v.guardImpact;
    this.shieldArm(f.add(V(0, 0, -imp * 0.14)), n, V(0, 1, 0.05));
  }

  private poseHeal(v: PlayerView, hipsY: number, leanF: number, twist: number, side: number, hipTwist: number) {
    const r = this.rig;
    const t = v.modeT;
    const lift = smooth(0, 0.3, t) * (1 - smooth(0.95, 1.3, t));
    const tilt = smooth(0.25, 0.55, t) * (1 - smooth(0.78, 1.0, t));
    this.setHips(hipsY - 0.03, 0, hipTwist, 0);
    this.spine(twist, leanF * 0.5 - 0.1 * tilt, side);
    r.fk();
    this.flaskVisible = true;
    // 방패를 내리고 병을 입 쪽으로 (투구 입가 슬릿)
    const low = V(0.36, 0.95, 0.25);
    const mouth = V(0.1, 1.64, 0.2);
    const fist = low.clone().lerp(mouth, lift);
    // 병 축이 위를 향하도록 손 방향
    const n = V(0.5, 0.25, 0.7).lerp(V(0.1, 0.9, 0.4), lift).normalize();
    this.shieldArm(fist, n, V(0, 1, 0).lerp(V(-0.1, 0.1, -1), lift * 0.8));
    // 오른손: 검을 아래로 내려 둔다
    this.swordArm(V(-0.3, 0.98, 0.35), V(0.1, -0.1, 1));
    this.rig.localQ[this.ids.head].setFromEuler(new THREE.Euler(-0.3 * tilt, 0, 0));
  }

  private poseHit(v: PlayerView, hipsY: number, leanF: number, side: number, hipTwist: number) {
    const r = this.rig;
    const t = v.modeT;
    const isBreak = v.mode === 'guardBreak';
    const k = easeOutCubic(clamp01(t / 0.12)) * (1 - smooth(isBreak ? 0.55 : 0.2, isBreak ? 1.1 : 0.5, t));
    // 맞은 방향으로부터 멀어지는 쪽으로 몸이 꺾인다
    const hx = v.hitDirLocal.x, hz = v.hitDirLocal.z;
    const strength = (v.hitHeavy ? 1.0 : 0.65) * (isBreak ? 1.1 : 1);
    const lean = -hz * 0.4 * strength * k;
    const sideLean = hx * 0.3 * strength * k;
    this.setHips(hipsY - 0.05 * k, 0, 0, 0);
    this.spine(-hx * 0.35 * k, leanF * 0.3 + lean, side + sideLean);
    r.fk();
    if (isBreak) {
      // 방패가 튕겨 나가며 두 팔이 벌어진다
      this.shieldArm(V(0.6, 1.25, 0.1 + 0.3 * (1 - k)), V(0.5, 0.2, 0.7), V(0, 1, 0));
      this.swordArm(V(-0.55, 1.35, 0.1), V(-0.6, 0.3, 0.6));
    } else {
      this.shieldPoseLow(0, v);
      const s = sampleSword(PLAYER_ATTACKS.light1, 0);
      this.swordArm(V(s.hand.x - 0.1 * k, s.hand.y + 0.1 * k, s.hand.z - 0.1 * k), V(s.dir.x, s.dir.y + 0.2 * k, s.dir.z));
    }
    this.rig.localQ[this.ids.head].setFromEuler(new THREE.Euler(-lean * 0.8, 0, 0));
    void hipTwist;
  }

  private poseVictory(v: PlayerView, hipsY: number, breath: number) {
    const r = this.rig;
    const t = v.victoryT;
    // 숨 고르기: 가슴이 크게 오르내리고 어깨가 처진다
    const heave = Math.sin(t * 3.0) * 0.5 + 0.5;
    const raise = 0; // 승리 후에는 납검 모션(모션 캡처)이 이어받는다
    this.setHips(hipsY - 0.02, 0, 0, 0);
    this.spine(0, 0.12 - 0.1 * raise + heave * 0.03 * (1 - raise), 0);
    r.fk();
    this.shieldArm(V(0.34, 0.95, 0.15), V(0.9, 0.05, 0.25), V(0, 1, 0));
    const down = { f: V(-0.3, 0.95, 0.3), d: V(0.1, -0.5, 1) };
    const up = { f: V(-0.32, 1.85, 0.25), d: V(-0.1, 1, 0.2) };
    this.swordArm(down.f.clone().lerp(up.f, raise), down.d.clone().lerp(up.d, raise).normalize());
    this.rig.localQ[this.ids.head].setFromEuler(new THREE.Euler(-0.35 * raise, 0, 0));
    void breath;
  }

  private poseDodge(dt: number, v: PlayerView) {
    const r = this.rig;
    const t = v.modeT;
    const dur = 0.72;
    const g = this.ids;
    this.footEvents.length = 0;
    if (v.dodgeBackstep) {
      // 뒤로 도약: 몸을 젖히고 다리를 모은다
      const u = clamp01(t / dur);
      const hop = Math.sin(Math.PI * clamp01((t - 0.04) / 0.5));
      this.setHips(0.9 + 0.12 * hop - 0.14 * smooth(0.55, 0.72, t) * 0, -0.16 * hop, 0, 0);
      this.spine(0, -0.18 * hop + 0.12, 0);
      r.fk();
      this.shieldArm(V(0.3, 1.3, 0.5), V(0.12, 0.08, 1), V(0, 1, 0.08));
      this.swordArm(V(-0.3, 1.1, 0.4), V(0.05, 0.3, 1));
      // 다리: 공중에서 모으고 착지 시 굽힘
      const air = hop;
      this.footPos.L.set(0.12, 0.1 + 0.22 * air, 0.1 - 0.18 * air);
      this.footPos.R.set(-0.12, 0.1 + 0.18 * air, -0.08 - 0.16 * air);
      (this.footPos.L as any)._pitch = 0.4 * air; (this.footPos.R as any)._pitch = 0.4 * air;
      this.head(0, 0.1, 0);
      r.fk();
      this.legs(0.9);
      if (u > 0.74 && this.footWasStance.L === false) { /* 착지 이벤트는 아래 */ }
      this.landingEvent(t, 0.58);
      return;
    }
    // 앞구르기
    const crouch = smooth(0, 0.1, t) * (1 - smooth(0.52, 0.72, t));
    const rollU = clamp01((t - 0.1) / 0.42);
    const ang = Math.PI * 2 * easeInOut(rollU);
    const inRoll = t > 0.1 && t < 0.52 ? 1 : 0;
    const hipsY = lerp(0.98 - 0.045, 0.52, crouch) + inRoll * 0.0;
    // 구르는 동안 골반을 중심으로 회전 (피벗 높이를 낮게 유지)
    this.setHips(hipsY, ang, 0, 0);
    this.spine(0, 0.5 * crouch, 0);
    r.fk();
    this.shieldArm(V(0.2, 1.2 - 0.25 * crouch, 0.3), V(0.6, 0.1, 0.7), V(0, 1, 0));
    this.swordArm(V(-0.2, 1.0 - 0.2 * crouch, 0.25), V(0.1, 0.2, 1));
    // 다리 접기 (IK 없이 FK)
    const tuck = crouch;
    for (const s of ['L', 'R'] as const) {
      const th = s === 'L' ? g.thighL : g.thighR;
      const sh = s === 'L' ? g.shinL : g.shinR;
      r.localQ[th].setFromEuler(new THREE.Euler(-1.6 * tuck, 0, 0));
      r.localQ[sh].setFromEuler(new THREE.Euler(2.0 * tuck, 0, 0));
    }
    this.head(0, 0.3 * crouch, 0);
    r.fk();
    // 구르기를 마치고 일어날 때 다리는 IK 로 서서히 복귀
    if (t >= 0.52) {
      const k = smooth(0.52, 0.72, t);
      this.footPos.L.set(0.14, 0.1, 0.14); this.footPos.R.set(-0.14, 0.1, -0.11);
      (this.footPos.L as any)._pitch = 0; (this.footPos.R as any)._pitch = 0;
      this.legs(hipsY);
      void k;
    }
    this.landingEvent(t, 0.52);
    void dt;
  }

  private landed = false;
  private landingEvent(t: number, at: number) {
    if (t < at) { this.landed = false; return; }
    if (!this.landed) {
      this.landed = true;
      this.footEvents.push({ side: 'L', kind: 'plant', x: 0.12, z: 0.1, strength: 0.9 });
      this.footEvents.push({ side: 'R', kind: 'plant', x: -0.12, z: 0.0, strength: 0.9 });
    }
  }

  private poseDead(v: PlayerView) {
    const r = this.rig;
    const g = this.ids;
    const t = v.deadT;
    const stagger = easeOutCubic(clamp01(t / 0.45));
    const kneel = smooth(0.4, 1.1, t);
    const fall = smooth(1.0, 2.0, t);
    // 쓰러지는 동안: 무릎 → 뒤로 넘어짐
    const hipsY = lerp(0.935, 0.5, kneel) * (1 - fall) + 0.17 * fall;
    this.setHips(hipsY, -1.5 * fall, 0, 0.08 * fall);
    this.spine(0.2 * fall, -0.35 * stagger * (1 - fall) + 0.25 * kneel * (1 - fall), 0.1 * fall);
    // 다리
    const flex = kneel * (1 - fall);
    r.localQ[g.thighL].setFromEuler(new THREE.Euler(-0.2 * flex - 0.35 * fall, 0, 0.06));
    r.localQ[g.shinL].setFromEuler(new THREE.Euler(1.9 * flex + 0.7 * fall, 0, 0));
    r.localQ[g.thighR].setFromEuler(new THREE.Euler(-0.1 * flex - 1.0 * fall, 0, -0.1 * fall));
    r.localQ[g.shinR].setFromEuler(new THREE.Euler(1.7 * flex + 1.2 * fall, 0, 0));
    r.fk();
    // 팔: 늘어짐
    const slack = smooth(0.2, 0.9, t);
    this.shieldArm(V(0.4 + 0.2 * fall, lerp(1.2, 0.5, slack) - 0.3 * fall, lerp(0.35, 0.0, slack)), V(0.9, 0.2, 0.1), V(0, 1, 0));
    this.swordArm(V(-0.38 - 0.2 * fall, lerp(1.0, 0.45, slack) - 0.2 * fall, lerp(0.4, 0.1, slack)), V(0.2, -0.3, 1));
    this.rig.localQ[g.head].setFromEuler(new THREE.Euler(0.2 * fall, 0.3 * fall, 0.2 * fall));
    this.rig.localQ[g.neck].setFromEuler(new THREE.Euler(0.15 * fall, 0, 0));
    r.fk();
    this.swordTipWorld.copy(r.worldP[g.handR]);
  }

  private updateSwordMarks() {
    const r = this.rig;
    const q = r.worldQ[this.ids.handR];
    const base = r.worldP[this.ids.handR].clone().add(HAND_OFFSET_R.clone().applyQuaternion(q));
    this.swordBaseWorld.copy(base).add(V(0, 0, 0.075).applyQuaternion(q));
    this.swordTipWorld.copy(base).add(V(0, 0, 0.635).applyQuaternion(q));
  }
}
void AXIS;
