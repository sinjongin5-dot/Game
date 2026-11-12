// 크로스링크 멀티 서버 — 이 컴퓨터 하나가 게임을 배포하고 모든 플레이어를 연결한다.
// 실행: node server.js   (설치할 패키지 없음, Node.js 18 이상)
// 접속: 같은 와이파이/공유기의 다른 기기에서 http://<이 컴퓨터 IP>:3000
// 포트 변경: PORT=8080 node server.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm'), os = require('os');

const PORT = +process.env.PORT || 3000;
const HTML_PATH = path.join(__dirname, 'public', 'index.html');

// ── 게임 엔진 로드: index.html 안의 엔진 부분(core ~ ai)을 그대로 실행해 서버 판정에 쓴다 ──
let HTML = fs.existsSync(HTML_PATH) ? fs.readFileSync(HTML_PATH, 'utf8') : require('zlib').gunzipSync(fs.readFileSync(HTML_PATH + '.gz')).toString('utf8');
const a = HTML.indexOf('// ── js/core.js ──'), b = HTML.indexOf('// ── js/data/world.js ──');
if (a < 0 || b < 0) throw new Error('index.html에서 엔진 코드를 찾지 못했습니다.');
const ctx = { console, Math, JSON, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(HTML.slice(a, b), ctx, { filename: 'engine.js' });
const X = ctx.XG, B = X.Battle;
// 브라우저에 서버 모드임을 알린다
const PAGE = HTML.replace('<head>', '<head><script>window.CL_SERVER=1</script>');

// ── HTTP ──
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(PAGE); }
  if (u === '/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ players: [...clients.values()].filter((c) => c.name).map((c) => ({ id: c.id, name: c.name, map: c.map, busy: !!c.battle })), battles: battles.size })); }
  if (u === '/admin' && req.method === 'POST') return handleRemoteAdmin(req, res);
  if (u === '/admin') { res.writeHead(405, { 'Allow': 'POST' }); return res.end('POST required'); }
  res.writeHead(404); res.end('not found');
});

// ── 최소 WebSocket 구현 (RFC 6455, 텍스트 프레임) ──
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
server.on('upgrade', (req, sock) => {
  if (req.url.split('?')[0] !== '/ws' || !req.headers['sec-websocket-key']) return sock.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = newClient(sock);
  let buf = Buffer.alloc(0), frag = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return sock.destroy();
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      const data = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) data[i] ^= buf[mOff + (i & 3)];
      buf = buf.subarray(off + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { sendFrame(sock, data, 0x0a); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0) {
        frag.push(data);
        if (fin) { const txt = Buffer.concat(frag).toString('utf8'); frag = []; let m; try { m = JSON.parse(txt); } catch (e) { continue; } try { onMessage(c, m); } catch (e) { console.error('메시지 처리 오류', e); } }
      }
    }
  });
  const bye = () => dropClient(c);
  sock.on('close', bye); sock.on('error', bye);
});
function sendFrame(sock, data, op = 0x01) {
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
  if (!sock.destroyed) sock.write(Buffer.concat([head, data]));
}

