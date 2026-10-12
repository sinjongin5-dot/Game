import { applyPlayerDamage } from './combat';
import type { SimContext } from './context';
import { norm2, yawOf, type V3 } from './math';
import { setLionMode, startLionAttack } from './lion';
import { setMode, startExecution } from './player';
import { TUNING } from './tuning';
import type { GrappleState, InputFrame, QteButton } from './state';

const G = TUNING.grapple;
const BUTTONS: QteButton[] = ['A', 'B', 'X', 'Y'];

/** 이번 프레임에 눌린 얼굴 버튼 (여러 개면 null 아닌 첫 번째) */
export function pressedFace(input: InputFrame): QteButton | null {
  const p = input.pressed;
  if (p.a) return 'A';
  if (p.b) return 'B';
  if (p.x) return 'X';
  if (p.y) return 'Y';
  return null;
}

/** 창 길이 배율 (여유 모드는 더 넉넉) */
const winMul = (ctx: SimContext) => (ctx.qteMode === 'easy' ? G.easyMul : 1);

/**
 * 사자의 도약이 플레이어에 명중했을 때 호출: 물어뜯기 포획을 시작한다.
 * 사자가 플레이어 앞 1.3m 에 달라붙어 3번 연속으로 문다. 각 물기에 표시되는 버튼을 창 안에 누르면 막는다.
 */
export function startGrapple(ctx: SimContext): boolean {
  const l = ctx.lion, p = ctx.player;
  if (ctx.grapple || ctx.qteMode === 'off' || p.mode === 'dead' || ctx.phase !== 'fight') return false;
  if ((l.cooldown.grapple ?? 0) > 0) return false;
  // 서로 마주 보게 배치 (플레이어 위치를 기준으로 사자를 붙인다)
  const dir = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
  const d = dir.x === 0 && dir.z === 0 ? { x: 0, z: 1 } : dir;
  const lp = { x: p.pos.x + d.x * G.dist, z: p.pos.z + d.z * G.dist };
  l.pos = lp;
  l.yaw = yawOf({ x: -d.x, z: -d.z });
  p.yaw = yawOf(d);
  ctx.physics.teleport('lion', l.pos, l.yaw);
  ctx.physics.teleport('player', p.pos, p.yaw);
  l.attack = null;
  l.y = 0;
  l.speed = 0;
  l.vel = { x: 0, z: 0 };
  setMode(p, 'free');
  p.vel = { x: 0, z: 0 };
  p.knock = { x: 0, z: 0 };
  p.attackId = null;
  p.buffer.action = null;
  const prompts: QteButton[] = [];
  for (let i = 0; i < G.count; i++) {
    let b = BUTTONS[Math.floor(ctx.rng.next() * 4) % 4];
    if (i > 0 && b === prompts[i - 1]) b = BUTTONS[(BUTTONS.indexOf(b) + 1 + Math.floor(ctx.rng.next() * 3)) % 4]; // 같은 버튼 연속 금지
    prompts.push(b);
  }
  ctx.grapple = {
    phase: 'intro', t: 0, idx: 0, prompts, results: prompts.map(() => 'pending'), winStart: 0, winEnd: 0, hitAt: G.hitAt, resolved: false, damaged: false,
    counterBtn: 'Y', counterWin: G.counterWin,
  };
  l.cooldown.grapple = G.cooldown;
  setLionMode(l, 'recover', 99); // 첫 물기 시작 전까지는 낮게 웅크린 자세 (공격 상태로 두면 공격 정보 없는 'attack' 모드가 된다)
  ctx.events.push({ type: 'grappleStart', pos: { x: l.pos.x, z: l.pos.z } });
  return true;
}

function biteContact(ctx: SimContext): V3 {
  const l = ctx.lion;
  const f = { x: Math.sin(l.yaw), z: Math.cos(l.yaw) };
  return { x: l.pos.x + f.x * 0.55, y: 1.05, z: l.pos.z + f.z * 0.55 };
}

