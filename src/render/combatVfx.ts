import * as THREE from 'three';
import { LION_ATTACKS, PLAYER_ATTACKS } from '../combat/attackData';
import type { GameSim } from '../simulation/sim';
import type { SimEvent } from '../simulation/state';
import type { CameraRig } from './cameraRig';
import type { Decals } from './decals';
import { Fx, HIT_FLASH } from './fx';
import type { Particles } from './particles';
import { SlashTrailPool, type SlashStyle } from './slashTrail';

/**
 * 전투 VFX 한 곳에서 관리: 공격 종류마다 시각 언어(색·섬광·파편·궤적·조명·카메라·화면효과)를 프로필로 정의하고,
 * 이벤트가 오면 프로필을 재생한다. 모든 오브젝트(파티클/섬광/링/궤적/조명)는 풀링되어 매 프레임 새로 만들지 않는다.
 *
 * 색 규칙(다크 판타지): 기본은 차가운 강철빛(청백). 따뜻한 색은 강한 타격·금속 불꽃에만, 붉은색은 살점/핏방울에만 쓴다.
 */
export type ImpactKind = 'bash' | 'clash' | 'light' | 'finisher' | 'run' | 'heavy' | 'riposte' | 'execute' | 'clang' | 'parry' | 'perfectGuard' | 'guard' | 'guardBreak';

interface CamKick { trauma: number; kick: number; fov: number; roll?: number }
interface Profile {
  /** [크기, 색, 수명] */
  flash: [number, number, number];
  /** 금속 불꽃: [개수, 속도, 퍼짐, 따뜻한 비율] */
  sparks?: [number, number, number, number];
  droplets?: number;
  fur?: number;
  shards?: number;
  dust?: number;
  /** 스윙 방향 섬광줄기: [개수, 길이, 굵기, 색, 수명] */
  streaks?: [number, number, number, number, number];
  /** 지면 링: [최대 반지름, 시간, 굵기, 색, 알파] */
  ring?: [number, number, number, number, number];
  /** 순간 조명: [색, 세기, 시간] */
  light?: [number, number, number];
  cam: CamKick;
  slow?: [number, number];
  screen?: [string, number];
  pulse: number;
}

