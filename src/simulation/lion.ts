import { LION_ATTACKS, sampleLionPath, type LionAttackDef, type LionAttackId } from '../combat/attackData';
import type { SimContext } from './context';
import { ARENA, wallDistance } from './arena';
import {
  angleDiff, approach, approachAngle, clamp, dist2, forward, leftOf, len2, localToWorld2, norm2, v2, yawOf, smoothstep, type V2, type V3,
} from './math';
import { TUNING } from './tuning';
import type { LionAttackState, LionState } from './state';

const L = TUNING.lion;

export function createLion(): LionState {
  return {
    pos: { x: ARENA.lionStart.x, z: ARENA.lionStart.z }, y: 0, yaw: Math.PI, vel: v2(), speed: 0,
    hp: L.hp, hpMax: L.hp, poise: 0, poiseDelay: 0, staggerImmune: 0, phase: 1, pendingPhase2: false, invuln: false,
    mode: 'idle', modeT: 0, modeDur: 1, attack: null, attackSerial: 0, circleDir: 1, circleT: 0, approachRange: 2.6,
    cooldown: { swipe: 0, bite: 0, pounce: 2, charge: 4, rear: 0, flurry: 3, dashBite: 2.5, backHop: 5, quake: 6, whirl: 3 }, history: [], behindT: 0, sinceAttack: 0, postDelay: 0,
    flinch: 0, flinchDir: v2(), turnRate: 0, lookYaw: 0, deadT: 0, roarT: 0, landed: 0, thinkT: 0.6,
  };
}

export function setLionMode(l: LionState, mode: LionState['mode'], dur = 1) {
  l.mode = mode;
  l.modeT = 0;
  l.modeDur = dur;
}

export function lionLocalToWorld(l: LionState, p: V3): V3 {
  const w = localToWorld2(l.pos, l.yaw, p.x, p.z);
  return { x: w.x, y: l.y + p.y, z: w.z };
}

/** 공격 정의에서 2페이즈 보정이 적용된 타이밍 배율 (준비 동작 단축) */
export function phaseTimeScale(l: LionState): number {
  return l.phase === 2 ? 0.9 : 1;
}

/** 현재 유효 구간 번호. 연타 공격은 여러 구간을 가진다. 유효하지 않으면 -1 */
export function activeWindowIndex(l: LionState): number {
  const a = l.attack;
  if (!a) return -1;
  const def = LION_ATTACKS[a.id];
  if (def.kind === 'none') return -1;
  if (def.windows) return def.windows.findIndex(([s, e]) => a.t >= s && a.t <= e);
  if (def.id === 'charge') return a.t >= def.activeStart && l.speed > 4.5 && !a.braking ? 0 : -1;
  return a.t >= def.activeStart && a.t <= def.activeEnd ? 0 : -1;
}

export function attackIsActive(l: LionState): boolean {
  return activeWindowIndex(l) >= 0;
}

export type LionVolume =
  | { kind: 'sphere'; c: V3; r: number }
  | { kind: 'capsule'; a: V3; b: V3; r: number }
  | { kind: 'ring'; c: V3; r: number; w: number };

/** 현재 공격의 판정 볼륨 (월드 좌표) */
export function lionAttackVolume(l: LionState): LionVolume | null {
  const a = l.attack;
  if (!a) return null;
  const def = LION_ATTACKS[a.id];
  if (def.kind === 'none') return null;
  if (def.kind === 'ring' && def.ring) {
    const u = clamp((a.t - def.activeStart) / (def.activeEnd - def.activeStart), 0, 1);
    return { kind: 'ring', c: { x: l.pos.x, y: 0, z: l.pos.z }, r: def.ring.r0 + (def.ring.r1 - def.ring.r0) * u, w: def.ring.width };
  }
  if (def.kind === 'body') {
    const cap = def.bodyCap ?? { z0: -0.6, z1: 0.8, r: def.radius };
    return {
      kind: 'capsule',
      a: lionLocalToWorld(l, { x: 0, y: 0.95, z: cap.z0 }),
      b: lionLocalToWorld(l, { x: 0, y: 0.95, z: cap.z1 }),
      r: cap.r,
    };
  }
  const p = sampleLionPath(def, a.t, a.mirror);
  return { kind: 'sphere', c: lionLocalToWorld(l, p), r: def.radius };
}

