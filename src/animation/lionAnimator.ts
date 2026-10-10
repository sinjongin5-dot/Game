import * as THREE from 'three';
import { LION_BONES } from '../rig/lionRig';
import { LION_ATTACKS, sampleLionPath, type LionAttackId } from '../combat/attackData';
import { PoseRig, easeInOut, easeOutCubic, clamp01 } from './poseRig';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const sm = (a: number, b: number, x: number) => easeInOut(clamp01((x - a) / (b - a)));
const E = (x: number, y: number, z: number) => new THREE.Euler(x, y, z, 'YXZ');

export interface LionView {
  mode: 'dormant' | 'enter' | 'roar' | 'idle' | 'circle' | 'approach' | 'attack' | 'recover' | 'stagger' | 'stunned' | 'dying' | 'dead' | 'victory';
  modeT: number;
  attackId: LionAttackId | null;
  attackT: number;
  mirror: boolean;
  speed: number;
  moveLocal: { x: number; z: number };
  turnRate: number;
  y: number;
  lookYaw: number;
  flinch: number;
  flinchDirLocal: { x: number; z: number };
  landed: number;
  deadT: number;
  time: number;
  phase: 1 | 2;
  chargeBraking: boolean;
  chargeSpeed: number;
  hpFrac: number;
}

export interface LionFootEvent { foot: 'LF' | 'RF' | 'LH' | 'RH'; kind: 'plant' | 'lift'; x: number; z: number; strength: number }

type FootKey = 'LF' | 'RF' | 'LH' | 'RH';
const FEET: FootKey[] = ['LF', 'RF', 'LH', 'RH'];

interface Foot {
  p: THREE.Vector3;
  frozen: THREE.Vector3;
  stance: boolean;
  was: boolean;
  pitch: number; // 앞발: 발 아래 방향 보정 / 뒷발: 중족골 각도
  swing: number; // 0 지지, 1 공중
  u: number;
}

const NEUTRAL: Record<FootKey, THREE.Vector3> = {
  LF: V(0.2, 0.055, 0.64), RF: V(-0.2, 0.055, 0.64), LH: V(0.22, 0.045, -0.7), RH: V(-0.22, 0.045, -0.7),
};

export class LionAnimator {
  readonly rig = new PoseRig(LION_BONES);
  private b = {
    pelvis: 0, spine1: 0, spine2: 0, neck1: 0, neck2: 0, head: 0, jaw: 0, earL: 0, earR: 0,
    tail: [] as number[],
  };
  private leg = {} as Record<FootKey, number[]>; // [scap?, arm/thigh, fore/knee, paw/hock, toe/hpaw, htoe]
  private feet = {} as Record<FootKey, Foot>;
  private phase = 0;
  private restBlend = 1;
  private breath = 0;
  footEvents: LionFootEvent[] = [];
  private gaitSpeed = 0;
  private prevSkip: { foot: FootKey; target: THREE.Vector3; age: number } | null = null;
  /** 머리 위치(월드 전 모델 공간) — 디버그/판정 비교용 */
  headPos = V();
  pawPos = V();
  jawOpen = 0;
  roarIntensity = 0;
  /** 포효/갈기 흔들림 강도 (셰이더 유니폼) */
  maneShake = 0;

  constructor() {
    const r = this.rig;
    this.b.pelvis = r.id('pelvis'); this.b.spine1 = r.id('spine1'); this.b.spine2 = r.id('spine2');
    this.b.neck1 = r.id('neck1'); this.b.neck2 = r.id('neck2'); this.b.head = r.id('head'); this.b.jaw = r.id('jaw');
    this.b.earL = r.id('ear_L'); this.b.earR = r.id('ear_R');
    this.b.tail = [1, 2, 3, 4, 5].map((i) => r.id(`tail${i}`));
    for (const s of ['L', 'R']) {
      this.leg[`${s}F` as FootKey] = [r.id(`scap_${s}`), r.id(`arm_${s}`), r.id(`fore_${s}`), r.id(`paw_${s}`), r.id(`toe_${s}`)];
      this.leg[`${s}H` as FootKey] = [-1, r.id(`thigh_${s}`), r.id(`knee_${s}`), r.id(`hock_${s}`), r.id(`hpaw_${s}`), r.id(`htoe_${s}`)];
    }
    for (const k of FEET) {
      this.feet[k] = { p: NEUTRAL[k].clone(), frozen: NEUTRAL[k].clone(), stance: true, was: true, pitch: 0, swing: 0, u: 0 };
    }
  }

  reset() {
    this.phase = 0;
    this.restBlend = 1;
    for (const k of FEET) {
      this.feet[k].p.copy(NEUTRAL[k]);
      this.feet[k].frozen.copy(NEUTRAL[k]);
      this.feet[k].stance = true;
      this.feet[k].was = true;
    }
  }