export const IMPACT_PROFILES: Record<ImpactKind, Profile> = {
  // 방패 밀치기: 둔탁한 금속+먼지, 낮고 묵직한 충격
  bash: { flash: [1.1, 0xe8e2d2, 0.13], sparks: [10, 4, 0.9, 0.3], dust: 7, shards: 3, cam: { trauma: 0.38, kick: 0.18, fov: 1.2 }, light: [0xf0e8d8, 8, 0.1], pulse: 0.28 },
  // 받아치기: 발톱이 닿기 전에 끊어낸 순간의 차가운 섬광
  clash: { flash: [1.8, 0xeaf4ff, 0.18], sparks: [22, 6, 1.0, 0.4], streaks: [2, 2.2, 0.08, 0xffffff, 0.14], light: [0xdfeaff, 20, 0.12], cam: { trauma: 0.4, kick: 0.14, fov: 1.8, roll: 0.02 }, slow: [0.45, 0.12], screen: ['200,226,255', 0.1], pulse: 0.45 },
  // 일반 공격: 짧고 선명, 작은 섬광
  light: { flash: [0.7, 0xf0e8dc, 0.1], droplets: 4, fur: 8, streaks: [1, 1.5, 0.1, 0xdbe8ff, 0.14], cam: { trauma: 0.16, kick: 0.07, fov: 0.7 }, pulse: 0.1 },
  // 3타(마무리): 조금 더 밝고 묵직
  finisher: { flash: [1.05, 0xfff0dc, 0.14], sparks: [5, 4.5, 0.7, 0.2], droplets: 8, fur: 14, streaks: [2, 1.9, 0.13, 0xe6eeff, 0.17], light: [0xffe2c0, 9, 0.12], cam: { trauma: 0.3, kick: 0.14, fov: 1.4 }, pulse: 0.22 },
  // 달리기 공격: 길게 끌리는 푸른 줄기
  run: { flash: [0.9, 0xe4efff, 0.12], sparks: [4, 4, 0.6, 0.1], droplets: 5, fur: 10, streaks: [2, 2.4, 0.09, 0xcfe0ff, 0.17], cam: { trauma: 0.22, kick: 0.1, fov: 1.0, roll: 0.015 }, pulse: 0.15 },
  // 강공격: 크고 집중된 섬광 + 묵직한 먼지/파편
  heavy: { flash: [1.75, 0xffdcae, 0.2], sparks: [12, 6, 0.8, 0.4], droplets: 12, fur: 24, shards: 6, dust: 8, streaks: [2, 2.8, 0.2, 0xfff0d8, 0.22], light: [0xffc890, 22, 0.16], cam: { trauma: 0.55, kick: 0.22, fov: 2.4 }, slow: [0.5, 0.1], pulse: 0.45 },
  // 패링 직후 반격: 차가운 백색 섬광
  riposte: { flash: [1.9, 0xeaf4ff, 0.2], sparks: [14, 6, 0.9, 0.2], droplets: 14, fur: 22, streaks: [2, 2.6, 0.17, 0xeef6ff, 0.2], light: [0xdfeaff, 24, 0.14], cam: { trauma: 0.5, kick: 0.2, fov: 2.2 }, slow: [0.45, 0.14], pulse: 0.4 },
  // 처형: 이 게임에서 가장 큰 일격
  execute: { flash: [2.8, 0xfff2d8, 0.3], sparks: [26, 7.5, 1.0, 0.45], droplets: 22, fur: 34, shards: 10, dust: 16, streaks: [3, 3.4, 0.26, 0xfff4e0, 0.3], light: [0xffd9a8, 42, 0.26], cam: { trauma: 1, kick: 0.36, fov: 4.2, roll: 0.04 }, slow: [0.22, 0.9], screen: ['255,240,215', 0.18], pulse: 1 },
  // 무적 상태(포효 중 등)에 맞음: 금속음처럼 튕겨 나감
  clang: { flash: [0.55, 0xdce8ff, 0.1], sparks: [8, 4, 0.9, 0.2], cam: { trauma: 0.1, kick: 0, fov: 0 }, pulse: 0.05 },
  // 패링: 정확한 충돌 순간 밝은 금속 섬광, 방사형 소량 파편
  parry: { flash: [2.3, 0xeaf4ff, 0.2], sparks: [32, 6.2, 1.0, 0.5], streaks: [2, 2.4, 0.05, 0xffffff, 0.14], light: [0xdfeaff, 30, 0.1], cam: { trauma: 0.45, kick: 0.1, fov: 2.0, roll: 0.02 }, slow: [0.35, 0.16], screen: ['200,226,255', 0.12], pulse: 0.6 },
  // 타이밍은 맞았지만 끊을 수 없는 큰 기술
  perfectGuard: { flash: [1.5, 0xdfeeff, 0.16], sparks: [18, 5, 0.9, 0.35], light: [0xdbe8ff, 16, 0.09], cam: { trauma: 0.3, kick: 0.1, fov: 1.2 }, slow: [0.5, 0.1], pulse: 0.3 },
  // 일반 방어: 따뜻한 불꽃
  guard: { flash: [0.9, 0xffd9a0, 0.13], sparks: [12, 4.2, 0.8, 0.6], light: [0xffcf9a, 10, 0.09], cam: { trauma: 0.28, kick: 0.1, fov: -0.8 }, pulse: 0.12 },
  // 가드 브레이크: 붉은 섬광 (어두운 붉은색 사용처)
  guardBreak: { flash: [1.5, 0xff8a60, 0.2], sparks: [34, 6, 1.0, 0.7], light: [0xff7a4a, 24, 0.14], cam: { trauma: 0.8, kick: 0.3, fov: -2.5 }, slow: [0.4, 0.18], screen: ['255,120,80', 0.2], pulse: 0.55 },
};