/** 피격 가능한 구체 */
export function lionHurtSpheres(l: LionState): { name: string; c: V3; r: number }[] {
  const crouch = l.attack && (l.attack.id === 'pounce') && l.attack.t < 0.95 ? -0.25 * smoothstep(0.2, 0.8, l.attack.t) : 0;
  const headPath = l.attack && (LION_ATTACKS[l.attack.id].kind === 'bite') ? sampleLionPath(LION_ATTACKS[l.attack.id], l.attack.t, false) : null;
  const head = headPath ? { x: 0, y: headPath.y + 0.05, z: headPath.z - 0.1 } : { x: 0, y: 1.12 + crouch * 0.5, z: 1.42 };
  return [
    { name: 'head', c: lionLocalToWorld(l, head), r: 0.36 },
    { name: 'chest', c: lionLocalToWorld(l, { x: 0, y: 0.95 + crouch, z: 0.5 }), r: 0.6 },
    { name: 'rump', c: lionLocalToWorld(l, { x: 0, y: 0.95 + crouch, z: -0.62 }), r: 0.54 },
    { name: 'foreL', c: lionLocalToWorld(l, { x: 0.2, y: 0.4, z: 0.55 }), r: 0.24 },
    { name: 'foreR', c: lionLocalToWorld(l, { x: -0.2, y: 0.4, z: 0.55 }), r: 0.24 },
  ];
}

function lionTrackedDir(ctx: SimContext): V2 {
  return norm2({ x: ctx.player.pos.x - ctx.lion.pos.x, z: ctx.player.pos.z - ctx.lion.pos.z });
}

function bearingAbs(ctx: SimContext): number {
  const toP = yawOf(lionTrackedDir(ctx));
  return Math.abs(angleDiff(toP, ctx.lion.yaw));
}

const PICKABLE: LionAttackId[] = ['swipe', 'bite', 'pounce', 'charge', 'flurry', 'dashBite', 'backHop', 'quake', 'whirl'];
const BASE_WEIGHT: Record<string, number> = { swipe: 3.0, bite: 2.2, pounce: 2.4, charge: 2.0, flurry: 2.2, dashBite: 2.4, backHop: 1.8, quake: 1.4, whirl: 1.2 };

function pickAttack(ctx: SimContext): LionAttackId | null {
  const l = ctx.lion;
  const d = dist2(ctx.player.pos, l.pos);
  const bearing = bearingAbs(ctx);
  const cands: { id: LionAttackId; w: number }[] = [];
  const p2 = l.phase === 2;
  for (const id of PICKABLE) {
    const def = LION_ATTACKS[id];
    if (l.cooldown[id] > 0) continue;
    if (d < def.range[0] || d > def.range[1]) continue;
    if (bearing > def.bearingMax) continue;
    let w = BASE_WEIGHT[id];
    if (id === 'charge' && d < 8.5 && ctx.rng.next() < 0.5) continue;
    const last = l.history[l.history.length - 1];
    const prev = l.history[l.history.length - 2];
    if (last === id) w *= 0.15;
    else if (prev === id) w *= 0.6;
    if (last === id && prev === id) w = 0;
    if (p2 && (id === 'swipe' || id === 'pounce')) w *= 1.25;
    // 같은 계열(할퀴기/물기)이 연속되지 않게 다른 패턴에 가중
    if (last && last !== id && ((last === 'swipe' || last === 'flurry') && (id === 'swipe' || id === 'flurry'))) w *= 0.5;
    if (last && ((last === 'bite' || last === 'dashBite') && (id === 'bite' || id === 'dashBite'))) w *= 0.5;
    // 근접할수록 앞발/물기 선호, 중거리일수록 도약/돌진 물기
    if (id === 'swipe' && d < 2.3) w *= 1.3;
    if (id === 'bite' && d < 1.9) w *= 1.3;
    if (id === 'whirl') w *= d < 2.1 ? 2.2 : 0.7;
    if (id === 'whirl' && bearing > 1.6) w *= 1.8; // 등 뒤에 선 상대를 쓸어낸다
    if (id === 'quake') { w *= p2 ? 1.8 : l.hp < l.hpMax * 0.85 ? 0.8 : 0.25; if (d > 4.5) w *= 0.6; }
    if (id === 'flurry') w *= p2 ? 1.5 : 0.8;
    if (id === 'backHop') w *= p2 ? 1.5 : 0.8;
    if (id === 'dashBite' && d > 5.5) w *= 1.2;
    if (w > 0) cands.push({ id, w });
  }
  if (!cands.length) return null;
  const tot = cands.reduce((s, c) => s + c.w, 0);
  let r = ctx.rng.next() * tot;
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.id;
  }
  return cands[cands.length - 1].id;
}