// ── 플레이어 ──
const LOOKS = ['tamer_m', 'tamer_f', 'duelist_m', 'duelist_f', 'leon', 'mira', 'gaon', 'sera', 'noah', 'aria', 'mujin', 'kid'];
const clients = new Map();
let nextId = 1, nextBid = 1;
function newClient(sock) { const id = nextId++; const c = { id, sock, name: null, originalName: null, look: LOOKS[(id - 1) % LOOKS.length], map: null, x: 0, y: 0, dir: 'down', battle: null, offers: new Map() }; clients.set(id, c); return c; }
const send = (c, m) => c && sendFrame(c.sock, Buffer.from(JSON.stringify(m)));
const pub = (c) => ({ id: c.id, name: c.name, look: c.look, map: c.map, x: c.x, y: c.y, dir: c.dir, busy: !!c.battle });
const all = (m, except) => { for (const c of clients.values()) if (c.name && c !== except) send(c, m); };
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function dropClient(c) {
  if (!clients.has(c.id)) return;
  clients.delete(c.id);
  if (c.battle) endBattle(c.battle, 1 - c.battle.p.indexOf(c), 'disconnect');
  for (const [from, o] of c.offers) { clearTimeout(o.timer); send(clients.get(from), { t: 'reply', ok: false, reason: 'gone' }); }
  for (const o of clients.values()) if (o.offers.has(c.id)) { clearTimeout(o.offers.get(c.id).timer); o.offers.delete(c.id); }
  if (c.name) { all({ t: 'leave', id: c.id }); log(`${c.name} 퇴장 (접속 ${online()}명)`); }
}
const online = () => [...clients.values()].filter((c) => c.name).length;
const log = (t) => console.log(new Date().toLocaleTimeString('ko-KR'), t);

// ── 대전 ──
const battles = new Map();
function buildSide(c, s) {
  if (!s || typeof s !== 'object') return null;
  if (s.kind === 'tamer') {
    if (!Array.isArray(s.team) || !s.team.length || s.team.length > 6) return null;
    const team = s.team.filter((b) => b && X.BEASTS[b.sp]).slice(0, 6).map((b) => { const nb = X.clone(b); nb.lv = X.clamp(nb.lv | 0, 1, 100); return nb; });
    if (!team.length || !team.some((b) => b.hp > 0)) return null;
    return { side: B.tamer(c.name, team), lv: Math.max(...team.map((t) => t.lv)) };
  }
  if (s.kind === 'duelist') {
    if (!Array.isArray(s.deck) || s.deck.length < X.DECK_MIN || s.deck.length > X.DECK_MAX || !s.deck.every((id) => X.CARDS[id])) return null;
    return { side: s.deck, deck: true };
  }
  return null;
}
function startBattle(ca, sa, cb, sb) {
  const A = buildSide(ca, sa), Bs = buildSide(cb, sb);
  if (!A || !Bs) { send(ca, { t: 'reply', ok: false, reason: 'invalid' }); send(cb, { t: 'reply', ok: false, reason: 'invalid' }); return; }
  // 링크 레벨: 테이머 쪽 최고 레벨 기준 (듀얼끼리는 20). 듀얼리스트 LP도 여기서 정해진다.
  const lvs = [A, Bs].filter((s) => !s.deck).map((s) => s.lv);
  const link = lvs.length ? Math.max(5, Math.max(...lvs)) : 20, lp = X.lpForLevel(link);
  const mk = (c, s) => (s.deck ? B.duelist(c.name, s.side, lp) : s.side);
  const init = { seed: (Math.random() * 2 ** 31) | 0 || 7, sides: [mk(ca, A), mk(cb, Bs)], link };
  const bt = new B(X.clone(init));
  const label = bt.mode === 'tt' ? '비스트 배틀' : bt.mode === 'dd' ? '듀얼' : '크로스 배틀';
  const bid = nextBid++, bo = { bid, bt, p: [ca, cb], left: [false, false] };
  battles.set(bid, bo);
  ca.battle = cb.battle = bo;
  [ca, cb].forEach((c, i) => { send(c, { t: 'b:start', bid, me: i, init, label, foe: { name: bo.p[1 - i].name, look: bo.p[1 - i].look } }); all({ t: 'state', id: c.id, busy: true }); });
  log(`대전 시작 #${bid}: ${ca.name} vs ${cb.name} (${label}, 링크 Lv.${link})`);
}
function endBattle(bo, winner, reason) {
  if (!battles.has(bo.bid)) return;
  battles.delete(bo.bid);
  for (const c of bo.p) {
    if (c.battle === bo) c.battle = null;
    if (clients.has(c.id)) { if (reason) send(c, { t: 'b:end', winner, reason }); all({ t: 'state', id: c.id, busy: false }); }
  }
  const r = bo.bt.s.result;
  log(`대전 종료 #${bo.bid}: ${reason || (r && r.winner != null ? bo.p[r.winner].name + ' 승리' : '종료')}`);
}

