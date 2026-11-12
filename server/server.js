// 크로스링크 멀티플레이 서버 — 의존성 없는 Node 서버.
//   node server/server.js [포트=8080]
// 서버 컴퓨터 한 대에서 실행하면, 같은 네트워크의 다른 기기는 브라우저로 http://<서버 IP>:<포트> 에 접속한다.
//
// 하는 일
//   1) 게임 파일 제공 (정적 파일)
//   2) 월드: 접속자의 위치를 서로에게 중계 (같은 맵의 다른 플레이어가 걸어 다니는 것이 보인다), 채팅, 대전 신청/수락
//   3) 대전: 전투 엔진(js/engine)을 서버에서 돌리는 서버 권위 방식.
//      클라이언트는 행동만 보내고, 서버는 상대의 패·덱·뒷면 카드를 가린 상태와 이벤트를 돌려준다.
// 통신: 서버→클라이언트는 SSE(/mp/events), 클라이언트→서버는 POST(/mp/send).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
for (const f of ['core', 'data/beasts', 'data/cards', 'engine/beast', 'engine/battle', 'engine/ai']) require(path.join(ROOT, 'js', f + '.js'));
const X = globalThis.XG, B = X.Battle, J = X.josa;
const PORT = +process.argv[2] || +process.env.PORT || 8080;
const PVP_LV = 50; // 대전 규칙: 비스트는 모두 Lv.50으로 맞춘다

const clients = new Map(); // id -> { id, name, res, room, load, label, pending }
const rooms = new Set();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const send = (c, msg) => { if (c && c.res) c.res.write(`data: ${JSON.stringify(msg)}\n\n`); };
const all = (msg) => { for (const c of clients.values()) send(c, msg); };
const roster = () => all({ t: 'players', list: [...clients.values()].map((c) => ({ id: c.pub, name: c.name, busy: !!c.room, map: c.map, x: c.x, y: c.y, dir: c.dir })) });
const sys = (text) => all({ t: 'chat', sys: true, text, ts: Date.now() });
const byPub = (pub) => [...clients.values()].find((c) => c.pub === pub);

// ── 편성 검증: 클라이언트가 보낸 팀/덱은 믿지 않고 서버에서 다시 만든다 ──
const RENTAL_TEAM = [['infernox', 'charm'], ['tidedrake', 'leftovers'], ['forestar', null], ['voltragon', 'orb'], ['glaciem', 'sash'], ['seraphin', null]];
function makeLoad(raw) {
  const h = { seed: crypto.randomBytes(4).readInt32LE(0) };
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'rteam') return { kind: 'tamer', label: '대여 비스트 팀', team: RENTAL_TEAM.map(([sp, it]) => { const b = X.makeBeast(sp, PVP_LV, h); b.item = it; return b; }) };
  if (raw.kind === 'rdeck') return { kind: 'duelist', label: '대여 덱', deck: X.DECKS.champion.slice() };
  if (raw.kind === 'team' && Array.isArray(raw.team)) {
    const team = [];
    for (const r of raw.team.slice(0, 6)) {
      if (!r || !X.BEASTS[r.sp]) continue;
      const b = X.makeBeast(r.sp, PVP_LV, h);
      if (Array.isArray(r.iv) && r.iv.length === 4) b.iv = r.iv.map((v) => Math.max(0, Math.min(15, v | 0)));
      const mv = (Array.isArray(r.moves) ? r.moves : []).map((m) => m && m.id).filter((id) => X.MOVES[id]);
      if (mv.length) b.moves = [...new Set(mv)].slice(0, 4).map((id) => ({ id, pp: X.MOVES[id].pp }));
      b.item = X.ITEMS[r.item] && X.ITEMS[r.item].hold ? r.item : null;
      b.name = clean(r.name, 8) || X.BEASTS[r.sp].name;
      X.calcStats(b); b.hp = b.maxhp;
      team.push(b);
    }
    return team.length ? { kind: 'tamer', label: `비스트 ${team.length}마리`, team } : null;
  }
  if (raw.kind === 'deck' && Array.isArray(raw.deck)) {
    const cnt = {}, deck = [];
    for (const id of raw.deck.slice(0, X.DECK_MAX)) { const c = X.CARDS[id]; if (!c || c.tier === 9) continue; cnt[id] = (cnt[id] || 0) + 1; if (cnt[id] <= X.COPY_MAX) deck.push(id); }
    return deck.length >= X.DECK_MIN ? { kind: 'duelist', label: `덱 ${deck.length}장`, deck } : null;
  }
  return null;
}