  // ── 보행 ────────────────────────────────────────────────────────────────────
  private gait(dt: number, vx: number, vz: number, speed: number, turnRate: number) {
    this.footEvents.length = 0;
    let sp = speed;
    let dirx = 0, dirz = 1;
    if (speed > 0.15) { dirx = vx / speed; dirz = vz / speed; }
    else if (Math.abs(turnRate) > 0.35) sp = Math.min(1.0, Math.abs(turnRate) * 0.55);
    const moving = sp > 0.15;
    this.gaitSpeed = sp;
    if (moving) {
      const tTrot = sm(2.7, 4.2, sp), tGal = sm(6.5, 9.0, sp);
      const Lc = lerp(lerp(1.5 + 0.12 * sp, 2.4, tTrot), 4.2, tGal);
      const beta = lerp(lerp(0.7, 0.52, tTrot), 0.33, tGal);
      const off: Record<FootKey, number> = {
        LH: 0,
        LF: lerp(lerp(0.25, 0.5, tTrot), 0.52, tGal),
        RH: lerp(lerp(0.5, 0.5, tTrot), 0.1, tGal),
        RF: lerp(lerp(0.75, 0.0, tTrot), 0.62, tGal),
      };
      this.phase = (this.phase + (sp * dt) / Lc) % 1;
      const S = beta * Lc * 0.9;
      const hLift = lerp(lerp(0.09, 0.15, tTrot), 0.2, tGal);
      for (const k of FEET) {
        const f = this.feet[k];
        const ph = (this.phase + off[k]) % 1;
        const stance = ph < beta;
        let s: number, lift = 0, pitch = 0;
        if (stance) {
          const u = ph / beta;
          s = S / 2 - S * u;
          pitch = clamp((u - 0.6) / 0.4, 0, 1);
          f.u = u;
        } else {
          const u = (ph - beta) / (1 - beta);
          s = -S / 2 + S * easeInOut(u);
          lift = hLift * Math.pow(Math.sin(Math.PI * u), 0.9);
          pitch = 1 - u * 0.3;
          f.u = u;
        }
        const n = NEUTRAL[k];
        f.p.set(n.x + dirx * s * 0.9, n.y + lift + (stance ? 0.012 * pitch : 0), n.z + dirz * s);
        f.pitch = pitch;
        f.swing = stance ? 0 : 1;
        f.stance = stance;
        if (stance && !f.was) this.footEvents.push({ foot: k, kind: 'plant', x: f.p.x, z: f.p.z, strength: clamp(sp / 8, 0.15, 1) });
        if (!stance && f.was) this.footEvents.push({ foot: k, kind: 'lift', x: f.p.x, z: f.p.z, strength: clamp(sp / 8, 0.15, 1) });
        f.was = stance;
        f.frozen.copy(f.p);
      }
      this.restBlend = Math.max(0, this.restBlend - dt * 4);
    } else {
      this.restBlend = Math.min(1, this.restBlend + dt * 3.0);
      const order: FootKey[] = ['LH', 'RF', 'RH', 'LF'];
      order.forEach((k, i) => {
        const f = this.feet[k];
        const delay = i * 0.14;
        const b = easeInOut(clamp01((this.restBlend - delay) / (1 - delay * 1.2)));
        f.p.lerpVectors(f.frozen, NEUTRAL[k], b);
        f.p.y = NEUTRAL[k].y + 0.07 * Math.sin(Math.PI * b);
        f.swing = b < 1 && b > 0 ? 1 : 0;
        f.pitch = Math.sin(Math.PI * b);
        f.stance = b >= 1;
        if (b >= 1 && !f.was) { f.was = true; this.footEvents.push({ foot: k, kind: 'plant', x: f.p.x, z: f.p.z, strength: 0.2 }); }
        if (b < 1 && b > 0) f.was = false;
      });
    }
  }

  // ── 다리 IK ──────────────────────────────────────────────────────────────────
  private foreLeg(k: 'LF' | 'RF', toe: THREE.Vector3, pitch: number, scapLift = 0) {
    const r = this.rig;
    const [scap, arm, fore, paw, toeB] = this.leg[k];
    const s = k === 'LF' ? 1 : -1;
    // 어깨뼈: 발이 앞이면 앞으로, 뒤면 뒤로 구르며 굴곡 + 외부 요청 lift
    const zNorm = clamp((toe.z - NEUTRAL[k].z) / 0.5, -1, 1);
    r.localQ[scap].setFromEuler(E(-0.22 * zNorm - scapLift, 0, 0));
    r.fkFrom(scap);
    // 손목 위치: 발끝에서 발 방향 반대로
    const down = V(0, -0.78 + 0.35 * pitch, 0.62 - 0.55 * pitch).normalize();
    const wrist = toe.clone().sub(down.multiplyScalar(0.188));
    r.twoBone(arm, fore, paw, wrist, V(s * 0.25, 0, -1));
    r.aim(paw, toeB, toe);
  }

