import { clipTravel, LIGHT_CHAIN, PLAYER_ATTACKS, sampleSword, SWORD, type PlayerAttackId } from '../combat/attackData';
import type { SimContext } from './context';
import {
  approach, approachAngle, clamp, dist2, forward, leftOf, len2, norm2, v2, wrapAngle, yawOf,
  worldToLocal2, type V2,
} from './math';
import { TUNING } from './tuning';
import type { InputFrame, PlayerState } from './state';

const T = TUNING.player;

export function createPlayer(): PlayerState {
  return {
    pos: { x: 0, z: -8.2 }, yaw: 0, vel: v2(), hp: T.hp, hpMax: T.hp, stamina: T.stamina, staminaMax: T.stamina,
    staminaDelay: 0, exhausted: false, heals: T.heal.charges, mode: 'free', modeT: 0,
    attackId: null, attackSerial: 0, attackHitDone: false, attackTravel: 0, slamFired: false, attackChain: 0, lastAttackEnd: -10,
    dodge: { dir: v2(0, 1), backstep: false, dodgedSet: 0 },
    guardHeld: false, guardUpT: 0, guardImpact: 0, healApplied: false,
    hitDir: v2(0, -1), hitHeavy: false, invulnT: 0, knock: v2(), lockOn: false, running: false, speed: 0,
    moveLocal: v2(), buffer: { action: null, t: 0 }, prevBlade: null, swingFired: false, lowStaminaFlash: 0, lastDodgeStart: -10,
  };
}

export function setMode(p: PlayerState, mode: PlayerState['mode']) {
  p.mode = mode;
  p.modeT = 0;
}

/** 현재 회피 무적 여부 */
export function isDodgeInvulnerable(p: PlayerState): boolean {
  return p.mode === 'dodge' && p.modeT >= T.dodge.iStart && p.modeT <= T.dodge.iEnd;
}

/** 방패가 활성 상태인지 (들어 올린 뒤 raise 시간 경과) */
export function isGuardUp(p: PlayerState): boolean {
  return p.guardHeld && p.guardUpT >= T.block.raise && (p.mode === 'free' || p.mode === 'dodge' && p.modeT >= T.dodge.cancelAt);
}

function spend(ctx: SimContext, p: PlayerState, cost: number): boolean {
  if (p.stamina < cost) {
    p.lowStaminaFlash = 0.5;
    ctx.events.push({ type: 'staminaDenied' });
    return false;
  }
  p.stamina -= cost;
  p.staminaDelay = T.staminaRegenDelay;
  if (p.stamina <= 0) {
    p.stamina = 0;
    p.exhausted = true;
    p.staminaDelay = 1.1;
  }
  return true;
}

/** 히트스톱 중에도 눌린 행동 입력을 잃지 않도록 버퍼에 쌓는다 */
export function bufferDuringHitstop(p: PlayerState, input: InputFrame) {
  if (p.mode === 'dead' || p.mode === 'scripted' || p.mode === 'victory') return;
  if (input.pressed.light) bufferAction(p, 'light');
  if (input.pressed.heavy) bufferAction(p, 'heavy');
  if (input.pressed.dodge) bufferAction(p, 'dodge');
  if (input.pressed.heal) bufferAction(p, 'heal');
}

function bufferAction(p: PlayerState, a: 'light' | 'heavy' | 'dodge' | 'heal') {
  p.buffer.action = a;
  p.buffer.t = T.inputBuffer;
}

function inputDir(input: InputFrame): V2 {
  const f = forward(input.cameraYaw);
  const r = { x: -leftOf(input.cameraYaw).x, z: -leftOf(input.cameraYaw).z };
  const x = f.x * input.moveY + r.x * input.moveX;
  const z = f.z * input.moveY + r.z * input.moveX;
  const l = Math.hypot(x, z);
  if (l < 0.01) return v2();
  const m = Math.min(1, l);
  return { x: (x / l) * m, z: (z / l) * m };
}

/**
 * 공격 시작 시 방향 보정(자동 조준). 락온 중이거나 사자가 가까이 있고 입력 방향이 크게 다르지 않으면
 * 사자를 향해 몸을 즉시 돌린다 — 조금 빗나간 입력으로 허공을 가르는 일을 줄인다.
 */
