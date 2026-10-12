import type { Physics } from '../physics/types';
import type { Rng } from './math';
import type { GamePhase, GrappleState, LionState, PlayerState, QteMode, SimEvent, Stats } from './state';

export interface SimContext {
  player: PlayerState;
  lion: LionState;
  physics: Physics;
  rng: Rng;
  events: SimEvent[];
  stats: Stats;
  time: number; // 전투 시간
  phase: GamePhase;
  hitstop: number;
  /** 입장 연출 종료 후 일정 시간까지 사자는 공격하지 않는다 */
  graceUntil: number;
  controlEnabled: boolean;
  /** 상호작용 연출(물어뜯기 포획) 설정/상태 */
  qteMode: QteMode;
  grapple: GrappleState | null;
}