  private hindLeg(k: 'LH' | 'RH', toe: THREE.Vector3, swingLift: number, extra = 0) {
    const r = this.rig;
    const [, thigh, knee, hock, hpaw, htoe] = this.leg[k];
    const s = k === 'LH' ? 1 : -1;
    const P = toe.clone().add(V(0, 0.025, -0.1)); // hpaw 위치
    const alpha = 0.57 + 0.45 * swingLift + extra; // 중족골 기울기 (수직 대비, 뒤로)
    const m = 0.333;
    const Hk = P.clone().add(V(0, Math.cos(alpha) * m, -Math.sin(alpha) * m));
    r.twoBone(thigh, knee, hock, Hk, V(s * 0.15, 0.1, 1));
    r.aim(hock, hpaw, P);
    r.aim(hpaw, htoe, toe);
  }

  // ── 자세 도우미 ──────────────────────────────────────────────────────────────
  private body(o: { drop?: number; pelvisPitch?: number; s1?: number; s2?: number; n1?: number; n2?: number; head?: number; twist?: number; roll?: number; yawPelvis?: number }) {
    const r = this.rig;
    const b = this.b;
    r.extraOffset[b.pelvis].set(0, -(o.drop ?? 0.045), 0);
    r.localQ[b.pelvis].setFromEuler(E(o.pelvisPitch ?? 0, o.yawPelvis ?? 0, o.roll ?? 0));
    const tw = o.twist ?? 0;
    r.localQ[b.spine1].setFromEuler(E(o.s1 ?? 0, tw * 0.5, 0));
    r.localQ[b.spine2].setFromEuler(E(o.s2 ?? 0, tw * 0.5, 0));
    r.localQ[b.neck1].setFromEuler(E(o.n1 ?? 0, 0, 0));
    r.localQ[b.neck2].setFromEuler(E(o.n2 ?? 0, 0, 0));
    r.localQ[b.head].setFromEuler(E(o.head ?? 0, 0, 0));
  }

  private lookAt(yaw: number, w = 1) {
    const r = this.rig;
    const y = clamp(yaw, -1.2, 1.2) * w;
    const b = this.b;
    const mul = (id: number, ky: number) => {
      const q = new THREE.Quaternion().setFromEuler(E(0, y * ky, 0));
      r.localQ[id].premultiply(q);
    };
    mul(b.neck1, 0.28); mul(b.neck2, 0.38); mul(b.head, 0.34);
  }

  private tailWave(t: number, speed: number, curl = 0, raise = 0) {
    const r = this.rig;
    const A = 0.14 + Math.min(speed, 9) * 0.02;
    this.b.tail.forEach((id, i) => {
      const w = Math.sin(t * (2.0 + speed * 0.5) - i * 0.9) * A * (0.6 + i * 0.25);
      const drop = i === 0 ? 0.0 : -0.04;
      r.localQ[id].setFromEuler(E(raise * (i === 0 ? 1 : 0.4) + drop - curl * 0.08 * i, w, 0));
    });
  }

  private jaw(open: number) {
    this.jawOpen = open;
    this.rig.localQ[this.b.jaw].setFromEuler(E(open, 0, 0));
  }

  private ears(back: number, t: number) {
    const tw = Math.sin(t * 6.0) * 0.05 * (1 - back);
    this.rig.localQ[this.b.earL].setFromEuler(E(-0.1 + back * 0.55 + tw, 0.35 * back, -0.15 * back));
    this.rig.localQ[this.b.earR].setFromEuler(E(-0.1 + back * 0.55 - tw, -0.35 * back, 0.15 * back));
  }

  private applyFeetDefault(skip?: FootKey | FootKey[]) {
    const skips = Array.isArray(skip) ? skip : skip ? [skip] : [];
    for (const k of FEET) {
      if (skips.includes(k)) continue;
      const f = this.feet[k];
      if (k === 'LF' || k === 'RF') this.foreLeg(k, f.p, f.pitch);
      else this.hindLeg(k, f.p, f.swing * (0.6 + 0.4 * f.pitch));
    }
  }

