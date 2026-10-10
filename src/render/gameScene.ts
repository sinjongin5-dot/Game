import * as THREE from 'three';
import { DebugDraw } from '../diagnostics/debugDraw';
import type { Physics } from '../physics/types';
import { ARENA } from '../simulation/arena';
import type { SimEvent } from '../simulation/state';
import type { GameSim } from '../simulation/sim';
import { ArenaBuilder } from './arena';
import type { LoadedAssets } from './assets';
import { CameraRig, type CameraSettings } from './cameraRig';
import { GladiatorActor, LionActor, type FootFx } from './characters';
import { Crowd } from './crowd';
import { Decals } from './decals';
import { Fx, HIT_FLASH } from './fx';
import { LION_ATTACKS } from '../combat/attackData';
import { activeWindowIndex, lionAttackVolume } from '../simulation/lion';
import { Particles } from './particles';
import { SwordTrail } from './swordTrail';

export type Quality = 'low' | 'medium' | 'high';

export const QUALITY: Record<Quality, { scale: number; maxDpr: number; shadow: number; shells: number; crowd: number; particles: number }> = {
  low: { scale: 0.75, maxDpr: 1, shadow: 2048, shells: 0, crowd: 0.3, particles: 0.5 },
  medium: { scale: 0.9, maxDpr: 1.25, shadow: 2048, shells: 6, crowd: 0.65, particles: 0.8 },
  high: { scale: 1.0, maxDpr: 2, shadow: 4096, shells: 12, crowd: 1.0, particles: 1.0 },
};

export interface SceneStats { fps: number; frameMs: number; calls: number; tris: number; geometries: number; textures: number }

export type SceneMode = 'title' | 'game';

export interface FxHooks {
  /** 화면 연출용 콜백 (UI 비네팅 등) */
  onDamageFlash?: (strength: number) => void;
  /** 전체 화면 번쩍임 (패링, 사자 처치 등) */
  onScreenFlash?: (color: string, strength: number) => void;
  /** 순간 슬로모션 (scale<1 로 duration 초 동안) */
  onSlowmo?: (scale: number, duration: number) => void;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: CameraRig;
  readonly arena: ArenaBuilder;
  readonly crowd: Crowd;
  readonly particles = new Particles();
  readonly decals = new Decals();
  readonly lion: LionActor;
  readonly gladiator: GladiatorActor;
  readonly debug = new DebugDraw();
  readonly trail = new SwordTrail();
  readonly fx = new Fx();
  private clawTrails = [new SwordTrail([1.0, 0.72, 0.55], 0.26, 1.3), new SwordTrail([1.0, 0.72, 0.55], 0.26, 1.3)];
  private eyePulse = 0;
  private emberAcc = 0;
  private ringDustAcc = 0;
  private lastLionWin = -1;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private quality: Quality = 'high';
  private time = 0;
  private envTex: THREE.Texture | null = null;
  private _w = 1;
  private _h = 1;
  private frameTimes: number[] = [];
  private lastPlayerPhase = '';
  private lionRoarShake = 0;
  mode: SceneMode = 'title';
  hooks: FxHooks = {};
  contextLost = false;
  /** 최근 프레임에서 발생한 발소리/충격 등 오디오 쪽이 읽어 갈 이벤트 */
  footFx: FootFx[] = [];
  private lastBlade = false;

