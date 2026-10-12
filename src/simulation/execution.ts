import type { SimContext } from './context';
import { angleDiff, dist2, norm2, yawOf } from './math';
import { TUNING } from './tuning';

const X = TUNING.execute;

/**
 * 처형 가능 조건: 사자가 경직(stagger/stunned) 중이고 아직 처형당하지 않았으며, 경직이 곧 끝나지 않고,
 * 플레이어가 살아 있고 사자 쪽(거리/각도 안)에 있다. 시뮬레이션이 매 스텝 lion.execReady 로 기록하고,
 * 플레이어 입력(강공격)이 같은 함수를 써서 시작 여부를 정한다.
 */
export function canExecute(ctx: SimContext): boolean {
  const l = ctx.lion, p = ctx.player;
  if (ctx.phase !== 'fight' || !ctx.controlEnabled) return false;
  if (l.hp <= 0 || l.executed) return false;
  if (l.mode !== 'stagger' && l.mode !== 'stunned') return false;
  if (l.modeT < X.minTime || l.modeDur - l.modeT < X.minRemain) return false;
  if (p.mode === 'dead' || p.mode === 'scripted' || p.mode === 'victory' || p.mode === 'hit' || p.mode === 'guardBreak') return false;
  if (dist2(p.pos, l.pos) > X.range) return false;
  const to = yawOf(norm2({ x: l.pos.x - p.pos.x, z: l.pos.z - p.pos.z }));
  return Math.abs(angleDiff(to, p.yaw)) <= X.bearing || p.lockOn;
}