function beginBite(ctx: SimContext, g: GrappleState) {
  const l = ctx.lion;
  g.phase = 'bite';
  g.t = 0;
  g.resolved = false;
  g.damaged = false;
  const len = G.winLen[Math.min(g.idx, G.winLen.length - 1)] * winMul(ctx);
  // 여유 모드: 이빨이 닿는 시각을 늦춰 입력 창을 실제로 넓힌다 (사자의 동작은 그만큼 천천히 재생된다)
  g.hitAt = ctx.qteMode === 'easy' ? G.hitAt + 0.24 : G.hitAt;
  g.winEnd = g.hitAt - 0.02;
  g.winStart = Math.max(0.08, g.winEnd - len);
  // 사자의 물기 동작(앞으로 숙였다 무는 동작)을 그대로 재생한다. 판정은 이 모듈이 직접 하므로 일반 공격 판정은 끈다.
  startLionAttack(ctx, 'bite', true);
  if (l.attack) { l.attack.hold = 0; l.attack.hitDone = true; l.attack.t = 0; }
  l.mode = 'attack';
  ctx.events.push({ type: 'qtePrompt', idx: g.idx, button: g.prompts[g.idx], winStart: g.winStart, winEnd: g.winEnd });
}

function resolveBite(ctx: SimContext, g: GrappleState, ok: boolean, perfect: boolean) {
  const l = ctx.lion, p = ctx.player;
  g.resolved = true;
  g.results[g.idx] = ok ? (perfect ? 'perfect' : 'success') : 'miss';
  const pos = biteContact(ctx);
  ctx.events.push({ type: 'qteResult', idx: g.idx, ok, perfect, button: g.prompts[g.idx], pos });
  if (ok) {
    ctx.stats.qteSuccess++;
    p.guardImpact = 1;
    l.attack = null;
    l.mode = 'recover';
    l.flinch = perfect ? 1 : 0.7;
    l.flinchDir = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
    ctx.hitstop = Math.max(ctx.hitstop, perfect ? 0.1 : 0.06);
  }
}

function applyBiteDamage(ctx: SimContext) {
  const p = ctx.player;
  const dmg = Math.round(G.damage * (ctx.lion.phase === 2 ? 1.1 : 1));
  applyPlayerDamage(ctx, dmg, biteContact(ctx), false, 'bite', false);
  if (p.mode !== 'dead') setMode(p, 'hit');
}

function endGrapple(ctx: SimContext, outcome: 'counter' | 'released' | 'dead') {
  const l = ctx.lion, p = ctx.player;
  ctx.grapple = null;
  ctx.events.push({ type: 'grappleEnd', outcome });
  if (outcome === 'dead') return;
  if (outcome === 'counter') {
    // 방패로 사자를 밀쳐 내 자세를 무너뜨리고, 곧바로 처형 일격으로 이어진다
    const away = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
    l.pos = { x: p.pos.x + away.x * G.pushBack, z: p.pos.z + away.z * G.pushBack };
    ctx.physics.teleport('lion', l.pos, l.yaw);
    l.attack = null;
    l.y = 0;
    l.poise = 0;
    setLionMode(l, 'stagger', TUNING.lion.staggerTime + 0.4);
    l.flinch = 1;
    l.flinchDir = away;
    p.stamina = Math.min(p.staminaMax, p.stamina + G.staminaReward);
    p.invulnT = Math.max(p.invulnT, 0.4);
    ctx.stats.counters++;
    ctx.events.push({ type: 'lionStagger', source: 'parry' });
    startExecution(ctx, p, true);
    return;
  }
  // 반격 실패/일부 실패: 사자가 물러나며 놓아 준다
  const away = norm2({ x: p.pos.x - l.pos.x, z: p.pos.z - l.pos.z });
  l.attack = null;
  setLionMode(l, 'recover', 0.9);
  p.knock = { x: away.x * 4.5, z: away.z * 4.5 };
  p.invulnT = Math.max(p.invulnT, 0.5);
  if (p.mode === 'hit') setMode(p, 'free');
}

