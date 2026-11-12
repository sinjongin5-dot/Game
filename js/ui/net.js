// 온라인 플레이 (클라이언트): 서버에서 게임을 열면 자동으로 접속한다.
//   - 같은 맵의 다른 플레이어가 실시간으로 걸어 다니는 모습을 그린다
//   - 채팅 (T 키 또는 채팅 버튼). 같은 맵이면 머리 위 말풍선으로도 뜬다
//   - 다른 플레이어에게 말을 걸거나 접속자 목록에서 대전 신청 → 서버가 계산하는 네트워크 대전
// 파일을 직접 열었거나 서버가 없으면 조용히 싱글 플레이로 동작한다.
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, el = X.el;
  const $ = (s) => document.querySelector(s);
  const LOOKS = ['tamer_m', 'tamer_f', 'duelist_m', 'duelist_f', 'kid', 'leon', 'mira', 'fisher', 'gaon', 'sera'];
  const lookOf = (pub) => LOOKS[parseInt(pub.slice(0, 4), 16) % LOOKS.length];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const Net = (X.Net = {
    on: false, id: null, pub: null, others: {}, log: [], sess: null, unread: 0,

    // 서버가 있는지 확인하고 접속
    async start() {
      if (this.es || !/^https?:$/.test(location.protocol)) return;
      try { const r = await fetch('/mp/ping', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); if (!j.ok) return; this.lv = j.lv; } catch (e) { return; }
      this.es = new EventSource('/mp/events?name=' + encodeURIComponent(G.p.name));
      this.es.onmessage = (e) => { try { this.msg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
      this.es.onerror = () => { this.on = false; this.paintHud(); };
      this.buildUi();
    },
    send(m) { if (!this.id) return; m.id = this.id; fetch('/mp/send', { method: 'POST', body: JSON.stringify(m) }).catch(() => {}); },
    pos(x, y, dir) { if (this.on && G.p) this.send({ t: 'pos', map: G.p.map, x, y, dir }); },

    msg(m) {
      switch (m.t) {
        case 'hello': this.id = m.id; this.pub = m.pub; this.on = true; this.lv = m.lv; this.pos(G.p.x, G.p.y, G.p.dir); this.paintHud(); break;
        case 'players': {
          const seen = {};
          for (const p of m.list) { if (p.id === this.pub) continue; seen[p.id] = 1; const o = this.others[p.id] || (this.others[p.id] = { id: p.id, fx: p.x, fy: p.y }); Object.assign(o, { name: p.name, busy: p.busy, map: p.map, x: p.x, y: p.y, dir: p.dir || 'down' }); }
          for (const k in this.others) if (!seen[k]) { this.drop(this.others[k]); delete this.others[k]; }
          this.paintHud(); this.paintList();
          break;
        }
        case 'pos': { if (m.id === this.pub) break; const o = this.others[m.id] || (this.others[m.id] = { id: m.id, fx: m.x, fy: m.y }); if (o.map !== m.map) { o.fx = m.x; o.fy = m.y; } Object.assign(o, { name: m.name, map: m.map, x: m.x, y: m.y, dir: m.dir, busy: m.busy }); break; }
        case 'chat': {
          this.log.push(m); if (this.log.length > 80) this.log.shift();
          if (!$('#chatw').classList.contains('open')) this.unread++;
          this.paintChat();
          if (!m.sys) { const o = m.me === this.pub ? { self: true } : this.others[m.me]; if (o) { o.say = m.text; o.sayT = performance.now() + 4500; } if (m.me === this.pub) { this.mySay = m.text; this.mySayT = performance.now() + 4500; } }
          break;
        }
        case 'info': G.toast(m.text, 2600); break;
        case 'challenge': this.onChallenge(m); break;
        case 'start': this.onStart(m); break;
        case 'batch': case 'reject': if (this.sess) this.sess.push(m.t === 'reject' ? { reject: true } : m); break;
      }
    },

    // ── 대전 ──
    // 지금의 팀/덱 중 무엇으로 싸울지 고른다. 서버가 다시 검증하고 비스트는 Lv.50으로 맞춘다.
    async pickLoad() {
      const p = G.p, canB = p.team.length > 0, canD = p.deck.length >= X.DECK_MIN;
      const opts = [];
      if (canB) opts.push(['내 비스트 팀', { kind: 'team', team: p.team.map((b) => ({ sp: b.sp, name: b.name, iv: b.iv, moves: b.moves, item: b.item })) }]);
      if (canD) opts.push(['내 덱', { kind: 'deck', deck: p.deck }]);
      opts.push(['대여 비스트 팀', { kind: 'rteam' }], ['대여 덱', { kind: 'rdeck' }], ['그만두기', null]);
      const c = await G.choose(`무엇으로 싸울까? (대전 규칙: 비스트는 모두 Lv.${this.lv || 50})`, opts.map((o) => o[0]), null, opts.length - 1);
      return opts[c][1];
    },
    async challenge(o) {
      if (o.busy) return G.say(`${o.name}은(는) 지금 대전 중이다.`);
      const c = await G.choose(`${o.name}에게 무엇을 할까?`, ['대전을 신청한다', '그만둔다'], null, 1);
      if (c !== 0) return;
      const load = await this.pickLoad();
      if (load) this.send({ t: 'challenge', to: o.id, load });
    },
    onChallenge(m) {
      if (G.scene !== 'world' || G.lock) return this.send({ t: 'answer', from: m.from, ok: false });
      G.sfx('ok');
      G.run(async () => {
        const c = await G.choose(`${m.name}의 대전 신청! (${m.label})`, ['받아들인다', '거절한다'], null, 1);
        const load = c === 0 ? await this.pickLoad() : null;
        this.send({ t: 'answer', from: m.from, ok: !!load, load });
      });
    },
    onStart(m) {
      const sess = (this.sess = {
        opp: m.opp, events: m.events, state: m.state, foeLook: m.oppKind === 'tamer' ? 'tamer_m' : 'duelist_m', q: [], w: null,
        push(b) { if (this.w) { const w = this.w; this.w = null; w(b); } else { this.q.push(b); X.BattleUI.netWake(); } },
        next() { return this.q.length ? Promise.resolve(this.q.shift()) : new Promise((r) => (this.w = r)); },
        send: (a) => Net.send({ t: 'act', a }),
      });
      const go = async () => { await X.BattleUI.runNet(sess); this.sess = null; this.pos(G.p.x, G.p.y, G.p.dir); };
      // 대화 중이었다면 끝난 뒤가 아니라 바로 전투로 넘어간다
      G.inputStack.length = 0; X.Dlg.hide(); $('#overlay').innerHTML = ''; $('#overlay').classList.add('hidden');
      G.run(go);
    },

    // ── 월드에 다른 플레이어 그리기 (overworld.js의 draw에서 매 프레임 호출) ──
    at(x, y) { return Object.values(this.others).find((o) => o.map === G.p.map && o.x === x && o.y === y); },
    drop(o) { if (o.el) { o.el.remove(); o.sh.remove(); o.el = null; } },
    draw(OW, dt) {
      const now = performance.now(), TS = OW.TS;
      for (const o of Object.values(this.others)) {
        if (o.map !== G.p.map) { this.drop(o); continue; }
        if (!o.el || !o.el.isConnected) {
          o.look = lookOf(o.id);
          o.sh = el('div', 'f3 shadow3'); o.el = OW.mkBoard(0, 0, OW.CW, OW.CH, 'ent');
          o.tag = o.el.appendChild(el('div', 'ntag')); o.bub = o.el.appendChild(el('div', 'bubble hidden'));
          OW.plane.appendChild(o.sh); OW.plane.appendChild(o.el); o.key = '';
        }
        // 목표 타일까지 일정 속도로 따라간다
        const dx = o.x - o.fx, dy = o.y - o.fy, d = Math.hypot(dx, dy), step = dt / 150;
        const moving = d > 0.02;
        if (d > 4) { o.fx = o.x; o.fy = o.y; } else if (moving) { const k = Math.min(1, step / d); o.fx += dx * k; o.fy += dy * k; o.walk = (o.walk || 0) + dt; }
        const px = o.fx * TS, py = (o.fy + OW.FEET) * TS;
        o.el.style.transform = OW.boardM(px - 3, py, OW.CH);
        o.sh.style.transform = `translate3d(${px + 6}px,${py - 9}px,1px)`;
        const key = o.dir + (moving ? Math.floor(o.walk / 75) % 4 : 0);
        if (key !== o.key) { o.key = key; o.el.firstChild.style.backgroundImage = `url(${A.charFrame(o.look, o.dir, moving ? Math.floor(o.walk / 75) % 4 : 0)})`; }
        const label = o.name + (o.busy ? ' ⚔' : '');
        if (o.tag.textContent !== label) o.tag.textContent = label;
        const say = o.sayT > now ? o.say : '';
        if (o.bub.textContent !== say) { o.bub.textContent = say; o.bub.classList.toggle('hidden', !say); }
      }
      // 내 말풍선
      const me = OW.plEl;
      if (me) { let b = me.querySelector('.bubble'); if (!b) b = me.appendChild(el('div', 'bubble hidden')); const say = this.mySayT > now ? this.mySay : ''; if (b.textContent !== say) { b.textContent = say; b.classList.toggle('hidden', !say); } }
    },

    // ── HUD: 접속 표시, 채팅, 접속자 목록 ──
    buildUi() {
      const hud = $('#hud');
      const nb = el('button', 'hud-btn net', ''); nb.id = 'btn-net'; nb.onclick = () => this.openList(); hud.appendChild(nb);
      const w = $('#chatw');
      w.classList.remove('hidden');
      w.innerHTML = `<div id="chat-log"></div><form id="chat-form"><input id="chat-in" maxlength="200" placeholder="메시지 입력 후 Enter" autocomplete="off"><button class="btn sm">보내기</button></form><button id="chat-btn" class="hud-btn">💬 채팅 <kbd>T</kbd><b></b></button>`;
      const open = (on) => { w.classList.toggle('open', on); if (on) { this.unread = 0; this.paintChat(); setTimeout(() => $('#chat-in').focus(), 30); } else $('#chat-in').blur(); };
      $('#chat-btn').onclick = () => open(!w.classList.contains('open'));
      $('#chat-form').onsubmit = (e) => { e.preventDefault(); const i = $('#chat-in'), t = i.value.trim(); if (t) this.send({ t: 'chat', text: t }); i.value = ''; if (G.scene === 'world') open(false); };
      $('#chat-in').addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); e.stopPropagation(); });
      addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && (e.key === 't' || e.key === 'T') && !e.repeat) { e.preventDefault(); open(true); } });
      this.paintHud(); this.paintChat();
    },
    paintHud() { const b = $('#btn-net'); if (b) { const n = Object.keys(this.others).length + 1; b.innerHTML = this.on ? `<i class="dot on"></i>온라인 ${n}명` : '<i class="dot"></i>연결 끊김'; } },
    paintChat() {
      const L = $('#chat-log'); if (!L) return;
      L.innerHTML = this.log.slice(-30).map((m) => (m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div><b class="${m.me === this.pub ? 'me' : ''}">${esc(m.from)}</b> ${esc(m.text)}</div>`)).join('');
      L.scrollTop = L.scrollHeight;
      const n = $('#chat-btn b'); if (n) { n.textContent = this.unread || ''; n.style.display = this.unread ? '' : 'none'; }
    },
    // 접속자 목록: 어디에 있든 대전을 신청할 수 있다
    openList() {
      if (G.scene !== 'world' || G.lock || G.inputStack.length) return;
      G.run(async () => {
        const list = Object.values(this.others);
        if (!list.length) return G.say('지금은 다른 접속자가 없다. 서버 주소를 친구에게 알려 주자!');
        const names = list.map((o) => `${o.name} — ${(X.WORLD.maps[o.map] || {}).name || '어딘가'}${o.busy ? ' (대전 중)' : ''}`);
        const c = await G.choose(`접속자 ${list.length + 1}명. 누구에게 대전을 신청할까?`, names.concat('닫기'), null, names.length);
        if (c < list.length) await this.challenge(list[c]);
      });
    },
    paintList() {},
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
