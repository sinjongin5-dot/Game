import { LION_ATTACKS, PARRYABLE, PLAYER_ATTACKS, SWORD } from '../combat/attackData';
import type { SimContext } from './context';
import { activeWindowIndex, attackIsActive, addLionPoise, interruptLionAttack, lionAttackVolume, lionHurtSpheres } from './lion';
import { angleDiff, clamp, forward, norm2, segPointDist, segSegDist2, v2, yawOf, type V3 } from './math';
import { bladeActive, isDodgeInvulnerable, isGuardUp, playerBladeSegment, setMode } from './player';
import { TUNING } from './tuning';
import { startGrapple } from './grapple';

const T = TUNING.player;
const norm3 = (v: V3): V3 => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** 플레이어 검 → 사자 */
export function resolvePlayerAttack(ctx: SimContext) {
  const p = ctx.player;
  const l = ctx.lion;
  if (!bladeActive(p) || p.attackHitDone) {
    if (!bladeActive(p)) p.prevBlade = null;
    return;
  }
  if (l.mode === 'dying' || l.mode === 'dead') return;
  if (p.executing) { resolveExecution(ctx); return; }
  const cur = playerBladeSegment(p);
  if (!cur) return;
  const prev = p.prevBlade ?? cur;
  const def = PLAYER_ATTACKS[p.attackId!];
  const spheres = lionHurtSpheres(l);
  let best: { name: string; point: V3; score: number } | null = null;
  const N = 4;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const a = lerp3(prev.a, cur.a, u), b = lerp3(prev.b, cur.b, u);
    for (const s of spheres) {
      const r = segPointDist(a, b, s.c);
      const lim = s.r + SWORD.hitRadius;
      if (r.d2 <= lim * lim) {
        const score = Math.sqrt(r.d2) / lim;
        if (!best || score < best.score) {
          best = { name: s.name, point: lerp3(a, b, r.t), score };
        }
      }
    }
  }
  const swingDir = norm3({ x: cur.b.x - prev.b.x, y: cur.b.y - prev.b.y, z: cur.b.z - prev.b.z });
  p.prevBlade = cur;
  if (!best) return;
  p.attackHitDone = true;
  const head = best.name === 'head';
  const stunned = l.mode === 'stagger' || l.mode === 'stunned';
  const riposte = ctx.time <= p.riposteUntil;
  const run = p.runAttack;
  const finisher = def.id === 'light3';
  let dmg = def.damage * (head ? 1.2 : 1) * (stunned ? 1.35 : 1) * (riposte ? TUNING.parry.riposteDamage : 1) * (run ? TUNING.runAttack.damageMul : 1);
  if (l.invuln) {
    ctx.events.push({ type: 'playerHitLion', pos: best.point, dmg: 0, heavy: def.id === 'heavy', head, stunned: false, invuln: true, dir: swingDir, killing: false, combo: p.attackChain });
    ctx.hitstop = Math.max(ctx.hitstop, 0.04);
    return;
  }
  dmg = Math.round(dmg);
  l.hp = Math.max(0, l.hp - dmg);
  ctx.stats.hitsLanded++;
  const staggeredNow = l.poise + def.poise * (l.staggerImmune > 0 ? TUNING.lion.staggerImmuneGain : 1) >= TUNING.lion.poiseMax;
  // 타격 정지: 기본 + 머리 가격/경직 유발/처치 시 더 길게
  ctx.hitstop = Math.max(ctx.hitstop, def.hitstop + (head ? 0.02 : 0) + (staggeredNow ? 0.06 : 0) + (riposte ? TUNING.parry.riposteHitstop : 0) + (l.hp <= 0 ? 0.22 : 0));
  // 경직 반응: 무게에 따라 크기가, 실제 휘두른 방향에 따라 방향이 정해진다 (검이 밀어낸 쪽으로 몸이 흔들린다)
  l.flinch = def.id === 'heavy' ? 1 : finisher ? 0.75 : 0.45;
  const away = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
  const sw = norm2({ x: swingDir.x, z: swingDir.z });
  l.flinchDir = norm2({ x: away.x * 0.6 + sw.x * 0.4, z: away.z * 0.6 + sw.z * 0.4 });
  const staggered = addLionPoise(ctx, def.poise * (run ? TUNING.runAttack.poiseMul : 1) * (riposte ? 1.4 : 1));
  if (riposte) p.riposteUntil = -1;
  ctx.events.push({ type: 'playerHitLion', pos: best.point, dmg, heavy: def.id === 'heavy', head, stunned: stunned || staggered, invuln: false, dir: swingDir, killing: l.hp <= 0, combo: p.attackChain, riposte, run, finisher });
}

