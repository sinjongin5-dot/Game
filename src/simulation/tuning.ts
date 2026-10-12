/** 모든 전투 수치. 플레이테스트 결과에 맞춰 이 파일에서만 조정한다. */
export const TUNING = {
  dt: 1 / 60,
  maxFrameDt: 0.1,
  maxSubSteps: 6,

  arena: { a: 15, b: 12, playerRadius: 0.42, lionRadius: 0.72 },

  player: {
    hp: 100,
    stamina: 100,
    walkSpeed: 3.2,
    runSpeed: 5.6,
    guardMoveSpeed: 1.9,
    accel: 36,
    turnRate: 15, // rad/s (락온/이동 방향 정렬)
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

  /** 패링: 방패를 든 직후(block.perfect 창) 막으면 사자의 가벼운 공격을 끊고 경직을 쌓는다 */
  parry: { poiseLight: 40, poiseHeavy: 14, recover: 1.15, riposteWindow: 1.3, riposteDamage: 1.25, riposteHitstop: 0.02, hitstop: 0.13, knockLight: 1.2 },
  /** 처형: 사자가 경직(stagger/stunned)일 때 강공격 입력으로 발동 */
  execute: { range: 4.4, bearing: 1.15, minTime: 0.18, minRemain: 0.45, standDist: 1.9, hpFrac: 0.17, minDamage: 120, hitstop: 0.3, killHitstop: 0.45 },
  runAttack: { minSpeed: 4.4, damageMul: 1.15, poiseMul: 1.25 },

  lion: {
    hp: 900,
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