export function startLionAttack(ctx: SimContext, id: LionAttackId, chained = false, startT = 0) {
  const l = ctx.lion;
  const def = LION_ATTACKS[id];
  l.attackSerial++;
  const toP = lionTrackedDir(ctx);
  const rel = angleDiff(yawOf(toP), l.yaw);
  const phase2 = l.phase === 2;
  let combo: LionAttackId | null = null;
  if (phase2 && !chained) {
    if (id === 'swipe' && ctx.rng.next() < 0.5) combo = 'swipeBite';
    if (id === 'pounce' && ctx.rng.next() < 0.55) combo = 'pounceSwat';
  }
  if (id === 'backHop') combo = 'pounce';
  // 전조 정지(페인트): 박자를 읽고 구르면 빗나가게 만든다. 가끔만, 2페이즈에서 더 자주.
  const holdable = id === 'swipe' || id === 'bite' || id === 'dashBite' || id === 'flurry';
  const hold = holdable && ctx.rng.next() < (phase2 ? 0.45 : 0.22) ? 0.28 + ctx.rng.next() * 0.34 : 0;
  l.attack = {
    id, t: startT, serial: l.attackSerial, win: -1, hold, slammed: false, lungeWin: -1,
    mirror: rel > 0, // 플레이어가 왼쪽(+)에 있으면 왼발
    hitDone: false, dodged: false, lockDir: toP, lockDist: 0, lunge: 0, leapFrom: null, leapTo: null,
    chargeDist: 0, chargeMax: 0, chargeSpeed: 0, wallHit: false, combo, prevVol: null, phase: 'windup', braking: false, blockedBy: false, fired: false, wasActive: false,
  };
  l.mode = 'attack';
  l.modeT = 0;
  l.sinceAttack = 0;
  if (!chained) {
    l.history.push(id);
    if (l.history.length > 4) l.history.shift();
  }
  ctx.events.push({ type: 'lionWindup', attack: id, dur: def.windup * phaseTimeScale(l) });
}

function endAttack(ctx: SimContext) {
  const l = ctx.lion;
  const a = l.attack;
  if (!a) return;
  const def = LION_ATTACKS[a.id];
  l.cooldown[a.id] = def.cooldown * (l.phase === 2 ? 0.8 : 1);
  l.attack = null;
  l.y = 0;
  // 큰 기술은 끝난 뒤 빈틈이 길다 (반격 기회)
  const extra = a.id === 'quake' ? 0.55 : a.id === 'whirl' ? 0.5 : a.id === 'dashBite' ? 0.35 : a.id === 'flurry' ? 0.3 : 0;
  setLionMode(l, 'recover', (l.phase === 2 ? 0.2 + ctx.rng.next() * 0.2 : 0.35 + ctx.rng.next() * 0.3) + extra);
}

function beginPhase2(ctx: SimContext) {
  const l = ctx.lion;
  l.phase = 2;
  l.pendingPhase2 = false;
  l.invuln = true;
  l.attack = null;
  l.y = 0;
  setLionMode(l, 'roar', 2.3);
  ctx.events.push({ type: 'phase2' });
  ctx.events.push({ type: 'lionRoar', phase2: true });
}

/** 사자 이동 적용 (충돌 해결 포함) */
function applyMove(ctx: SimContext, speed: number, dt: number, dirYaw?: number): { blocked: boolean } {
  const l = ctx.lion;
  const f = forward(dirYaw ?? l.yaw);
  const want = { x: f.x * speed * dt, z: f.z * speed * dt };
  const before = l.pos;
  const np = ctx.physics.moveCharacter('lion', before, want);
  const real = { x: np.x - before.x, z: np.z - before.z };
  l.pos = np;
  l.vel = { x: real.x / dt, z: real.z / dt };
  const wl = Math.hypot(want.x, want.z);
  const rl = Math.hypot(real.x, real.z);
  l.speed = rl / dt;
  return { blocked: wl > 1e-4 && rl < wl * 0.45 };
}

function turnToward(l: LionState, targetYaw: number, rate: number, dt: number) {
  const old = l.yaw;
  l.yaw = approachAngle(l.yaw, targetYaw, rate * dt);
  l.turnRate = angleDiff(l.yaw, old) / dt;
}