  constructor(canvas: HTMLCanvasElement, assets: LoadedAssets, camSettings: CameraSettings, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x1a1612);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; });

    this.cam = new CameraRig(camSettings);
    this.arena = new ArenaBuilder();
    this.scene.add(this.arena.group);
    this.crowd = new Crowd(this.arena.shared, this.arena.standProfile);
    this.scene.add(this.crowd.group);
    this.scene.add(this.particles.group, this.decals.mesh, this.trail.mesh, this.fx.group, this.clawTrails[0].mesh, this.clawTrails[1].mesh, this.debug.group);

    this.scene.fog = new THREE.FogExp2(0xd7c6a1, 0.0042);
    // 조명: 태양(그림자), 반구 필러, 환경 반사
    this.sun = new THREE.DirectionalLight(0xfff0d4, 3.1);
    const sunDir = new THREE.Vector3(0.62, 0.74, -0.5).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(90);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 20; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.0;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb9cdf0, 0x8f7550, 0.7);
    this.scene.add(this.hemi);
    (this.arena.skyMat.uniforms.uSun.value as THREE.Vector3).copy(sunDir);
    this.buildEnvironment();

    this.lion = new LionActor(assets, this.arena.shared);
    this.gladiator = new GladiatorActor(assets);
    this.scene.add(this.lion.group, this.gladiator.group);
    this.setQuality(quality);
  }

  private buildEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const sky = this.arena.skyMat.clone();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), sky));
    // 바닥의 따뜻한 반사광을 흉내내는 아래쪽 반구
    const ground = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9c7c52, side: THREE.BackSide }));
    s.add(ground);
    this.envTex = pm.fromScene(s, 0.02).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const c = QUALITY[q];
    this.sun.shadow.mapSize.set(c.shadow, c.shadow);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.lion.setShells(c.shells);
    this.crowd.setDensity(c.crowd);
    this.resizeInternal();
  }

  get qualityName() { return this.quality; }

  resize(w: number, h: number) {
    this._w = w;
    this._h = h;
    this.resizeInternal();
  }

  private resizeInternal() {
    const c = QUALITY[this.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, c.maxDpr) * c.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this._w, this._h, false);
    this.cam.resize(this._w, this._h);
  }

  /** 새 판 시작 시 장면 상태를 모두 되돌린다 (재도전) */
  resetForNewAttempt(sim: GameSim) {
    this.particles.clear();
    this.decals.clear();
    this.trail.clear();
    this.lion.reset();
    this.gladiator.reset();
    this.cam.reset(sim);
    this.crowd.excitement = 0.1;
    this.arena.snapGate('player', sim.phase !== 'intro' ? false : true);
    this.arena.snapGate('lion', false);
    this.footFx.length = 0;
    this.lastBlade = false;
    this.lionRoarShake = 0;
    this.fx.clear();
    for (const c of this.clawTrails) c.clear();
    HIT_FLASH.lion.value = 0;
    HIT_FLASH.player.value = 0;
    this.eyePulse = 0;
    this.emberAcc = 0;
  }

  setMode(m: SceneMode) {
    this.mode = m;
  }

  handleEvents(events: SimEvent[], sim: GameSim) {
    const V3 = THREE.Vector3;
    const toLion = () => new V3(sim.lion.pos.x - sim.player.pos.x, 0, sim.lion.pos.z - sim.player.pos.z);
    for (const e of events) {
      switch (e.type) {
        case 'playerHitLion': {
          const p = new V3(e.pos.x, e.pos.y, e.pos.z);
          const n = new V3(sim.player.pos.x - sim.lion.pos.x, 0.3, sim.player.pos.z - sim.lion.pos.z).normalize();
          if (e.invuln) {
            this.particles.sparks(p, n, 8);
            this.fx.flash(p, 0.5, 0xbfd8ff, 0.1);
            break;
          }
          const heavy = e.heavy;
          this.particles.furBurst(p, n, heavy ? 30 : 16);
          this.particles.sparks(p, n, heavy ? 14 : 6, new THREE.Color(1.0, 0.8, 0.5));
          this.particles.burst(p, heavy ? 12 : 5, heavy ? 6 : 4);
          // 번쩍임 + 베기 줄기 (스윙 방향)
          this.fx.flash(p, heavy ? 1.5 : e.head ? 1.1 : 0.85, e.head ? 0xffe9a0 : 0xffd6a0, heavy ? 0.2 : 0.14);
          const dir = new V3(e.dir.x, e.dir.y, e.dir.z);
          this.fx.streakWorld(p, dir, this.cam.camera, heavy ? 2.6 : 1.7, heavy ? 0.2 : 0.13, 0xfff0d0, heavy ? 0.22 : 0.16);
          if (heavy) this.fx.streakWorld(p, dir.clone().applyAxisAngle(new V3(0, 1, 0), 0.5), this.cam.camera, 1.6, 0.1, 0xffc890, 0.2);
          HIT_FLASH.lion.value = heavy ? 0.85 : 0.55;
          this.cam.addTrauma(heavy ? 0.55 : 0.26);
          this.cam.kick(toLion(), heavy ? 0.2 : 0.1);
          this.cam.punchFov(heavy ? 2.4 : 1.1, (Math.random() - 0.5) * (heavy ? 0.03 : 0.015));
          this.crowd.cheerBurst(heavy ? 0.5 : 0.22);
          if (e.killing) {
            this.hooks.onSlowmo?.(0.2, 1.1);
            this.hooks.onScreenFlash?.('255,240,210', 0.6);
            this.fx.shock(sim.lion.pos.x, sim.lion.pos.z, 0.6, 7, 0.9, 0.9, 0xfff0d0, 0.7);
          } else if (e.stunned) this.hooks.onSlowmo?.(0.35, 0.2);
          else if (heavy) this.hooks.onSlowmo?.(0.5, 0.1);
          break;
        }
        case 'playerBlocked': {
          const p = new V3(e.pos.x, e.pos.y, e.pos.z);
          const n = new V3(sim.player.pos.x - sim.lion.pos.x, 0.2, sim.player.pos.z - sim.lion.pos.z).normalize();
          this.particles.sparks(p, n, e.broke ? 34 : 14 + Math.round(e.strength * 12), new THREE.Color(1.0, 0.75, 0.4));
          this.particles.puff(new V3(sim.player.pos.x, 0.1, sim.player.pos.z), 0.6 + e.strength * 0.5, n.clone().multiplyScalar(-1), 5);
          this.fx.flash(p, e.perfect ? 1.6 : 0.8 + e.strength * 0.7, e.perfect ? 0xbfe0ff : e.broke ? 0xff8a60 : 0xffd9a0, e.perfect ? 0.22 : 0.14);
          this.fx.shock(sim.player.pos.x, sim.player.pos.z, 0.3, e.perfect ? 3.4 : 1.8 + e.strength, 0.28, 0.35, e.perfect ? 0xc8e4ff : 0xffe2b0, 0.55);
          this.cam.addTrauma(e.broke ? 0.8 : 0.3 + e.strength * 0.25);
          this.cam.kick(toLion().negate(), e.broke ? 0.3 : 0.08 + e.strength * 0.12);
          this.cam.punchFov(e.broke ? -2.5 : e.perfect ? 2.2 : -0.8);
          if (e.perfect) { this.hooks.onScreenFlash?.('190,224,255', 0.28); this.hooks.onSlowmo?.(0.4, 0.2); }
          if (e.broke) { this.hooks.onScreenFlash?.('255,120,80', 0.3); this.hooks.onSlowmo?.(0.4, 0.18); }
          break;
        }
        case 'playerHit': {
          const heavy = e.heavy;
          const p = new V3(e.pos.x, e.pos.y, e.pos.z);
          HIT_FLASH.player.value = heavy ? 1 : 0.75;
          this.cam.addTrauma(heavy ? 0.9 : 0.6);
          this.cam.kick(toLion().negate(), heavy ? 0.3 : 0.17);
          this.cam.punchFov(heavy ? -3 : -1.6, (Math.random() < 0.5 ? -1 : 1) * (heavy ? 0.04 : 0.025));
          this.hooks.onDamageFlash?.(heavy ? 1 : 0.7);
          this.hooks.onSlowmo?.(heavy ? 0.3 : 0.45, heavy ? 0.22 : 0.14);
          this.particles.puff(new V3(sim.player.pos.x, 0.2, sim.player.pos.z), 0.8, undefined, 6);
          this.particles.burst(new V3(sim.player.pos.x, 1.1, sim.player.pos.z), heavy ? 14 : 8, 4, new THREE.Color(1.0, 0.3, 0.2));
          // 발톱/이빨 자국: 공격 종류별 번쩍임
          const paw = e.attack === 'swipe' || e.attack === 'rear' || e.attack === 'pounceSwat' || e.attack === 'flurry';
          this.fx.flash(p, heavy ? 1.6 : 1.1, paw ? 0xff7a50 : 0xffd0a0, 0.18);
          if (paw) {
            const base = new V3(sim.lion.pos.x - sim.player.pos.x, 0, sim.lion.pos.z - sim.player.pos.z).normalize();
            const side = new V3(-base.z, 0, base.x);
            for (let i = -1; i <= 1; i++) {
              const o = p.clone().addScaledVector(side, i * 0.14);
              this.fx.streakWorld(o, new V3(0.9, -0.5, 0).applyAxisAngle(new V3(0, 1, 0), 0.4), this.cam.camera, 2.0, 0.07, 0xffb090, 0.2);
            }
          } else if (e.attack === 'bite' || e.attack === 'dashBite' || e.attack === 'swipeBite') {
            this.fx.streakWorld(p, new V3(0, 1, 0), this.cam.camera, 1.4, 0.09, 0xffe0d0, 0.18);
          } else {
            this.particles.ring(new V3(sim.player.pos.x, 0, sim.player.pos.z), 1.0, 22);
          }
          break;
        }
        case 'lionLand': {
          const pw = e.power ?? 1;
          this.particles.ring(new V3(e.pos.x, 0, e.pos.z), 1.8 * pw);
          this.fx.shock(e.pos.x, e.pos.z, 0.4, 3.6 * pw + 0.8, 0.45, 0.6, 0xffe6bb, 0.5 * pw + 0.2);
          this.cam.addTrauma(0.7 * pw);
          this.cam.punchFov(1.4 * pw);
          this.crowd.cheerBurst(0.35 * pw);
          break;
        }
        case 'lionSlam': {
          const def = LION_ATTACKS.quake;
          const c = new V3(e.pos.x, 0, e.pos.z);
          this.fx.shock(e.pos.x, e.pos.z, def.ring!.r0, def.ring!.r1, def.activeEnd - def.activeStart, def.ring!.width * 1.15, 0xfff4d8, 1.0);
          this.particles.ring(c, 2.6, 56);
          this.particles.debris(c.clone().setY(0.2), 26);
          this.particles.burst(c.clone().setY(0.3), 20, 6);
          // 바닥 균열 (방사형)
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
            const r = 1.1 + Math.random() * 1.5;
            this.decals.add(e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, a, 0.1 + Math.random() * 0.06, 1.3 + Math.random() * 1.0, 40, 0.95);
          }
          this.cam.addTrauma(1);
          this.cam.punchFov(3.2);
          this.hooks.onScreenFlash?.('255,236,200', 0.18);
          this.crowd.cheerBurst(0.9);
          break;
        }
        case 'playerSlam': {
          const c = new V3(e.pos.x, 0, e.pos.z);
          this.particles.ring(c, 1.4, 34);
          this.particles.debris(c.clone().setY(0.15), 12);
          this.fx.shock(e.pos.x, e.pos.z, 0.3, 3.2, 0.4, 0.55, 0xffe6bb, 0.6);
          this.cam.addTrauma(0.45);
          this.cam.punchFov(1.6);
          break;
        }
        case 'lionHop': {
          this.particles.puff(new V3(e.pos.x, 0.05, e.pos.z), 1.0, undefined, 10);
          this.cam.addTrauma(0.15);
          break;
        }
        case 'lionWallHit': {
          this.particles.debris(new V3(e.pos.x, 0.8, e.pos.z));
          this.fx.flash(new V3(e.pos.x, 1.0, e.pos.z), 2.0, 0xffe0b0, 0.22);
          this.cam.addTrauma(0.95);
          this.cam.punchFov(3.5);
          this.hooks.onSlowmo?.(0.4, 0.2);
          this.crowd.cheerBurst(0.7);
          break;
        }
        case 'lionRoar': {
          this.cam.addTrauma(e.phase2 ? 0.7 : 0.35);
          this.crowd.cheerBurst(e.phase2 ? 0.9 : 0.5);
          this.lionRoarShake = 1;
          const lp = sim.lion.pos;
          this.fx.shock(lp.x, lp.z, 0.8, e.phase2 ? 14 : 8, e.phase2 ? 1.2 : 0.9, e.phase2 ? 1.1 : 0.8, e.phase2 ? 0xff9a60 : 0xffe9c0, e.phase2 ? 0.7 : 0.45);
          this.particles.ring(new V3(lp.x, 0, lp.z), 2.2, 40);
          if (e.phase2) {
            this.particles.ember(new V3(lp.x, 0.2, lp.z), 70, 1.6);
            HIT_FLASH.lion.value = 0.6;
            this.hooks.onScreenFlash?.('200,40,20', 0.22);
          }
          break;
        }
        case 'phase2':
          this.crowd.cheerBurst(0.8);
          break;
        case 'lionWindup':
          this.eyePulse = 1;
          if (e.attack === 'quake') this.particles.puff(new V3(sim.lion.pos.x, 0.05, sim.lion.pos.z), 1.2, undefined, 12);
          break;
        case 'lionAttack': {
          const lp = sim.lion.pos;
          const head = this.lion.headWorld;
          if (e.attack === 'pounce') this.particles.puff(new V3(lp.x, 0.05, lp.z), 1.0, undefined, 10);
          if (e.attack === 'charge') this.particles.puff(new V3(lp.x, 0.05, lp.z), 1.2, undefined, 12);
          if (e.attack === 'dashBite') this.particles.puff(new V3(lp.x, 0.05, lp.z), 1.3, undefined, 12);
          if (e.attack === 'bite' || e.attack === 'dashBite' || e.attack === 'swipeBite') {
            const f = new V3(Math.sin(sim.lion.yaw), 0, Math.cos(sim.lion.yaw));
            this.fx.flash(head.clone().addScaledVector(f, 0.35).add(new V3(0, -0.08, 0)), 0.55, 0xffffff, 0.1);
          }
          if (e.attack === 'whirl') this.cam.addTrauma(0.3);
          if (e.attack === 'flurry' || e.attack === 'swipe' || e.attack === 'rear' || e.attack === 'pounceSwat') {
            this.particles.puff(new V3(lp.x + Math.sin(sim.lion.yaw) * 0.9, 0.05, lp.z + Math.cos(sim.lion.yaw) * 0.9), 0.5, undefined, 3);
          }
          break;
        }
        case 'lionStagger':
          this.cam.addTrauma(0.3);
          this.fx.flash(this.lion.headWorld.clone(), 1.2, 0xffe6a0, 0.2);
          this.particles.burst(this.lion.headWorld.clone(), 14, 5);
          break;
        case 'lionDeath':
          this.cam.addTrauma(0.6);
          this.crowd.cheerBurst(1);
          this.particles.ring(new V3(sim.lion.pos.x, 0, sim.lion.pos.z), 2.4, 40);
          break;
        case 'victory':
          this.crowd.excitement = 1;
          break;
        case 'playerDeath':
          this.cam.addTrauma(0.6);
          this.crowd.excitement = 0.5;
          this.hooks.onSlowmo?.(0.3, 0.9);
          break;
        case 'dodgeSuccess':
          this.crowd.cheerBurst(0.18);
          this.cam.punchFov(1.1);
          this.hooks.onSlowmo?.(0.55, 0.14);
          this.fx.shock(sim.player.pos.x, sim.player.pos.z, 0.2, 2.2, 0.3, 0.3, 0xdff0ff, 0.4);
          break;
        case 'playerDodge':
          this.particles.puff(new V3(sim.player.pos.x, 0.05, sim.player.pos.z), 0.8, undefined, 6);
          break;
        case 'gateClose':
          this.arena.setGate('player', false, 3.2);
          this.cam.addTrauma(0.35);
          break;
        case 'lionGateOpen':
          this.arena.setGate('lion', true, 0.42);
          break;
        case 'heal':
          this.particles.ember(new V3(sim.player.pos.x, 0.2, sim.player.pos.z), 28, 0.5, new THREE.Color(1.0, 0.85, 0.35));
          break;
        default:
          break;
      }
    }
    void this.lionRoarShake;
  }

  private spawnFootFx(list: FootFx[]) {
    for (const f of list) {
      if (f.kind !== 'plant') continue;
      this.footFx.push(f);
      const fast = f.strength > 0.45;
      if (f.who === 'lion') {
        if (f.strength > 0.15) this.particles.puff(f.world, f.strength * 1.1, undefined, f.strength > 0.6 ? 4 : 2);
        if (f.strength > 0.1) this.decals.add(f.world.x, f.world.z, f.yaw, 0.22, 0.28, 24, 0.9);
      } else {
        if (fast) this.particles.puff(f.world, f.strength * 0.8, undefined, 2);
        if (f.strength > 0.15) this.decals.add(f.world.x, f.world.z, f.yaw, 0.11, 0.29, 22, 0.8);
      }
    }
  }

  /** 장면 갱신. frameDt: 실제 프레임 시간(초) */
  update(sim: GameSim, frameDt: number, alpha: number, look: { dx: number; dy: number }, controlEnabled: boolean) {
    const dt = Math.min(frameDt, 0.1);
    this.time += dt;
    this.arena.update(dt, this.time);

    const phase = sim.phase;
    this.gladiator.update(sim, alpha, dt, this.time);
    this.lion.update(sim, alpha, dt, this.time);
    this.footFx.length = 0;
    this.spawnFootFx(this.gladiator.lastFeet);
    this.spawnFootFx(this.lion.lastFeet);

    // 구르기/돌진 중 연속 먼지
    if (sim.player.mode === 'dodge' && sim.player.modeT > 0.1 && sim.player.modeT < 0.5 && Math.random() < 0.5) {
      this.particles.puff(new THREE.Vector3(sim.player.pos.x, 0.05, sim.player.pos.z), 0.5, undefined, 1);
    }
    const l = sim.lion;
    if (l.attack?.id === 'charge' && l.speed > 5 && Math.random() < 0.8) {
      this.particles.puff(new THREE.Vector3(l.pos.x - Math.sin(l.yaw) * 1.0, 0.05, l.pos.z - Math.cos(l.yaw) * 1.0), 1.0, undefined, 2);
    }
    if (l.attack?.id === 'charge' && l.attack.braking && l.attack.chargeSpeed > 2) {
      this.particles.puff(new THREE.Vector3(l.pos.x, 0.05, l.pos.z), 1.3, undefined, 3);
      this.decals.add(l.pos.x, l.pos.z, l.yaw, 0.5, 1.4, 30, 0.7);
    }
    // 칼 궤적
    const bladeActive = sim.player.mode === 'attack' && sim.player.attackId !== null;
    if (bladeActive) {
      this.trail.push(this.gladiator.swordBase, this.gladiator.swordTip);
    }
    this.lastBlade = bladeActive;
    this.trail.update(dt);
    this.updateLionFx(sim, dt);

    // 관중 흥분도
    const base = phase === 'fight' ? 0.12 + (l.phase === 2 ? 0.25 : 0) : phase === 'victory' ? 1 : 0.08;
    this.crowd.excitement = Math.max(base, 0);
    this.crowd.update(dt);
    this.fx.update(dt);
    this.particles.update(dt, this.renderer.domElement.height, this.cam.camera.fov);
    this.decals.update(dt);

    // 카메라
    if (this.mode === 'title') this.cam.title(this.time);
    else if (phase === 'intro') this.cam.intro(sim, dt);
    else this.cam.gameplay(sim, look, dt, (o, d, m) => sim.physics.raycast({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, m), controlEnabled, alpha);

    // 태양 그림자 카메라는 고정 (아레나 전체)
    this.debug.update(sim);
    this.lastPlayerPhase = phase;
  }

  /** 사자 공격에 붙는 연속 이펙트: 발톱 궤적, 회전 먼지, 돌진 먼지, 눈빛, 2페이즈 불씨 */
  private updateLionFx(sim: GameSim, dt: number) {
    const l = sim.lion;
    const V3 = THREE.Vector3;
    HIT_FLASH.lion.value *= Math.exp(-13 * dt);
    HIT_FLASH.player.value *= Math.exp(-11 * dt);
    this.eyePulse = Math.max(0, this.eyePulse - dt * 2.2);
    const a = l.attack;
    const alive = l.mode !== 'dying' && l.mode !== 'dead' && l.mode !== 'dormant';

    // 눈빛: 2페이즈 상시 + 공격 전조 때 번뜩임
    let eye = l.phase === 2 ? 0.45 : 0.0;
    if (a) {
      const def = LION_ATTACKS[a.id];
      if (a.t < def.windup) eye = Math.max(eye, 0.35 + 0.65 * Math.min(1, a.t / Math.max(0.3, def.windup)));
    }
    eye = Math.max(eye, this.eyePulse * 0.9);
    if (l.mode === 'roar') eye = 1;
    this.fx.setEyeGlow(this.lion.headWorld, l.yaw, alive ? eye : 0, alive);

    // 발톱 궤적: 앞발 공격의 유효 구간 전후에 앞발 위치를 따라 그린다
    if (a && alive) {
      const def = LION_ATTACKS[a.id];
      if (def.kind === 'paw') {
        const wins = def.windows ?? [[def.activeStart, def.activeEnd] as [number, number]];
        const wi = wins.findIndex(([ws, we]) => a.t >= ws - 0.05 && a.t <= we + 0.05);
        if (wi >= 0) {
          const vol = lionAttackVolume(l);
          if (vol && vol.kind === 'sphere') {
            const tr = this.clawTrails[wi % 2];
            tr.push(new V3(vol.c.x, vol.c.y - 0.32, vol.c.z), new V3(vol.c.x, vol.c.y + 0.32, vol.c.z));
            if (wi !== this.lastLionWin) {
              this.lastLionWin = wi;
              this.fx.flash(new V3(vol.c.x, vol.c.y, vol.c.z), 0.45, 0xffb090, 0.1);
            }
          }
        }
      } else this.lastLionWin = -1;
      // 회전 꼬리치기: 모래 소용돌이
      if (a.id === 'whirl' && activeWindowIndex(l) >= 0) {
        this.particles.swirl(new V3(l.pos.x, 0, l.pos.z), 1.9, 4, a.mirror ? 1 : -1);
        if (Math.random() < 0.5) this.particles.puff(new V3(l.pos.x, 0.05, l.pos.z), 1.2, undefined, 2);
      } else if (a.id === 'whirl' && a.t > 0.35 && a.t < def.activeStart) {
        this.particles.swirl(new V3(l.pos.x, 0, l.pos.z), 1.4, 1, a.mirror ? -1 : 1);
      }
      // 충격파 강타: 링을 따라 먼지 벽이 함께 퍼진다 (어디까지 위험한지 보인다)
      if (a.id === 'quake' && a.t >= def.activeStart && a.t <= def.activeEnd + 0.1 && def.ring) {
        const u = Math.min(1, (a.t - def.activeStart) / (def.activeEnd - def.activeStart));
        const r = def.ring.r0 + (def.ring.r1 - def.ring.r0) * u;
        this.ringDustAcc += dt * 420 * QUALITY[this.quality].particles;
        while (this.ringDustAcc >= 1) {
          this.ringDustAcc -= 1;
          const ang = Math.random() * Math.PI * 2;
          this.particles.puff(new V3(l.pos.x + Math.cos(ang) * r, 0.05, l.pos.z + Math.sin(ang) * r), 0.9, new V3(Math.cos(ang), 0, Math.sin(ang)), 1);
        }
      }
      // 충격파 강타 전조: 일어서며 먼지를 일으킨다
      if (a.id === 'quake' && a.t > 0.2 && a.t < def.activeStart && Math.random() < 0.6) {
        this.particles.puff(new V3(l.pos.x + (Math.random() - 0.5) * 1.6, 0.05, l.pos.z + (Math.random() - 0.5) * 1.6), 0.7, undefined, 2);
      }
      // 돌진 물기: 몸을 날리며 모래를 뿌린다
      if (a.id === 'dashBite' && l.speed > 6) {
        this.particles.puff(new V3(l.pos.x - Math.sin(l.yaw) * 0.9, 0.05, l.pos.z - Math.cos(l.yaw) * 0.9), 1.2, undefined, 3);
      }
    } else this.lastLionWin = -1;
    for (const t of this.clawTrails) t.update(dt);

    // 2페이즈: 몸에서 불씨가 피어오른다
    if (l.phase === 2 && alive && sim.phase === 'fight') {
      this.emberAcc += dt * 26 * QUALITY[this.quality].particles;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        this.particles.ember(new V3(l.pos.x, 0.25 + l.y, l.pos.z), 1, 0.75);
      }
    }
  }

  setDebug(on: boolean) {
    this.debug.group.visible = on;
  }

  render(frameMs: number): SceneStats {
    if (this.contextLost) return { fps: 0, frameMs, calls: 0, tris: 0, geometries: 0, textures: 0 };
    this.renderer.render(this.scene, this.cam.camera);
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const info = this.renderer.info;
    return { fps: avg > 0 ? 1000 / avg : 0, frameMs: avg, calls: info.render.calls, tris: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
  }

  dispose() {
    this.renderer.dispose();
  }
}
void ARENA;