/** 한 번에 같은 종류가 겹쳐 화면을 가리지 않도록 (초) */
const FLASH_SCALE = 0.55;
const LIGHT_SCALE = 0.45;
const COOLDOWN: Partial<Record<ImpactKind, number>> = { light: 0.04, clang: 0.1 };

export interface VfxQuality {
  /** 파티클 개수 배율 */
  particles: number;
  /** 순간 조명/연기 층/줌 블러 같은 비싼 효과 허용 */
  rich: boolean;
}

interface Timer { t: number; fn: (() => void) | null }

const V = THREE.Vector3;
const FURY_EMBER = new THREE.Color(1.6, 0.8, 0.2);

export class CombatVfx {
  readonly trails = new SlashTrailPool(3);
  /** 후처리가 읽는 순간 충격값(0..1, 빠르게 감쇠) */
  pulse = 0;
  private light: THREE.PointLight;
  private lightPeak = 0;
  private lightT = 0;
  private lightDur = 0.1;
  private timers: Timer[] = [];
  private quality: VfxQuality = { particles: 1, rich: true };
  private trailSerial = -1;
  private airCutSerial = -1;
  private lastCool: Partial<Record<ImpactKind, number>> = {};
  private clock = 0;
  private staggerRingT = 0;
  private tmpP = new V();
  private tmpN = new V();
  private tmpD = new V();
  private tmpK = new V();
  private lastTip = new V();
  private hasTip = false;
  /** 진단/테스트용: 마지막으로 재생한 효과 */
  lastImpact: ImpactKind | null = null;
  played = 0;

  constructor(
    private fx: Fx,
    private particles: Particles,
    private decals: Decals,
    private cam: CameraRig,
    private hooks: () => { onScreenFlash?: (c: string, s: number) => void; onSlowmo?: (scale: number, dur: number) => void },
    private camera: () => THREE.Camera,
  ) {
    // 조명은 시작할 때 한 번만 만든다 (런타임에 라이트 개수가 바뀌면 모든 재질 셰이더가 다시 컴파일된다)
    this.light = new THREE.PointLight(0xffffff, 0, 9, 2);
    this.light.castShadow = false;
    for (let i = 0; i < 24; i++) this.timers.push({ t: 0, fn: null });
  }

  get lightObject() { return this.light; }
  get group() { return this.trails.group; }

  setQuality(q: VfxQuality) {
    this.quality = q;
    this.trails.smoke = q.rich;
  }

  clear() {
    this.trails.clear();
    this.pulse = 0;
    this.lightPeak = 0;
    this.light.intensity = 0;
    for (const t of this.timers) t.fn = null;
    this.trailSerial = -1;
    this.airCutSerial = -1;
    this.hasTip = false;
    this.staggerRingT = 0;
  }

  private after(delay: number, fn: () => void) {
    const t = this.timers.find((x) => !x.fn);
    if (!t) return; // 풀이 가득 차면 후속 연출은 생략한다 (게임플레이에 영향 없음)
    t.t = delay;
    t.fn = fn;
  }

  private flashLight(pos: THREE.Vector3, color: number, intensity: number, dur: number) {
    if (!this.quality.rich) return;
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.lightPeak = Math.max(this.lightPeak * 0.5, intensity);
    this.lightDur = dur;
    this.lightT = 0;
  }

  /** 매 프레임: 타이머/조명/충격값 갱신 */
  update(dt: number, sim: GameSim) {
    this.clock += dt;
    for (const t of this.timers) {
      if (!t.fn) continue;
      t.t -= dt;
      if (t.t <= 0) { const f = t.fn; t.fn = null; f(); }
    }
    if (this.lightPeak > 0) {
      this.lightT += dt;
      const u = this.lightT / this.lightDur;
      if (u >= 1) { this.lightPeak = 0; this.light.intensity = 0; } else this.light.intensity = this.lightPeak * (1 - u) * (1 - u);
    }
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.trails.update(dt);
    this.updateStaggerAura(sim, dt);
  }

