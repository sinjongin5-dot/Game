import type { BoneDef, V3 } from './types';

/**
 * 검투사 리그. 모델은 +Z 를 바라보고, 캐릭터의 왼쪽이 +X 이다. 높이 1.82m (투구 볏 제외).
 * 모든 뼈의 휴식 회전은 단위 회전(월드 축과 동일)이라 포즈 계산이 단순하다.
 */
const L = (v: V3): V3 => v;
const R = (v: V3): V3 => [-v[0], v[1], v[2]];

function side(suffix: 'L' | 'R', f: (v: V3) => V3): BoneDef[] {
  const s = `_${suffix}`;
  return [
    { name: `clavicle${s}`, parent: 'chest', pos: f([0.04, 1.5, 0.02]) },
    { name: `upperarm${s}`, parent: `clavicle${s}`, pos: f([0.19, 1.49, 0.0]) },
    { name: `forearm${s}`, parent: `upperarm${s}`, pos: f([0.27, 1.2, -0.01]) },
    { name: `hand${s}`, parent: `forearm${s}`, pos: f([0.345, 0.95, 0.04]) },
    { name: `thigh${s}`, parent: 'hips', pos: f([0.095, 0.93, 0.0]) },
    { name: `shin${s}`, parent: `thigh${s}`, pos: f([0.105, 0.52, 0.015]) },
    { name: `foot${s}`, parent: `shin${s}`, pos: f([0.105, 0.1, -0.015]) },
    { name: `toe${s}`, parent: `foot${s}`, pos: f([0.105, 0.045, 0.115]) },
  ];
}

export const HUMAN_BONES: BoneDef[] = [
  { name: 'root', parent: null, pos: [0, 0, 0] },
  { name: 'hips', parent: 'root', pos: [0, 0.98, 0] },
  { name: 'spine1', parent: 'hips', pos: [0, 1.08, 0] },
  { name: 'spine2', parent: 'spine1', pos: [0, 1.24, 0] },
  { name: 'chest', parent: 'spine2', pos: [0, 1.38, 0] },
  { name: 'neck', parent: 'chest', pos: [0, 1.56, 0.01] },
  { name: 'head', parent: 'neck', pos: [0, 1.66, 0.015] },
  ...side('L', L),
  ...side('R', R),
];

export const HUMAN_BONE_INDEX: Record<string, number> = Object.fromEntries(
  HUMAN_BONES.map((b, i) => [b.name, i]),
);

/** 신체 치수 (포즈 계산용). */
export const HUMAN_DIM = {
  thigh: 0.41,
  shin: 0.42,
  upperarm: 0.313,
  forearm: 0.274,
  hipHeight: 0.98,
  ankleHeight: 0.1,
  footLen: 0.2,
};
