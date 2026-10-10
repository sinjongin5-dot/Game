/** 모든 전투 수치. 플레이테스트 결과에 맞춰 이 파일에서만 조정한다. */
export const TUNING = {
  dt: 1 / 60,
  maxFrameDt: 0.1,
  maxSubSteps: 6,

  arena: { a: 15, b: 12, playerRadius: 0.42, lionRadius: 0.72 },

  player: {
    hp: 100,
    stamina: 100,
    walkSpeed: 3.0,
    runSpeed: 5.6,
    guardMoveSpeed: 1.9,
    accel: 22,
    turnRate: 12, // rad/s (락온/이동 방향 정렬)
    staminaRegen: 30, // /s
    staminaRegenDelay: 0.7,
    guardRegenMul: 0.25,
    runDrain: 9, // /s
    lightCost: 18,
    heavyCost: 32,
    dodgeCost: 25,
    heal: { charges: 2, amount: 45, duration: 1.35, consumeAt: 0.0, applyAt: 0.72, moveMul: 0.0 },
    dodge: { duration: 0.72, iStart: 0.1, iEnd: 0.34, distance: 4.0, cancelAt: 0.56, backDistance: 3.2 },
    block: { raise: 0.12, halfAngle: (78 * Math.PI) / 180, perfect: 0.16, perfectMul: 0.5 },
    hitStun: 0.5,
    bigHitStun: 0.85,
    guardBreakStun: 1.1,
    inputBuffer: 0.15,
    radius: 0.4,
    height: 1.8,
  },

  lion: {
    hp: 520,
    phase2At: 0.55,
    walkSpeed: 1.7,
    circleSpeed: 2.3,
    runSpeed: 5.2,
    turnRateWalk: 1.9,
    turnRateRun: 1.2,
    poiseMax: 100,
    poiseLightGain: 12,
    poiseHeavyGain: 46,
    poiseDecay: 7,
    poiseDecayDelay: 2.4,
    staggerTime: 1.7,
    staggerImmuneTime: 7,
    staggerImmuneGain: 0.3,
    radius: 0.72,
  },
} as const;