  // ── 메인 ────────────────────────────────────────────────────────────────────
  update(dt: number, v: LionView) {
    const r = this.rig;
    r.reset();
    this.breath += dt * (1.0 + (1 - v.hpFrac) * 0.6 + v.speed * 0.08);
    const breath = Math.sin(this.breath * Math.PI * 2 * 0.55);
    this.jawOpen = 0;
    this.roarIntensity = 0;
    this.maneShake = 0;
    r.fk();

    if (v.mode === 'dying' || v.mode === 'dead') {
      this.footEvents.length = 0;
      this.poseDeath(v);
      return;
    }

    const t = v.time;
    const tail = { curl: 0, raise: 0 };
    let earsBack = 0.15;
    let jaw = 0;
    let lookW = 1;
    let drop = 0.045;
    let pelvisPitch = 0, s1 = 0, s2 = 0, n1 = 0, n2 = 0, hd = 0, twist = 0, roll = 0;
    let skipFoot: FootKey | null = null;
    let skipFootTarget: THREE.Vector3 | null = null;
    let skipFootPitch = 0.4;
    let scapLift = 0;
    let airborne = false;
    let rootY = 0;
    let front: { LF: THREE.Vector3; RF: THREE.Vector3; pitch: number; lift: number } | null = null;
    let airReach = 1;
    let airU = 0;

    // 보행/휴식 (공중이 아니면)
    const mv = v.moveLocal;
    const inLeap = v.mode === 'attack' && ((v.attackId === 'pounce' && v.attackT >= 0.95 && v.attackT < 1.5) || (v.attackId === 'backHop' && v.attackT >= 0.08 && v.attackT < 0.6));
    if (!inLeap) this.gait(dt, mv.x, mv.z, v.speed, v.turnRate);
    else this.footEvents.length = 0;
    const spd = this.gaitSpeed;
    const tTrot = sm(2.7, 4.2, spd), tGal = sm(6.5, 9, spd);

    // 걷기 중 몸의 움직임
    if (spd > 0.15) {
      const w = this.phase * Math.PI * 2;
      s1 += Math.sin(w * 2 + 0.6) * (0.015 + 0.03 * tTrot + 0.12 * tGal);
      s2 += Math.sin(w * 2 + 1.2) * (0.015 + 0.03 * tTrot + 0.12 * tGal);
      pelvisPitch += Math.sin(w * 2 + 0.2) * (0.012 + 0.03 * tTrot + 0.1 * tGal);
      drop += 0.006 * Math.sin(w * 2) + 0.05 * tGal;
      twist += Math.sin(w) * (0.04 + 0.03 * tTrot);
      n1 += -Math.sin(w * 2 + 0.6) * 0.03 * (1 + tGal);
      roll += Math.sin(w) * 0.02;
    }
    // 앞으로 전진하며 머리를 낮게 (circle: 경계 자세)
    if (v.mode === 'circle' || v.mode === 'approach') {
      n1 += 0.12; n2 += 0.1; hd += 0.05;
      s2 += 0.05;
      earsBack = 0.5;
    }
    if (v.mode === 'idle' || v.mode === 'recover') {
      n1 += 0.05 + breath * 0.012; earsBack = 0.25;
    }
    // 선회 시 몸이 기울어짐
    roll += clamp(v.turnRate * 0.035, -0.07, 0.07);
    twist += clamp(v.turnRate * -0.05, -0.12, 0.12);

    switch (v.mode) {
      case 'enter': {
        n1 += 0.1; n2 += 0.05; earsBack = 0.35;
        break;
      }
      case 'roar': {
        const T = v.modeT;
        const up = sm(0.15, 0.6, T) * (1 - sm(1.85, 2.2, T));
        const shake = Math.sin(T * 46) * 0.012 * up;
        jaw = 0.72 * up;
        n1 = -0.35 * up; n2 = -0.28 * up; hd = -0.25 * up;
        s2 += -0.12 * up + breath * 0.01; pelvisPitch += 0.06 * up;
        drop += 0.02 * up;
        s1 += shake; earsBack = 0.9;
        this.roarIntensity = up;
        this.maneShake = up;
        // 앞발을 단단히 버팀 (발 간격 조금 넓힘)
        break;
      }
      case 'stagger':
      case 'stunned': {
        const T = v.modeT;
        const hit = easeOutCubic(clamp01(T / 0.18));
        const shake = Math.sin(T * 14) * 0.28 * Math.exp(-T * 1.2);
        n1 = -0.1 * hit + 0.1; n2 = 0.15; hd = 0.2 * hit;
        pelvisPitch = -0.1 * hit; s2 = -0.12 * hit;
        drop += 0.06 * hit;
        twist += shake * 0.4;
        earsBack = 0.9;
        this.rig.fk();
        this.lookAt(shake * 1.6, 1);
        lookW = 0;
        if (v.mode === 'stunned') { s2 += 0.15; n1 += 0.25; }
        break;
      }
      case 'victory': {
        n1 += 0.0; earsBack = 0.2;
        break;
      }
      case 'attack': {
        const res = this.attackPose(v, { skip: null });
        pelvisPitch += res.pelvisPitch; s1 += res.s1; s2 += res.s2; n1 += res.n1; n2 += res.n2; hd += res.head; twist += res.twist; roll += res.roll;
        drop = res.drop ?? drop;
        jaw = res.jaw;
        earsBack = res.ears;
        lookW = res.lookW;
        skipFoot = res.skipFoot; skipFootTarget = res.skipTarget; skipFootPitch = res.skipPitch;
        scapLift = res.scapLift;
        airborne = res.airborne;
        rootY = res.rootY;
        front = res.front;
        airReach = res.airReach;
        airU = res.airU;
        if (res.tailRaise) tail.raise = res.tailRaise;
        this.maneShake = res.mane;
        if (res.headTarget) { this.headIK(res.headTarget, res.headBlend); }
        break;
      }
      default: break;
    }

    // 경직/가벼운 피격
    if (v.flinch > 0.01) {
      const f = v.flinch;
      s2 += -0.12 * f; n1 += 0.08 * f; hd += 0.12 * f;
      twist += v.flinchDirLocal.x * 0.15 * f;
      drop += 0.03 * f;
    }
    // 착지 충격
    if (v.landed > 0.01) { drop += 0.12 * v.landed; s2 += 0.1 * v.landed; n1 += 0.1 * v.landed; }

    // 몸 적용
    const pivotLift = rootY;
    this.body({ drop: drop - pivotLift, pelvisPitch, s1, s2, n1, n2, head: hd, twist, roll });
    r.fk();
    if (lookW > 0) this.lookAt(v.lookYaw, lookW);
    this.jaw(jaw);
    this.ears(earsBack, t);
    this.tailWave(t, spd, tail.curl, tail.raise);
    r.fk();
    // 다리
    if (airborne) {
      this.airLegs(airU, airReach);
    } else if (front) {
      this.applyFeetDefault(['LF', 'RF']);
      this.foreLeg('LF', front.LF, front.pitch, front.lift);
      this.foreLeg('RF', front.RF, front.pitch, front.lift);
    } else {
      this.applyFeetDefault(skipFoot ?? undefined);
      // 앞발이 바뀌는 순간 이전 앞발이 튀지 않도록 짧게 원위치로 풀어 준다
      if (this.prevSkip && this.prevSkip.foot !== skipFoot) {
        const ps = this.prevSkip;
        ps.age += dt;
        if (ps.age < 0.16) {
          const u = easeInOut(clamp01(ps.age / 0.16));
          const rest = this.feet[ps.foot].p;
          this.foreLeg(ps.foot as 'LF' | 'RF', ps.target.clone().lerp(rest, u), 0.3, 0.2 * (1 - u));
        } else this.prevSkip = null;
      }
      if (skipFoot && skipFootTarget) {
        const hind = skipFoot === 'LH' || skipFoot === 'RH';
        if (hind) this.hindLeg(skipFoot as 'LH' | 'RH', skipFootTarget, 0.8);
        else {
          this.foreLeg(skipFoot as 'LF' | 'RF', skipFootTarget, skipFootPitch, scapLift);
          if (!this.prevSkip || this.prevSkip.foot === skipFoot) this.prevSkip = { foot: skipFoot, target: skipFootTarget.clone(), age: 0 };
        }
      } else if (this.prevSkip && this.prevSkip.age >= 0.16) this.prevSkip = null;
    }
    r.fk();
    this.headPos.copy(r.worldP[this.b.head]);
  }

