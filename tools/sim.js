// 밸런스 시뮬레이터 & 엔진 스모크 테스트:  node tools/sim.js [판수]
// AI끼리 세 가지 대전 방식을 돌려 승률/턴 수를 출력하고, 무작위 합법 행동 퍼징으로 엔진 안정성을 확인한다.
const path = require('path');
for (const f of ['core', 'data/beasts', 'data/cards', 'engine/beast', 'engine/battle', 'engine/ai']) require(path.join('..', 'js', f + '.js'));
const X = globalThis.XG;
const N = +process.argv[2] || 400;

const team = (list, h) => list.map(([sp, lv]) => X.makeBeast(sp, lv, h));
const TIERS = {
  early: { lv: 9, teams: [[['embercub', 9], ['flitwing', 8]], [['aquaring', 9], ['squeako', 8]], [['leafy', 9], ['sparklet', 8]], [['wriggle', 8], ['pebblit', 9], ['squeako', 8]]], decks: ['starter', 'novice', 'mira1'] },
  mid: { lv: 24, teams: [[['flarehound', 24], ['stormhawk', 23], ['lilypad', 22]], [['aqualune', 24], ['voltragon', 23], ['mothra', 23]], [['leafron', 24], ['craggon', 24], ['shadecat', 23]], [['gnawlord', 24], ['wavelord', 23], ['charcoal', 24]]], decks: ['forestduel', 'fire', 'water', 'mira2'] },
  late: { lv: 42, teams: [[['infernox', 43], ['stormhawk', 41], ['lotusprite', 41], ['craggon', 42]], [['tidedrake', 43], ['voltragon', 41], ['nightpard', 41], ['magmaros', 42]], [['forestar', 43], ['seraphin', 41], ['wavelord', 41], ['gnawlord', 42]]], decks: ['dark', 'mira3', 'champion', 'zero'] },
};

function run(mk, n) {
  let w = [0, 0, 0], turns = 0;
  for (let g = 0; g < n; g++) {
    const bt = mk(g);
    X.AI.autoPlay(bt);
    const r = bt.s.result;
    if (!r) { w[2]++; continue; }
    w[r.winner == null ? 2 : r.winner]++;
    turns += bt.s.turn;
  }
  return `${(100 * w[0] / n).toFixed(0).padStart(3)}% : ${(100 * w[1] / n).toFixed(0).padStart(3)}%  (무승부/미결 ${w[2]}, 평균 ${(turns / n).toFixed(1)}턴)`;
}

// 데이터 검증
for (const [k, d] of Object.entries(X.DECKS)) {
  if (d.length < X.DECK_MIN || d.length > X.DECK_MAX) console.log('덱 장수 오류', k, d.length);
  for (const id of d) if (!X.CARDS[id]) console.log('없는 카드', k, id);
}
for (const b of Object.values(X.BEASTS)) { for (const [, m] of b.learn) if (!X.MOVES[m]) console.log('없는 기술', b.id, m); if (b.evo && !X.BEASTS[b.evo[1]]) console.log('없는 진화', b.id); }

for (const [name, T] of Object.entries(TIERS)) {
  const lp = X.lpForLevel(T.lv);
  console.log(`\n=== ${name} (Lv${T.lv}, LP ${lp}) ===`);
  const pick = (arr, g, k) => arr[(g * 7 + k * 3) % arr.length];
  console.log(' 비스트전  A:B   ', run((g) => { const h = { seed: g + 1 }; return new X.Battle({ seed: g + 11, sides: [X.Battle.tamer('A', team(pick(T.teams, g, 0), h)), X.Battle.tamer('B', team(pick(T.teams, g, 1), h))] }); }, N));
  console.log(' 듀얼      A:B   ', run((g) => new X.Battle({ seed: g + 11, sides: [X.Battle.duelist('A', X.DECKS[pick(T.decks, g, 0)], lp), X.Battle.duelist('B', X.DECKS[pick(T.decks, g, 1)], lp)] }), N));
  console.log(' 크로스 테이머:듀얼', run((g) => { const h = { seed: g + 1 }; return new X.Battle({ seed: g + 11, link: T.lv, sides: [X.Battle.tamer('T', team(pick(T.teams, g, 0), h)), X.Battle.duelist('D', X.DECKS[pick(T.decks, Math.floor(g / T.teams.length), 1)], lp)] }); }, N));
  for (const dk of T.decks) console.log(`   vs 덱 ${dk.padEnd(10)}`, run((g) => { const h = { seed: g + 1 }; return new X.Battle({ seed: g + 11, link: T.lv, sides: [X.Battle.tamer('T', team(pick(T.teams, g, 0), h)), X.Battle.duelist('D', X.DECKS[dk], lp)] }); }, N));
}