export function updateLion(ctx: SimContext, dt: number) {
  const l = ctx.lion;
  const p = ctx.player;
  l.modeT += dt;
  l.flinch = Math.max(0, l.flinch - dt * 4);
  l.landed = Math.max(0, l.landed - dt * 2.5);
  for (const k of Object.keys(l.cooldown)) l.cooldown[k] = Math.max(0, l.cooldown[k] - dt);
  l.sinceAttack += dt;
  l.staggerImmune = Math.max(0, l.staggerImmune - dt);
  l.poiseDelay = Math.max(0, l.poiseDelay - dt);
  if (l.poiseDelay <= 0 && l.poise > 0) l.poise = Math.max(0, l.poise - L.poiseDecay * dt);
  l.turnRate = 0;

  // 머리 시선
  const toP = yawOf(lionTrackedDir(ctx));
  const lookTarget = clamp(angleDiff(toP, l.yaw), -1.1, 1.1);
  l.lookYaw += (lookTarget - l.lookYaw) * Math.min(1, dt * 6);

  if (l.mode === 'dying' || l.mode === 'dead') {
    l.deadT += dt;
    l.speed = approach(l.speed, 0, 6 * dt);
    if (l.speed > 0.05) applyMove(ctx, l.speed, dt);
    else { l.vel = v2(); l.speed = 0; }
    if (l.mode === 'dying' && l.modeT > 3.6) setLionMode(l, 'dead', 1);
    return;
  }

  if (l.hp <= 0) {
    l.attack = null;
    l.y = 0;
    l.invuln = false;
    setLionMode(l, 'dying', 3.6);
    ctx.events.push({ type: 'lionDeath' });
    return;
  }
  if (!l.pendingPhase2 && l.phase === 1 && l.hp <= l.hpMax * L.phase2At) l.pendingPhase2 = true;

  // 플레이어가 죽었으면 공격 중지
  if (p.mode === 'dead') {
    if (l.mode === 'attack') l.attack = null;
    if (l.mode !== 'victory') setLionMode(l, 'victory', 99);
  }

  // 뒤쪽 체류 시간
  const behind = bearingAbs(ctx) > 2.1 && dist2(p.pos, l.pos) < 3.6;
  l.behindT = behind ? l.behindT + dt : Math.max(0, l.behindT - dt * 2);

  switch (l.mode) {
    case 'dormant':
      l.speed = 0;
      break;
    case 'enter': {
      // 문에서 시작 지점까지 걸어 들어온다 (연출)
      const target = ARENA.lionStart;
      const dir = norm2({ x: target.x - l.pos.x, z: target.z - l.pos.z });
      const d = Math.hypot(target.x - l.pos.x, target.z - l.pos.z);
      turnToward(l, yawOf(dir), 2.6, dt);
      const sp = Math.min(2.4, d * 1.5 + 0.2);
      applyMove(ctx, d < 0.15 ? 0 : sp, dt);
      if (d < 0.15) {
        l.speed = 0;
        l.roarT = 0;
        setLionMode(l, 'roar', 2.2);
        ctx.events.push({ type: 'lionRoar', phase2: false });
      }
      break;
    }
    case 'roar': {
      l.speed = approach(l.speed, 0, 8 * dt);
      if (l.speed > 0.05) applyMove(ctx, l.speed, dt);
      else { l.vel = v2(); l.speed = 0; }
      turnToward(l, toP, 1.0, dt);
      if (l.modeT >= l.modeDur) {
        l.invuln = false;
        setLionMode(l, 'idle', 0.6);
        l.sinceAttack = 0;
      }
      break;
    }
    case 'idle': {
      l.speed = approach(l.speed, 0, 7 * dt);
      if (l.speed > 0.05) applyMove(ctx, l.speed, dt); else { l.vel = v2(); l.speed = 0; }
      turnToward(l, toP, L.turnRateWalk, dt);
      if (l.modeT >= l.modeDur && ctx.time >= ctx.graceUntil) decide(ctx);
      break;
    }
    case 'recover': {
      l.speed = approach(l.speed, 0, 9 * dt);
      if (l.speed > 0.05) applyMove(ctx, l.speed, dt); else { l.vel = v2(); l.speed = 0; }
      turnToward(l, toP, L.turnRateWalk * 0.8, dt);
      if (l.modeT >= l.modeDur) decide(ctx);
      break;
    }
    case 'circle': {
      const d = dist2(p.pos, l.pos);
      l.circleT -= dt;
      // 접선 방향 + 반경 유지
      const toDir = lionTrackedDir(ctx);
      const tangent = { x: -toDir.z * l.circleDir, z: toDir.x * l.circleDir };
      const targetR = 5.2;
      const radial = clamp((d - targetR) * 0.5, -0.7, 0.7);
      let hx = tangent.x + toDir.x * radial, hz = tangent.z + toDir.z * radial;
      // 벽 회피: 바깥을 향하면 안쪽으로 보정
      const wd = wallDistance(l.pos);
      if (wd < 2.6) {
        const inward = norm2({ x: -l.pos.x, z: -l.pos.z });
        const k = clamp((2.6 - wd) / 2.6, 0, 1);
        hx = hx * (1 - k) + inward.x * k;
        hz = hz * (1 - k) + inward.z * k;
      }
      const hd = yawOf(norm2({ x: hx, z: hz }));
      turnToward(l, hd, L.turnRateWalk * 1.1, dt);
      const aligned = 1 - Math.min(1, Math.abs(angleDiff(hd, l.yaw)) / 1.2);
      const spd = L.circleSpeed * (l.phase === 2 ? 1.25 : 1) * aligned;
      l.speed = approach(l.speed, spd, 4 * dt);
      const r = applyMove(ctx, l.speed, dt);
      void r;
      if (opportunistic(ctx, dt)) break;
      if (ctx.time >= ctx.graceUntil && (l.circleT <= 0 || d < 3.3)) decide(ctx);
      break;
    }
    case 'approach': {
      const d = dist2(p.pos, l.pos);
      turnToward(l, toP, d > 8 ? L.turnRateRun : L.turnRateWalk * 1.2, dt);
      const aligned = 1 - Math.min(1, Math.abs(angleDiff(toP, l.yaw)) / 1.4);
      const chase = 1 + 0.45 * clamp((l.modeT - 1.2) / 3, 0, 1); // 플레이어가 계속 물러나면 속도를 올려 추격
      const spd = (d > 9 ? L.runSpeed * 0.8 : d > 5 ? L.walkSpeed * 1.5 : L.walkSpeed) * chase * (l.phase === 2 ? 1.15 : 1) * aligned;
      l.speed = approach(l.speed, spd, 5 * dt);
      applyMove(ctx, l.speed, dt);
      if (opportunistic(ctx, dt)) break;
      if (ctx.time >= ctx.graceUntil && d <= l.approachRange) decide(ctx);
      else if (l.modeT > 6) decide(ctx);
      break;
    }
    case 'attack':
      updateAttack(ctx, dt);
      break;
    case 'stagger':
    case 'stunned': {
      l.speed = approach(l.speed, 0, 12 * dt);
      if (l.speed > 0.05) applyMove(ctx, l.speed, dt); else { l.vel = v2(); l.speed = 0; }
      l.invuln = false;
      if (l.modeT >= l.modeDur) {
        setLionMode(l, 'recover', 0.4);
        l.sinceAttack = 0;
      }
      break;
    }
    case 'victory': {
      l.speed = approach(l.speed, 0, 9 * dt);
      if (l.speed > 0.05) applyMove(ctx, l.speed, dt); else { l.vel = v2(); l.speed = 0; }
      break;
    }
  }
}