function aimAssist(ctx: SimContext, p: PlayerState, input: InputFrame) {
  const lion = ctx.lion;
  if (lion.mode === 'dying' || lion.mode === 'dead') return;
  const d = dist2(p.pos, lion.pos);
  if (d > 6.5) return;
  const toLion = yawOf(norm2({ x: lion.pos.x - p.pos.x, z: lion.pos.z - p.pos.z }));
  const wish = inputDir(input);
  if (p.lockOn) { p.yaw = toLion; return; }
  if (len2(wish) > 0.2) {
    // 입력 방향이 사자 쪽(±80°)이면 사자 방향으로, 아니면 입력 방향으로
    const wy = yawOf(wish);
    p.yaw = Math.abs(wrapAngle(wy - toLion)) < 1.4 ? toLion : wy;
    return;
  }
  if (Math.abs(wrapAngle(p.yaw - toLion)) < 1.5) p.yaw = toLion;
}

function startAttack(ctx: SimContext, p: PlayerState, id: PlayerAttackId, chain: number, input?: InputFrame): boolean {
  const def = PLAYER_ATTACKS[id];
  if (!spend(ctx, p, def.cost)) return false;
  if (input) aimAssist(ctx, p, input);
  p.mode = 'attack';
  p.modeT = 0;
  p.attackId = id;
  p.attackSerial++;
  p.slamFired = false;
  p.attackTravel = 0;
  if (def.clip) {
    // 도약 내려찍기: 사자 앞 1.7m 지점에 내려앉도록 이동 거리를 정한다 (사자가 없거나 정면이 아니면 기본 거리)
    const lion = ctx.lion;
    const dl = dist2(p.pos, lion.pos);
    const toLion = yawOf(norm2({ x: lion.pos.x - p.pos.x, z: lion.pos.z - p.pos.z }));
    const ahead = lion.mode !== 'dying' && lion.mode !== 'dead' && Math.abs(wrapAngle(p.yaw - toLion)) < 0.9 && dl < 7.5;
    p.attackTravel = ahead ? clamp(dl - 1.7, 0.35, def.clip.travelMax) : 2.0;
  }
  p.attackHitDone = false;
  p.attackChain = chain;
  p.prevBlade = null;
  p.swingFired = false;
  p.buffer.action = null;
  return true;
}

function startDodge(ctx: SimContext, p: PlayerState, input: InputFrame): boolean {
  if (!spend(ctx, p, T.dodgeCost)) return false;
  const d = inputDir(input);
  let dir = d;
  let back = false;
  if (len2(d) < 0.2) {
    const f = forward(p.yaw);
    dir = { x: -f.x, z: -f.z };
    back = true;
  } else {
    dir = norm2(d);
    // 락온 중 뒤로 입력은 백스텝으로 취급
    if (p.lockOn) {
      const rel = dir.x * forward(p.yaw).x + dir.z * forward(p.yaw).z;
      if (rel < -0.85) back = true;
    }
  }
  p.mode = 'dodge';
  p.modeT = 0;
  p.dodge = { dir, backstep: back, dodgedSet: 0 };
  p.lastDodgeStart = ctx.time;
  if (!back) p.yaw = yawOf(dir);
  p.buffer.action = null;
  ctx.events.push({ type: 'playerDodge', backstep: back });
  return true;
}

function startHeal(ctx: SimContext, p: PlayerState): boolean {
  if (p.heals <= 0 || p.hp >= p.hpMax) return false;
  p.heals--; // 소비 시점: 시작 즉시 (취소/중단해도 돌려받지 않음)
  p.mode = 'heal';
  p.modeT = 0;
  p.healApplied = false;
  p.buffer.action = null;
  ctx.events.push({ type: 'healStart' });
  return true;
}