  /** 경직한 사자 발밑에 차가운 링이 반복해서 퍼지고 머리 위로 흰 입자가 오른다 — "지금이 기회"라는 신호 */
  private updateStaggerAura(sim: GameSim, dt: number) {
    const l = sim.lion;
    const on = (l.mode === 'stagger' || l.mode === 'stunned') && l.hp > 0 && sim.phase === 'fight';
    if (!on) { this.staggerRingT = 0; return; }
    this.staggerRingT -= dt;
    if (this.staggerRingT <= 0) {
      this.staggerRingT = l.execReady ? 0.42 : 0.7;
      this.fx.shock(l.pos.x, l.pos.z, 0.5, l.execReady ? 3.6 : 2.6, 0.55, 0.22, l.execReady ? 0xf4f8ff : 0xaec4e8, l.execReady ? 0.55 : 0.3);
    }
  }

  // ── 검 궤적 ───────────────────────────────────────────────────────────────

  /** 공격 종류에 따른 궤적 스타일 */
  static styleFor(sim: GameSim): SlashStyle {
    const p = sim.player;
    if (p.executing) return 'execute';
    if (p.furyT > 0) return 'fury';
    if (p.attackId === 'heavy') return 'heavy';
    if (p.runAttack) return 'run';
    if (p.attackId === 'light3') return 'finisher';
    return 'light';
  }

