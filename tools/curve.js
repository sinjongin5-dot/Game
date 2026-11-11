// 성장 곡선 검증:  node tools/curve.js [야생 전투 비율=0.35]
// 스토리 순서대로 모든 트레이너를 이겼을 때의 예상 레벨과 상대 레벨의 차이를 출력한다.
// 보스에서 -2 ~ -3 정도가 되도록 world.js의 LEVELS와 beast.js의 expMult를 맞춘다.
const path = require('path');
for (const f of ['core', 'data/beasts', 'data/cards', 'engine/beast', 'engine/battle', 'engine/ai', 'data/world']) require(path.join('..', 'js', f + '.js'));
const X = globalThis.XG, G = { p: { starter: 'embercub' } }, wild = +process.argv[2] || 0.35;
const ORDER = ['leon1', 'r1a', 'r1b', 'r1c', 'ch_t1', 'sera', 'f1', 'f2', 'f3', 'grunt1', 'lg_t1', 'gaon', 'leon2', 'c1', 'c2', 'c3', 'mira2', 'v1', 'v2', 'v3', 'admin', 'xg_t1', 'xg_t2', 'mujin', 'xh_t1', 'xh_t2', 'noah', 'sp1', 'sp2', 'sp3', 'fg_t1', 'seolhwa', 'aq1', 'aq2', 'leon3', 'mira3', 'aria'];
const find = (id) => { for (const m of Object.values(X.WORLD.maps)) { const n = m.npcs.find((x) => x.id === id); if (n) return n; } };
const size = (i) => (i < 5 ? 2 : i < 12 ? 3 : i < 21 ? 4 : 5); // 그 시점에 키우는 비스트 수
let cum = 0;
ORDER.forEach((id, i) => {
  const b = find(id).battle, k = size(i), pred = Math.cbrt((cum * (1 + wild) / k + 0.8 * 125) / 0.8);
  let e = 0;
  if (b.team) for (const [sp, lv] of typeof b.team === 'function' ? b.team(G) : b.team) e += (X.BEASTS[sp].xp * lv) / 7 * 1.5 * X.expMult(lv);
  else e = b.lvl * 42 * X.expMult(b.lvl);
  console.log(id.padEnd(8), '상대 Lv' + String(b.lvl).padStart(3), ' 예상 Lv' + pred.toFixed(1).padStart(5), ' 차이' + (pred - b.lvl).toFixed(1).padStart(6));
  cum += e;
});