/** 처형: 검 궤적과 무관하게 유효 구간에 들어서는 순간 한 번 반드시 명중한다 (사자는 경직 중이라 방어 불가) */
function resolveExecution(ctx: SimContext) {
  const p = ctx.player, l = ctx.lion;
  p.attackHitDone = true;
  const X = TUNING.execute;
  const spheres = lionHurtSpheres(l);
  const target = spheres.find((s) => s.name === 'head') ?? spheres[0];
  const dir = norm3({ x: l.pos.x - p.pos.x, y: -0.45, z: l.pos.z - p.pos.z });
  const pos = target ? { x: target.c.x, y: target.c.y, z: target.c.z } : { x: l.pos.x, y: 1.0, z: l.pos.z };
  const dmg = Math.round(Math.max(X.minDamage, l.hpMax * X.hpFrac));
  l.hp = Math.max(0, l.hp - dmg);
  ctx.stats.hitsLanded++;
  l.flinch = 1;
  l.flinchDir = norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z });
  l.poise = 0;
  l.staggerImmune = Math.max(l.staggerImmune, 5);
  ctx.hitstop = Math.max(ctx.hitstop, l.hp <= 0 ? X.killHitstop : X.hitstop);
  ctx.events.push({ type: 'playerHitLion', pos, dmg, heavy: true, head: true, stunned: true, invuln: false, dir, killing: l.hp <= 0, combo: 0, execute: true });
}

function playerCapsule(ctx: SimContext) {
  const p = ctx.player;
  return { a: { x: p.pos.x, y: 0.35, z: p.pos.z }, b: { x: p.pos.x, y: 1.55, z: p.pos.z }, r: 0.38 };
}

