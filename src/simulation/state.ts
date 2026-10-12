import type { LionAttackId, PlayerAttackId } from '../combat/attackData';
import type { V2, V3 } from './math';

export type GamePhase = 'intro' | 'fight' | 'playerDead' | 'victory';

export interface InputFrame {
  moveX: number; // +1 = 오른쪽(D)
  moveY: number; // +1 = 앞(W)
  run: boolean;
  guard: boolean;
  cameraYaw: number;
  pressed: { light: boolean; heavy: boolean; dodge: boolean; heal: boolean; lock: boolean };
}
export const emptyInput = (): InputFrame => ({
  moveX: 0, moveY: 0, run: false, guard: false, cameraYaw: 0,
  pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false },
});

export type PlayerMode = 'free' | 'attack' | 'dodge' | 'guardBreak' | 'hit' | 'heal' | 'dead' | 'victory' | 'scripted';

export interface PlayerState {
  pos: V2;
  yaw: number;
  vel: V2;
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  staminaDelay: number;
  exhausted: boolean;
  heals: number;
  mode: PlayerMode;
  modeT: number;
  attackId: PlayerAttackId | null;
  attackSerial: number;
  attackHitDone: boolean;
  /** 클립 공격(도약 내려찍기)이 이번에 이동할 총 거리(m) */
  attackTravel: number;
  slamFired: boolean;
  attackChain: number;
  lastAttackEnd: number;
  dodge: { dir: V2; backstep: boolean; dodgedSet: number };
  guardHeld: boolean;
  guardUpT: number; // 방패를 든 뒤 경과
  guardImpact: number; // 0..1, 감쇠
  healApplied: boolean;
  hitDir: V2;
  hitHeavy: boolean;
  invulnT: number; // 피격 후 짧은 무적
  knock: V2; // 넉백 속도
  lockOn: boolean;
  running: boolean;
  speed: number; // 현재 수평 속도
  moveLocal: V2; // 캐릭터 로컬 속도 (x=왼쪽, z=앞)
  buffer: { action: 'light' | 'heavy' | 'dodge' | 'heal' | null; t: number };
  prevBlade: { a: V3; b: V3 } | null;
  swingFired: boolean;
  lowStaminaFlash: number;
  lastDodgeStart: number;
  /** 처형 동작 중 (강공격 클립을 재사용하되 판정은 고정 명중, 무적) */
  executing: boolean;
  /** 달리다가 시작한 약공격 (달리기 공격) */
  runAttack: boolean;
  /** 이 시각(ctx.time)까지 다음 공격이 반격(리포스트) 보너스를 받는다 */
  riposteUntil: number;
}

export type LionMode =
  | 'dormant' | 'enter' | 'roar' | 'idle' | 'circle' | 'approach' | 'attack' | 'recover'
  | 'stagger' | 'stunned' | 'dying' | 'dead' | 'victory';

export interface LionAttackState {
  id: LionAttackId;
  t: number;
  serial: number;
  mirror: boolean; // 왼발(true) / 오른발
  hitDone: boolean;
  dodged: boolean;
  lockDir: V2;
  lockDist: number;
  lunge: number;
  leapFrom: V2 | null;
  leapTo: V2 | null;
  chargeDist: number;
  chargeMax: number;
  chargeSpeed: number;
  wallHit: boolean;
  combo: LionAttackId | null;
  prevVol: V3 | null;
  phase: 'windup' | 'active' | 'recover';
  braking: boolean;
  blockedBy: boolean;
  fired: boolean;
  wasActive: boolean;
  /** 현재 유효 구간 번호(연타 공격), 없으면 -1 */
  win: number;
  /** 전조 정지(페인트) 남은 시간 */
  hold: number;
  slammed: boolean;
  lungeWin: number;
  announced: number;
}

export interface LionState {
  pos: V2;
  y: number;
  yaw: number;
  vel: V2;
  speed: number;
  hp: number;
  hpMax: number;
  poise: number;
  poiseDelay: number;
  staggerImmune: number;
  phase: 1 | 2;
  pendingPhase2: boolean;
  invuln: boolean;
  mode: LionMode;
  modeT: number;
  modeDur: number;
  attack: LionAttackState | null;
  attackSerial: number;
  circleDir: 1 | -1;
  circleT: number;
  approachRange: number;
  cooldown: Record<string, number>;
  history: LionAttackId[];
  behindT: number;
  sinceAttack: number;
  postDelay: number;
  flinch: number; // 0..1 감쇠 (가벼운 피격 반응)
  flinchDir: V2;
  turnRate: number; // 현재 선회 각속도 (애니메이션용)
  lookYaw: number; // 머리가 바라보는 상대 각도 (몸 기준)
  deadT: number;
  roarT: number;
  landed: number; // 착지 직후 감쇠
  thinkT: number; // 이동 중 재평가 타이머
  /** 이번 경직(stagger/stunned) 동안 이미 처형을 당했는가 */
  executed: boolean;
  /** 지금 처형할 수 있는 상태인가 (플레이어 거리/각도 포함, 시뮬레이션이 매 스텝 갱신) */
  execReady: boolean;
}

export type SimEvent =
  | { type: 'playerSwing'; id: PlayerAttackId }
  | { type: 'playerSlam'; pos: V2; hit: boolean }
  | { type: 'playerHitLion'; pos: V3; dmg: number; heavy: boolean; head: boolean; stunned: boolean; invuln: boolean; dir: V3; killing: boolean; combo: number; execute?: boolean; riposte?: boolean; run?: boolean; finisher?: boolean }
  | { type: 'executionStart'; pos: V2; dur: number }
  | { type: 'playerBlocked'; strength: number; pos: V3; broke: boolean; attack: LionAttackId; perfect: boolean; parry?: boolean; interrupted?: boolean }
  | { type: 'playerHit'; dmg: number; pos: V3; heavy: boolean; attack: LionAttackId }
  | { type: 'playerDodge'; backstep: boolean }
  | { type: 'dodgeSuccess'; attack: LionAttackId }
  | { type: 'playerDeath' }
  | { type: 'heal'; amount: number }
  | { type: 'healStart' }
  | { type: 'healInterrupted' }
  | { type: 'staminaDenied' }
  | { type: 'lockOn'; on: boolean }
  | { type: 'lionWindup'; attack: LionAttackId; dur: number }
  | { type: 'lionAttack'; attack: LionAttackId }
  | { type: 'lionRoar'; phase2: boolean }
  | { type: 'lionLand'; pos: V2; power?: number }
  | { type: 'lionSlam'; pos: V2 }
  | { type: 'lionHop'; pos: V2; to: V2 }
  | { type: 'lionWallHit'; pos: V2 }
  | { type: 'lionStagger'; source?: 'poise' | 'parry' | 'wall' }
  | { type: 'lionDeath' }
  | { type: 'phase2' }
  | { type: 'gateClose' }
  | { type: 'lionGateOpen' }
  | { type: 'fightStart' }
  | { type: 'victory' }
  | { type: 'playerDeathScreen' };

export interface Stats {
  time: number;
  damageTaken: number;
  dodges: number;
  blocks: number;
  hitsLanded: number;
  heals: number;
  attempts: number;
}