  /** 머리 목표 위치로 목 체인을 구부린다 (머리 뼈 원점이 닿도록) */
  private headIK(target: THREE.Vector3, blend: number) {
    const r = this.rig;
    const b = this.b;
    r.fk();
    // 가슴-목 전체를 숙여서 근접시키고 마지막은 2본 IK
    const base = r.worldP[b.neck1];
    const reach = r.restOffset[b.neck2].length() + r.restOffset[b.head].length();
    const tv = target.clone().sub(base);
    const dist = tv.length();
    if (dist > reach * 0.98) {
      // spine2 를 목표 쪽으로 기울여 목 뿌리를 가까이
      const pivot = r.worldP[b.spine1];
      const cur = base.clone().sub(pivot);
      const want = target.clone().sub(pivot);
      const extra = clamp((dist - reach * 0.98) / Math.max(cur.length(), 0.01), 0, 0.6);
      const ang = Math.atan2(want.y, want.z) - Math.atan2(cur.y, cur.z);
      r.localQ[b.spine2].multiply(new THREE.Quaternion().setFromEuler(E(-ang * extra * blend, 0, 0)));
      r.fkFrom(b.spine2);
    }
    r.twoBone(b.neck1, b.neck2, b.head, target.clone().lerp(r.worldP[b.head], 1 - blend), V(0, 1, 0.1));
  }

  private airLegs(u: number, reachScale = 1) {
    const reach = Math.sin(Math.PI * Math.min(1, clamp01(u) * 1.1)) * reachScale;
    const fz = lerp(0.65, 1.1, reach), fy = lerp(0.08, 0.5, reach * 0.9);
    const hz = lerp(-0.7, -1.0, reach), hy = lerp(0.08, 0.38, reach * 0.9);
    this.foreLeg('LF', V(0.2, fy, fz), 0.4, 0.2 * reach);
    this.foreLeg('RF', V(-0.2, fy, fz), 0.4, 0.2 * reach);
    this.hindLeg('LH', V(0.22, hy, hz), 1, 0.15);
    this.hindLeg('RH', V(-0.22, hy, hz), 1, 0.15);
  }

