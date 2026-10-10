import * as THREE from 'three';
import { GladiatorAnimator, type FootEvent, type PlayerView } from '../animation/gladiatorAnimator';
import { LionAnimator, type LionFootEvent, type LionView } from '../animation/lionAnimator';
import { angleDiff, forward, leftOf, type V2 } from '../simulation/math';
import type { GameSim } from '../simulation/sim';
import { createCharMaterial } from './charMaterials';
import { createFurMaterial, createManeMaterial, makeEyeTexture, FUR_DEFAULT } from './furMaterial';
import { mapBones } from './skeletonUtil';
import type { LoadedAssets } from './assets';

const lerpA = (a: number, b: number, t: number) => a + angleDiff(b, a) * t;

export interface Transform { x: number; z: number; yaw: number; y: number }

export function interpPlayer(sim: GameSim, alpha: number): Transform {
  const p = sim.player;
  return {
    x: sim.prevPlayer.x + (p.pos.x - sim.prevPlayer.x) * alpha,
    z: sim.prevPlayer.z + (p.pos.z - sim.prevPlayer.z) * alpha,
    yaw: lerpA(sim.prevPlayer.yaw, p.yaw, alpha),
    y: 0,
  };
}
export function interpLion(sim: GameSim, alpha: number): Transform {
  const l = sim.lion;
  return {
    x: sim.prevLion.x + (l.pos.x - sim.prevLion.x) * alpha,
    z: sim.prevLion.z + (l.pos.z - sim.prevLion.z) * alpha,
    yaw: lerpA(sim.prevLion.yaw, l.yaw, alpha),
    y: sim.prevLion.y + (l.y - sim.prevLion.y) * alpha,
  };
}

export interface FootFx { who: 'player' | 'lion'; kind: 'plant' | 'lift'; world: THREE.Vector3; strength: number; yaw: number; big: boolean }

export class LionActor {
  readonly group = new THREE.Group();
  private animator = new LionAnimator();
  private bones: THREE.Object3D[];
  private rootBone: THREE.Object3D;
  private furBases: THREE.SkinnedMesh[] = [];
  private shells: THREE.SkinnedMesh[] = [];
  private shellCount = 0;
  private mane: THREE.Mesh | null = null;
  private shake = { value: 0 };
  readonly shared: { time: { value: number } };
  private jawMesh?: THREE.Object3D;
  lastFeet: FootFx[] = [];
  jawOpen = 0;
  headWorld = new THREE.Vector3();
  roar = 0;

  constructor(assets: LoadedAssets, shared: { time: { value: number } }) {
    this.shared = shared;
    const g = assets.gltf.lion;
    const scene = g.scene;
    this.group.add(scene);
    this.bones = mapBones(scene, this.animator.rig);
    this.rootBone = this.bones[0];
    const eyeTex = makeEyeTexture();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const kind = (mat.userData?.kind as string) ?? '';
      m.frustumCulled = false;
      if (kind === 'fur') {
        const sm = m as THREE.SkinnedMesh;
        this.furBases.push(sm);
        sm.castShadow = true;
        sm.receiveShadow = true;
      } else if (kind === 'mane') {
        m.material = createManeMaterial(shared, this.shake);
        m.castShadow = false;
        m.receiveShadow = true;
        this.mane = m;
      } else if (kind === 'mouth') {
        m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
        m.castShadow = false;
      } else if (kind === 'eye') {
        m.material = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.05, metalness: 0 });
      } else if (kind === 'ivory' || kind === 'claw') {
        (m.material as THREE.MeshStandardMaterial).roughness = 0.42;
      }
      if (o.name === 'lion_jaw') this.jawMesh = o;
    });
    this.setShells(FUR_DEFAULT.shells);
  }

  /** 털 셸 개수 변경 (그래픽 품질) */
  setShells(n: number) {
    if (n === this.shellCount && this.shells.length === Math.max(0, (n - 1) * this.furBases.length)) return;
    this.shellCount = n;
    for (const s of this.shells) s.parent?.remove(s);
    this.shells = [];
    for (const base of this.furBases) {
      base.material = createFurMaterial(0, Math.max(n, 1), FUR_DEFAULT, this.shared);
      for (let i = 1; i < n; i++) {
        const sh = new THREE.SkinnedMesh(base.geometry, createFurMaterial(i, n, FUR_DEFAULT, this.shared));
        sh.bind(base.skeleton, base.bindMatrix);
        sh.frustumCulled = false;
        sh.castShadow = false;
        sh.receiveShadow = true;
        base.parent!.add(sh);
        this.shells.push(sh);
      }
    }
  }

  reset() {
    this.animator.reset();
  }

  update(sim: GameSim, alpha: number, dt: number, time: number) {
    const l = sim.lion;
    const t = interpLion(sim, alpha);
    const hold = sim.ctx.hitstop > 0;
    const adv = hold ? 0 : alpha * (1 / 60);
    this.group.visible = l.mode !== 'dormant';
    this.group.position.set(t.x, 0, t.z);
    this.group.rotation.y = t.yaw;
    this.rootBone.position.y = t.y;
    const f = forward(l.yaw), le = leftOf(l.yaw);
    const view: LionView = {
      mode: l.mode,
      modeT: l.modeT + adv,
      attackId: l.attack?.id ?? null,
      attackT: (l.attack?.t ?? 0) + adv,
      mirror: l.attack?.mirror ?? false,
      speed: l.speed,
      moveLocal: { x: l.vel.x * le.x + l.vel.z * le.z, z: l.vel.x * f.x + l.vel.z * f.z },
      turnRate: l.turnRate,
      y: t.y,
      lookYaw: l.lookYaw,
      flinch: l.flinch,
      flinchDirLocal: { x: l.flinchDir.x * le.x + l.flinchDir.z * le.z, z: l.flinchDir.x * f.x + l.flinchDir.z * f.z },
      landed: l.landed,
      deadT: l.deadT + adv,
      time,
      phase: l.phase,
      chargeBraking: l.attack?.braking ?? false,
      chargeSpeed: l.attack?.chargeSpeed ?? 0,
      hpFrac: l.hp / l.hpMax,
    };
    this.animator.update(hold ? 0 : dt, view);
    this.animator.rig.applyTo(this.bones);
    this.bones[this.animator.rig.id('head')].scale.setScalar(1.16); // 머리를 약간 키워 갈기와 균형을 맞춘다
    this.shake.value = this.animator.maneShake;
    this.jawOpen = this.animator.jawOpen;
    this.roar = this.animator.roarIntensity;
    // 발자국/먼지 이벤트 수집
    this.lastFeet.length = 0;
    for (const e of this.animator.footEvents as LionFootEvent[]) {
      const w = new THREE.Vector3(e.x, 0, e.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw).add(new THREE.Vector3(t.x, 0, t.z));
      this.lastFeet.push({ who: 'lion', kind: e.kind, world: w, strength: e.strength, yaw: t.yaw, big: e.foot === 'LF' || e.foot === 'RF' });
    }
    const hp = this.animator.rig.worldP[this.animator.rig.id('head')];
    this.headWorld.set(hp.x, hp.y, hp.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw).add(new THREE.Vector3(t.x, t.y, t.z));
  }

  get footEvents() { return this.animator.footEvents; }
  get anim() { return this.animator; }
  get maneMesh() { return this.mane; }
  get jaw() { return this.jawMesh; }
}