/** 사자 공격 → 플레이어 */
export function resolveLionAttack(ctx: SimContext) {
  const l = ctx.lion;
  const p = ctx.player;
  const a = l.attack;
  if (ctx.grapple) return; // 포획 중에는 grapple.ts 가 물기 판정을 직접 처리한다
  if (!a || ctx.phase !== 'fight' || p.mode === 'dead') {
    if (a) a.prevVol = null;
    return;
  }
  // 연타 공격: 새 유효 구간에 들어서면 판정 상태를 되돌려 구간마다 한 번씩 맞을 수 있게 한다
  const win = activeWindowIndex(l);
  if (win >= 0 && win !== a.win) {
    if (a.win >= 0 || a.hitDone || a.dodged) { a.hitDone = false; a.dodged = false; a.blockedBy = false; a.prevVol = null; a.wasActive = false; }
    a.win = win;
  }
  const active = attackIsActive(l);
  if (a.wasActive && !active && !a.hitDone && !a.dodged && !a.blockedBy && ctx.time - p.lastDodgeStart < 1.0) {
    // 공격이 유효 구간을 끝낼 때까지 맞지 않았고 직전에 회피했다면 회피 성공
    a.dodged = true;
    ctx.stats.dodges++;
    ctx.events.push({ type: 'dodgeSuccess', attack: a.id });
  }
  a.wasActive = active;
  if (a.hitDone || a.dodged) return;
  if (!active) { a.prevVol = null; return; }
  const def = LION_ATTACKS[a.id];
  const vol = lionAttackVolume(l);
  if (!vol) return;
  const cap = playerCapsule(ctx);
  let contact: V3 | null = null;
  if (vol.kind === 'ring') {
    // 충격파: 중심에서 플레이어까지의 거리가 링 두께 안에 들어오면 명중
    const dx = p.pos.x - vol.c.x, dz = p.pos.z - vol.c.z;
    const d = Math.hypot(dx, dz);
    if (Math.abs(d - vol.r) <= vol.w / 2 + cap.r) {
      const n = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
      contact = { x: vol.c.x + n.x * vol.r, y: 0.6, z: vol.c.z + n.z * vol.r };
    }
  } else if (vol.kind === 'sphere') {
    const prev = a.prevVol ?? vol.c;
    const N = 3;
    for (let i = 1; i <= N && !contact; i++) {
      const c = lerp3(prev, vol.c, i / N);
      const r = segPointDist(cap.a, cap.b, c);
      const lim = vol.r + cap.r;
      if (r.d2 <= lim * lim) contact = c;
    }
    a.prevVol = vol.c;
  } else {
    const d2 = segSegDist2(vol.a, vol.b, cap.a, cap.b);
    const lim = vol.r + cap.r;
    if (d2 <= lim * lim) {
      // 접촉점: 사자 몸통 축 위에서 플레이어에 가장 가까운 점
      const r = segPointDist(vol.a, vol.b, { x: p.pos.x, y: 1.0, z: p.pos.z });
      contact = lerp3(vol.a, vol.b, r.t);
    }
  }
  if (!contact) return;
  // 회피 무적
  if (isDodgeInvulnerable(p)) {
    a.dodged = true;
    ctx.stats.dodges++;
    ctx.events.push({ type: 'dodgeSuccess', attack: a.id });
    return;
  }
  if (p.invulnT > 0) return;
  a.hitDone = true;
  const dmg = Math.round(def.damage * (l.phase === 2 ? 1.05 : 1));
  const toAttacker = yawOf(norm2({ x: contact.x - p.pos.x, z: contact.z - p.pos.z }));
  const away = norm2({ x: p.pos.x - contact.x, z: p.pos.z - contact.z });
  const inCone = Math.abs(angleDiff(toAttacker, p.yaw)) <= T.block.halfAngle;
  if (isGuardUp(p) && inCone) {
    const perfect = p.guardUpT < T.block.raise + T.block.perfect;
    const cost = def.blockCost * (perfect ? T.block.perfectMul : 1);
    ctx.stats.blocks++;
    if (p.stamina < cost) {
      // 가드 브레이크
      p.stamina = 0;
      p.exhausted = true;
      p.staminaDelay = 1.5;
      p.guardImpact = 1;
      p.knock = { x: away.x * 6.5, z: away.z * 6.5 };
      ctx.events.push({ type: 'playerBlocked', strength: 1, pos: contact, broke: true, attack: a.id, perfect: false });
      ctx.hitstop = Math.max(ctx.hitstop, 0.12);
      setMode(p, 'guardBreak');
      p.attackId = null;
      p.invulnT = 0.4;
      applyPlayerDamage(ctx, Math.round(dmg * 0.4), contact, def.heavyHit, a.id, false);
      return;
    }
    p.stamina -= cost;
    p.staminaDelay = Math.max(p.staminaDelay, 0.8);
    p.guardImpact = clamp(cost / 40, 0.35, 1);
    // 패링: 타이밍이 정확하고 끊을 수 있는 가벼운 공격이면 공격을 중단시키고 사자를 비틀거리게 한다
    const parry = perfect && PARRYABLE.has(a.id);
    const kb = parry ? TUNING.parry.knockLight : def.heavyHit ? 8 : 3.4;
    p.knock = { x: away.x * kb, z: away.z * kb };
    p.invulnT = 0.2;
    a.blockedBy = true;
    let interrupted = false;
    if (perfect) {
      const staggered = addLionPoise(ctx, parry ? TUNING.parry.poiseLight : TUNING.parry.poiseHeavy, 'parry');
      if (parry && !staggered && l.attack) { interruptLionAttack(ctx, TUNING.parry.recover); interrupted = true; }
      if (parry) { p.riposteUntil = ctx.time + TUNING.parry.riposteWindow; l.flinch = 1; l.flinchDir = norm2({ x: -away.x, z: -away.z }); }
      interrupted = interrupted || staggered;
    }
    ctx.events.push({ type: 'playerBlocked', strength: p.guardImpact, pos: contact, broke: false, attack: a.id, perfect, parry, interrupted });
    ctx.hitstop = Math.max(ctx.hitstop, parry ? TUNING.parry.hitstop : perfect ? 0.1 : def.heavyHit ? 0.07 : 0.045);
    return;
  }
  // 도약 명중 → 물어뜯기 포획 상호작용 (끄면 일반 피해)
  if (a.id === 'pounce' && startGrapple(ctx)) { l.attack = null; return; }
  const kb = def.heavyHit ? 7 : 3.6;
  p.knock = { x: away.x * kb, z: away.z * kb };
  applyPlayerDamage(ctx, dmg, contact, def.heavyHit, a.id, true);
}

export function applyPlayerDamage(ctx: SimContext, dmg: number, pos: V3, heavy: boolean, attack: import('../combat/attackData').LionAttackId, stagger: boolean) {
  const p = ctx.player;
  p.hp = Math.max(0, p.hp - dmg);
  ctx.stats.damageTaken += dmg;
  p.hitDir = norm2({ x: pos.x - p.pos.x, z: pos.z - p.pos.z });
  p.hitHeavy = heavy;
  if (stagger) {
    if (p.mode === 'heal' && !p.healApplied) ctx.events.push({ type: 'healInterrupted' });
    p.attackId = null;
    setMode(p, 'hit');
    p.invulnT = 0.35;
    p.buffer.action = null;
  }
  ctx.hitstop = Math.max(ctx.hitstop, heavy ? 0.11 : 0.07);
  ctx.events.push({ type: 'playerHit', dmg, pos, heavy, attack });
  if (p.hp <= 0) {
    p.hp = 0;
    p.attackId = null;
    setMode(p, 'dead');
    p.vel = v2();
    ctx.events.push({ type: 'playerDeath' });
  }
}

void forward;
