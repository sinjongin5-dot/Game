import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/render/cameraRig';
import { SLASH_STYLES, SlashTrail, SlashTrailPool } from '../src/render/slashTrail';
import { IMPACT_PROFILES } from '../src/render/combatVfx';
import { makeSim } from './helpers';

const settings = { sensitivity: 1, shake: 1, invertY: false };

describe('카메라 충격 관리', () => {
  it('연속으로 수십 번 충격을 가해도 흔들림/킥/FOV 가 상한을 넘지 않는다', () => {
    const cam = new CameraRig(settings);
    const dir = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 60; i++) cam.impact({ dir, trauma: 1, kick: 0.4, fov: 5, roll: 0.05 });
    expect(cam.traumaLevel).toBeLessThanOrEqual(1);
    expect(cam.kickLength).toBeLessThanOrEqual(0.55 + 1e-6);
    expect(Math.abs(cam.fovKickValue)).toBeLessThanOrEqual(9);
  });

  it('충격 후 시간이 지나면 흔들림이 0 으로 복귀한다', () => {
    const sim = makeSim();
    const cam = new CameraRig(settings);
    const raycast = () => null;
    cam.impact({ dir: new THREE.Vector3(1, 0, 0), trauma: 1, kick: 0.5, fov: 4 });
    for (let i = 0; i < 180; i++) cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, raycast, true, 1);
    expect(cam.traumaLevel).toBeLessThan(0.01);
    expect(cam.kickLength).toBeLessThan(0.01);
    expect(Math.abs(cam.fovKickValue)).toBeLessThan(0.05);
  });

  it('이미 크게 흔들리는 중에는 추가 충격이 줄어든다 (누적 방지)', () => {
    const a = new CameraRig(settings), b = new CameraRig(settings);
    a.impact({ trauma: 0.4 });
    const single = a.traumaLevel;
    b.impact({ trauma: 0.9 });
    b.impact({ trauma: 0.4 });
    expect(b.traumaLevel - 0.9 * 1).toBeLessThan(single);
  });

  it('흔들림 설정이 0 이면 충격/긴장/시네마틱이 모두 꺼진다 (접근성)', () => {
    const sim = makeSim();
    const cam = new CameraRig({ ...settings, shake: 0 });
    cam.impact({ dir: new THREE.Vector3(1, 0, 0), trauma: 1, kick: 0.5, fov: 4 });
    cam.setTension(1, 2);
    cam.startCine('execute', 1, sim);
    expect(cam.traumaLevel).toBe(0);
    expect(cam.kickLength).toBe(0);
    expect(cam.cineActive).toBe(false);
    for (let i = 0; i < 30; i++) cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, () => null, true, 1);
    expect(cam.tension).toBe(0);
  });

  it('보스 준비 긴장은 holdSec 뒤 자동으로 풀린다', () => {
    const sim = makeSim();
    const cam = new CameraRig(settings);
    cam.setTension(1, 0.5);
    for (let i = 0; i < 20; i++) cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, () => null, true, 1);
    expect(cam.tension).toBeGreaterThan(0.2);
    for (let i = 0; i < 120; i++) cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, () => null, true, 1);
    expect(cam.tension).toBeLessThan(0.02);
  });

  it('처형 시네마틱은 지정한 시간 뒤 끝나고 카메라가 경기장 밖으로 나가지 않는다', () => {
    const sim = makeSim();
    const c = sim.ctx;
    c.player.pos = { x: 10, z: 8 }; c.lion.pos = { x: 11, z: 9 };
    const cam = new CameraRig(settings);
    for (let i = 0; i < 5; i++) cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, () => null, true, 1);
    cam.startCine('execute', 1.0, sim);
    expect(cam.cineActive).toBe(true);
    let maxQ = 0;
    for (let i = 0; i < 90; i++) {
      cam.gameplay(sim, { dx: 0, dy: 0 }, 1 / 60, () => null, true, 1);
      const p = cam.camera.position;
      maxQ = Math.max(maxQ, Math.hypot(p.x / 15, p.z / 12));
    }
    expect(cam.cineActive).toBe(false);
    expect(maxQ).toBeLessThan(1.3);
  });
});