/** 이동 중에도 거리가 맞으면 공격을 시작한다 (접근/선회 중 재평가) */
function opportunistic(ctx: SimContext, dt: number): boolean {
  const l = ctx.lion;
  l.thinkT -= dt;
  if (l.thinkT > 0 || ctx.time < ctx.graceUntil || ctx.player.mode === 'dead') return false;
  l.thinkT = 0.3 + ctx.rng.next() * 0.25;
  if (l.pendingPhase2) { beginPhase2(ctx); return true; }
  const atk = pickAttack(ctx);
  if (!atk) return false;
  const chance = atk === 'charge' ? 0.5 : atk === 'pounce' ? 0.4 : 0.55;
  if (ctx.rng.next() < chance) {
    startLionAttack(ctx, atk);
    return true;
  }
  return false;
}

/** 다음 행동 결정 */
function decide(ctx: SimContext) {
  const l = ctx.lion;
  const p = ctx.player;
  if (p.mode === 'dead') return;
  if (l.pendingPhase2) {
    beginPhase2(ctx);
    return;
  }
  const d = dist2(p.pos, l.pos);
  // 뒤쪽 견제
  if (l.behindT > 1.1 && l.cooldown.rear <= 0 && d < 3.2) {
    startLionAttack(ctx, 'rear');
    l.behindT = 0;
    return;
  }
  // 오래 공격하지 않으면 공격성 증가
  const aggressive = l.sinceAttack > 5.5;
  const atk = pickAttack(ctx);
  if (atk && (aggressive || ctx.rng.next() < 0.78)) {
    startLionAttack(ctx, atk);
    return;
  }
  if (d > 7.2 || aggressive) {
    l.approachRange = 2.0 + ctx.rng.next() * 0.9;
    setLionMode(l, 'approach', 5);
    return;
  }
  // 옆으로 돌며 관찰
  if (ctx.rng.next() < 0.3 || d < 3.0 && ctx.rng.next() < 0.45) {
    setLionMode(l, 'idle', 0.35 + ctx.rng.next() * 0.55);
    return;
  }
  if (ctx.rng.next() < 0.4) l.circleDir = l.circleDir === 1 ? -1 : 1;
  l.circleT = (l.phase === 2 ? 1.2 : 1.8) + ctx.rng.next() * 1.6;
  setLionMode(l, 'circle', l.circleT);
  if (d < 4.2) {
    // 가까우면 접근 후 공격 준비
    l.approachRange = 2.2 + ctx.rng.next() * 0.7;
    if (ctx.rng.next() < 0.55) setLionMode(l, 'approach', 4);
  }
}

