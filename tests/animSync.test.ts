import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GladiatorAnimator, type PlayerView } from '../src/animation/gladiatorAnimator';
import { LionAnimator, type LionView } from '../src/animation/lionAnimator';
import { LION_ATTACKS, PLAYER_ATTACKS, SWORD, sampleLionPath, sampleSword, type LionAttackId } from '../src/combat/attackData';

const baseView = (): PlayerView => ({
  mode: 'attack', modeT: 0, attackId: 'light1', guardHeld: false, guardUp: false, guardUpT: 1, guardImpact: 0, moveLocal: { x: 0, z: 0 }, speed: 0,
  running: false, healApplied: false, hitDirLocal: { x: 0, z: -1 }, hitHeavy: false, dodgeBackstep: false, lookYaw: 0, staminaFrac: 1, hpFrac: 1, time: 1, deadT: 0, victoryT: 0,
});

describe('애니메이션과 판정의 동기화 (같은 궤적 데이터를 IK 로 푼 결과)', () => {
  it('플레이어 검: 그려지는 칼끝이 판정용 칼끝과 일치한다 (활성 구간)', () => {
    const rows: string[] = [];
    let worst = 0;
    for (const def of Object.values(PLAYER_ATTACKS)) {
      const anim = new GladiatorAnimator();
      let maxErr = 0;
      for (let t = def.activeStart - 0.02; t <= def.activeEnd + 0.02; t += 0.01) {
        const v = baseView(); v.attackId = def.id; v.modeT = t;
        anim.update(1 / 60, v);
        const s = sampleSword(def, t);
        const wantTip = new THREE.Vector3(s.hand.x + s.dir.x * (SWORD.bladeStart + SWORD.bladeLen), s.hand.y + s.dir.y * (SWORD.bladeStart + SWORD.bladeLen), s.hand.z + s.dir.z * (SWORD.bladeStart + SWORD.bladeLen));
        const err = anim.swordTipWorld.distanceTo(wantTip);
        maxErr = Math.max(maxErr, err);
      }
      rows.push(`${def.id}: 칼끝 최대 오차 ${(maxErr * 100).toFixed(1)}cm`);
      worst = Math.max(worst, maxErr);
    }
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));
    expect(worst).toBeLessThan(0.07);
  });

  it('사자 앞발/머리: 그려지는 위치가 판정 경로와 일치한다 (활성 구간)', () => {
    const rows: string[] = [];
    let worst = 0;
    for (const id of ['swipe', 'bite', 'rear', 'pounceSwat', 'swipeBite', 'dashBite'] as LionAttackId[]) {
      const def = LION_ATTACKS[id];
      const anim = new LionAnimator();
      let maxErr = 0;
      for (let t = def.activeStart; t <= def.activeEnd; t += 0.01) {
        const v: LionView = {
          mode: 'attack', modeT: t, attackId: id, attackT: t, mirror: false, speed: 0, moveLocal: { x: 0, z: 0 }, turnRate: 0, y: 0, lookYaw: 0, flinch: 0,
          flinchDirLocal: { x: 0, z: -1 }, landed: 0, deadT: 0, time: 1, phase: 1, chargeBraking: false, chargeSpeed: 0, hpFrac: 1,
        };
        for (let k = 0; k < 2; k++) anim.update(1 / 60, v);
        const want = sampleLionPath(def, t, false);
        const wantV = new THREE.Vector3(want.x, want.y, want.z);
        const actual = def.kind === 'bite'
          ? anim.rig.worldP[anim.rig.id('head')].clone().add(new THREE.Vector3(0, -0.1, 0.36))
          : anim.rig.worldP[anim.rig.id('toe_R')].clone();
        const err = actual.distanceTo(wantV);
        maxErr = Math.max(maxErr, err);
      }
      rows.push(`${id}: 최대 오차 ${(maxErr * 100).toFixed(1)}cm`);
      worst = Math.max(worst, maxErr);
    }
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));
    expect(worst).toBeLessThan(0.2);
  });

  it('연타 할퀴기: 타마다 번갈아 휘두르는 앞발이 판정 경로와 일치한다', () => {
    const def = LION_ATTACKS.flurry;
    const rows: string[] = [];
    for (const mirror of [false, true]) {
      const anim = new LionAnimator();
      let maxErr = 0;
      def.windows!.forEach(([ws, we], idx) => {
        for (let t = ws; t <= we; t += 0.01) {
          const v: LionView = {
            mode: 'attack', modeT: t, attackId: 'flurry', attackT: t, mirror, speed: 0, moveLocal: { x: 0, z: 0 }, turnRate: 0, y: 0, lookYaw: 0, flinch: 0,
            flinchDirLocal: { x: 0, z: -1 }, landed: 0, deadT: 0, time: 1, phase: 1, chargeBraking: false, chargeSpeed: 0, hpFrac: 1,
          };
          for (let k = 0; k < 2; k++) anim.update(1 / 60, v);
          const want = sampleLionPath(def, t, mirror);
          const rightPaw = (idx % 2 === 0) !== mirror;
          const toe = anim.rig.worldP[anim.rig.id(rightPaw ? 'toe_R' : 'toe_L')];
          maxErr = Math.max(maxErr, toe.distanceTo(new THREE.Vector3(want.x, want.y, want.z)));
        }
      });
      rows.push(`flurry mirror=${mirror}: 최대 오차 ${(maxErr * 100).toFixed(1)}cm`);
      expect(maxErr).toBeLessThan(0.2);
    }
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));
  });
});
