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
    this.scene.add(this.particles.group, this.decals.mesh, this.trail.mesh, this.debug.group);

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
  }

  setMode(m: SceneMode) {
    this.mode = m;
  }

  handleEvents(events: SimEvent[], sim: GameSim) {
    for (const e of events) {
      switch (e.type) {
        case 'playerHitLion': {
          const p = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
          const n = new THREE.Vector3(sim.player.pos.x - sim.lion.pos.x, 0.3, sim.player.pos.z - sim.lion.pos.z).normalize();
          if (e.invuln) this.particles.sparks(p, n, 8);
          else {
            this.particles.furBurst(p, n, e.heavy ? 26 : 14);
            this.particles.sparks(p, n, e.heavy ? 6 : 2, new THREE.Color(1.0, 0.8, 0.5));
            this.cam.addTrauma(e.heavy ? 0.5 : 0.22);
            this.crowd.cheerBurst(e.heavy ? 0.5 : 0.22);
          }
          break;
        }
        case 'playerBlocked': {
          const p = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
          const n = new THREE.Vector3(sim.player.pos.x - sim.lion.pos.x, 0.2, sim.player.pos.z - sim.lion.pos.z).normalize();
          this.particles.sparks(p, n, e.broke ? 26 : 10 + Math.round(e.strength * 10), new THREE.Color(1.0, 0.75, 0.4));
          this.particles.puff(new THREE.Vector3(sim.player.pos.x, 0.1, sim.player.pos.z), 0.6 + e.strength * 0.5, n.clone().multiplyScalar(-1), 5);
          this.cam.addTrauma(e.broke ? 0.8 : 0.3 + e.strength * 0.25);
          break;
        }
        case 'playerHit': {
          this.cam.addTrauma(e.heavy ? 0.85 : 0.55);
          this.hooks.onDamageFlash?.(e.heavy ? 1 : 0.7);
          this.particles.puff(new THREE.Vector3(sim.player.pos.x, 0.2, sim.player.pos.z), 0.8, undefined, 5);
          break;
        }
        case 'lionLand': {
          this.particles.ring(new THREE.Vector3(e.pos.x, 0, e.pos.z), 1.8);
          this.cam.addTrauma(0.7);
          this.crowd.cheerBurst(0.35);
          break;
        }
        case 'lionWallHit': {
          this.particles.debris(new THREE.Vector3(e.pos.x, 0.8, e.pos.z));
          this.cam.addTrauma(0.95);
          this.crowd.cheerBurst(0.7);
          break;
        }
        case 'lionRoar': {
          this.cam.addTrauma(e.phase2 ? 0.55 : 0.35);
          this.crowd.cheerBurst(e.phase2 ? 0.9 : 0.5);
          this.lionRoarShake = 1;
          break;
        }
        case 'phase2':
          this.crowd.cheerBurst(0.8);
          break;
        case 'lionAttack':
          if (e.attack === 'pounce') this.particles.puff(new THREE.Vector3(sim.lion.pos.x, 0.05, sim.lion.pos.z), 1.0, undefined, 10);
          if (e.attack === 'charge') this.particles.puff(new THREE.Vector3(sim.lion.pos.x, 0.05, sim.lion.pos.z), 1.2, undefined, 12);
          break;
        case 'lionStagger':
          this.cam.addTrauma(0.3);
          break;
        case 'lionDeath':
          this.cam.addTrauma(0.6);
          this.crowd.cheerBurst(1);
          break;
        case 'victory':
          this.crowd.excitement = 1;
          break;
        case 'playerDeath':
          this.cam.addTrauma(0.6);
          this.crowd.excitement = 0.5;
          break;
        case 'dodgeSuccess':
          this.crowd.cheerBurst(0.18);
          break;
        case 'playerDodge':
          this.particles.puff(new THREE.Vector3(sim.player.pos.x, 0.05, sim.player.pos.z), 0.8, undefined, 6);
          break;
        case 'gateClose':
          this.arena.setGate('player', false, 3.2);
          this.cam.addTrauma(0.35);
          break;
        case 'lionGateOpen':
          this.arena.setGate('lion', true, 0.42);
          break;
        case 'heal':
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

    // 관중 흥분도
    const base = phase === 'fight' ? 0.12 + (l.phase === 2 ? 0.25 : 0) : phase === 'victory' ? 1 : 0.08;
    this.crowd.excitement = Math.max(base, 0);
    this.crowd.update(dt);
    this.particles.update(dt, this.renderer.domElement.height, this.cam.camera.fov);
    this.decals.update(dt);

    // 카메라
    if (this.mode === 'title') this.cam.title(this.time);
    else if (phase === 'intro') this.cam.intro(sim, dt);
    else this.cam.gameplay(sim, look, dt, (o, d, m) => sim.physics.raycast({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, m), controlEnabled);

    // 태양 그림자 카메라는 고정 (아레나 전체)
    this.debug.update(sim);
    this.lastPlayerPhase = phase;
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
