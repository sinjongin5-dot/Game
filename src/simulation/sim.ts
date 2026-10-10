import { RapierPhysics } from '../physics/rapierPhysics';
import type { Physics } from '../physics/types';
import { ARENA } from './arena';
import { resolveLionAttack, resolvePlayerAttack } from './combat';
import type { SimContext } from './context';
import { createLion, setLionMode, updateLion } from './lion';
import { Rng, clamp, v2 } from './math';
import { createPlayer, setMode, updatePlayer } from './player';
import { emptyInput, type InputFrame, type SimEvent, type Stats } from './state';
import { TUNING } from './tuning';

export interface SimOptions {
  seed?: number;
  skipIntro?: boolean;
}

const INTRO = {
  walkEnd: 3.4,
  gateCloseAt: 3.6,
  lionGateAt: 4.2,
  lionEnterAt: 5.6,
  total: 12,
};

/**
 * 게임 규칙의 단일 원본. 렌더링 오브젝트에 어떤 상태도 두지 않는다.
 * 고정 시간 간격(60Hz) 으로 갱신하고, 렌더 쪽은 alpha 로 보간한다.
 */
export class GameSim {
  ctx: SimContext;
  alpha = 0;
  private acc = 0;
  introT = 0;
  introSkippable = true;
  deathT = 0;
  victoryT = 0;
  private lionEnterStarted = false;
  private gateClosed = false;
  private lionGateEventSent = false;
  attemptSeed: number;
  prevPlayer = { x: 0, z: 0, yaw: 0 };
  prevLion = { x: 0, z: 0, yaw: 0, y: 0 };
  tick = 0;

  constructor(public physics: Physics, private opts: SimOptions = {}) {
    this.attemptSeed = opts.seed ?? 1337;
    this.ctx = this.makeContext();
    this.reset({ skipIntro: opts.skipIntro ?? false });
  }

  static async createWithRapier(opts: SimOptions = {}): Promise<GameSim> {
    return new GameSim(await RapierPhysics.create(), opts);
  }

  private makeContext(): SimContext {
    const stats: Stats = { time: 0, damageTaken: 0, dodges: 0, blocks: 0, hitsLanded: 0, heals: 0, attempts: 0 };
    return {
      player: createPlayer(), lion: createLion(), physics: this.physics, rng: new Rng(this.attemptSeed), events: [],
      stats, time: 0, phase: 'intro', hitstop: 0, graceUntil: 0, controlEnabled: false,
    };
  }

  get player() { return this.ctx.player; }
  get lion() { return this.ctx.lion; }
  get phase() { return this.ctx.phase; }
  get stats() { return this.ctx.stats; }

  /** 모든 상태를 처음 값으로 되돌린다 (재도전 시 호출) */
  reset(o: { skipIntro?: boolean; seed?: number } = {}) {
    const attempts = this.ctx ? this.ctx.stats.attempts + 1 : 1;
    if (o.seed !== undefined) this.attemptSeed = o.seed;
    const ctx = this.makeContext();
    ctx.stats.attempts = attempts;
    // 같은 객체 참조를 유지하는 쪽(외부 구독자)을 위해 ctx 를 갈아끼운다
    this.ctx = ctx;
    this.acc = 0;
    this.alpha = 0;
    this.deathT = 0;
    this.victoryT = 0;
    this.introT = 0;
    this.tick = 0;
    this.lionEnterStarted = false;
    this.gateClosed = false;
    this.lionGateEventSent = false;
    this.physics.setGatesClosed(false);
    if (o.skipIntro) {
      this.setupFightStart();
    } else {
      this.setupIntro();
    }
    this.prevPlayer = { x: ctx.player.pos.x, z: ctx.player.pos.z, yaw: ctx.player.yaw };
    this.prevLion = { x: ctx.lion.pos.x, z: ctx.lion.pos.z, yaw: ctx.lion.yaw, y: 0 };
  }

  private setupIntro() {
    const c = this.ctx;
    c.phase = 'intro';
    c.controlEnabled = false;
    c.player.pos = { x: ARENA.playerGate.x, z: ARENA.playerGate.z - 3.4 };
    c.player.yaw = 0;
    setMode(c.player, 'scripted');
    c.lion.pos = { x: ARENA.lionGate.x, z: ARENA.lionGate.z + 4.5 };
    c.lion.yaw = Math.PI;
    setLionMode(c.lion, 'dormant', 99);
    this.physics.teleport('player', c.player.pos, 0);
    this.physics.teleport('lion', c.lion.pos, Math.PI);
  }

  private setupFightStart() {
    const c = this.ctx;
    c.phase = 'fight';
    c.controlEnabled = true;
    c.player.pos = { x: ARENA.playerStart.x, z: ARENA.playerStart.z };
    c.player.yaw = 0;
    setMode(c.player, 'free');
    c.lion.pos = { x: ARENA.lionStart.x, z: ARENA.lionStart.z };
    c.lion.yaw = Math.PI;
    setLionMode(c.lion, 'idle', 1.0);
    c.graceUntil = 1.8;
    this.physics.teleport('player', c.player.pos, 0);
    this.physics.teleport('lion', c.lion.pos, Math.PI);
    this.physics.setGatesClosed(true);
    this.gateClosed = true;
    this.lionGateEventSent = true;
    this.lionEnterStarted = true;
    c.events.push({ type: 'fightStart' });
  }