// ── 대전 방 ──
// 각 플레이어에게는 "자신이 0번 진영"인 것처럼 뒤집은 상태를 보낸다. 클라이언트 UI는 진영 번호를 신경 쓰지 않아도 된다.
function flip(v, i) {
  v.seed = 0; // 난수 상태는 내보내지 않는다
  v.choices = v.choices.map((c, k) => (k === i ? c : c ? { hidden: true } : null));
  if (i === 0) return v;
  v.sides.reverse(); v.choices.reverse(); v.cur = 1 - v.cur;
  if (v.wait) { if (v.wait.sides) v.wait.sides = v.wait.sides.map((x) => 1 - x); if (v.wait.side != null) v.wait.side = 1 - v.wait.side; if (v.wait.ctx) v.wait.ctx.side = 1 - v.wait.ctx.side; }
  if (v.result && v.result.winner != null) v.result.winner = 1 - v.result.winner;
  return v;
}
const flipFx = (fx, i) => (fx && i === 1 && fx.side != null ? Object.assign({}, fx, { side: 1 - fx.side }) : fx);
function pushBatch(room) {
  const evs = room.bt.events.splice(0);
  room.players.forEach((c, i) => send(c, { t: 'batch', events: evs.map((e) => ({ text: e.text, fx: flipFx(e.fx, i), s: flip(B.viewFor(e.s, i), i) })), state: flip(room.bt.view(i), i) }));
}
function startRoom(a, b) {
  const lp = X.lpForLevel(PVP_LV);
  const side = (c) => (c.load.kind === 'tamer' ? B.tamer(c.name, X.clone(c.load.team)) : B.duelist(c.name, c.load.deck, lp));
  const bt = new B({ seed: crypto.randomBytes(4).readInt32LE(0), link: PVP_LV, sides: [side(a), side(b)] });
  const room = { bt, players: [a, b] };
  rooms.add(room); a.room = b.room = room; a.pending = b.pending = null;
  const evs = bt.events.splice(0);
  room.players.forEach((c, i) => { const o = room.players[1 - i]; send(c, { t: 'start', opp: o.name, oppKind: o.load.kind, events: evs.map((e) => ({ text: e.text, fx: flipFx(e.fx, i), s: flip(B.viewFor(e.s, i), i) })), state: flip(bt.view(i), i) }); });
  sys(`⚔ ${a.name} vs ${b.name} — 대전 시작!`);
  roster();
}
function endRoom(room, text) {
  if (!rooms.has(room)) return;
  rooms.delete(room);
  for (const c of room.players) c.room = null;
  if (text) sys(text);
  roster();
}
function act(c, a) {
  const room = c.room;
  if (!room) return;
  const i = room.players.indexOf(c), bt = room.bt;
  if (a && a.type === 'forfeit') { bt.finish(1 - i, 'forfeit', `${J(c.name, '이/가')} 항복했다!`); }
  else if (!a || typeof a !== 'object' || a.type === 'item' || a.type === 'capture' || a.type === 'run' || bt.submit(i, a) === false) return send(c, { t: 'reject' });
  pushBatch(room);
  if (bt.over) { const r = bt.s.result, w = r.winner == null ? null : room.players[r.winner]; endRoom(room, w ? `🏆 ${J(w.name, '이/가')} ${room.players[1 - r.winner].name}에게 승리!` : '대전이 무승부로 끝났다.'); }
}

