import { GameSim } from '../src/simulation/sim';
import { emptyInput, type InputFrame } from '../src/simulation/state';
import { yawOf } from '../src/simulation/math';
import { LION_ATTACKS, type LionAttackId } from '../src/combat/attackData';

export interface BotOpts { skill: number; aggression: number }

const DODGE_AT: Record<LionAttackId, number> = { swipe: 0.57, bite: 0.42, pounce: 0.8, charge: 1.55, rear: 0.65, swipeBite: 0.2, pounceSwat: 0.2, flurry: 0.4, dashBite: 0.6, backHop: 9, quake: 0.9, whirl: 0.72 };

/** 규칙 기반 플레이어 봇 (균형/막힘/승리 경로 검증용). 사람이 하듯 "읽고, 피하고, 반격" 한다. */
export class Bot {
  private rs = 12345;
  private plan = { serial: -1, lateral: 1, mode: 'dodge' as 'dodge' | 'guard' | 'none', at: 0 };
  private comboLeft = 0;
  constructor(private sim: GameSim, private opts: BotOpts = { skill: 0.9, aggression: 0.8 }) {}
  private rnd() { this.rs = (this.rs * 1664525 + 1013904223) >>> 0; return this.rs / 4294967296; }

  next(): InputFrame {
    const s = this.sim, p = s.player, l = s.lion;
    const inp = emptyInput();
    const toL = { x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z };
    const d = Math.hypot(toL.x, toL.z);
    inp.cameraYaw = yawOf(toL);
    p.lockOn = true;
    const a = l.attack;
    if (a && this.plan.serial !== a.serial) {
      const def = LION_ATTACKS[a.id];
      const sloppy = this.rnd() > this.opts.skill;
      const useGuard = ((a.id === 'swipe' || a.id === 'bite') && this.rnd() < 0.3 || a.id === 'flurry' && this.rnd() < 0.8) && p.stamina > 55;
      this.plan = { serial: a.serial, lateral: this.rnd() < 0.5 ? 1 : -1, mode: sloppy ? 'none' : useGuard ? 'guard' : 'dodge', at: DODGE_AT[a.id] + (this.rnd() - 0.3) * 0.25 * (1 - this.opts.skill + 0.2) };
      void def;
      if (a.id === 'quake') this.plan.at = 1.0 + Math.max(0, d - 0.9) / 10.4 - 0.2 + (this.rnd() - 0.3) * 0.06; // 링이 닿는 순간에 무적 구간이 겹치도록
      if (a.id === 'backHop') this.plan.mode = 'none';
    }
    const attackDone = !a || a.t > LION_ATTACKS[a.id].activeEnd + 0.05 || (a.id === 'charge' && a.braking);
    if (a && !attackDone && p.mode === 'free') {
      if (this.plan.mode === 'dodge' && a.t >= this.plan.at && a.t < this.plan.at + 0.12 && p.stamina >= 25) {
        inp.pressed.dodge = true;
        inp.moveX = this.plan.lateral;
        inp.moveY = a.id === 'pounce' ? 0 : a.id === 'flurry' ? -0.7 : -0.3;
      } else if (this.plan.mode === 'guard' && a.t >= 0.15) inp.guard = true;
      else if (a.id === 'charge' && a.t > 1.1) inp.moveX = this.plan.lateral;
    }
    const open = !a || attackDone;
    const lionStaggered = l.mode === 'stagger' || l.mode === 'stunned';
    if (p.mode === 'free' && !inp.pressed.dodge && !inp.guard) {
      if (p.hp < 50 && p.heals > 0 && d > 5 && !a) inp.pressed.heal = true;
      else if ((open && (l.mode === 'recover' || lionStaggered || attackDone)) && l.hp > 0) {
        if (d > 2.3) inp.moveY = 1;
        else if (d < 1.5 && !lionStaggered) inp.moveY = -1; // 붙어서 버티지 않고 간격 유지
        else if (p.stamina > 36 && this.rnd() < this.opts.aggression) {
          if (lionStaggered && p.stamina > 50) inp.pressed.heavy = true; else inp.pressed.light = true;
          this.comboLeft = 1;
        }
      } else if (!a) {
        if (d > 4.6) inp.moveY = 1; else if (d < 3.2) inp.moveY = -1;
        inp.moveX = Math.sin(s.tick / 90) * 0.4;
      }
    }
    if (p.mode === 'attack' && this.comboLeft > 0 && p.attackId !== 'heavy' && p.stamina > 30 && open) {
      inp.pressed.light = true;
      if (p.modeT > 0.45) this.comboLeft = 0;
    }
    return inp;
  }
}