  private attackPose(v: LionView, _o: { skip: null }) {
    const id = v.attackId!;
    const def = LION_ATTACKS[id];
    const t = v.attackT;
    const out = {
      pelvisPitch: 0, s1: 0, s2: 0, n1: 0, n2: 0, head: 0, twist: 0, roll: 0, jaw: 0, ears: 0.3, lookW: 1,
      skipFoot: null as FootKey | null, skipTarget: null as THREE.Vector3 | null, skipPitch: 0.4, scapLift: 0,
      airborne: false, rootY: 0, drop: undefined as number | undefined, tailRaise: 0, mane: 0,
      headTarget: null as THREE.Vector3 | null, headBlend: 1,
      front: null as null | { LF: THREE.Vector3; RF: THREE.Vector3; pitch: number; lift: number }, airReach: 1, airU: 0,
    };
    const wind = clamp01(t / def.windup);
    switch (id) {
      case 'flurry': {
        // 오른발 → 왼발 → 오른발. 타마다 앞발을 번갈아 휘두르고 몸통을 반대로 비튼다
        const m = v.mirror;
        const wins = def.windows!;
        let idx = wins.findIndex(([, we]) => t < we + 0.12);
        if (idx < 0) idx = wins.length - 1;
        const sideR = (idx % 2 === 0) !== m;
        const paw = sampleLionPath(def, t, m);
        out.skipFoot = sideR ? 'RF' : 'LF';
        out.skipTarget = V(paw.x + (sideR ? -0.02 : 0.02), Math.max(0.055, paw.y), paw.z);
        out.skipPitch = 0.25;
        const [ws, we] = wins[idx];
        const prep = sm(Math.max(0, ws - 0.5), ws - 0.05, t);
        const strike = sm(ws - 0.05, we, t);
        const rec = sm(we, we + 0.2, t);
        const lift = prep * (1 - rec * 0.8);
        const sg = sideR ? 1 : -1;
        const fin = sm(wins[wins.length - 1][1], def.duration, t); // 마지막 타 이후 자세 복귀
        out.pelvisPitch = 0.06 * lift;
        out.s1 = -0.12 * lift; out.s2 = -0.2 * lift + 0.2 * strike * (1 - rec);
        out.n1 = 0.1 * lift - 0.1 * strike; out.n2 = 0.08 * lift; out.head = 0.1 * lift;
        out.twist = sg * -(0.3 * prep - 0.55 * strike * (1 - rec * 0.7)) * (1 - fin);
        out.roll = sg * -0.09 * lift;
        out.scapLift = 0.28 * lift;
        out.ears = 0.85;
        out.jaw = 0.35 * prep * (1 - strike) + 0.15;
        out.drop = 0.045 + 0.07 * lift;
        out.mane = 0.45;
        break;
      }
      case 'dashBite': {
        const hp = sampleLionPath(def, t, false);
        const coil = sm(0.05, 0.45, t);
        const strike = sm(def.activeStart - 0.3, def.activeStart - 0.02, t);
        const rec = sm(def.activeEnd + 0.05, def.duration - 0.2, t);
        out.headTarget = V(0, hp.y + 0.1, hp.z - 0.36);
        out.headBlend = 1;
        // 몸을 땅에 붙이듯 낮췄다가(웅크림) 쏘아 나가며 길게 늘어난다
        out.drop = 0.045 + 0.17 * coil * (1 - strike) + 0.02 * strike * (1 - rec);
        out.pelvisPitch = -0.14 * coil * (1 - strike);
        out.s1 = 0.1 * coil * (1 - strike); out.s2 = 0.12 * coil * (1 - strike) + 0.06 * strike * (1 - rec);
        out.n1 = 0.1 * coil;
        const open = sm(def.activeStart - 0.12, def.activeStart + 0.04, t) * (1 - sm(def.activeEnd - 0.05, def.activeEnd + 0.1, t));
        out.jaw = 0.15 * coil + 0.7 * open;
        out.ears = 0.95;
        out.lookW = 0.2;
        out.mane = 0.5;
        out.tailRaise = 0.15 * coil;
        break;
      }
      case 'backHop': {
        const pre = sm(0.0, 0.08, t) * (1 - sm(0.08, 0.16, t));
        const air = t >= 0.08 && t < 0.6;
        const u = clamp01((t - 0.08) / 0.52);
        const arc = Math.sin(Math.PI * u);
        const land = sm(0.6, 0.66, t);
        out.drop = 0.045 + 0.12 * pre + 0.1 * land;
        out.pelvisPitch = air ? -0.28 * arc : 0;
        out.s1 = 0.1 * pre + (air ? 0.12 * arc : 0);
        out.s2 = 0.1 * pre + 0.1 * land;
        out.n1 = (air ? 0.12 * arc : 0) + 0.15 * land; out.head = 0.1 * land;
        out.ears = 0.9;
        out.jaw = air ? 0.25 * arc : 0.1;
        out.airborne = air;
        out.airU = u; out.airReach = 0.55;
        out.lookW = 0.8;
        out.tailRaise = 0.3 * arc;
        out.mane = 0.35;
        break;
      }
      case 'quake': {
        // 뒷다리로 일어서서(상승) 앞발을 높이 들었다가 땅을 찍는다
        const k = sm(0.1, 0.88, t) * (1 - sm(0.97, 1.04, t));
        const slam = sm(0.97, 1.05, t) * (1 - sm(1.25, 2.2, t));
        const wob = Math.sin(t * 26) * 0.015 * k;
        out.drop = 0.045 + 0.04 * k + 0.12 * slam;
        out.pelvisPitch = -0.62 * k + 0.1 * slam;
        out.s1 = -0.28 * k + wob; out.s2 = -0.3 * k + 0.22 * slam;
        out.n1 = 0.3 * k - 0.3 * slam; out.n2 = 0.2 * k; out.head = 0.1 * k;
        out.jaw = 0.8 * k * (1 - slam) + 0.1;
        out.ears = 0.95;
        out.lookW = 0.3;
        out.mane = 0.9 * k + 0.6 * slam;
        out.tailRaise = 0.3 * k;
        const lx = 0.3 - 0.08 * slam;
        const upY = 0.055 + 1.15 * k, upZ = 0.64 + 0.15 * k - 0.1 * k;
        const dnY = 0.055, dnZ = 1.0;
        const y = lerp(upY, dnY, slam), z = lerp(upZ, dnZ, slam);
        out.front = { LF: V(lx, y, z), RF: V(-lx, y, z), pitch: 0.2 + 0.4 * k, lift: 0.45 * k };
        break;
      }
      case 'whirl': {
        const coil = sm(0.1, 0.8, t) * (1 - sm(0.84, 0.92, t));
        const spin = sm(0.84, 0.92, t) * (1 - sm(1.4, 1.6, t));
        out.drop = 0.045 + 0.14 * coil + 0.08 * spin;
        out.pelvisPitch = -0.05 * coil;
        out.s1 = 0.1 * coil; out.s2 = 0.12 * coil;
        out.n1 = 0.22 * coil + 0.1 * spin; out.head = 0.1 * coil;
        out.roll = (v.mirror ? 1 : -1) * 0.22 * spin;
        out.jaw = 0.25 * coil + 0.6 * spin;
        out.ears = 0.95;
        out.lookW = 0.3;
        out.mane = 0.9 * spin + 0.3 * coil;
        out.tailRaise = 0.4 * coil + 0.7 * spin;
        break;
      }
      case 'swipe':
      case 'rear':
      case 'pounceSwat': {
        const m = v.mirror;
        const paw = sampleLionPath(def, t, m);
        const foot: FootKey = paw.x >= 0 && !m || (m && paw.x > 0) ? 'LF' : 'RF';
        const swipeSide: FootKey = m ? 'LF' : 'RF';
        void foot;
        out.skipFoot = swipeSide;
        out.skipTarget = V(paw.x * 1.0 + (m ? 0.02 : -0.02), Math.max(0.055, paw.y), paw.z);
        out.skipPitch = 0.25;
        // 준비: 체중을 뒷다리로 (앞부분 들어올림), 타격 시 몸통 비틀기
        const prep = sm(0.1, def.windup * 0.95, t);
        const strike = sm(def.activeStart - 0.05, def.activeEnd, t);
        const rec = sm(def.activeEnd, def.duration, t);
        const lift = prep * (1 - rec * 0.8);
        out.pelvisPitch = 0.05 * lift;
        out.s1 = -0.12 * lift; out.s2 = -0.2 * lift + 0.18 * strike * (1 - rec);
        out.n1 = 0.1 * lift - 0.1 * strike; out.n2 = 0.08 * lift; out.head = 0.1 * lift;
        out.twist = (m ? -1 : 1) * (0.28 * prep - 0.5 * strike * (1 - rec * 0.7)) * -1;
        out.roll = (m ? 1 : -1) * 0.08 * lift;
        out.scapLift = 0.28 * lift;
        out.ears = 0.8;
        out.jaw = 0.35 * prep * (1 - strike) + 0.15;
        out.drop = 0.045 + 0.06 * lift;
        out.mane = 0.2;
        break;
      }
      case 'bite':
      case 'swipeBite': {
        const hp = sampleLionPath(def, t, false);
        const prep = sm(0.05, def.windup, t);
        const strike = sm(def.activeStart - 0.04, def.activeStart + 0.1, t);
        const rec = sm(def.activeEnd + 0.05, def.duration, t);
        // 판정 구체(입 앞쪽)와 일치하도록: 머리 본 원점 = 입 중심 - (0, -0.1, 0.36)
        out.headTarget = V(0, hp.y + 0.1, hp.z - 0.36);
        out.headBlend = 1;
        // 머리를 뒤로 빼며 몸을 낮춘다 → 앞으로 튀어나가며 입을 벌리고 닫는다
        out.drop = 0.045 + 0.09 * prep * (1 - strike) + 0.03 * strike * (1 - rec);
        out.s2 = 0.0 + 0.2 * strike * (1 - rec) - 0.04 * prep * (1 - strike);
        out.pelvisPitch = -0.04 * prep + 0.06 * strike * (1 - rec);
        const open = sm(def.activeStart - 0.1, def.activeStart + 0.05, t) * (1 - sm(def.activeEnd - 0.05, def.activeEnd + 0.08, t));
        out.jaw = 0.12 * prep + 0.62 * open;
        out.ears = 0.9;
        out.lookW = 0.25;
        out.mane = 0.15;
        break;
      }
      case 'pounce': {
        const crouch = sm(0.05, 0.8, t) * (1 - sm(0.95, 1.05, t));
        const wig = Math.sin(t * 20) * 0.03 * crouch;
        const leap = clamp01((t - 0.95) / 0.55);
        const air = t >= 0.95 && t < 1.5;
        const land = sm(1.5, 1.62, t) * (1 - sm(1.7, 2.6, t));
        out.drop = 0.045 + 0.2 * crouch + 0.1 * land;
        out.pelvisPitch = -0.1 * crouch + wig - (air ? 0.35 * Math.sin(Math.PI * leap) : 0) * 0 + (air ? -0.25 * Math.sin(Math.PI * leap) : 0);
        out.s1 = 0.12 * crouch + (air ? 0.18 * Math.sin(Math.PI * leap) : 0);
        out.s2 = 0.14 * crouch + (air ? -0.1 * Math.sin(Math.PI * leap) : 0) + 0.14 * land;
        out.n1 = 0.12 * crouch + (air ? -0.15 : 0);
        out.n2 = 0.05 * crouch; out.head = 0.1 * crouch;
        out.twist = wig * 1.5;
        out.ears = 0.9;
        out.jaw = air ? 0.4 : 0.1 * crouch + 0.2 * land;
        out.lookW = air ? 0.0 : 0.8;
        out.airborne = air;
        out.airU = leap;
        out.rootY = 0;
        out.tailRaise = 0.25 * crouch + (air ? 0.3 : 0);
        out.mane = air ? 0.5 : 0.1;
        break;
      }
      case 'charge': {
        const sc = v.chargeSpeed > 0.5 ? 1 : 0;
        const wind2 = sm(0.0, 1.1, t) * (1 - sc);
        const scrape = Math.max(0, Math.sin(t * 12)) * wind2;
        out.drop = 0.045 + 0.1 * wind2 + 0.05 * sc;
        out.n1 = 0.3 * wind2 + 0.1 * sc; out.n2 = 0.2 * wind2; out.head = 0.2 * wind2;
        out.s2 = 0.12 * wind2;
        out.pelvisPitch = -0.08 * wind2;
        out.jaw = t < 0.9 ? 0.6 * sm(0.05, 0.3, t) * (1 - sm(0.65, 0.9, t)) : 0.1;
        out.ears = 0.95;
        if (t < 1.15) {
          // 앞발로 모래를 긁는다 (오른발)
          out.skipFoot = 'RF';
          out.skipTarget = V(-0.2, 0.055 + 0.22 * scrape, 0.62 + 0.22 * Math.sin(t * 12 + 1.0) * wind2 - 0.1);
          out.skipPitch = 0.6;
          out.scapLift = 0.1 * scrape;
        }
        if (v.chargeBraking) {
          out.drop = 0.14; out.pelvisPitch = -0.18; out.s2 = -0.08; out.n1 = 0.25;
        }
        out.mane = 0.5;
        break;
      }
    }
    return out;
  }