// ── 메시지 처리 ──
function handle(c, m) {
  switch (m.t) {
    case 'chat': { const text = clean(m.text, 200); if (text) all({ t: 'chat', from: c.name, me: c.pub, text, ts: Date.now() }); break; }
    case 'name': { const n = clean(m.name, 10); if (n && n !== c.name) { sys(`${c.name} → ${n} (이름 변경)`); c.name = n; roster(); } break; }
    case 'pos': {
      // 위치 중계: 맵 이름과 타일 좌표만 받는다
      c.map = clean(m.map, 24); c.x = m.x | 0; c.y = m.y | 0; c.dir = ['up', 'down', 'left', 'right'].includes(m.dir) ? m.dir : 'down';
      for (const o of clients.values()) if (o !== c) send(o, { t: 'pos', id: c.pub, name: c.name, map: c.map, x: c.x, y: c.y, dir: c.dir, busy: !!c.room });
      break;
    }
    case 'challenge': {
      const o = byPub(m.to);
      if (!o || o === c || c.room || o.room) return send(c, { t: 'info', text: '지금은 신청할 수 없는 상대다.' });
      c.load = makeLoad(m.load);
      if (!c.load) return send(c, { t: 'info', text: '대전에 쓸 수 있는 팀이나 덱이 없다. (덱은 20장 이상)' });
      c.label = c.load.label; c.pending = o.id;
      send(o, { t: 'challenge', from: c.pub, name: c.name, label: c.label });
      send(c, { t: 'info', text: `${o.name}에게 대전을 신청했다. 응답을 기다리는 중…` });
      break;
    }
    case 'answer': {
      const o = byPub(m.from);
      if (!o || o.pending !== c.id) return;
      o.pending = null;
      if (!m.ok) return send(o, { t: 'info', text: `${J(c.name, '이/가')} 대전을 거절했다.` });
      c.load = makeLoad(m.load);
      if (c.room || o.room || !c.load || !o.load) { send(o, { t: 'info', text: '대전을 시작할 수 없었다.' }); return send(c, { t: 'info', text: '대전을 시작할 수 없다. (팀이나 20장 이상의 덱이 필요)' }); }
      startRoom(o, c);
      break;
    }
    case 'act': act(c, m.a); break;
  }
}

// ── HTTP ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/mp/ping') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, players: clients.size, lv: PVP_LV })); }
  if (url.pathname === '/mp/events') {
    if (clients.size >= 64) { res.writeHead(503); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = { id: crypto.randomBytes(12).toString('hex'), pub: crypto.randomBytes(4).toString('hex'), name: clean(url.searchParams.get('name'), 10) || '손님', res, room: null, load: null, label: null, pending: null, map: null, x: 0, y: 0, dir: 'down' };
    clients.set(c.id, c);
    send(c, { t: 'hello', id: c.id, pub: c.pub, name: c.name, lv: PVP_LV });
    sys(`${J(c.name, '이/가')} 접속했다.`); roster();
    req.on('close', () => {
      clients.delete(c.id); c.res = null;
      if (c.room) { const room = c.room, i = room.players.indexOf(c); room.bt.finish(1 - i, 'forfeit', `${c.name}의 접속이 끊어졌다!`); pushBatch(room); endRoom(room, `${c.name}의 접속이 끊겨 ${room.players[1 - i].name}의 승리.`); }
      sys(`${J(c.name, '이/가')} 나갔다.`); roster();
    });
    return;
  }
  if (url.pathname === '/mp/send' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 200000) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(); }
      const c = clients.get(m && m.id);
      if (!c) { res.writeHead(403); return res.end(); }
      try { handle(c, m); } catch (e) { console.error('handle error', e); }
      res.writeHead(204); res.end();
    });
    return;
  }
  // 정적 파일
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p) p = 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || /(^|[/\\])(\.git|server|node_modules)([/\\]|$)/.test(p)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
setInterval(() => { for (const c of clients.values()) if (c.res) c.res.write(': ping\n\n'); }, 20000);
server.listen(PORT, () => {
  console.log(`크로스링크 서버 실행 중 (포트 ${PORT})`);
  console.log(`  이 컴퓨터:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  다른 기기:  http://${n.address}:${PORT}`);
});
