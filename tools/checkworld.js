// 월드 데이터 검증: 행 길이, NPC/워프 좌표, 맵 간 도달 가능성
const path = require('path');
for (const f of ['core', 'data/beasts', 'data/cards', 'engine/beast', 'engine/battle', 'engine/ai', 'data/world']) require(path.join('..', 'js', f + '.js'));
const X = globalThis.XG, M = X.WORLD.maps;
let bad = 0;
const err = (...a) => { bad++; console.log('오류:', ...a); };
const walk = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && !X.BLOCK.includes(m.tiles[y][x]);
const G = { p: { team: [1], defeated: new Proxy({}, { get: () => true }), emblems: [1, 2, 3, 4], starter: 'leafy' }, flag: () => true };
for (const m of Object.values(M)) {
  for (const n of m.npcs) {
    if (!walk(m, n.x, n.y)) err(m.id, 'NPC가 막힌 타일 위', n.id, n.x, n.y, m.tiles[n.y][n.x]);
    if (n.battle) { const b = n.battle; if (b.deck && !X.DECKS[b.deck]) err('없는 덱', n.id); if (b.team) for (const [sp] of (typeof b.team === 'function' ? b.team(G) : b.team)) if (!X.BEASTS[sp]) err('없는 비스트', n.id, sp); }
  }
  for (const w of m.warps) {
    if (!walk(m, w.x, w.y)) err(m.id, '워프가 막힌 타일', w.x, w.y);
    const t = M[w.to];
    if (!t) { err(m.id, '없는 맵', w.to); continue; }
    if (!walk(t, w.tx, w.ty)) err(m.id, '->', w.to, '도착 타일이 막힘', w.tx, w.ty, t.tiles[w.ty] && t.tiles[w.ty][w.tx]);
    if (t.warps.some((v) => v.x === w.tx && v.y === w.ty)) err(m.id, '->', w.to, '도착 타일이 또 워프', w.tx, w.ty);
  }
  if (m.enc) for (const [sp] of m.enc.list) if (!X.BEASTS[sp]) err('없는 야생', sp);
}
// 시작점에서 걸어서(워프 포함) 닿는 타일 집합
const seen = new Set(), q = [[X.WORLD.start.map, X.WORLD.start.x, X.WORLD.start.y]];
while (q.length) {
  const [id, x, y] = q.pop(), k = id + ',' + x + ',' + y;
  if (seen.has(k)) continue; seen.add(k);
  const m = M[id], w = m.warps.find((v) => v.x === x && v.y === y);
  if (w) { q.push([w.to, w.tx, w.ty]); continue; }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walk(m, x + dx, y + dy) && !m.npcs.some((n) => n.x === x + dx && n.y === y + dy && !n.show)) q.push([id, x + dx, y + dy]);
}
for (const m of Object.values(M)) {
  if (![...seen].some((k) => k.startsWith(m.id + ','))) err('도달 불가 맵', m.id);
  for (const n of m.npcs) if (![[1, 0], [-1, 0], [0, 1], [0, -1], [0, 2], [0, -2]].some(([dx, dy]) => seen.has(m.id + ',' + (n.x + dx) + ',' + (n.y + dy)))) err('말 걸 수 없는 NPC', m.id, n.id);
}
console.log(bad ? `문제 ${bad}건` : `월드 검증 통과: 맵 ${Object.keys(M).length}개, NPC ${Object.values(M).reduce((a, m) => a + m.npcs.length, 0)}명`);
process.exit(bad ? 1 : 0);