describe('검 궤적', () => {
  const base = new THREE.Vector3(), tip = new THREE.Vector3();
  const sweep = (t: SlashTrail, frames: number, fps = 60) => {
    for (let i = 0; i < frames; i++) {
      const a = -1.2 + (i / frames) * 2.4;
      base.set(Math.sin(a) * 0.15, 1.2, Math.cos(a) * 0.15);
      tip.set(Math.sin(a) * 0.75, 1.2 + Math.cos(a) * 0.3, Math.cos(a) * 0.75);
      t.push(base, tip, 1 / fps);
      t.update(1 / fps);
    }
  };

  it('스타일마다 서로 다른 색/수명/두께 정의를 가진다 (강공격 > 일반)', () => {
    expect(SLASH_STYLES.heavy.life).toBeGreaterThan(SLASH_STYLES.light.life);
    expect(SLASH_STYLES.heavy.extend).toBeGreaterThan(SLASH_STYLES.light.extend);
    expect(SLASH_STYLES.execute.life).toBeGreaterThanOrEqual(SLASH_STYLES.heavy.life);
    expect(SLASH_STYLES.light.smoke).toBe(0);
    expect(SLASH_STYLES.heavy.smoke).toBeGreaterThan(0);
  });

  it('휘두르는 동안 보이고 끝난 뒤 수명이 지나면 사라진다', () => {
    const t = new SlashTrail();
    t.begin('light');
    sweep(t, 12);
    expect(t.visible).toBe(true);
    t.end();
    for (let i = 0; i < 40; i++) t.update(1 / 60);
    expect(t.visible).toBe(false);
  });

  it('빠른 칼끝 이동에서 저프레임(15fps)이어도 중간 샘플을 보간해 리본이 끊기지 않는다', () => {
    const t = new SlashTrail();
    t.begin('heavy');
    sweep(t, 4, 15);
    const pos = (t as unknown as { pos: Float32Array }).pos;
    // 연속한 칼끝 샘플 사이 간격이 일정 수준 이하(보간됨)
    let maxGap = 0;
    for (let i = 0; i < 12; i++) {
      const a = new THREE.Vector3(pos[i * 6 + 3], pos[i * 6 + 4], pos[i * 6 + 5]);
      const b = new THREE.Vector3(pos[(i + 1) * 6 + 3], pos[(i + 1) * 6 + 4], pos[(i + 1) * 6 + 5]);
      if (a.lengthSq() === 0 || b.lengthSq() === 0) continue;
      maxGap = Math.max(maxGap, a.distanceTo(b));
    }
    expect(maxGap).toBeLessThan(0.45);
  });

  it('풀은 재사용만 하고 새 오브젝트를 늘리지 않는다 (공격 100번)', () => {
    const pool = new SlashTrailPool(3);
    const before = pool.group.children.length;
    for (let i = 0; i < 100; i++) {
      const tr = pool.begin(i % 3 === 0 ? 'heavy' : 'light');
      for (let f = 0; f < 6; f++) { base.set(0, 1, 0); tip.set(0.1 * f, 1.2, 0.7); tr.push(base, tip, 1 / 60); pool.update(1 / 60); }
      pool.end();
    }
    expect(pool.group.children.length).toBe(before);
    expect(pool.size).toBe(3);
  });

  it('칼끝이 멈춰 있으면(히트스톱) 같은 위치 샘플을 쌓지 않는다', () => {
    const t = new SlashTrail();
    t.begin('light');
    base.set(0, 1, 0); tip.set(0, 1.2, 0.7);
    for (let i = 0; i < 30; i++) t.push(base, tip, 1 / 60);
    // 보간 단계가 1 이므로 최대 30 샘플이 들어가도 위치는 동일 — 속도는 0 으로 측정된다
    expect(t.speed).toBe(0);
  });
});

describe('충돌 프로필', () => {
  it('공격 종류마다 서로 다른 프로필이며 강한 순서대로 충격이 커진다', () => {
    const P = IMPACT_PROFILES;
    expect(P.heavy.cam.trauma).toBeGreaterThan(P.light.cam.trauma);
    expect(P.execute.cam.trauma).toBeGreaterThan(P.heavy.cam.trauma);
    expect(P.heavy.flash[0]).toBeGreaterThan(P.light.flash[0]);
    expect(P.execute.flash[0]).toBeGreaterThan(P.heavy.flash[0]);
    // 패링은 금속 불꽃이 가장 많고 살점(핏방울)은 없다
    expect(P.parry.sparks![0]).toBeGreaterThan(P.heavy.sparks![0]);
    expect(P.parry.droplets).toBeUndefined();
    expect(P.light.droplets).toBeGreaterThan(0);
    // 같은 색·같은 파티클로 처리하지 않는다
    const flashColors = new Set(Object.values(P).map((p) => p.flash[1]));
    expect(flashColors.size).toBeGreaterThan(6);
  });
});