function onMessage(c, m) {
  switch (m.t) {
    case 'hello': {
      const first = !c.name;
      c.name = clean(m.name, 8) || '플레이어' + c.id;
      if (!c.originalName) c.originalName = c.name;
      Object.assign(c, { map: clean(m.map, 30), x: m.x | 0, y: m.y | 0, dir: clean(m.dir, 5) || 'down' });
      if (first) { send(c, { t: 'welcome', id: c.id, players: [...clients.values()].filter((o) => o.name).map(pub) }); all({ t: 'join', p: pub(c) }, c); log(`${c.name} 접속 (접속 ${online()}명)`); }
      else all({ t: 'join', p: pub(c) }, c);
      break;
    }
    case 'pos':
      if (!c.name) return;
      Object.assign(c, { map: clean(m.map, 30), x: m.x | 0, y: m.y | 0, dir: clean(m.dir, 5) || 'down' });
      all({ t: 'pos', id: c.id, map: c.map, x: c.x, y: c.y, dir: c.dir }, c);
      break;
    case 'chat': { const t = clean(m.text, 80); if (c.name && t) { all({ t: 'chat', id: c.id, name: c.name, text: t }); log(`[채팅] ${c.name}: ${t}`); } break; }
    case 'challenge': {
      const o = clients.get(m.to);
      if (!o || !o.name) return send(c, { t: 'reply', ok: false, reason: 'gone' });
      if (o.battle || c.battle || o.offers.size) return send(c, { t: 'reply', ok: false, reason: 'busy' });
      const timer = setTimeout(() => { if (o.offers.get(c.id)) { o.offers.delete(c.id); send(c, { t: 'reply', ok: false, reason: 'timeout' }); } }, 25000);
      o.offers.set(c.id, { side: m.side, timer });
      send(o, { t: 'challenge', from: c.id, name: c.name, mode: m.mode === 'deck' ? 'deck' : 'beast' });
      break;
    }
    case 'accept': case 'decline': {
      const off = c.offers.get(m.from), from = clients.get(m.from);
      if (!off) return send(c, { t: 'reply', ok: false, reason: 'timeout' });
      clearTimeout(off.timer); c.offers.delete(m.from);
      if (!from) return send(c, { t: 'reply', ok: false, reason: 'gone' });
      if (m.t === 'decline') return send(from, { t: 'reply', ok: false, reason: m.reason === 'busy' ? 'busy' : 'declined' });
      if (from.battle || c.battle) { send(from, { t: 'reply', ok: false, reason: 'busy' }); return send(c, { t: 'reply', ok: false, reason: 'busy' }); }
      startBattle(from, off.side, c, m.side);
      break;
    }
    case 'b:act': {
      const bo = c.battle; if (!bo || bo.bid !== m.bid) return;
      const i = bo.p.indexOf(c);
      let ok = false;
      try { ok = bo.bt.submit(i, m.a) !== false; } catch (e) { ok = false; }
      if (!ok) return send(c, { t: 'b:reject' });
      bo.bt.events.length = 0;
      for (const p of bo.p) send(p, { t: 'b:act', i, a: m.a });
      if (bo.bt.over) endBattle(bo, bo.bt.s.result.winner, null);
      break;
    }
    case 'b:forfeit': { const bo = c.battle; if (bo && bo.bid === m.bid) endBattle(bo, 1 - bo.p.indexOf(c), 'forfeit'); break; }
    case 'b:leave': break;
  }
}

