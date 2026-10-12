import type { LionAttackId, PlayerAttackId } from '../combat/attackData';
import type { V2, V3 } from './math';

export type GamePhase = 'intro' | 'fight' | 'playerDead' | 'victory';

export interface InputFrame {
  moveX: number; // +1 = 오른쪽(D)
  moveY: number; // +1 = 앞(W)
  run: boolean;
  guard: boolean;
  cameraYaw: number;
  /** a/b/x/y: 상호작용(물어뜯기 막기) 연출용 얼굴 버튼. 게임패드 A/B/X/Y, 키보드 Space/Q/E/F */
  pressed: { light: boolean; heavy: boolean; dodge: boolean; heal: boolean; lock: boolean; a: boolean; b: boolean; x: boolean; y: boolean; fury: boolean };
}
export const emptyInput = (): InputFrame => ({
  moveX: 0, moveY: 0, run: false, guard: false, cameraYaw: 0,
  pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false, a: false, b: false, x: false, y: false, fury: false },
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
  /** 기세 게이지 0..100 — 맞추고 막고 피할수록 차고, 가득 차면 폭발(fury) 입력으로 발동 */
  momentum: number;
  /** 폭발 모드 남은 시간(초) */
  furyT: number;
  /** 마지막으로 기세가 오른 뒤 경과(초): 일정 시간 지나면 서서히 식는다 */
  momentumIdle: number;
  /** 연속 타격 수 / 마지막 타격 뒤 경과 */
  combo: number;
  comboT: number;
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
  | { type: 'playerHitLion'; pos: V3; dmg: number; heavy: boolean; head: boolean; stunned: boolean; invuln: boolean; dir: V3; killing: boolean; combo: number; execute?: boolean; riposte?: boolean; run?: boolean; finisher?: boolean; bash?: boolean; witch?: boolean; fury?: boolean }
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
  | { type: 'playerDeathScreen' }
  | { type: 'callout'; kind: CalloutKind; n?: number }
  | { type: 'witchStart' }
  | { type: 'clash'; pos: V3; attack: LionAttackId }
  | { type: 'furyStart' }
  | { type: 'furyEnd' }
  | { type: 'grappleStart'; pos: V2 }
  | { type: 'qtePrompt'; idx: number; button: QteButton; winStart: number; winEnd: number }
  | { type: 'qteResult'; idx: number; ok: boolean; perfect: boolean; button: QteButton; pos: V3 }
  | { type: 'grappleCounterPrompt'; button: QteButton }
  | { type: 'grappleCounter' }
  | { type: 'grappleEnd'; outcome: 'counter' | 'released' | 'dead' };

export type CalloutKind = 'parry' | 'dodge' | 'clash' | 'bash' | 'combo' | 'fury' | 'execute' | 'counter' | 'riposte';

export type QteButton = 'A' | 'B' | 'X' | 'Y';
export type QteMode = 'off' | 'easy' | 'normal';

/** 물어뜯기 포획 상호작용 상태 (시뮬레이션이 소유, UI/연출은 읽기만 한다) */
export interface GrappleState {
  phase: 'intro' | 'bite' | 'counter';
  /** 현재 단계 시작 후 경과 */
  t: number;
  idx: number;
  prompts: QteButton[];
  results: ('pending' | 'success' | 'perfect' | 'miss')[];
  /** 현재 물기의 입력 창 (물기 시작 기준 초) */
  winStart: number;
  winEnd: number;
  /** 사자 이빨이 닿는 시각 */
  hitAt: number;
  /** 이번 물기가 끝났는가(성공/실패 판정 완료) */
  resolved: boolean;
  /** 이번 물기의 피해를 이미 적용했는가 */
  damaged: boolean;
  counterBtn: QteButton;
  counterWin: number;
}

export interface Stats {
  time: number;
  damageTaken: number;
  dodges: number;
  blocks: number;
  hitsLanded: number;
  heals: number;
  attempts: number;
  /** 물어뜯기 막기 성공 횟수 / 반격 성공 횟수 */
  qteSuccess: number;
  counters: number;
  perfectDodges: number;
  clashes: number;
  maxCombo: number;
  furies: number;
}
