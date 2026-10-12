import type { SimContext } from './context';
import type { CalloutKind } from './state';
import { TUNING } from './tuning';

const M = TUNING.momentum;
const F = TUNING.fury;

export type GainKey = keyof typeof M.gain;

export const isFury = (ctx: SimContext) => ctx.player.furyT > 0;

/** 기세를 올린다. 폭발 모드 중에는 올라가지 않는다(남은 시간이 곧 게이지). */
export function gainMomentum(ctx: SimContext, key: GainKey) {
  const p = ctx.player;
  if (p.furyT > 0 || p.mode === 'dead') return;
  p.momentum = Math.min(M.max, p.momentum + M.gain[key]);
  p.momentumIdle = 0;
}

export function callout(ctx: SimContext, kind: CalloutKind, n?: number) {
  ctx.events.push({ type: 'callout', kind, n });
}

/** 사자를 맞췄을 때: 연속 타격 수를 올리고 5/10/15… 마다 콜아웃 */
export function registerHit(ctx: SimContext) {
  const p = ctx.player;
  p.combo = p.comboT < M.comboWindow ? p.combo + 1 : 1;
  p.comboT = 0;
  if (p.combo > ctx.stats.maxCombo) ctx.stats.maxCombo = p.combo;
  if (p.combo >= 5 && p.combo % 5 === 0) callout(ctx, 'combo', p.combo);
  if (p.furyT > 0) p.hp = Math.min(p.hpMax, p.hp + F.healPerHit);
}

/** 피해를 받으면 연속 타격이 끊기고 기세가 깎인다 */
export function onPlayerDamaged(ctx: SimContext) {
  const p = ctx.player;
  p.combo = 0;
  if (p.furyT <= 0) p.momentum = Math.max(0, p.momentum * (1 - M.lossOnHit));
}

/** 완벽 회피: 사자의 시간이 느려지는 역습 구간 시작 */
export function onPerfectDodge(ctx: SimContext) {
  if (ctx.grapple) return;
  ctx.witchT = TUNING.witch.dur;
  ctx.stats.perfectDodges++;
  gainMomentum(ctx, 'dodge');
  ctx.events.push({ type: 'witchStart' });
  callout(ctx, 'dodge');
}

/** 폭발 입력: 게이지가 가득 찼을 때만 발동 */
export function tryStartFury(ctx: SimContext): boolean {
  const p = ctx.player;
  if (p.furyT > 0 || p.momentum < M.max || p.mode === 'dead' || ctx.grapple) return false;
  p.furyT = F.dur;
  p.momentum = M.max;
  ctx.stats.furies++;
  ctx.events.push({ type: 'furyStart' });
  callout(ctx, 'fury');
  return true;
}

/** 매 스텝: 폭발 시간/게이지 감소, 콤보 만료 */
export function updateMomentum(ctx: SimContext, dt: number) {
  const p = ctx.player;
  p.comboT += dt;
  if (p.comboT > M.comboWindow) p.combo = 0;
  if (p.furyT > 0) {
    p.furyT = Math.max(0, p.furyT - dt);
    p.momentum = (p.furyT / F.dur) * M.max;
    if (p.furyT <= 0) { p.momentum = 0; ctx.events.push({ type: 'furyEnd' }); }
    return;
  }
  p.momentumIdle += dt;
  if (p.momentumIdle > M.idleDelay && p.momentum > 0) p.momentum = Math.max(0, p.momentum - M.decay * dt);
}

export const furyDamageMul = (ctx: SimContext) => (ctx.player.furyT > 0 ? F.damage : 1);
export const furyPoiseMul = (ctx: SimContext) => (ctx.player.furyT > 0 ? F.poise : 1);