/**
 * 포획 진행 (매 스텝, 플레이어/사자 갱신 전에 호출). 사자는 이 모듈이 자세를 쥐고 있고 일반 AI/판정은 멈춘다.
 * 타임라인: intro → (물기 ×3: 버튼 입력 창 → 이빨이 닿는 시각 → 결과) → 모두 막았으면 반격 입력 → 밀쳐 내고 처형 일격
 */
export function updateGrapple(ctx: SimContext, input: InputFrame, dt: number) {
  const g = ctx.grapple;
  if (!g) return;
  const l = ctx.lion, p = ctx.player;
  if (p.mode === 'dead' || ctx.phase !== 'fight') { endGrapple(ctx, 'dead'); return; }
  g.t += dt;
  const btn = pressedFace(input);
  // 사자는 달라붙은 채로 고정
  l.speed = 0;
  l.vel = { x: 0, z: 0 };
  l.turnRate = 0;
  l.yaw = yawOf(norm2({ x: p.pos.x - l.pos.x, z: p.pos.z - l.pos.z }));

  switch (g.phase) {
    case 'intro':
      if (g.t >= G.intro) beginBite(ctx, g);
      return;
    case 'bite': {
      const a = l.attack;
      if (a) a.t = g.t * (G.hitAt / g.hitAt); // 사자 물기 동작 시간 = 이 물기의 시간 (이빨이 닿는 시각에 정확히 맞춘다)
      if (!g.resolved && btn) {
        if (btn === g.prompts[g.idx] && g.t >= g.winStart && g.t <= g.winEnd) {
          const perfect = g.t >= g.winEnd - (g.winEnd - g.winStart) * G.perfectFrac;
          resolveBite(ctx, g, true, perfect);
        } else if (btn !== g.prompts[g.idx]) {
          resolveBite(ctx, g, false, false); // 잘못된 버튼: 이 물기는 못 막는다 (이빨은 제 시각에 닿는다)
          g.resolved = true;
          g.results[g.idx] = 'miss';
        }
        // 너무 이른 정답 입력은 무시한다 (창이 열릴 때까지 기다려야 한다)
      }
      if (g.t >= g.hitAt && g.results[g.idx] === 'pending') {
        resolveBite(ctx, g, false, false);
      }
      if (g.t >= g.hitAt && g.results[g.idx] === 'miss' && !g.damaged) {
        g.damaged = true;
        applyBiteDamage(ctx);
        if ((p.mode as string) === 'dead') { endGrapple(ctx, 'dead'); return; }
      }
      if (p.mode === 'hit' && p.modeT >= 0.3) setMode(p, 'free');
      if (g.t >= G.gap) {
        g.damaged = false;
        g.idx++;
        if (g.idx >= G.count) {
          const all = g.results.every((r) => r === 'success' || r === 'perfect');
          if (all) { g.phase = 'counter'; g.t = 0; ctx.events.push({ type: 'grappleCounterPrompt', button: g.counterBtn }); }
          else endGrapple(ctx, 'released');
        } else beginBite(ctx, g);
      }
      return;
    }
    case 'counter': {
      if (g.t < G.counterAfter) { l.mode = 'recover'; return; }
      if (btn === g.counterBtn) { ctx.events.push({ type: 'grappleCounter' }); endGrapple(ctx, 'counter'); return; }
      if (g.t >= G.counterAfter + g.counterWin * winMul(ctx)) endGrapple(ctx, 'released');
      return;
    }
  }
}

/** 포획 중 플레이어는 방패를 든 채 제자리에 묶인다 (updatePlayer 가 호출) */
export function holdPlayerInGrapple(ctx: SimContext) {
  const p = ctx.player;
  p.vel = { x: 0, z: 0 };
  p.running = false;
  p.speed = 0;
  p.moveLocal = { x: 0, z: 0 };
  p.guardHeld = p.mode === 'free';
  p.guardUpT = Math.max(p.guardUpT, 0.3);
  p.yaw = yawOf(norm2({ x: ctx.lion.pos.x - p.pos.x, z: ctx.lion.pos.z - p.pos.z }));
  ctx.physics.setYaw('player', p.yaw);
}