function updateAttack(ctx: SimContext, dt: number) {
  const l = ctx.lion;
  const a = l.attack!;
  const def = LION_ATTACKS[a.id];
  const ts = phaseTimeScale(l);
  // 2페이즈는 준비 동작 단축: 시간 진행을 가속 (windup 구간만)
  let adv = a.t < def.windup ? dt / ts : dt;
  if (a.hold > 0 && a.t >= def.windup - 0.14 && a.t < def.windup) { a.hold -= dt; adv = 0; }
  a.t += adv;
  const t = a.t;
  const p = ctx.player;
  const toP = lionTrackedDir(ctx);
  const dP = dist2(p.pos, l.pos);

  if (!a.fired && def.kind !== 'body' && def.kind !== 'ring' && def.kind !== 'none' && t >= def.activeStart - 0.05) {
    a.fired = true;
    ctx.events.push({ type: 'lionAttack', attack: a.id });
  }
  if (a.t < def.windup) a.phase = 'windup';
  else if (t <= def.activeEnd) a.phase = 'active';
  else a.phase = 'recover';

  // 추적 회전 (결정 직전까지만, 제한 속도)
  if (t < def.trackUntil && a.id !== 'charge') {
    turnToward(l, yawOf(toP), def.trackRate * (l.phase === 2 ? 1.1 : 1), dt);
  } else if (a.id === 'charge' && t < def.trackUntil) {
    turnToward(l, yawOf(toP), def.trackRate, dt);
  }
  if (a.lockDist === 0 && t >= def.trackUntil) {
    a.lockDist = Math.max(0.5, dP);
    a.lockDir = forward(l.yaw);
  }

  switch (a.id) {
    case 'swipe':
    case 'rear': {
      if (a.id === 'rear' && t < def.windup) {
        // 천천히 몸을 돌려 플레이어를 향한다 (즉시 180도 회전 금지)
        turnToward(l, yawOf(toP), 3.0, dt);
      }
      if (a.lunge === 0 && t >= 0.45) a.lunge = clamp(dP - 1.4, 0, 1.15);
      const w0 = def.activeStart - 0.22, w1 = def.activeEnd;
      let sp = 0;
      if (t >= w0 && t <= w1) sp = a.lunge / (w1 - w0);
      else if (t < w0) sp = 0.35;
      l.speed = sp;
      if (sp > 0) applyMove(ctx, sp, dt);
      else { l.vel = v2(); }
      break;
    }
    case 'bite':
    case 'swipeBite': {
      if (a.lunge === 0 && t >= (a.id === 'bite' ? 0.35 : 0.1)) a.lunge = clamp(dP - 1.15, 0, a.id === 'bite' ? 1.25 : 1.0);
      const w0 = def.activeStart - 0.12, w1 = def.activeEnd;
      let sp = 0;
      if (t >= w0 && t <= w1) sp = a.lunge / (w1 - w0);
      else if (t < w0 && a.id === 'bite') sp = 0.25;
      l.speed = sp;
      if (sp > 0) applyMove(ctx, sp, dt);
      else l.vel = v2();
      break;
    }
    case 'flurry': {
      // 구간마다 짧게 앞으로 파고들며 다시 조준한다 (마지막 타는 더 깊게)
      const wins = def.windows!;
      const idx = wins.findIndex(([ws, we]) => t >= ws - 0.2 && t <= we);
      let sp = 0;
      if (idx >= 0) {
        if (a.lungeWin !== idx) { a.lungeWin = idx; a.lunge = clamp(dP - 1.35, 0, idx === 2 ? 1.0 : 0.65); }
        const ws = wins[idx][0] - 0.2, we = wins[idx][1];
        sp = a.lunge / (we - ws);
      }
      // 타격 사이에 플레이어를 다시 향한다
      if (idx < 0 && t > wins[0][1] && t < wins[2][0] - 0.2) turnToward(l, yawOf(toP), 3.2, dt);
      l.speed = sp;
      if (sp > 0) applyMove(ctx, sp, dt); else l.vel = v2();
      break;
    }
    case 'dashBite': {
      if (a.lunge === 0 && t >= def.trackUntil) a.lunge = clamp(dP - 1.15, 1.6, 5.4);
      const w0 = 0.5, w1 = def.activeEnd - 0.02;
      let sp = 0;
      if (a.lunge > 0 && t >= w0 && t <= w1) sp = a.lunge / (w1 - w0);
      else if (t < w0) sp = 0;
      l.speed = sp;
      if (sp > 0) applyMove(ctx, sp, dt); else l.vel = v2();
      break;
    }
    case 'backHop': {
      const H0 = 0.08, H1 = 0.6;
      turnToward(l, yawOf(toP), 3.4, dt);
      if (t >= H0 && t <= H1) {
        if (!a.leapFrom) {
          a.leapFrom = { ...l.pos };
          const away = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
          let dist = 3.6;
          // 벽/기둥에 막히지 않게 도착 지점이 경기장 안쪽이 되도록 줄인다
          while (dist > 1.2 && (wallDistance({ x: l.pos.x + away.x * dist, z: l.pos.z + away.z * dist }) < 1.8
            || ARENA.pillars.some((c) => Math.hypot(c.x - (l.pos.x + away.x * dist), c.z - (l.pos.z + away.z * dist)) < c.r + 1.4))) dist -= 0.4;
          a.leapTo = { x: l.pos.x + away.x * dist, z: l.pos.z + away.z * dist };
          a.lockDir = away;
          ctx.events.push({ type: 'lionHop', pos: { ...l.pos }, to: { ...a.leapTo } });
          ctx.events.push({ type: 'lionAttack', attack: 'backHop' });
        }
        const u = (t - H0) / (H1 - H0);
        l.y = 0.75 * 4 * u * (1 - u);
        const sp = Math.hypot(a.leapTo!.x - a.leapFrom.x, a.leapTo!.z - a.leapFrom.z) / (H1 - H0);
        applyMove(ctx, sp, dt, yawOf(a.lockDir));
      } else {
        if (t > H1 && l.y > 0) { l.y = 0; l.landed = 0.6; ctx.events.push({ type: 'lionLand', pos: { ...l.pos } }); }
        l.speed = approach(l.speed, 0, 14 * dt);
        if (l.speed > 0.1) applyMove(ctx, l.speed, dt); else l.vel = v2();
      }
      break;
    }
    case 'quake': {
      l.speed = 0;
      l.vel = v2();
      if (!a.slammed && t >= def.activeStart) {
        a.slammed = true;
        ctx.events.push({ type: 'lionSlam', pos: { ...l.pos } });
        ctx.events.push({ type: 'lionAttack', attack: 'quake' });
      }
      break;
    }
    case 'whirl': {
      l.speed = 0;
      l.vel = v2();
      const sign = a.mirror ? 1 : -1;
      const ANT = 0.5; // 반대 방향으로 몸을 감는 예비 동작(rad)
      if (t >= 0.3 && t < def.activeStart) l.yaw -= sign * ANT * (dt / (def.activeStart - 0.3));
      else if (t >= def.activeStart && t <= def.activeEnd) l.yaw += sign * (Math.PI * 2 + ANT) * (dt / (def.activeEnd - def.activeStart));
      if (!a.fired && t >= def.activeStart - 0.05) { a.fired = true; ctx.events.push({ type: 'lionAttack', attack: 'whirl' }); }
      break;
    }
    case 'pounceSwat': {
      if (a.lunge === 0 && t >= 0.1) a.lunge = clamp(dP - 1.5, 0, 1.0);
      const w0 = def.activeStart - 0.15, w1 = def.activeEnd;
      const sp = t >= w0 && t <= w1 ? a.lunge / (w1 - w0) : 0;
      l.speed = sp;
      if (sp > 0) applyMove(ctx, sp, dt); else l.vel = v2();
      break;
    }
    case 'pounce': {
      const LEAP0 = 0.95, FLIGHT = 0.55;
      if (t < LEAP0) {
        l.speed = 0;
        l.vel = v2();
        l.y = 0;
      } else if (t < LEAP0 + FLIGHT) {
        if (!a.leapFrom) {
          a.leapFrom = { ...l.pos };
          const L2 = clamp(a.lockDist + 0.6, 3.5, 9.5);
          const f = forward(l.yaw);
          a.leapTo = { x: l.pos.x + f.x * L2, z: l.pos.z + f.z * L2 };
          ctx.events.push({ type: 'lionAttack', attack: 'pounce' });
        }
        const u = (t - LEAP0) / FLIGHT;
        const sp = Math.hypot(a.leapTo!.x - a.leapFrom.x, a.leapTo!.z - a.leapFrom.z) / FLIGHT;
        l.y = 1.4 * 4 * u * (1 - u);
        const r = applyMove(ctx, sp, dt);
        void r;
      } else {
        if (l.y > 0 || !a.wallHit) {
          if (l.y > 0) {
            l.y = 0;
            l.landed = 1;
            ctx.events.push({ type: 'lionLand', pos: { ...l.pos } });
            a.wallHit = true; // 착지 이벤트 1회 보장용
          }
        }
        l.speed = approach(l.speed, 0, 14 * dt);
        if (l.speed > 0.1) applyMove(ctx, l.speed, dt); else l.vel = v2();
      }
      break;
    }
    case 'charge': {
      const WIND = def.windup;
      if (t < WIND) {
        l.speed = 0;
        l.vel = v2();
      } else if (!a.braking) {
        if (a.chargeMax === 0) {
          a.chargeMax = clamp(a.lockDist + 3.5, 9, 22);
          ctx.events.push({ type: 'lionAttack', attack: 'charge' });
        }
        a.chargeSpeed = Math.min(11.5, a.chargeSpeed + 10.5 * dt);
        const res = applyMove(ctx, a.chargeSpeed, dt, yawOf(a.lockDir));
        a.chargeDist += l.speed * dt;
        const nearWall = wallDistance(l.pos) < 1.2 || ARENA.pillars.some((c) => Math.hypot(c.x - l.pos.x, c.z - l.pos.z) < c.r + 1.6);
        if (res.blocked && a.chargeSpeed > 6 && nearWall) {
          a.wallHit = true;
          a.braking = true;
          l.attack = null;
          l.y = 0;
          l.speed = 0;
          setLionMode(l, 'stunned', 1.9);
          l.poise = 0;
          ctx.events.push({ type: 'lionWallHit', pos: { ...l.pos } });
          ctx.events.push({ type: 'lionStagger' });
          l.cooldown.charge = def.cooldown;
          l.history.push('charge');
          return;
        }
        if (a.chargeDist >= a.chargeMax) a.braking = true;
      } else {
        a.chargeSpeed = approach(a.chargeSpeed, 0, 15 * dt);
        applyMove(ctx, a.chargeSpeed, dt, yawOf(a.lockDir));
        if (a.chargeSpeed <= 0.05) {
          l.speed = 0;
          // 되돌아보며 천천히 선회 (복귀)
          a.t = Math.max(a.t, 3.3);
        }
      }
      // 종료
      if (a.braking && a.chargeSpeed <= 0.05 && t >= 3.3 + 0.9) { endAttack(ctx); return; }
      return;
    }
  }

  // 콤보 연계 (2페이즈)
  if (a.combo && t >= (def.comboAt ?? def.activeEnd + (a.id === 'swipe' ? 0.32 : 0.55))) {
    const next = a.combo;
    l.cooldown[a.id] = def.cooldown * (l.phase === 2 ? 0.8 : 1);
    // 뒷걸음 도약에서 이어지는 덮치기는 이미 웅크린 상태로 시작한다 (준비 구간 일부 생략)
    startLionAttack(ctx, next, true, a.id === 'backHop' ? 0.32 : 0);
    return;
  }
  if (t >= def.duration) endAttack(ctx);
}

/** 사자에게 가해지는 경직 누적 및 반응 */
export function addLionPoise(ctx: SimContext, amount: number): boolean {
  const l = ctx.lion;
  if (l.mode === 'dying' || l.mode === 'dead') return false;
  const mul = l.staggerImmune > 0 ? L.staggerImmuneGain : 1;
  l.poise += amount * mul;
  l.poiseDelay = L.poiseDecayDelay;
  if (l.poise >= L.poiseMax && l.mode !== 'roar' && l.mode !== 'stagger' && l.mode !== 'stunned' && !l.invuln) {
    l.poise = 0;
    l.staggerImmune = L.staggerImmuneTime;
    l.attack = null;
    l.y = 0;
    setLionMode(l, 'stagger', L.staggerTime);
    ctx.events.push({ type: 'lionStagger' });
    return true;
  }
  return false;
}

void len2; void leftOf;
export type { LionAttackState, LionAttackDef };