  /**
   * 플레이어 검 궤적: 실제 검 위치(base/tip, 매 렌더 프레임 보간된 값)를 따라 그린다.
   * 유효 구간 직전(검이 가속하는 구간)부터 끝난 직후까지만 그리며, 공격 속도에 따라 두께/밝기가 달라진다.
   */
  updateSlash(sim: GameSim, base: THREE.Vector3, tip: THREE.Vector3, dt: number) {
    const p = sim.player;
    const def = p.mode === 'attack' && p.attackId ? PLAYER_ATTACKS[p.attackId] : null;
    if (!def || def.id === 'bash') { this.trails.end(); this.hasTip = false; return; }
    const heavy = def.id === 'heavy';
    const lead = heavy ? 0.2 : 0.1;
    const tail = heavy ? 0.12 : 0.05;
    const t = p.modeT;
    if (t < def.activeStart - lead || t > def.activeEnd + tail) { this.trails.end(); return; }
    if (p.attackSerial !== this.trailSerial || !this.trails.current?.active) {
      this.trailSerial = p.attackSerial;
      this.trails.begin(CombatVfx.styleFor(sim));
    }
    const tr = this.trails.current!;
    tr.push(base, tip, dt);
    // 공기 절단: 칼끝이 충분히 빠를 때 진행 방향으로 얇은 바람 줄기를 한 번 그린다
    if (this.airCutSerial !== p.attackSerial && tr.speed > 6.5 && t >= def.activeStart - 0.03 && this.hasTip) {
      this.airCutSerial = p.attackSerial;
      const dir = this.tmpD.copy(tip).sub(this.lastTip);
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        const len = 1.2 + Math.min(1.8, tr.speed * 0.1);
        const n = heavy ? 2 : 1;
        for (let i = 0; i < n; i++) {
          this.tmpP.copy(tip).addScaledVector(dir, -0.15).y += i * 0.12;
          this.fx.streakWorld(this.tmpP, dir, this.camera(), len, heavy ? 0.1 : 0.06, 0xcddcff, 0.12);
        }
      }
    }
    this.lastTip.copy(tip);
    this.hasTip = true;
  }

  // ── 충돌 연출 (프로필 재생) ────────────────────────────────────────────────

  /**
   * 충돌 지점 pos 에서 kind 프로필을 재생한다.
   * normal: 불꽃/파편이 튀는 쪽, dir: 칼이 지나간 방향, kickDir: 카메라가 밀릴 방향(월드)
   */
  impact(kind: ImpactKind, pos: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, kickDir: THREE.Vector3, scale = 1) {
    const cd = COOLDOWN[kind];
    if (cd !== undefined) {
      const last = this.lastCool[kind] ?? -10;
      if (this.clock - last < cd) return;
      this.lastCool[kind] = this.clock;
    }
    const pr = IMPACT_PROFILES[kind];
    const q = this.quality.particles;
    const n = (c: number) => Math.max(1, Math.round(c * q * scale));
    this.lastImpact = kind;
    this.played++;
    // 섬광은 화면을 가리지 않도록 크기를 억제한다 (밝기는 블룸이 알아서 번지게 둔다)
    this.fx.flash(pos, pr.flash[0] * scale * FLASH_SCALE, pr.flash[1], pr.flash[2]);
    if (pr.sparks) this.particles.metalSparks(pos, normal, n(pr.sparks[0]), pr.sparks[1], pr.sparks[2], pr.sparks[3]);
    if (pr.droplets) this.particles.droplets(pos, normal, n(pr.droplets));
    if (pr.fur) this.particles.furBurst(pos, normal, n(pr.fur));
    if (pr.shards) this.particles.shards(this.tmpP.set(pos.x, 0.05, pos.z), n(pr.shards), 3.5);
    if (pr.dust) this.particles.puff(this.tmpP.set(pos.x, 0.05, pos.z), 0.7, normal, n(pr.dust));
    if (pr.streaks) {
      const [cnt, len, wid, col, life] = pr.streaks;
      for (let i = 0; i < cnt; i++) {
        const ang = (i - (cnt - 1) / 2) * 0.38;
        this.tmpK.copy(dir).applyAxisAngle(this.cam.camera.up, ang);
        this.fx.streakWorld(pos, this.tmpK, this.camera(), len * scale, wid, col, life);
      }
    }
        if (pr.light) this.flashLight(pos, pr.light[0], pr.light[1] * scale * LIGHT_SCALE, pr.light[2]);
    this.cam.impact({ dir: kickDir, trauma: pr.cam.trauma * scale, kick: pr.cam.kick * scale, fov: pr.cam.fov * scale, roll: (pr.cam.roll ?? 0) * (Math.random() < 0.5 ? -1 : 1) });
    if (pr.slow) this.hooks().onSlowmo?.(pr.slow[0], pr.slow[1]);
    if (pr.screen) this.hooks().onScreenFlash?.(pr.screen[0], pr.screen[1]);
    this.pulse = Math.max(this.pulse, pr.pulse * scale);
  }

  /** 지면이 실제로 맞았을 때만: 먼지 벽, 돌 파편, 낮은 충격파, 뒤이어 가라앉는 먼지 */
  groundImpact(x: number, z: number, power: number, opts: { ring?: boolean; settle?: boolean; light?: boolean } = {}) {
    const q = this.quality.particles;
    const c = this.tmpP.set(x, 0, z);
    this.particles.dustWave(c, 0.9 + power * 0.8, Math.max(6, Math.round((16 + power * 22) * q)), 2.2 + power * 2.2);
    this.particles.shards(this.tmpP.set(x, 0.05, z), Math.max(3, Math.round((5 + power * 9) * q)), 2.4 + power * 2.2);
    if (opts.ring !== false) this.fx.shock(x, z, 0.3, 2.2 + power * 2.6, 0.38 + power * 0.1, 0.4 + power * 0.25, 0xd9dde6, 0.3 + power * 0.3);
    if (opts.light !== false) this.flashLight(this.tmpP.set(x, 0.5, z), 0xffd7a8, 8 + power * 12, 0.14);
    if (opts.settle !== false) {
      const cx = x, cz = z, sp = 1.2 + power * 1.2, cnt = Math.max(5, Math.round((10 + power * 14) * q));
      this.after(0.3, () => this.particles.settleDust(this.tmpP.set(cx, 0, cz), sp, cnt));
      this.after(0.9, () => this.particles.settleDust(this.tmpP.set(cx, 0, cz), sp * 1.3, Math.round(cnt * 0.6)));
    }
    this.pulse = Math.max(this.pulse, 0.2 + power * 0.35);
  }

  // ── 이벤트 라우팅 ──────────────────────────────────────────────────────────

  /** 이 모듈이 담당하는 이벤트를 처리한다. 처리했으면 true (나머지 이벤트는 GameScene 이 처리) */
  handle(e: SimEvent, sim: GameSim): boolean {
    const p = sim.player.pos, l = sim.lion.pos;
    switch (e.type) {
      case 'playerHitLion': {
        const pos = this.tmpP.set(e.pos.x, e.pos.y, e.pos.z).clone();
        const nrm = this.tmpN.set(p.x - l.x, 0.3, p.z - l.z).normalize().clone();
        const dir = this.tmpD.set(e.dir.x, e.dir.y, e.dir.z).clone();
        const kick = this.tmpK.set(l.x - p.x, 0, l.z - p.z).clone();
        if (e.invuln) { this.impact('clang', pos, nrm, dir, kick); return true; }
        const kind: ImpactKind = e.execute ? 'execute' : e.bash ? 'bash' : e.heavy ? 'heavy' : e.riposte ? 'riposte' : e.run ? 'run' : e.finisher ? 'finisher' : 'light';
        const scale = (e.head && !e.execute ? 1.15 : 1) * (e.fury ? 1.2 : 1) * (e.witch ? 1.1 : 1);
        this.impact(kind, pos, nrm, dir, kick, scale);
        HIT_FLASH.lion.value = kind === 'execute' ? 0.55 : kind === 'heavy' ? 0.45 : kind === 'riposte' ? 0.4 : kind === 'finisher' ? 0.35 : 0.28;
        if (e.heavy || e.execute) this.after(0.25, () => this.particles.settleDust(this.tmpP.set(l.x, 0, l.z), 1.4, 8));
        // 중요한 순간 슬로모션: 처치 > 경직 유발
        if (e.killing) { this.hooks().onSlowmo?.(0.2, 1.1); this.hooks().onScreenFlash?.('255,240,210', 0.6); this.fx.shock(l.x, l.z, 0.6, 7, 0.9, 0.9, 0xfff0d0, 0.7); this.pulse = 1; }
        else if (e.stunned && !e.execute) this.hooks().onSlowmo?.(0.35, 0.2);
        return true;
      }
      case 'playerBlocked': {
        const pos = this.tmpP.set(e.pos.x, e.pos.y, e.pos.z).clone();
        const nrm = this.tmpN.set(p.x - l.x, 0.2, p.z - l.z).normalize().clone();
        const dir = this.tmpD.set(l.x - p.x, 0, l.z - p.z).normalize().clone();
        const kick = this.tmpK.set(l.x - p.x, 0, l.z - p.z).negate().clone();
        const kind: ImpactKind = e.broke ? 'guardBreak' : e.parry ? 'parry' : e.perfect ? 'perfectGuard' : 'guard';
        this.impact(kind, pos, nrm, dir, kick, e.broke ? 1 : kind === 'guard' ? 0.8 + e.strength * 0.5 : 1);
        this.particles.puff(this.tmpP.set(p.x, 0.1, p.z), 0.6 + e.strength * 0.5, nrm.clone().multiplyScalar(-1), e.parry ? 3 : 5);
        if (e.parry) {
          // 패링은 사자를 즉시 밀어내는 두 번째 충격(방사 링)과 사자의 몸이 젖혀지는 반응이 따른다
          this.after(0.06, () => this.fx.flash(this.tmpP.set(pos.x, pos.y, pos.z), 0.6, 0xffe9c8, 0.1));
        }
        return true;
      }
      case 'lionStagger': {
        const src = e.source ?? 'poise';
        const lp = this.tmpP.set(l.x, 0, l.z).clone();
        const head = lp.clone(); head.y = 1.25;
        if (src !== 'wall') {
          this.fx.flash(head, 1.0, 0xe8f0ff, 0.2);
          this.particles.metalSparks(head, this.tmpN.set(0, 0.6, 0).normalize(), Math.round(16 * this.quality.particles), 5, 1, 0.1);
        }
        this.fx.shock(l.x, l.z, 0.6, 6.5, 0.6, 0.5, 0xc4d6f6, 0.55);
        this.particles.dustWave(lp, 1.4, Math.max(8, Math.round(22 * this.quality.particles)), 3.2);
        this.particles.shards(this.tmpP.set(l.x, 0.05, l.z), Math.round(6 * this.quality.particles), 3);
        this.cam.impact({ dir: this.tmpK.set(l.x - p.x, 0, l.z - p.z), trauma: src === 'wall' ? 0.2 : 0.5, kick: 0.12, fov: 1.6 });
        this.hooks().onSlowmo?.(0.35, 0.25);
        this.hooks().onScreenFlash?.('205,224,255', 0.18);
        HIT_FLASH.lion.value = Math.max(HIT_FLASH.lion.value, 0.4);
        this.pulse = Math.max(this.pulse, 0.6);
        this.after(0.5, () => this.particles.settleDust(this.tmpP.set(l.x, 0, l.z), 1.6, 10));
        return true;
      }
      case 'executionStart': {
        // 시네마틱: 동작이 끝나기 전에 카메라가 게임플레이로 돌아와 입력 복귀 시점에는 이미 정상 시점이다
        const d = PLAYER_ATTACKS.heavy.activeEnd + 0.4;
        this.cam.startCine('execute', d, sim);
        this.hooks().onSlowmo?.(0.7, 0.3);
        this.pulse = Math.max(this.pulse, 0.35);
        return true;
      }
      case 'clash': {
        const pos = this.tmpP.set(e.pos.x, e.pos.y, e.pos.z).clone();
        const nrm = this.tmpN.set(p.x - l.x, 0.3, p.z - l.z).normalize().clone();
        const dir = this.tmpD.set(l.x - p.x, 0, l.z - p.z).normalize().clone();
        this.impact('clash', pos, nrm, dir, this.tmpK.set(l.x - p.x, 0, l.z - p.z).clone());
        return true;
      }
      case 'witchStart': {
        // 완벽 회피: 차가운 푸른 번쩍임과 시야 수축. 이후 분위기(mood)는 GameScene 이 witchT 동안 유지한다
        this.hooks().onScreenFlash?.('120,170,255', 0.16);
        this.cam.impact({ fov: -2.2, trauma: 0.15 });
        this.fx.shock(p.x, p.z, 0.2, 3.2, 0.5, 0.25, 0xb6d4ff, 0.5);
        this.pulse = Math.max(this.pulse, 0.5);
        return true;
      }
      case 'furyStart': {
        // 기세 폭발: 금빛 불씨가 폭발하듯 솟고 땅에서 충격파가 퍼진다
        this.particles.ember(this.tmpP.set(p.x, 0.1, p.z), Math.round(60 * this.quality.particles), 0.9, FURY_EMBER);
        this.fx.shock(p.x, p.z, 0.3, 5.5, 0.6, 0.6, 0xffd27a, 0.7);
        this.fx.flash(this.tmpP.set(p.x, 1.2, p.z), 1.6, 0xffe2a0, 0.25);
        this.hooks().onScreenFlash?.('255,200,90', 0.22);
        this.cam.impact({ fov: 3, trauma: 0.45 });
        this.pulse = Math.max(this.pulse, 0.8);
        return true;
      }
      case 'grappleStart': {
        // 사자가 달려들어 붙는 순간: 먼지 폭발과 낮은 충격, 이후 어깨 너머 시점으로 전환
        this.groundImpact(l.x, l.z, 0.8, { ring: false, settle: true });
        this.cam.impact({ dir: this.tmpK.set(p.x - l.x, 0, p.z - l.z), trauma: 0.8, kick: 0.25, fov: -2.5 });
        this.cam.startCine('grapple', 10, sim);
        this.hooks().onSlowmo?.(0.45, 0.28);
        this.hooks().onScreenFlash?.('200,60,40', 0.14);
        this.pulse = Math.max(this.pulse, 0.7);
        return true;
      }
      case 'qteResult': {
        if (!e.ok) return true; // 물렸을 때의 피격 연출은 playerHit 이벤트가 담당한다
        const pos = this.tmpP.set(e.pos.x, e.pos.y, e.pos.z).clone();
        const nrm = this.tmpN.set(p.x - l.x, 0.25, p.z - l.z).normalize().clone();
        const dir = this.tmpD.set(l.x - p.x, 0, l.z - p.z).normalize().clone();
        const kick = this.tmpK.set(l.x - p.x, 0, l.z - p.z).negate().clone();
        // 막을 때마다 "딱" — 타이밍이 정확하면(perfect) 패링급 섬광, 아니면 방어급
        this.impact(e.perfect ? 'parry' : 'perfectGuard', pos, nrm, dir, kick, e.perfect ? 1 : 0.85);
        return true;
      }
      case 'grappleCounter': {
        this.pulse = 1;
        this.hooks().onScreenFlash?.('255,240,215', 0.2);
        this.hooks().onSlowmo?.(0.3, 0.45);
        return true;
      }
      case 'grappleEnd': {
        if (e.outcome !== 'counter') this.cam.endCine();
        return true;
      }
      case 'playerSlam': {
        // 강공격이 지면을 찍는 순간. 사자 몸에 맞은 경우(hit)는 몸 쪽 연출이, 빗나가 바닥을 때린 경우만 땅 연출이 강하다
        const big = !sim.lion || Math.hypot(e.pos.x - l.x, e.pos.z - l.z) > 1.6;
        this.groundImpact(e.pos.x, e.pos.z, big ? 0.9 : 0.5, { ring: true, settle: true });
        this.cam.impact({ dir: this.tmpK.set(l.x - p.x, 0, l.z - p.z), trauma: big ? 0.5 : 0.35, fov: 1.6 });
        return true;
      }
      default: return false;
    }
  }

  /**
   * 보스 공격 준비 연출: 몸을 낮추고 모래가 일어나며, 위험한 기술일수록 시야가 좁아진다.
   * 공격이 실제로 시작(lionAttack)되면 긴장이 풀린다.
   */
  bossTell(attack: keyof typeof LION_ATTACKS, dur: number, sim: GameSim) {
    const l = sim.lion.pos;
    const lvl: Partial<Record<string, number>> = { quake: 1, charge: 0.85, pounce: 0.7, whirl: 0.65, dashBite: 0.5, flurry: 0.35, bite: 0.25, swipe: 0.25, rear: 0.3 };
    const level = lvl[attack] ?? 0.2;
    this.cam.setTension(level, dur + 0.2);
    const q = this.quality.particles;
    const f = this.tmpD.set(Math.sin(sim.lion.yaw), 0, Math.cos(sim.lion.yaw));
    if (level >= 0.5) {
      // 앞발 부근에서 모래가 튀어 오르고 가라앉는다 (바닥을 박차기 전의 긴장)
      this.particles.puff(this.tmpP.set(l.x + f.x * 0.8, 0.05, l.z + f.z * 0.8), 0.6 + level * 0.5, f.clone().multiplyScalar(-1), Math.max(2, Math.round(4 * q)));
      this.after(Math.max(0.1, dur * 0.5), () => this.particles.settleDust(this.tmpP.set(l.x, 0, l.z), 1.6, Math.round(6 * q)));
    } else {
      this.particles.puff(this.tmpP.set(l.x + f.x * 0.6, 0.05, l.z + f.z * 0.6), 0.35, f.clone().multiplyScalar(-1), 2);
    }
    if (level >= 0.85) this.fx.shock(l.x, l.z, 0.3, 2.4, Math.max(0.5, dur * 0.8), 0.2, 0xb8b4aa, 0.22);
  }

  releaseTell(strength = 0.3) {
    this.cam.setTension(0);
    void strength;
  }

  dispose() {
    this.trails.dispose();
    this.light.dispose();
  }
}
