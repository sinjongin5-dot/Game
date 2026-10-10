import type { BoneDef, V3 } from './types';

/**
 * 숫사자 리그. +Z 정면, 캐릭터 왼쪽이 +X. 어깨높이 약 1.15m, 머리-몸통 길이 약 2.0m, 꼬리 약 1m.
 * 휴식 회전은 모두 단위 회전.
 */
const mir = (v: V3): V3 => [-v[0], v[1], v[2]];
const id = (v: V3): V3 => v;

function front(suffix: 'L' | 'R', f: (v: V3) => V3): BoneDef[] {
  const s = `_${suffix}`;
  return [
    { name: `scap${s}`, parent: 'spine2', pos: f([0.16, 1.1, 0.5]) },
    { name: `arm${s}`, parent: `scap${s}`, pos: f([0.22, 0.86, 0.52]) },
    { name: `fore${s}`, parent: `arm${s}`, pos: f([0.21, 0.5, 0.38]) },
    { name: `paw${s}`, parent: `fore${s}`, pos: f([0.2, 0.2, 0.52]) },
    { name: `toe${s}`, parent: `paw${s}`, pos: f([0.2, 0.055, 0.64]) },
  ];
}
function hind(suffix: 'L' | 'R', f: (v: V3) => V3): BoneDef[] {
  const s = `_${suffix}`;
  return [
    { name: `thigh${s}`, parent: 'pelvis', pos: f([0.25, 0.97, -0.72]) },
    { name: `knee${s}`, parent: `thigh${s}`, pos: f([0.28, 0.6, -0.4]) },
    { name: `hock${s}`, parent: `knee${s}`, pos: f([0.23, 0.35, -0.98]) },
    { name: `hpaw${s}`, parent: `hock${s}`, pos: f([0.22, 0.07, -0.8]) },
    { name: `htoe${s}`, parent: `hpaw${s}`, pos: f([0.22, 0.045, -0.7]) },
  ];
}

export const LION_BONES: BoneDef[] = [
  { name: 'root', parent: null, pos: [0, 0, 0] },
  { name: 'pelvis', parent: 'root', pos: [0, 0.98, -0.66] },
  { name: 'spine1', parent: 'pelvis', pos: [0, 1.0, -0.2] },
  { name: 'spine2', parent: 'spine1', pos: [0, 1.04, 0.28] },
  { name: 'neck1', parent: 'spine2', pos: [0, 1.1, 0.66] },
  { name: 'neck2', parent: 'neck1', pos: [0, 1.18, 0.9] },
  { name: 'head', parent: 'neck2', pos: [0, 1.24, 1.06] },
  { name: 'jaw', parent: 'head', pos: [0, 1.12, 1.2] },
  { name: 'ear_L', parent: 'head', pos: [0.14, 1.44, 1.04] },
  { name: 'ear_R', parent: 'head', pos: [-0.14, 1.44, 1.04] },
  ...front('L', id),
  ...front('R', mir),
  ...hind('L', id),
  ...hind('R', mir),
  { name: 'tail1', parent: 'pelvis', pos: [0, 0.96, -1.08] },
  { name: 'tail2', parent: 'tail1', pos: [0, 0.86, -1.42] },
  { name: 'tail3', parent: 'tail2', pos: [0, 0.68, -1.74] },
  { name: 'tail4', parent: 'tail3', pos: [0, 0.48, -1.98] },
  { name: 'tail5', parent: 'tail4', pos: [0, 0.32, -2.12] },
];

export const LION_BONE_INDEX: Record<string, number> = Object.fromEntries(
  LION_BONES.map((b, i) => [b.name, i]),
);