// 퍼징: 무작위 합법 행동으로 예외/교착이 없는지 확인
function fuzz(n) {
  const h = { seed: 99 };
  const R = () => X.rngNext(h);
  const rint = (k) => Math.floor(R() * k);
  let done = 0;
  for (let g = 0; g < n; g++) {
    const T = Object.values(TIERS)[g % 3], lp = X.lpForLevel(T.lv), kind = g % 4;
    const mkT = (nm) => X.Battle.tamer(nm, team(T.teams[rint(T.teams.length)], h), { bag: { potion: 2, cure: 1, revive: 1, capsule: 3 } });
    const mkD = (nm) => X.Battle.duelist(nm, X.DECKS[T.decks[rint(T.decks.length)]], lp);
    const sides = kind === 0 ? [mkT('A'), mkT('B')] : kind === 1 ? [mkD('A'), mkD('B')] : kind === 2 ? [mkT('A'), mkD('B')] : [mkD('A'), mkT('B')];
    const bt = new X.Battle({ seed: g + 5, sides, expSide: 0, link: T.lv });
    let steps = 0;
    while (!bt.over && steps++ < 3000) {
      for (const i of [0, 1]) {
        const req = bt.request(i);
        if (!req) continue;
        let a = null;
        if (R() < 0.55) a = X.AI.decide(bt, i);
        else if (req.kind === 'switch') a = { type: 'switch', to: rint(4) };
        else if (req.kind === 'trap') a = { type: 'trap', idx: R() < 0.5 ? null : req.options[0] };
        else if (req.kind === 'tamer') a = [{ type: 'move', move: rint(4), target: rint(3) }, { type: 'switch', to: rint(4) }, { type: 'item', item: ['potion', 'cure', 'revive'][rint(3)], target: rint(4) }, { type: 'move', move: rint(4), target: 'direct' }][rint(4)];
        else a = [{ type: 'summon', hand: rint(6), pos: R() < 0.5 ? 'atk' : 'set', tributes: [[], [rint(3)], [0, 1], [1, 2]][rint(4)] }, { type: 'spell', hand: rint(6), target: rint(3) }, { type: 'setST', hand: rint(6) }, { type: 'pos', zone: rint(3) }, { type: 'attack', zone: rint(3), target: rint(3) }, { type: 'end' }][rint(6)];
        if (bt.submit(i, a) === false && R() < 0.3) { const f = X.AI.decide(bt, i); if (bt.submit(i, f) === false) throw new Error('AI fallback illegal ' + JSON.stringify(f)); }
        JSON.stringify(X.Battle.viewFor(bt.s, i));
        bt.events.length = 0;
      }
    }
    if (bt.over) done++;
    for (const sd of bt.s.sides) {
      if (sd.kind === 'tamer') for (const b of sd.team) if (!(b.hp >= 0 && b.hp <= b.maxhp)) throw new Error('hp 범위 오류');
      if (sd.kind === 'duelist' && sd.lp < 0) throw new Error('lp 음수');
    }
  }
  return done;
}
// 결정론 검증: (초기 조건 + 행동 기록) 재생 결과가 원본과 완전히 같은지 — 네트워크 대전의 전제 조건
function determinism(n) {
  for (let g = 0; g < n; g++) {
    const T = Object.values(TIERS)[g % 3], h = { seed: g + 1 }, lp = X.lpForLevel(T.lv);
    const mkT = (nm, k) => X.Battle.tamer(nm, team(T.teams[(g + k) % T.teams.length], h));
    const mkD = (nm, k) => X.Battle.duelist(nm, X.DECKS[T.decks[(g + k) % T.decks.length]], lp);
    const sides = [[mkT('A', 0), mkT('B', 1)], [mkD('A', 0), mkD('B', 1)], [mkT('A', 0), mkD('B', 1)], [mkD('A', 0), mkT('B', 1)]][g % 4];
    const bt = new X.Battle({ seed: g + 31, sides, link: T.lv, expSide: 0 });
    X.AI.autoPlay(bt);
    const re = X.Battle.replay(bt.init, bt.log);
    if (JSON.stringify(re.s) !== JSON.stringify(bt.s)) throw new Error('리플레이 불일치 (판 ' + g + ')');
  }
  return n;
}
console.log(`\n결정론 검증 ${determinism(120)}판: 행동 기록 재생 결과가 원본과 일치`);
const F = 600;
console.log(`\n퍼징 ${F}판: ${fuzz(F)}판 종료, 예외 없음`);