export class GladiatorActor {
  readonly group = new THREE.Group();
  private animator = new GladiatorAnimator();
  private bones: THREE.Object3D[];
  private flask?: THREE.Object3D;
  lastFeet: FootFx[] = [];
  swordTip = new THREE.Vector3();
  swordBase = new THREE.Vector3();
  private sword: THREE.Object3D[] = [];

  constructor(assets: LoadedAssets) {
    const g = assets.gltf.gladiator;
    const scene = g.scene;
    this.group.add(scene);
    this.bones = mapBones(scene, this.animator.rig);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const kind = (src.userData?.kind as string) ?? '';
      if (!kind) return;
      const map = kind === 'shield_face' ? assets.textures.shield : null;
      if (map) map.anisotropy = 8;
      m.material = createCharMaterial(kind, src, { vertexColors: !!m.geometry.getAttribute('color'), map });
      m.castShadow = true;
      m.receiveShadow = true;
      if (m.name === 'flask') this.flask = m;
      if (m.name.startsWith('sword')) this.sword.push(m);
    });
    if (this.flask) this.flask.visible = false;
  }

  reset() {
    this.animator.reset();
  }

  update(sim: GameSim, alpha: number, dt: number, time: number, opts: { scripted?: PlayerViewOverride } = {}) {
    const p = sim.player;
    const l = sim.lion;
    const t = interpPlayer(sim, alpha);
    const hold = sim.ctx.hitstop > 0;
    const adv = hold ? 0 : alpha * (1 / 60);
    this.group.position.set(t.x, 0, t.z);
    this.group.rotation.y = t.yaw;
    const toLion = Math.atan2(l.pos.x - p.pos.x, l.pos.z - p.pos.z);
    const f = forward(p.yaw), le = leftOf(p.yaw);
    const hd = p.hitDir;
    const view: PlayerView = {
      mode: p.mode,
      modeT: p.modeT + adv,
      attackId: p.attackId,
      guardHeld: p.guardHeld,
      guardUp: p.guardHeld && p.guardUpT >= 0.12,
      guardUpT: p.guardUpT,
      guardImpact: p.guardImpact,
      moveLocal: p.moveLocal,
      speed: p.speed,
      running: p.running,
      healApplied: p.healApplied,
      hitDirLocal: { x: hd.x * le.x + hd.z * le.z, z: hd.x * f.x + hd.z * f.z },
      hitHeavy: p.hitHeavy,
      dodgeBackstep: p.dodge.backstep,
      lookYaw: sim.phase === 'victory' ? 0 : angleDiff(toLion, p.yaw),
      staminaFrac: p.stamina / p.staminaMax,
      hpFrac: p.hp / p.hpMax,
      time,
      deadT: p.mode === 'dead' ? p.modeT + adv : 0,
      victoryT: sim.phase === 'victory' ? sim.victoryT : p.modeT,
      ...(opts.scripted ?? {}),
    };
    this.animator.update(hold ? 0 : dt, view);
    this.animator.rig.applyTo(this.bones);
    if (this.flask) this.flask.visible = this.animator.flaskVisible;
    this.lastFeet.length = 0;
    for (const e of this.animator.footEvents as FootEvent[]) {
      const w = new THREE.Vector3(e.x, 0, e.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw).add(new THREE.Vector3(t.x, 0, t.z));
      this.lastFeet.push({ who: 'player', kind: e.kind, world: w, strength: e.strength, yaw: t.yaw, big: false });
    }
    const tp = this.animator.swordTipWorld, bp = this.animator.swordBaseWorld;
    const rotY = new THREE.Vector3(0, 1, 0);
    this.swordTip.copy(tp).applyAxisAngle(rotY, t.yaw).add(new THREE.Vector3(t.x, 0, t.z));
    this.swordBase.copy(bp).applyAxisAngle(rotY, t.yaw).add(new THREE.Vector3(t.x, 0, t.z));
  }

  get anim() { return this.animator; }
}

export type PlayerViewOverride = Partial<PlayerView>;
void ((_: V2) => 0);
