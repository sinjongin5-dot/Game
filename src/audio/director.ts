import type * as THREE from 'three';
import type { GameSim } from '../simulation/sim';
import type { SimEvent } from '../simulation/state';
import type { FootFx } from '../render/characters';
import type { AudioEngine, SoundName } from './audioEngine';

const rr = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** 시뮬레이션 이벤트를 소리와 음악 상태로 번역한다 (이벤트당 한 번만 재생) */
export class AudioDirector {
  private lastCheer = -10;
  private t = 0;
  private lastStepLion = -1;
  private roarToggle = false;
  private lastPick: Record<string, number> = {};

  constructor(private audio: AudioEngine) {}

  reset() {
    this.t = 0;
    this.lastCheer = -10;
    this.audio.stopAllOneShots();
  }

  tick(dt: number) { this.t += dt; }

  /** 같은 소리가 연달아 나오지 않도록 직전과 다른 변주를 고른다 */
  private variant<T>(key: string, arr: T[]): T {
    let i = Math.floor(Math.random() * arr.length);
    if (arr.length > 1 && i === this.lastPick[key]) i = (i + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length;
    this.lastPick[key] = i;
    return arr[i];
  }

  private lionPos(sim: GameSim) { return { x: sim.lion.pos.x, y: 1.1, z: sim.lion.pos.z }; }
  private playerPos(sim: GameSim) { return { x: sim.player.pos.x, y: 1.0, z: sim.player.pos.z }; }

  private cheer(vol = 0.7) {
    if (this.t - this.lastCheer < 3.5) return;
    this.lastCheer = this.t;
    this.audio.play('crowd_cheer', { volume: vol, bus: 'crowd', reverb: 0.15 });
  }

  handle(events: SimEvent[], sim: GameSim) {
    const a = this.audio;
    for (const e of events) {
      switch (e.type) {
        case 'playerSwing': {
          if (e.id === 'bash') { a.play('dodge_roll', { volume: 0.5, rate: 0.7, pos: this.playerPos(sim) }); break; }
          const run = sim.player.runAttack && e.id !== 'heavy';
          const name: SoundName = e.id === 'heavy' ? 'swing_heavy' : run ? 'swing_run' : this.variant<SoundName>('swing', ['swing_light', 'swing_light_b', 'swing_light_c']);
          // 3타(마무리)는 낮고 묵직하게, 나머지는 빠르고 날카롭게
          const rate = e.id === 'light3' ? rr(0.82, 0.92) : rr(0.94, 1.1);
          a.play(name, { volume: rr(0.68, 0.82), rate, pos: this.playerPos(sim) });
          break;
        }
        case 'playerHitLion': {
          if (e.invuln) { a.play('block_light', { volume: 0.5, rate: 1.4, pos: e.pos }); break; }
          if (e.execute) {
            // 처형: 거대한 타격 + 저음 + 금속 울림. 다른 모든 효과음보다 크게 들린다
            a.play('execute_hit', { volume: 1, pos: e.pos, reverb: 0.3 });
            a.play('hit_flesh_heavy', { volume: 0.9, rate: rr(0.8, 0.9), pos: e.pos });
            a.play('ground_crack', { volume: 0.7, rate: rr(0.85, 0.95), pos: { x: e.pos.x, y: 0.1, z: e.pos.z }, delay: 0.02 });
            a.duck(0.6, 1.4);
            this.cheer(1);
            break;
          }
          if (e.bash) { a.play('shield_bash', { volume: 1, rate: rr(0.95, 1.06), pos: e.pos }); a.play('hit_flesh', { volume: 0.55, rate: 0.9, pos: e.pos }); break; }
          a.play(e.heavy ? 'hit_flesh_heavy' : this.variant<SoundName>('flesh', ['hit_flesh', 'hit_flesh_b', 'hit_flesh_c']), { volume: rr(0.88, 1.0), rate: rr(0.94, 1.08), pos: e.pos, delay: rr(0, 0.012) });
          if (e.riposte) a.play('parry_clang', { volume: 0.5, rate: rr(0.9, 1.0), pos: e.pos });
          // 저음 충격을 겹쳐 묵직하게 (강타/머리/연계 마지막 타일수록 크게)
          if (e.heavy || e.head || e.combo >= 2) a.play('impact_boom', { volume: e.heavy ? 0.7 : 0.4, rate: rr(0.95, 1.1), pos: e.pos });
          if (e.heavy) a.play('ground_crack', { volume: 0.35, rate: rr(1.0, 1.2), pos: { x: e.pos.x, y: 0.1, z: e.pos.z }, delay: 0.03 });
          if (e.killing || e.stunned) a.play('slowmo_whoosh', { volume: 0.5, bus: 'sfx', reverb: 0.2 });
          if (e.killing) a.duck(0.7, 1.6);
          if (e.heavy || Math.random() < 0.4) a.play('lion_hurt', { volume: 0.55, rate: rr(0.9, 1.1), pos: this.lionPos(sim), key: 'lionHurt' });
          if (e.heavy) this.cheer(0.5);
          break;
        }
        case 'playerBlocked':
          if (e.parry && !e.broke) {
            // 패링: 날카로운 금속 충돌 + 긴 울림. 일반 방어보다 확실히 높고 밝다
            a.play('parry_clang', { volume: 1, rate: rr(0.96, 1.06), pos: e.pos });
            a.play('parry_ring', { volume: 0.7, rate: rr(1.0, 1.1), pos: e.pos, delay: 0.01 });
            a.duck(0.3, 0.6);
            this.cheer(0.5);
            break;
          }
          if (e.perfect && !e.broke) a.play('parry_ring', { volume: 0.6, rate: 0.9, pos: e.pos });
          if (e.broke) { a.play('guard_break', { volume: 1, pos: this.playerPos(sim) }); a.play('impact_boom', { volume: 0.8, pos: this.playerPos(sim) }); }
          else a.play(e.strength > 0.7 ? 'block_heavy' : 'block_light', { volume: 0.55 + 0.45 * e.strength, rate: rr(0.95, 1.05), pos: e.pos });
          break;
        case 'playerHit':
          a.play('hit_flesh', { volume: 0.9, rate: 0.85, pos: this.playerPos(sim) });
          a.play('impact_boom', { volume: e.heavy ? 0.85 : 0.5, rate: rr(0.9, 1.05), pos: this.playerPos(sim) });
          a.duck(0.25, 0.5);
          a.play('player_hurt', { volume: 0.9, rate: rr(0.92, 1.05), pos: this.playerPos(sim), delay: 0.03 });
          a.play('crowd_gasp', { volume: 0.5, bus: 'crowd', reverb: 0.1 });
          break;
        case 'playerDodge':
          a.play('dodge_roll', { volume: e.backstep ? 0.45 : 0.8, rate: e.backstep ? 1.25 : 1, pos: this.playerPos(sim) });
          break;
        case 'dodgeSuccess':
          a.play('slowmo_whoosh', { volume: 0.3, bus: 'sfx' });
          if (this.t - this.lastCheer > 2) a.play('crowd_gasp', { volume: 0.35, bus: 'crowd', reverb: 0.1 });
          break;
        case 'healStart':
          a.play('heal_drink', { volume: 0.7, pos: this.playerPos(sim) });
          break;
        case 'staminaDenied':
          a.play('stamina_denied', { volume: 0.6 });
          break;
        case 'lockOn':
          a.play('ui_hover', { volume: 0.9 });
          break;
        case 'lionWindup': {
          const p = this.lionPos(sim);
          // 큰 기술은 짧게 모래를 긁고 숨을 들이쉬는 소리가 먼저 난다 (공격 직전의 긴장)
          if (e.attack === 'quake' || e.attack === 'charge' || e.attack === 'pounce' || e.attack === 'whirl' || e.attack === 'dashBite') a.play('lion_tell', { volume: 0.55, rate: rr(0.92, 1.08), pos: { x: p.x, y: 0.2, z: p.z } });
          if (e.attack === 'charge') { a.play('lion_roar2', { volume: 0.95, pos: p, rate: 1.05 }); a.duck(0.5, 2.2); }
          else if (e.attack === 'quake') { a.play('lion_rise', { volume: 0.95, pos: p, rate: 1.0 }); a.duck(0.35, 1.1); }
          else if (e.attack === 'whirl') { a.play('lion_growl', { volume: 0.8, pos: p, rate: 0.9 }); a.duck(0.3, 0.9); }
          else if (e.attack === 'dashBite') { a.play('lion_growl', { volume: 0.7, pos: p, rate: 1.25 }); a.duck(0.3, 0.8); }
          else if (e.attack === 'backHop') { /* 도약 동작으로 바로 이어지므로 별도 경고음 없음 */ }
          else if (e.attack === 'pounce') { a.play('lion_growl', { volume: 0.85, pos: p, rate: 1.1 }); a.duck(0.4, 1.4); }
          else if (e.attack === 'swipeBite' || e.attack === 'pounceSwat') { /* 연계 동작은 별도 경고음 없이 몸짓으로 */ }
          else { a.play('lion_warn', { volume: 0.7, pos: p, rate: rr(0.95, 1.1) }); a.duck(0.3, 1.0); }
          break;
        }
        case 'lionAttack': {
          const p = this.lionPos(sim);
          if (e.attack === 'bite' || e.attack === 'swipeBite') a.play('lion_bite', { volume: 0.9, pos: p });
          else if (e.attack === 'swipe' || e.attack === 'rear' || e.attack === 'pounceSwat') a.play('lion_swipe', { volume: 0.9, pos: p, rate: rr(0.95, 1.05) });
          else if (e.attack === 'pounce') a.play('lion_swipe', { volume: 0.9, pos: p, rate: 0.7 });
          else if (e.attack === 'flurry') a.play('lion_swipe', { volume: 0.85, pos: p, rate: rr(0.92, 1.15) });
          else if (e.attack === 'dashBite') { a.play('lion_dash', { volume: 0.95, pos: p }); a.play('lion_bite', { volume: 0.8, pos: p, delay: 0.1 }); }
          else if (e.attack === 'backHop') a.play('lion_hop', { volume: 0.7, pos: p });
          else if (e.attack === 'whirl') a.play('lion_whirl', { volume: 0.95, pos: p });
          break;
        }
        case 'playerSlam':
          a.play('ground_crack', { volume: 0.7, rate: rr(0.95, 1.1), pos: { x: e.pos.x, y: 0.1, z: e.pos.z } });
          a.play('impact_boom', { volume: 0.75, rate: 1.1, pos: { x: e.pos.x, y: 0.2, z: e.pos.z } });
          a.play('step_sand_0', { volume: 0.9, rate: 0.7, pos: { x: e.pos.x, y: 0.1, z: e.pos.z } });
          break;
        case 'lionSlam': {
          const p = { x: e.pos.x, y: 0.3, z: e.pos.z };
          a.play('lion_quake', { volume: 1, pos: p, reverb: 0.35 });
          a.play('ground_crack', { volume: 0.9, rate: 0.85, pos: p, delay: 0.02 });
          a.play('impact_boom', { volume: 1, pos: p, rate: 0.85 });
          a.duck(0.55, 1.8);
          this.cheer(0.8);
          break;
        }
        case 'lionLand':
          if ((e.power ?? 1) < 0.8) a.play('lion_hop', { volume: 0.8, pos: { x: e.pos.x, y: 0.2, z: e.pos.z } });
          else { a.play('lion_land', { volume: 1, pos: { x: e.pos.x, y: 0.2, z: e.pos.z } }); a.play('ground_crack', { volume: 0.55, rate: rr(0.9, 1.05), pos: { x: e.pos.x, y: 0.1, z: e.pos.z }, delay: 0.03 }); }
          break;
        case 'lionWallHit':
          a.play('lion_wall', { volume: 1, pos: { x: e.pos.x, y: 1, z: e.pos.z } });
          this.cheer(0.9);
          break;
        case 'lionRoar': {
          this.roarToggle = !this.roarToggle;
          a.play(e.phase2 ? 'lion_roar2' : 'lion_roar', { volume: 1, pos: this.lionPos(sim), key: 'roar', reverb: 0.5 });
          a.duck(0.45, 2.6);
          if (e.phase2) a.setMusic('music_phase2', 1, 2.0);
          this.cheer(0.9);
          break;
        }
        case 'lionStagger':
          // 자세 붕괴: 균열음 + 저음 충격 위에 사자의 고통스러운 울음
          a.play('stagger_break', { volume: 1, pos: this.lionPos(sim), reverb: 0.25 });
          a.play('impact_boom', { volume: 0.7, rate: 0.9, pos: this.lionPos(sim) });
          a.play('lion_hurt', { volume: 0.8, rate: 0.85, pos: this.lionPos(sim), key: 'lionHurt', delay: 0.05 });
          a.duck(0.35, 0.8);
          break;
        case 'grappleStart':
          a.play('lion_roar2', { volume: 0.85, pos: this.lionPos(sim), rate: 1.1 });
          a.play('impact_boom', { volume: 0.9, rate: 0.9, pos: this.playerPos(sim) });
          a.play('ground_crack', { volume: 0.5, rate: 1.1, pos: { x: sim.lion.pos.x, y: 0.1, z: sim.lion.pos.z } });
          a.duck(0.5, 1.2);
          break;
        case 'qtePrompt':
          a.play('qte_prompt', { volume: 0.55, rate: 0.95 + e.idx * 0.08 });
          break;
        case 'qteResult':
          if (e.ok) {
            a.play('parry_clang', { volume: e.perfect ? 1 : 0.8, rate: e.perfect ? rr(1.05, 1.15) : rr(0.92, 1.0), pos: e.pos });
            if (e.perfect) a.play('parry_ring', { volume: 0.5, rate: 1.15, pos: e.pos, delay: 0.01 });
            this.cheer(0.4);
          }
          break;
        case 'grappleCounterPrompt':
          a.play('slowmo_whoosh', { volume: 0.55 });
          break;
        case 'grappleCounter':
          a.play('execute_whoosh', { volume: 0.8, pos: this.playerPos(sim) });
          a.play('impact_boom', { volume: 0.8, rate: 1.1, pos: this.playerPos(sim) });
          break;
        case 'witchStart':
          a.play('slowmo_whoosh', { volume: 0.7, rate: 0.85, bus: 'sfx' });
          a.play('impact_boom', { volume: 0.35, rate: 1.3, pos: this.playerPos(sim) });
          a.duck(0.3, 0.8);
          break;
        case 'clash':
          a.play('clash_clang', { volume: 1, rate: rr(0.95, 1.08), pos: e.pos });
          a.play('impact_boom', { volume: 0.4, rate: 1.2, pos: e.pos });
          this.cheer(0.35);
          break;
        case 'furyStart':
          a.play('fury_start', { volume: 1, pos: this.playerPos(sim), reverb: 0.25 });
          a.duck(0.4, 1.2);
          this.cheer(0.9);
          break;
        case 'executionStart':
          a.play('execute_whoosh', { volume: 0.75, pos: this.playerPos(sim) });
          break;
        case 'lionDeath':
          a.play('lion_death', { volume: 1, pos: this.lionPos(sim) });
          a.setMusic(null, 1, 1.0);
          break;
        case 'victory':
          a.play('sting_victory', { volume: 0.8, bus: 'music', reverb: 0 });
          this.lastCheer = -10;
          this.cheer(1);
          break;
        case 'playerDeath':
          a.play('player_death', { volume: 1, pos: this.playerPos(sim) });
          a.setMusic(null, 1, 1.4);
          a.play('sting_defeat', { volume: 0.75, bus: 'music', reverb: 0, delay: 0.4 });
          break;
        case 'gateClose':
          a.play('gate_drop', { volume: 1, pos: { x: 0, y: 2, z: -12 } });
          break;
        case 'lionGateOpen':
          a.play('gate_rise', { volume: 0.9, pos: { x: 0, y: 2, z: 12 } });
          break;
        case 'fightStart':
          a.setMusic('music_battle', 1, 2.0);
          break;
        case 'phase2':
          this.cheer(0.9);
          break;
        default: break;
      }
    }
  }

  footsteps(list: FootFx[], sim: GameSim) {
    const a = this.audio;
    for (const f of list) {
      if (f.kind !== 'plant') continue;
      if (f.who === 'lion') {
        if (f.strength < 0.12) continue;
        a.play(pick<SoundName>(['step_lion_0', 'step_lion_1']), { volume: Math.min(1, 0.25 + f.strength * 0.9), rate: rr(0.9, 1.1) - f.strength * 0.1, pos: { x: f.world.x, y: 0.1, z: f.world.z } });
      } else {
        if (f.strength < 0.18) continue;
        a.play(pick<SoundName>(['step_sand_0', 'step_sand_1', 'step_sand_2']), { volume: 0.3 + f.strength * 0.45, rate: rr(0.9, 1.12), pos: { x: f.world.x, y: 0.1, z: f.world.z } });
      }
    }
    void sim;
  }

  /** 상황에 따른 군중/배경 */
  ambience(sim: GameSim, cam: THREE.Camera, phase: string) {
    const a = this.audio;
    const inTunnel = Math.abs(cam.position.z) > 12.3 && Math.abs(cam.position.x) < 2.6 ? 1 : 0;
    a.updateListener(cam, inTunnel);
    const exc = phase === 'victory' ? 0.9 : phase === 'fight' ? 0.35 + (sim.lion.phase === 2 ? 0.15 : 0) : 0.28;
    a.setCrowdLevel(exc);
  }
}
