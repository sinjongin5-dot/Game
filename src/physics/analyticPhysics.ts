import { ARENA, clampToEllipse } from '../simulation/arena';
import { TUNING } from '../simulation/tuning';
import type { V2, V3 } from '../simulation/math';
import type { CharId, Physics } from './types';

/** Rapier 없이 쓰는 해석적 충돌 (단위 테스트/폴백). 타원 벽 + 기둥 + 캐릭터 간 분리 */
export class AnalyticPhysics implements Physics {
  readonly name = 'analytic';
  private pos: Record<CharId, V2> = { player: { x: 0, z: 0 }, lion: { x: 0, z: 0 } };
  private radius: Record<CharId, number> = { player: TUNING.arena.playerRadius, lion: TUNING.arena.lionRadius };
  private gates = false;

  moveCharacter(id: CharId, pos: V2, delta: V2): V2 {
    let p = { x: pos.x + delta.x, z: pos.z + delta.z };
    p = clampToEllipse(p, this.radius[id] + 0.3);
    for (const c of ARENA.pillars) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + this.radius[id];
      if (d < m && d > 1e-6) { p = { x: c.x + (dx / d) * m, z: c.z + (dz / d) * m }; }
    }
    const other: CharId = id === 'player' ? 'lion' : 'player';
    const o = this.pos[other];
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    const m = this.radius.player + this.radius.lion * 0.9;
    if (d < m && d > 1e-6) p = { x: o.x + (dx / d) * m, z: o.z + (dz / d) * m };
    this.pos[id] = p;
    return p;
  }
  teleport(id: CharId, pos: V2): void { this.pos[id] = { ...pos }; }
  setYaw(): void {}
  step(): void {}
  setGatesClosed(c: boolean): void { this.gates = c; void this.gates; }
  raycast(_o: V3, _d: V3, _m: number): number | null { return null; }
  dispose(): void {}
}