export function updatePlayer(ctx: SimContext, input: InputFrame, dt: number) {
  const p = ctx.player;
  const lion = ctx.lion;
  p.modeT += dt;
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.lowStaminaFlash = Math.max(0, p.lowStaminaFlash - dt);
  p.guardImpact = Math.max(0, p.guardImpact - dt * 3.2);
  p.buffer.t -= dt;
  if (p.buffer.t <= 0) p.buffer.action = null;
  p.knock = { x: approach(p.knock.x, 0, 14 * dt), z: approach(p.knock.z, 0, 14 * dt) };

  const dead = p.mode === 'dead';
  const scripted = p.mode === 'scripted';
  const canAct = ctx.controlEnabled && !dead && !scripted && p.mode !== 'victory';

  // 입력 캐치
  if (canAct) {
    if (input.pressed.lock) {
      p.lockOn = !p.lockOn;
      ctx.events.push({ type: 'lockOn', on: p.lockOn });
    }
    if (input.pressed.light) bufferAction(p, 'light');
    if (input.pressed.heavy) bufferAction(p, 'heavy');
    if (input.pressed.dodge) bufferAction(p, 'dodge');
    if (input.pressed.heal) bufferAction(p, 'heal');
  }
  const wasGuard = p.guardHeld;
  p.guardHeld = canAct && input.guard;
  if (p.guardHeld && !wasGuard) p.guardUpT = 0;
  if (p.guardHeld) p.guardUpT += dt;
  else p.guardUpT = 0;

  // 스태미나 회복
  if (!dead) {
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    if (p.staminaDelay <= 0) {
      let rate = T.staminaRegen;
      if (p.guardHeld) rate *= T.guardRegenMul;
      if (p.mode === 'heal') rate *= 0.4;
      p.stamina = Math.min(p.staminaMax, p.stamina + rate * dt);
      if (p.exhausted && p.stamina >= 20) p.exhausted = false;
    }
  }

  const wish = canAct ? inputDir(input) : v2();
  const lionDir = norm2({ x: lion.pos.x - p.pos.x, z: lion.pos.z - p.pos.z });
  const toLionYaw = yawOf(lionDir);
  let delta: V2 = v2();

  switch (p.mode) {
    case 'free': {
      // 행동 시작 판정 (우선순위: 회피 > 회복 > 강공격 > 약공격)
      const a = p.buffer.action;
      if (a === 'dodge' && startDodge(ctx, p, input)) break;
      if (a === 'heal') { if (!startHeal(ctx, p)) p.buffer.action = null; else break; }
      if (a === 'heavy' && startAttack(ctx, p, 'heavy', 0, input)) break;
      if (a === 'light') {
        // 직전 공격 직후 짧은 시간 안이면 연계 이어감 (마지막 타 이후엔 처음부터)
        const chainContinue = ctx.time - p.lastAttackEnd < 0.0;
        void chainContinue;
        if (startAttack(ctx, p, 'light1', 0, input)) break;
        p.buffer.action = null;
      }
      // 이동
      const guarding = p.guardHeld;
      let maxSpeed: number = guarding ? T.guardMoveSpeed : T.walkSpeed;
      p.running = false;
      if (!guarding && input.run && len2(wish) > 0.1 && p.stamina > 0 && !p.exhausted) {
        p.running = true;
        maxSpeed = T.runSpeed;
        p.stamina = Math.max(0, p.stamina - T.runDrain * dt);
        p.staminaDelay = Math.max(p.staminaDelay, 0.35);
        if (p.stamina <= 0) { p.exhausted = true; p.staminaDelay = 1.0; }
      }
      const target = { x: wish.x * maxSpeed, z: wish.z * maxSpeed };
      const acc = T.accel * dt * (len2(wish) > 0.05 ? 1 : 2.0);
      p.vel = { x: approach(p.vel.x, target.x, acc), z: approach(p.vel.z, target.z, acc) };
      delta = { x: (p.vel.x + p.knock.x) * dt, z: (p.vel.z + p.knock.z) * dt };
      // 방향
      if (p.lockOn) p.yaw = approachAngle(p.yaw, toLionYaw, 14 * dt);
      else if (guarding) p.yaw = approachAngle(p.yaw, input.cameraYaw, 12 * dt);
      else if (len2(wish) > 0.1) p.yaw = approachAngle(p.yaw, yawOf(wish), T.turnRate * dt);
      break;
    }
    case 'attack': {
      const def = PLAYER_ATTACKS[p.attackId!];
      const t = p.modeT;
      // 추적 회전
      if (t < def.trackUntil) {
        const desired = p.lockOn ? toLionYaw : len2(wish) > 0.1 ? yawOf(wish) : (dist2(p.pos, lion.pos) < 5 ? toLionYaw : p.yaw);
        p.yaw = approachAngle(p.yaw, desired, 12 * dt);
      }
      // 돌진 이동 (루트 모션)
      const f = forward(p.yaw);
      let ls: number;
      if (def.clip) {
        // 클립 이동 곡선의 미분: 이번 스텝에 진행한 만큼 나아간다
        const dProg = clipTravel(def.clip.name, t) - clipTravel(def.clip.name, Math.max(0, t - dt));
        ls = (dProg * p.attackTravel) / dt;
        if (!p.slamFired && t >= def.clip.slamAt) {
          p.slamFired = true;
          ctx.events.push({ type: 'playerSlam', pos: { x: p.pos.x + f.x * 1.1, z: p.pos.z + f.z * 1.1 }, hit: false });
        }
      } else {
        const lt0 = def.lunge.start, lt1 = def.lunge.end;
        const lungeSpeed = t >= lt0 && t <= lt1 ? (def.lunge.distance / (lt1 - lt0)) : 0;
        // 정지 상태에서 시작하면 일정 속도로 나가되, 사자와 너무 가까우면 멈춘다
        const close = dist2(p.pos, lion.pos) < TUNING.arena.lionRadius + TUNING.arena.playerRadius + 0.55;
        ls = close ? 0 : lungeSpeed;
      }
      p.vel = { x: f.x * ls, z: f.z * ls };
      delta = { x: (p.vel.x + p.knock.x) * dt, z: (p.vel.z + p.knock.z) * dt };
      // 스윙 소리 시점
      if (!p.swingFired && t >= def.swingSound) {
        p.swingFired = true;
        ctx.events.push({ type: 'playerSwing', id: def.id });
      }
      // 연계
      if (p.buffer.action === 'light' && def.next && t >= def.comboAt - T.inputBuffer) {
        if (t >= def.comboAt) {
          p.lastAttackEnd = ctx.time;
          if (startAttack(ctx, p, def.next, p.attackChain + 1, input)) break;
        }
      }
      // 후딜 이동 취소: 유효 구간이 끝난 뒤 이동 입력을 하면 바로 걸어 나간다 (끈적임 방지)
      if (t >= Math.max(def.activeEnd + 0.1, def.cancelAt - 0.08) && len2(wish) > 0.5 && !p.buffer.action) {
        p.lastAttackEnd = ctx.time;
        p.attackId = null;
        setMode(p, 'free');
        break;
      }
      // 취소 (회피)
      if (t >= def.cancelAt) {
        if (p.buffer.action === 'dodge' && startDodge(ctx, p, input)) break;
        if (p.guardHeld) { p.lastAttackEnd = ctx.time; setMode(p, 'free'); p.attackId = null; break; }
      }
      if (t >= def.duration) {
        p.lastAttackEnd = ctx.time;
        p.attackId = null;
        setMode(p, 'free');
      }
      break;
    }
    case 'dodge': {
      const t = p.modeT;
      const dd = T.dodge;
      const dist = p.dodge.backstep ? dd.backDistance : dd.distance;
      // 속도 곡선: 초반 빠르게, 이후 감속 (적분 = dist)
      const u = clamp(t / dd.duration, 0, 1);
      const prevU = clamp((t - dt) / dd.duration, 0, 1);
      const ease = (x: number) => 1 - Math.pow(1 - x, 2.2);
      const step = (ease(u) - ease(prevU)) * dist;
      delta = { x: p.dodge.dir.x * step + p.knock.x * dt, z: p.dodge.dir.z * step + p.knock.z * dt };
      p.vel = { x: delta.x / dt, z: delta.z / dt };
      if (t >= dd.cancelAt) {
        if (p.buffer.action === 'light' && startAttack(ctx, p, 'light1', 0, input)) break;
        if (p.buffer.action === 'heavy' && startAttack(ctx, p, 'heavy', 0, input)) break;
      }
      if (t >= dd.duration) setMode(p, 'free');
      break;
    }
    case 'guardBreak':
    case 'hit': {
      const dur = p.mode === 'guardBreak' ? T.guardBreakStun : p.hitHeavy ? T.bigHitStun : T.hitStun;
      p.vel = { x: p.knock.x, z: p.knock.z };
      delta = { x: p.knock.x * dt, z: p.knock.z * dt };
      if (p.modeT >= dur) setMode(p, 'free');
      break;
    }
    case 'heal': {
      const hd = T.heal;
      p.vel = { x: approach(p.vel.x, wish.x * 0.8, 10 * dt), z: approach(p.vel.z, wish.z * 0.8, 10 * dt) };
      delta = { x: (p.vel.x + p.knock.x) * dt, z: (p.vel.z + p.knock.z) * dt };
      if (p.lockOn) p.yaw = approachAngle(p.yaw, toLionYaw, 6 * dt);
      if (!p.healApplied && p.modeT >= hd.applyAt) {
        p.healApplied = true;
        const before = p.hp;
        p.hp = Math.min(p.hpMax, p.hp + hd.amount);
        ctx.stats.heals++;
        ctx.events.push({ type: 'heal', amount: p.hp - before });
      }
      if (p.healApplied && p.modeT >= 0.95) {
        if (p.buffer.action === 'dodge' && startDodge(ctx, p, input)) break;
      }
      if (p.modeT >= hd.duration) setMode(p, 'free');
      break;
    }
    case 'scripted':
    case 'dead':
    case 'victory': {
      p.vel = { x: approach(p.vel.x, 0, 12 * dt), z: approach(p.vel.z, 0, 12 * dt) };
      delta = { x: (p.vel.x + p.knock.x) * dt, z: (p.vel.z + p.knock.z) * dt };
      break;
    }
  }

  const oldPos = p.pos;
  if (p.mode !== 'scripted' || delta.x !== 0 || delta.z !== 0) {
    const np = ctx.physics.moveCharacter('player', oldPos, delta);
    p.pos = np;
    // 실제 이동 속도 (충돌로 막힌 경우 반영)
    const real = { x: (np.x - oldPos.x) / dt, z: (np.z - oldPos.z) / dt };
    if (p.mode === 'free') p.vel = { x: real.x - p.knock.x, z: real.z - p.knock.z };
    p.speed = Math.hypot(real.x, real.z);
    p.moveLocal = worldToLocal2(v2(), p.yaw, real);
  }
  ctx.physics.setYaw('player', p.yaw);
  if (p.mode === 'dead') p.speed = 0;
}

