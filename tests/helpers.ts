import { AnalyticPhysics } from '../src/physics/analyticPhysics';
import { GameSim } from '../src/simulation/sim';
import { emptyInput, type InputFrame } from '../src/simulation/state';

export function makeSim(opts: { seed?: number; skipIntro?: boolean } = {}) {
  return new GameSim(new AnalyticPhysics(), { skipIntro: true, ...opts });
}
export function input(over: Omit<Partial<InputFrame>, 'pressed'> & { pressed?: Partial<InputFrame['pressed']> } = {}): InputFrame {
  const base = emptyInput();
  return { ...base, ...over, pressed: { ...base.pressed, ...(over.pressed ?? {}) } };
}
export function run(sim: GameSim, seconds: number, inp: InputFrame | ((t: number) => InputFrame) = emptyInput()) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) sim.step(typeof inp === 'function' ? inp(i / 60) : inp);
}