// ── 로컬 관리자 콘솔: 서버를 실행한 CMD 창에서만 입력 가능 ──
function adminHelp() {
  console.log(`\n[크로스링크 관리자 명령어]\n  players                         접속자 목록\n  rename <ID> <이름>              플레이어 이름 변경 (최대 8자)\n  resetname <ID>                  원래 이름으로 복구\n  prank <ID> <메시지>             해당 플레이어 화면에 장난 알림 표시\n  announce <메시지>               전체 공지\n  help                            도움말\n`);
}
function runAdminCommand(line) {
  const [cmd, ...rest] = String(line || '').trim().split(/\s+/);
  if (!cmd) return { ok: false, message: '명령어를 입력하세요.' };
  const argText = rest.join(' ');
  if (cmd === 'help') return { ok: true, message: 'players | rename <ID> <이름> | resetname <ID> | prank <ID> <메시지> | announce <메시지>' };
  if (cmd === 'players') {
    const list = [...clients.values()].filter(c => c.name).map(c => ({ id: c.id, name: c.name, map: c.map || '-', busy: !!c.battle }));
    return { ok: true, message: `접속자 ${list.length}명`, players: list };
  }
  if (cmd === 'announce') {
    if (!argText) return { ok: false, message: '사용법: announce <메시지>' };
    const message = clean(argText, 100);
    for (const c of clients.values()) if (c.name) send(c, { t: 'notice', text: '[관리자 공지] ' + message });
    log('[관리자] 전체 공지: ' + message);
    return { ok: true, message: '전체 공지를 전송했습니다.' };
  }
  const id = Number(rest[0]);
  const target = clients.get(id);
  if (!Number.isInteger(id) || !target || !target.name) return { ok: false, message: '접속자 ID를 찾을 수 없습니다. players를 확인하세요.' };
  if (cmd === 'rename') {
    const name = clean(rest.slice(1).join(' '), 8);
    if (!name) return { ok: false, message: '사용법: rename <ID> <이름>' };
    const old = target.name; target.name = name;
    all({ t: 'admin:rename', id: target.id, name: target.name });
    log(`[관리자] ${old}의 이름을 ${name}(으)로 변경`);
    return { ok: true, message: `${old} → ${name}` };
  }
  if (cmd === 'resetname') {
    const old = target.name; target.name = target.originalName || ('플레이어' + target.id);
    all({ t: 'admin:rename', id: target.id, name: target.name });
    log(`[관리자] ${old}의 이름을 원래대로 복구: ${target.name}`);
    return { ok: true, message: `${old} → ${target.name}` };
  }
  if (cmd === 'prank') {
    const message = clean(rest.slice(1).join(' '), 100);
    if (!message) return { ok: false, message: '사용법: prank <ID> <메시지>' };
    send(target, { t: 'notice', text: '🎭 ' + message });
    return { ok: true, message: `${target.name}에게 장난 알림을 보냈습니다.` };
  }
  return { ok: false, message: '알 수 없는 명령어입니다. help를 입력하세요.' };
}
function adminInput(line) {
  const result = runAdminCommand(line);
  if (result.players) {
    console.log(`\n${result.message}`);
    for (const p of result.players) console.log(`  ID ${p.id} | ${p.name} | 맵: ${p.map} | ${p.busy ? '대전 중' : '대기'}`);
  } else console.log(result.message);
}
function handleRemoteAdmin(req, res) {
  const configured = process.env.ADMIN_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(configured), b = Buffer.from(supplied);
  if (!configured || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, message: '관리자 인증에 실패했습니다. ADMIN_TOKEN을 확인하세요.' }));
  }
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, message: '잘못된 JSON입니다.' })); }
    const result = runAdminCommand(payload.command);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result));
  });
}
if (process.stdin.isTTY) {
  console.log('관리자 콘솔 준비 완료. help를 입력하세요.');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => chunk.split(/\r?\n/).forEach(adminInput));
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  console.log('\n  ★ 크로스링크 멀티 서버가 켜졌습니다');
  console.log(`  이 컴퓨터:      http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  다른 기기에서:  http://${ip}:${PORT}`);
  console.log('  (같은 와이파이/공유기에 연결된 기기에서 위 주소를 브라우저로 여세요. 종료: Ctrl+C)\n');
});