/** 플레이어 검의 월드 선분 (판정/표시 공용) */
export function playerBladeSegment(p: PlayerState): { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } } | null {
  if (p.mode !== 'attack' || !p.attackId) return null;
  const def = PLAYER_ATTACKS[p.attackId];
  const s = sampleSword(def, p.modeT);
  const f = forward(p.yaw), l = leftOf(p.yaw);
  const toW = (x: number, y: number, z: number) => ({ x: p.pos.x + l.x * x + f.x * z, y, z: p.pos.z + l.z * x + f.z * z });
  const a = toW(s.hand.x + s.dir.x * SWORD.bladeStart, s.hand.y + s.dir.y * SWORD.bladeStart, s.hand.z + s.dir.z * SWORD.bladeStart);
  const e = SWORD.bladeStart + SWORD.bladeLen;
  const b = toW(s.hand.x + s.dir.x * e, s.hand.y + s.dir.y * e, s.hand.z + s.dir.z * e);
  return { a, b };
}

export function bladeActive(p: PlayerState): boolean {
  if (p.mode !== 'attack' || !p.attackId) return false;
  const def = PLAYER_ATTACKS[p.attackId];
  return p.modeT >= def.activeStart && p.modeT <= def.activeEnd;
}

export const LIGHT_IDS = LIGHT_CHAIN;
void wrapAngle;