  private poseDeath(v: LionView) {
    const r = this.rig;
    const t = v.deadT;
    const fall = sm(0.0, 1.5, t);
    const settle = sm(1.4, 3.0, t);
    const gut = sm(0.0, 0.5, t);
    // 옆으로 무너짐 (오른쪽으로 쓰러짐)
    const side = 1;
    this.body({
      drop: lerp(0.045, 0.62, fall), pelvisPitch: 0.05 * fall, s1: 0.1 * fall, s2: 0.12 * fall,
      n1: 0.25 * fall + 0.1 * gut, n2: 0.2 * fall, head: 0.1 * fall, twist: 0.1 * fall, roll: side * 1.45 * fall,
    });
    r.fk();
    // 다리: 늘어지며 접힘 (FK)
    const g = this.leg;
    const setE = (id: number, x: number, y = 0, z = 0) => r.localQ[id].setFromEuler(E(x, y, z));
    for (const s of ['L', 'R'] as const) {
      const sg = s === 'L' ? 1 : -1;
      const F = g[`${s}F` as FootKey], H = g[`${s}H` as FootKey];
      setE(F[1], lerp(0, -0.5, fall) * (s === 'R' ? 1 : 0.5) - 0.2 * settle, 0, sg * 0.15 * fall);
      setE(F[2], lerp(0, 1.0, fall) * (s === 'R' ? 0.6 : 1));
      setE(F[3], lerp(0, 0.5, fall));
      setE(H[1], lerp(0, -0.35, fall) * (s === 'R' ? 0.6 : 1), 0, sg * 0.08 * fall);
      setE(H[2], lerp(0, 0.8, fall));
      setE(H[3], lerp(0, -0.5, fall));
    }
    // 턱 벌어짐, 귀 처짐, 꼬리 힘 빠짐
    this.jaw(0.25 * fall - 0.05 * settle);
    this.ears(0.6, 0);
    this.tailWave(0, 0, 0.5, -0.1 * fall);
    // 호흡이 점차 멎는다
    const breathe = Math.sin(this.breath * 2.5) * 0.02 * (1 - settle);
    r.localQ[this.b.spine2].multiply(new THREE.Quaternion().setFromEuler(E(breathe, 0, 0)));
    r.fk();
  }

  /** 모델 공간 위치(월드 모델)로 변환 전 임의 본 월드 위치 */
  bonePos(name: string): THREE.Vector3 {
    return this.rig.worldP[this.rig.id(name)];
  }
}
void easeOutCubic;
