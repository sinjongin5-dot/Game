import type { V2, V3 } from '../simulation/math';

export type CharId = 'player' | 'lion';

export interface Physics {
  /** 캐릭터를 delta 만큼 이동 시도하고 충돌 해결 후 새 위치를 반환 */
  moveCharacter(id: CharId, pos: V2, delta: V2): V2;
  teleport(id: CharId, pos: V2, yaw: number): void;
  setYaw(id: CharId, yaw: number): void;
  step(): void;
  setGatesClosed(closed: boolean): void;
  /** 월드 레이캐스트 (카메라 벽 충돌). 충돌 거리 또는 null */
  raycast(origin: V3, dir: V3, maxDist: number): number | null;
  dispose(): void;
  readonly name: string;
}