  /** 입장 연출 건너뛰기 */
  skipIntro() {
    if (this.ctx.phase !== 'intro') return;
    const events = this.ctx.events;
    this.setupFightStart();
    this.ctx.events = events;
    this.ctx.events.push({ type: 'gateClose' });
    this.prevPlayer = { x: this.ctx.player.pos.x, z: this.ctx.player.pos.z, yaw: this.ctx.player.yaw };
    this.prevLion = { x: this.ctx.lion.pos.x, z: this.ctx.lion.pos.z, yaw: this.ctx.lion.yaw, y: 0 };
  }

  drainEvents(): SimEvent[] {
    const e = this.ctx.events;
    this.ctx.events = [];
    return e;
  }

  /** 프레임 시간으로 갱신. 누적 시간은 상한을 둬 탭 복귀 시 폭주를 막는다. */
  update(frameDt: number, input: InputFrame) {
    this.acc += Math.min(frameDt, TUNING.maxFrameDt);
    let n = 0;
    const pressed = { ...input.pressed };
    while (this.acc >= TUNING.dt && n < TUNING.maxSubSteps) {
      this.step({ ...input, pressed }, TUNING.dt);
      // 한 번 발생한 눌림 이벤트는 첫 스텝에서만 소비
      pressed.light = pressed.heavy = pressed.dodge = pressed.heal = pressed.lock = false;
      this.acc -= TUNING.dt;
      n++;
    }
    if (n === TUNING.maxSubSteps) this.acc = 0;
    this.alpha = this.acc / TUNING.dt;
  }

  /** 단일 고정 스텝 */
  step(input: InputFrame = emptyInput(), dt = TUNING.dt) {
    const c = this.ctx;
    this.tick++;
    this.prevPlayer = { x: c.player.pos.x, z: c.player.pos.z, yaw: c.player.yaw };
    this.prevLion = { x: c.lion.pos.x, z: c.lion.pos.z, yaw: c.lion.yaw, y: c.lion.y };

    if (c.hitstop > 0) {
      c.hitstop = Math.max(0, c.hitstop - dt);
      return;
    }

    if (c.phase === 'intro') {
      this.stepIntro(dt);
      return;
    }

    if (c.phase === 'fight' || c.phase === 'playerDead' || c.phase === 'victory') {
      if (c.phase === 'fight') {
        c.time += dt;
        c.stats.time = c.time;
      }
      updatePlayer(c, input, dt);
      updateLion(c, dt);
      resolvePlayerAttack(c);
      resolveLionAttack(c);
      this.physics.step();
      this.checkEnd(dt);
    }
  }

  private stepIntro(dt: number) {
    const c = this.ctx;
    this.introT += dt;
    const t = this.introT;
    const p = c.player;
    if (t < INTRO.walkEnd) {
      const target = ARENA.playerStart.z;
      const startZ = ARENA.playerGate.z - 3.4;
      const u = clamp(t / INTRO.walkEnd, 0, 1);
      const ease = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      const z = startZ + (target - startZ) * ease;
      p.vel = v2(0, (z - p.pos.z) / dt);
      p.pos = { x: 0, z };
      p.speed = Math.abs(p.vel.z);
      p.moveLocal = { x: 0, z: p.vel.z };
      this.physics.teleport('player', p.pos, 0);
    } else {
      p.vel = v2();
      p.speed = 0;
      p.moveLocal = v2();
    }
    p.modeT += dt;
    if (t >= INTRO.gateCloseAt && !this.gateClosed) {
      this.gateClosed = true;
      c.events.push({ type: 'gateClose' });
    }
    if (t >= INTRO.lionGateAt && !this.lionGateEventSent) {
      this.lionGateEventSent = true;
      c.events.push({ type: 'lionGateOpen' });
    }
    if (t >= INTRO.lionEnterAt && !this.lionEnterStarted) {
      this.lionEnterStarted = true;
      setLionMode(c.lion, 'enter', 99);
    }
    if (this.lionEnterStarted) {
      c.lion.modeT += 0; // 모드 시간은 updateLion 이 관리
      updateLion(c, dt);
      c.lion.invuln = true;
      if (c.lion.mode === 'idle') {
        // 포효 종료 → 전투 시작
        this.beginFight();
      }
    }
  }

  private beginFight() {
    const c = this.ctx;
    c.phase = 'fight';
    c.controlEnabled = true;
    setMode(c.player, 'free');
    c.player.yaw = 0;
    c.lion.invuln = false;
    c.graceUntil = c.time + 1.8;
    this.physics.teleport('player', c.player.pos, c.player.yaw);
    this.physics.setGatesClosed(true);
    c.events.push({ type: 'fightStart' });
  }

  private checkEnd(dt: number) {
    const c = this.ctx;
    if (c.phase === 'fight') {
      if (c.player.mode === 'dead') {
        c.phase = 'playerDead';
        this.deathT = 0;
      } else if (c.lion.mode === 'dying' || c.lion.mode === 'dead') {
        c.phase = 'victory';
        this.victoryT = 0;
        c.events.push({ type: 'victory' });
        setMode(c.player, c.player.mode === 'free' || c.player.mode === 'attack' ? 'victory' : 'victory');
        c.player.attackId = null;
      }
    } else if (c.phase === 'playerDead') {
      this.deathT += dt;
    } else if (c.phase === 'victory') {
      this.victoryT += dt;
    }
  }

  dispose() {
    this.physics.dispose();
  }
}
