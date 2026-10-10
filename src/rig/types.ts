export type V3 = [number, number, number];

/** 뼈대 정의. pos 는 모델 공간(미터)의 휴식 자세 월드 좌표이며, 모든 뼈의 휴식 회전은 단위 회전이다. */
export interface BoneDef {
  name: string;
  parent: string | null;
  pos: V3;
}

export function mirrorBones(defs: BoneDef[]): BoneDef[] {
  return defs;
}
