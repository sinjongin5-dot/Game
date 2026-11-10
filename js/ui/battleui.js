// 전투 화면 — 엔진의 이벤트를 재생하고, 플레이어의 결정을 action으로 바꿔 submit한다.
// 한 화면이 세 방식(비스트전/듀얼/크로스)을 모두 처리한다: 각 진영 패널은 kind(tamer/duelist)에 따라 그려진다.
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, el = X.el;
  const $ = (s) => document.querySelector(s);
  const typeChip = (t) => `<span class="chip" style="background:${X.TYPES[t].color}">${X.TYPES[t].name}</span>`;
  const KIND_KO = { mon: '몬스터', spell: '마법', trap: '함정' };
  const SUB_KO = { normal: '일반', equip: '장착', cont: '지속' };

  // 카드 상세 HTML (전투/덱 편집/상점 공용)
  X.cardDetail = function (id, extra) {
    const c = X.CARDS[id];
    const head = c.kind === 'mon' ? `${typeChip(c.attr)} <span class="lvl">★${c.lv}</span> <b>ATK ${c.atk}</b> / <b>DEF ${c.def}</b>` : `<span class="chip k-${c.kind}">${KIND_KO[c.kind]}${c.sub ? '·' + SUB_KO[c.sub] : ''}</span>`;
    const tr = c.kind === 'mon' && c.lv >= 5 ? `<div class="cd-note">제물 ${c.lv >= 7 ? 2 : 1}장이 필요</div>` : '';
    return `<div class="cd"><div class="cd-art k-${c.kind}"><img src="${A.cardUrl(id)}"></div><div class="cd-body"><div class="cd-name">${c.name}</div><div class="cd-head">${head}</div>${tr}<div class="cd-text">${c.text || (c.kind === 'mon' ? '효과 없는 일반 몬스터.' : '')}</div>${extra || ''}</div></div>`;
  };
  // 작은 카드 (패/컬렉션)
  X.cardHTML = function (id, attrs, badge, cls) {
    const c = X.CARDS[id];
    return `<div class="card k-${c.kind}${c.kind === 'mon' && c.text ? ' fxm' : ''}${cls ? ' ' + cls : ''}" ${attrs || ''}><div class="c-name">${c.name}</div><div class="c-art"><img src="${A.cardUrl(id)}"></div><div class="c-foot">${c.kind === 'mon' ? `<i style="background:${X.TYPES[c.attr].color}"></i>★${c.lv} <b>${c.atk}</b>/<b>${c.def}</b>` : KIND_KO[c.kind]}</div>${badge || ''}</div>`;
  };

  const UI = (X.BattleUI = {
    async run(cfg) {
      const bt = (this.bt = new X.Battle({ seed: (Math.random() * 2 ** 31) | 0, sides: cfg.sides, link: cfg.link, wild: cfg.wild, noRun: cfg.noRun, expSide: cfg.expSide }));
      this.auto = false;
      this.cfg = cfg; this.log = []; this.sel = null; this.picking = null; this.prevHp = {}; this.skipFn = null;
      this.meKind = bt.side(0).kind;
      const h = G.pushInput({ a: () => this.skipFn && this.skipFn(), b: () => this.cancelPick() });
      const prevScene = G.scene;
      await G.fade(true);
      this.build();
      G.scene = 'battle';
      this.render(bt.view(0));
      await G.fade(false);
      this.render(bt.view(0));
      if (cfg.intro) await this.message(cfg.intro, 900);
      await this.play();
      while (!bt.over) {
        if (bt.request(1)) {
          if (bt.mode !== 'tt') await X.wait(380);
          const a = X.AI.decide(bt, 1);
          if (bt.submit(1, a) === false) bt.submit(1, { type: 'end' });
          await this.play();
          continue;
        }
        const req = bt.request(0);
        if (!req) break;
        this.render(bt.view(0));
        let a;
        if (this.auto) { await X.wait(260 / (G.speed || 1)); a = X.AI.decide(bt, 0); } else a = await this.ask(req);
        this.clearSel();
        if (bt.submit(0, a) === false) { G.sfx('bump'); this.setMsg('그 행동은 지금 할 수 없다.'); continue; }
        await this.play();
      }
      const r = bt.s.result || { winner: 1, reason: 'ko' };
      this.render(bt.view(0));
      const txt = r.reason === 'fled' ? '전투에서 벗어났다.' : r.reason === 'capture' ? '포획 성공!' : r.winner === 0 ? '승리!' : '패배…';
      if (r.winner === 0) G.sfx('win');
      await this.result(txt, r.winner === 0 || r.reason === 'capture');
      await G.fade(true);
      $('#battle').classList.add('hidden');
      if (this.gl) X.FX3D.stop();
      this.auto = false;
      G.popInput(h);
      G.scene = prevScene;
      await G.fade(false);
      return r;
    },

    build() {
      const b = $('#battle'), bt = this.bt;
      const mode = bt.mode === 'tt' ? '비스트 배틀' : bt.mode === 'dd' ? '듀얼' : '크로스 배틀';
      b.className = 'bg-' + (this.cfg.bg || 'field') + ' m-' + bt.mode;
      b.innerHTML = `<div class="b-side b-opp" id="bs1"></div><div class="b-banner"><span class="b-mode">${mode}</span><div id="b-msg"></div><button class="bb" data-act="speed" title="메시지 속도">▶ ×${G.speed || 1}</button><button class="bb${this.auto ? ' on' : ''}" data-act="auto" title="AI가 대신 진행">자동</button></div><div class="b-side b-me" id="bs0"></div>
        <div id="b-right"><div id="b-log"></div><div id="b-detail" class="hidden"></div></div>
        <div class="b-bottom"><div id="b-hand"></div><div id="b-cmd"></div></div><div id="b-modal" class="hidden"></div>`;
      b.onclick = (e) => this.click(e);
      this.gl = X.FX3D.ok;
      if (this.gl) { X.FX3D.start(b, this.cfg.bg || 'field'); b.classList.add('gl'); }
    },

    // ── 렌더링 ──
    render(v) {
      this.v = v;
      for (const i of [0, 1]) {
        const sd = v.sides[i], e = $('#bs' + i);
        e.className = `b-side ${i ? 'b-opp' : 'b-me'} k-${sd.kind}`;
        e.innerHTML = sd.kind === 'tamer' ? this.tamerHTML(sd, i) : this.duelHTML(sd, i);
      }
      requestAnimationFrame(() => document.querySelectorAll('#battle [data-to]').forEach((f) => (f.style.width = f.dataset.to + '%')));
      if (this.meKind === 'duelist') this.renderHand();
      this.paintPick();
      if (this.gl) X.FX3D.sync(v);
    },
    hpCls: (p) => (p > 50 ? 'g' : p > 20 ? 'y' : 'r'),
    tamerHTML(sd, i) {
      const b = sd.team[sd.active], sp = X.BEASTS[b.sp], pct = (b.hp / b.maxhp) * 100, mem = this.prevHp[i];
      const old = mem && mem.active === sd.active ? mem.pct : pct;
      this.prevHp[i] = { active: sd.active, pct };
      const stg = Object.entries(sd.stages).filter(([, n]) => n).map(([k, n]) => `<span class="${n > 0 ? 'up' : 'dn'}">${{ atk: '공', def: '방', spd: '속' }[k]}${n > 0 ? '▲' : '▼'}${Math.abs(n)}</span>`).join('');
      const dots = sd.wild ? '' : `<div class="tp-team">${sd.team.map((t, k) => `<i class="${t.hp <= 0 ? 'x' : k === sd.active ? 'a' : ''}"></i>`).join('')}</div>`;
      return `<div class="tp-info"><div class="tp-owner">${sd.wild ? '야생 비스트' : sd.name}</div>
        <div class="tp-name">${b.name} <span class="lv">Lv.${b.lv}</span>${b.status ? `<span class="st st-${b.status}">${X.STATUS[b.status]}</span>` : ''}</div>
        <div class="tp-types">${sp.types.map(typeChip).join('')}<span class="stg">${stg}</span></div>
        <div class="hpbar"><div class="hpfill ${this.hpCls(pct)}" style="width:${old}%" data-to="${pct}"></div></div>
        <div class="tp-hp">HP ${b.hp} / ${b.maxhp}</div>${dots}</div>
        <div class="tp-sprite zone" data-side="${i}" data-zone="beast"><div class="shadow"></div><img class="spr${i === 0 ? ' flip' : ''}${b.hp <= 0 ? ' down' : ''}" src="${A.beastUrl(b.sp)}"></div>`;
    },
    monHTML(m) {
      if (!m) return '';
      if (m.hidden) return `<div class="fc back def"></div><div class="fz-stat">세트</div>`;
      const c = X.CARDS[m.id];
      const cls = (cur, base) => (cur > base ? 'up' : cur < base ? 'dn' : '');
      return `<img class="holo${m.pos === 'def' ? ' hd' : ''}${m.faceDown ? ' fdn' : ''}" style="--hc:${X.TYPES[c.attr].color}" src="${A.cardUrl(m.id)}"><div class="fc k-mon${c.text ? ' fxm' : ''}${m.pos === 'def' ? ' def' : ''}${m.faceDown ? ' own-fd' : ''}"><div class="c-art"><img src="${A.cardUrl(m.id)}"></div><i class="attr" style="background:${X.TYPES[c.attr].color}"></i></div>${m.status ? `<span class="st st-${m.status} zst">${X.STATUS[m.status]}</span>` : ''}
        <div class="fz-name">${m.faceDown ? '(세트) ' : ''}${c.name}</div><div class="fz-stat"><b class="${cls(m.a, c.atk)}${m.pos === 'atk' ? ' cur' : ''}">${m.a}</b> / <b class="${cls(m.d, c.def)}${m.pos === 'def' ? ' cur' : ''}">${m.d}</b></div>`;
    },
    stHTML(t) {
      if (!t) return '';
      if (t.faceDown) return `<div class="fc sm back"></div>${t.id ? `<div class="fz-name">${X.CARDS[t.id].name}</div>` : ''}`;
      const c = X.CARDS[t.id];
      return `<div class="fc sm k-${c.kind}"><div class="c-art"><img src="${A.cardUrl(t.id)}"></div></div><div class="fz-name">${c.name}</div>`;
    },
    duelHTML(sd, i) {
      const mons = `<div class="row mon">${sd.mons.map((m, z) => `<div class="zone mz${m ? '' : ' empty'}" data-side="${i}" data-zone="${z}">${this.monHTML(m)}</div>`).join('')}</div>`;
      const st = `<div class="row st">${sd.st.map((t, z) => `<div class="zone sz${t ? '' : ' empty'}" data-side="${i}" data-st="${z}">${this.stHTML(t)}</div>`).join('')}</div>`;
      const look = i === 1 ? this.cfg.foeLook || 'duelist_m' : 'hero';
      const pct = Math.min(100, (sd.lp / sd.maxLp) * 100);
      return `<div class="dp-info"><img class="ava" src="${A.charUrl(look)}"><div class="dp-name">${sd.name}</div><div class="lp" data-lp="${i}">LP <b>${sd.lp}</b></div>
        <div class="hpbar"><div class="hpfill lpf" style="width:${pct}%"></div></div>
        <div class="dp-counts">덱 ${sd.deck.length} · 패 ${sd.hand.length} · 묘지 ${sd.grave.length}</div></div>
        <div class="dp-field">${i === 1 ? st + mons : mons + st}</div>`;
    },
    renderHand() {
      const sd = this.v.sides[0], bt = this.bt, my = bt.request(0), can = my && my.kind === 'duel';
      $('#b-hand').innerHTML = sd.hand.map((id, h) => {
        const c = X.CARDS[id];
        const ok = can && (c.kind === 'mon' ? bt.canSummon(0, h) : c.kind === 'spell' ? bt.spellInfo(0, h) : bt.freeZone(bt.side(0).st) >= 0);
        return X.cardHTML(id, `data-hand="${h}"`, '', (ok ? 'ok' : '') + (this.sel && this.sel.hand === h ? ' sel' : ''));
      }).join('');
    },
    setMsg(t) { $('#b-msg').textContent = t; },
    addLog(t) {
      this.log.push(t);
      const L = $('#b-log');
      L.innerHTML = this.log.slice(-40).map((x) => `<div class="${x.startsWith('──') ? 'turn' : ''}">${x}</div>`).join('');
      L.scrollTop = L.scrollHeight;
    },

    // ── 이벤트 재생 ──
    async play() {
      const evs = this.bt.events.splice(0);
      for (const e of evs) {
        this.render(X.Battle.viewFor(e.s, 0));
        this.fx(e.fx);
        this.addLog(e.text);
        await this.message(e.text, e.fx && e.fx.k === 'turn' ? 520 : 480 + Math.min(700, e.text.length * 22));
      }
    },
    message(text, ms) {
      this.setMsg(text);
      ms /= G.speed || 1;
      return new Promise((res) => { const t = setTimeout(done, ms); const self = this; function done() { clearTimeout(t); self.skipFn = null; res(); } this.skipFn = done; });
    },
    fx(f) {
      if (!f) return;
      if (this.gl) X.FX3D.fx(f);
      const tgt = f.zone != null && f.zone !== 'beast' ? $(`#bs${f.side} .mz[data-zone="${f.zone}"]`) : $(`#bs${f.side} .tp-sprite`) || $(`#bs${f.side} .dp-info`);
      const cls = { hit: 'fx-hit', destroy: 'fx-destroy', faint: 'fx-faint', summon: 'fx-pop', flip: 'fx-pop', enter: 'fx-pop', heal: 'fx-heal', buff: 'fx-buff', debuff: 'fx-debuff', status: 'fx-debuff', lp: 'fx-hit', levelup: 'fx-buff', capsule: 'fx-capsule', trap: 'fx-trap', spell: 'fx-buff' }[f.k];
      if (f.k === 'hit' || f.k === 'lp' || f.k === 'destroy') G.sfx('hit'); else if (f.k === 'faint') G.sfx('faint'); else if (f.k === 'heal' || f.k === 'levelup') G.sfx('heal'); else if (['summon', 'spell', 'trap', 'set', 'draw'].includes(f.k)) G.sfx('card');
      const target = f.k === 'lp' ? $(`#bs${f.side} .lp`) : f.k === 'trap' || f.k === 'spell' ? $(`#bs${f.side} .dp-info`) : tgt;
      if (target && cls) { target.classList.add(cls); if (f.type) target.style.setProperty('--fx', X.TYPES[f.type].color); }
      if ((f.k === 'spell' || f.k === 'trap') && f.card) this.showDetail(X.cardDetail(f.card, `<div class="cd-note">${f.side === 0 ? '내가' : '상대가'} 발동</div>`), true);
    },
    result(text, good) {
      return new Promise((res) => {
        const m = $('#b-modal');
        m.className = 'result ' + (good ? 'good' : 'bad');
        m.innerHTML = `<div class="res-box"><div class="res-title">${text}</div><button class="btn" data-act="close">계속</button></div>`;
        this.skipFn = this.onClose = () => { this.skipFn = this.onClose = null; m.className = 'hidden'; res(); };
      });
    },

    // ── 플레이어 입력 ──
    ask(req) {
      this.clearSel();
      return new Promise((res) => {
        this.done = (a) => { this.done = null; G.sfx('ok'); res(a); };
        if (req.kind === 'switch') { this.setMsg('다음에 내보낼 비스트를 고르자.'); this.teamModal((k) => this.bt.canSwitch(0, k), (k) => this.done({ type: 'switch', to: k }), true); }
        else if (req.kind === 'trap') this.trapModal(req);
        else if (req.kind === 'tamer') { this.setMsg(`${this.bt.active(0).name}${this.bt.s.follow ? ' — 쾌속! 한 번 더' : ''} 무엇을 할까?`); this.tamerCmd(); }
        else { this.setMsg('내 턴 — 카드를 골라 행동하자.'); this.duelCmd(); }
      });
    },
    click(e) {
      const t = e.target, act = t.closest('[data-act]');
      if (act) { e.stopPropagation(); return this.act(act.dataset.act, act.dataset); }
      const z = t.closest('.zone'), hand = t.closest('[data-hand]');
      if (this.picking) {
        if (z && +z.dataset.side === this.picking.side && this.picking.zones.includes(z.dataset.zone === 'beast' ? 'beast' : +z.dataset.zone) && z.dataset.st == null) { const p = this.picking; G.sfx('sel'); return p.cb(+z.dataset.zone); }
        return;
      }
      if (hand) return this.selectHand(+hand.dataset.hand);
      if (z) return this.selectZone(+z.dataset.side, z.dataset);
      if (!t.closest('#b-right') && !t.closest('#b-cmd')) this.clearSel();
    },
    act(name, d) {
      const f = this.acts && this.acts[name];
      if (name === 'close' && this.onClose) return this.onClose();
      if (name === 'cancel') return this.cancelPick();
      if (name === 'speed') { G.speed = { 1: 2, 2: 4, 4: 1 }[G.speed || 1]; const e = $('#battle [data-act=speed]'); if (e) e.textContent = '▶ ×' + G.speed; return; }
      if (name === 'auto') {
        this.auto = !this.auto;
        const e = $('#battle [data-act=auto]'); if (e) e.classList.toggle('on', this.auto);
        if (this.auto && this.done && this.bt.request(0)) { this.picking = null; this.paintPick(); $('#b-modal').className = 'hidden'; this.done(X.AI.decide(this.bt, 0)); }
        return;
      }
      if (f) f(d);
    },
    showDetail(html, soft) { const d = $('#b-detail'); d.innerHTML = html; d.classList.remove('hidden'); d.classList.toggle('soft', !!soft); },
    clearSel() { this.sel = null; this.acts = this.baseActs || {}; const d = $('#b-detail'); if (d) d.classList.add('hidden'); document.querySelectorAll('#battle .sel').forEach((x) => x.classList.remove('sel')); },
    cancelPick() { if (!this.picking) return; this.picking = null; this.paintPick(); this.clearSel(); if (this.cmdBack) this.cmdBack(); },
    // 대상 선택 모드
    pick(side, zones, prompt, cb, tagFn) {
      this.picking = { side, zones, tagFn, cb: (z) => { this.picking = null; this.paintPick(); cb(z); } };
      this.setMsg(prompt);
      $('#b-detail').classList.add('hidden');
      this.paintPick();
    },
    paintPick() {
      document.querySelectorAll('#battle .pick').forEach((x) => { x.classList.remove('pick'); const t = x.querySelector('.ptag'); if (t) t.remove(); });
      const p = this.picking;
      $('#battle').classList.toggle('picking', !!p);
      if (!p) return;
      for (const z of p.zones) {
        const e = $(`#bs${p.side} .zone[data-zone="${z}"]:not(.sz)`);
        if (!e) continue;
        e.classList.add('pick');
        if (p.tagFn) { const tag = p.tagFn(z); if (tag) e.appendChild(el('div', 'ptag ' + tag[1], tag[0])); }
      }
    },

    // ── 테이머 커맨드 ──
    tamerCmd() {
      const bt = this.bt, cross = bt.mode === 'cross', b = bt.active(0);
      const main = () => {
        this.cmdBack = null;
        $('#b-hand').innerHTML = `<div class="hint">${cross ? '크로스 룰: 기술은 <b>스트라이크</b>가 되어 몬스터의 ATK/DEF와 겨룬다. 몬스터가 없으면 상대 LP에 직접!' : '비스트 룰: 스피드가 빠른 쪽이 먼저 움직인다. 속성 상성을 노리자.'}</div>`;
        $('#b-cmd').innerHTML = `<button class="btn big" data-act="fight">싸운다</button><button class="btn" data-act="team">비스트</button><button class="btn" data-act="bag">가방</button>${bt.s.wild && bt.mode === 'tt' ? '<button class="btn" data-act="run">도망</button>' : '<button class="btn" data-act="rules">룰</button>'}`;
      };
      const fight = () => {
        this.cmdBack = main;
        const usable = b.moves.some((m) => m.pp > 0);
        const foeTypes = bt.side(1).kind === 'tamer' ? X.BEASTS[bt.active(1).sp].types : null;
        const btn = (mv, k, pp) => {
          const info = mv.pow > 0 ? (cross ? `스트라이크 ${Math.round(bt.strikeBase(0, mv, null) / 10) * 10}` : `위력 ${mv.pow}`) : '변화';
          const e = foeTypes && mv.pow > 0 ? X.eff(mv.type, foeTypes) : 1;
          return `<button class="move" data-act="move" data-i="${k}" ${pp === 0 ? 'disabled' : ''} style="--tc:${X.TYPES[mv.type].color}"><b>${mv.name}</b><span>${X.TYPES[mv.type].name} · ${info}${e > 1 ? ' · <em class="up">효과 굉장</em>' : e < 1 ? ' · <em class="dn">효과 별로</em>' : ''}</span><span class="pp">${pp == null ? '' : `PP ${pp}/${mv.pp}`}</span></button>`;
        };
        $('#b-hand').innerHTML = `<div class="moves">${usable ? b.moves.map((m, k) => btn(X.MOVES[m.id], k, m.pp)).join('') : btn({ name: '발버둥', type: 'normal', pow: 35, pp: 1 }, -1, null)}</div>`;
        $('#b-cmd').innerHTML = `<button class="btn" data-act="back">뒤로</button>`;
      };
      this.acts = this.baseActs = {
        fight, back: main, rules: () => this.rulesModal(),
        run: () => this.done({ type: 'run' }),
        team: () => this.teamModal((k) => bt.canSwitch(0, k), (k) => this.done({ type: 'switch', to: k })),
        bag: () => this.bagModal(),
        move: (d) => {
          const k = +d.i, mv = bt.moveOf(0, k);
          if (!mv) return;
          if (!cross) return this.done({ type: 'move', move: k });
          const zones = bt.monZones(1);
          const needs = mv.pow > 0 || mv.fx.st || mv.fx.foe;
          if (!needs || !zones.length) return this.done({ type: 'move', move: k, target: 'direct' });
          if (zones.length === 1) return this.done({ type: 'move', move: k, target: zones[0] });
          $('#b-cmd').innerHTML = `<button class="btn" data-act="cancel">취소</button>`;
          this.cmdBack = fight;
          this.pick(1, zones, `${mv.name} — 대상 몬스터를 고르자.`, (z) => this.done({ type: 'move', move: k, target: z }), (z) => {
            if (!mv.pow) return null;
            const m = this.v.sides[1].mons[z];
            if (m.hidden) return ['?', ''];
            const S = Math.round(bt.strikeBase(0, mv, X.CARDS[m.id].attr) * 0.96 / 10) * 10, val = m.pos === 'atk' ? m.a : m.d;
            return [`${S} ${S >= val ? '≥' : '<'} ${val}`, S >= val ? 'good' : 'bad'];
          });
        },
      };
      main();
    },
    teamModal(valid, cb, forced) {
      const sd = this.bt.side(0), m = $('#b-modal');
      m.className = 'modal';
      m.innerHTML = `<div class="mbox"><div class="mtitle">비스트 선택</div><div class="tlist">${sd.team.map((b, k) => `<button class="trow" data-act="tpick" data-i="${k}" ${valid(k) ? '' : 'disabled'}><img src="${A.beastUrl(b.sp)}"><div><b>${b.name}</b> Lv.${b.lv} ${b.status ? `<span class="st st-${b.status}">${X.STATUS[b.status]}</span>` : ''}${k === sd.active ? ' <i>(전투 중)</i>' : ''}<div class="hpbar"><div class="hpfill ${this.hpCls((b.hp / b.maxhp) * 100)}" style="width:${(b.hp / b.maxhp) * 100}%"></div></div><small>HP ${b.hp}/${b.maxhp}</small></div></button>`).join('')}</div>${forced ? '' : '<button class="btn" data-act="mclose">취소</button>'}</div>`;
      const prev = this.acts;
      this.acts = Object.assign({}, prev, { tpick: (d) => { m.className = 'hidden'; this.acts = prev; cb(+d.i); }, mclose: () => { m.className = 'hidden'; this.acts = prev; } });
    },
    bagModal() {
      const bt = this.bt, sd = bt.side(0), bag = sd.bag || {}, m = $('#b-modal');
      const items = Object.keys(bag).filter((k) => bag[k] > 0 && (X.ITEMS[k].ball ? bt.s.wild && bt.mode === 'tt' : true));
      m.className = 'modal';
      m.innerHTML = `<div class="mbox"><div class="mtitle">가방</div><div class="tlist">${items.length ? items.map((k) => `<button class="trow" data-act="ipick" data-i="${k}"><div><b>${X.ITEMS[k].name}</b> ×${bag[k]}<br><small>${X.ITEMS[k].desc}</small></div></button>`).join('') : '<div class="hint">쓸 수 있는 도구가 없다.</div>'}</div><button class="btn" data-act="mclose">취소</button></div>`;
      const prev = this.acts;
      this.acts = Object.assign({}, prev, {
        mclose: () => { m.className = 'hidden'; this.acts = prev; },
        ipick: (d) => {
          const it = X.ITEMS[d.i];
          this.acts = prev;
          if (it.ball) { m.className = 'hidden'; return this.done({ type: 'capture', item: d.i }); }
          this.teamModal((k) => !!bt.useItem(0, { item: d.i, target: k }), (k) => this.done({ type: 'item', item: d.i, target: k }));
        },
      });
    },
    trapModal(req) {
      const sd = this.bt.side(0), m = $('#b-modal'), ctx = req.ctx;
      const what = ctx.type === 'summon' ? '상대가 몬스터를 소환했다!' : ctx.type === 'switchIn' ? '상대가 비스트를 교체했다!' : '상대의 공격 선언!';
      this.setMsg(what + ' 함정을 발동할까?');
      m.className = 'modal';
      m.innerHTML = `<div class="mbox"><div class="mtitle">${what}</div><div class="tlist">${req.options.map((z) => `<button class="trow trap" data-act="trap" data-i="${z}"><img src="${A.cardUrl(sd.st[z].id)}"><div><b>${X.CARDS[sd.st[z].id].name}</b> 발동<br><small>${X.CARDS[sd.st[z].id].text}</small></div></button>`).join('')}</div><button class="btn" data-act="notrap">발동하지 않는다</button></div>`;
      this.acts = { trap: (d) => { m.className = 'hidden'; this.done({ type: 'trap', idx: +d.i }); }, notrap: () => { m.className = 'hidden'; this.done({ type: 'trap', idx: null }); } };
    },
    rulesModal() {
      const m = $('#b-modal'), mode = this.bt.mode, K = X.Battle.linkK(this.bt.s.link);
      const text = mode === 'tt' ? '<p><b>비스트 룰</b></p><p>양쪽이 동시에 행동을 고르고, 스피드가 빠른 쪽부터 움직인다. 상대의 비스트를 모두 쓰러뜨리면 승리.</p><p>속성 상성(2배/0.5배), 자속 보정(1.5배), 상태이상(독·화상·마비·수면)을 활용하자.</p>'
        : mode === 'dd' ? '<p><b>카드 룰</b></p><p>턴마다 1장 드로우, 몬스터 일반 소환은 1회. ★5~6은 제물 1장, ★7 이상은 제물 2장.</p><p>공격 표시끼리는 ATK 비교(차이만큼 LP 데미지). 수비 표시는 DEF로 막고 LP는 안전하다.</p><p>함정은 세트한 다음 턴부터 상대 행동에 맞춰 발동. LP가 0이 되거나 덱이 떨어지면 패배.</p>'
        : `<p><b>크로스 룰</b> — 각자 자기 규칙으로 싸운다. (링크 Lv.${this.bt.s.link})</p><p>● 테이머는 비스트가 모두 쓰러지면, 듀얼리스트는 LP가 0이 되면 패배.</p><p>● 비스트의 기술은 <b>스트라이크</b>(공격×${K.toFixed(0)}×위력/60×상성)가 된다. 몬스터의 ATK(수비 표시면 DEF) 이상이면 파괴하고, 공격 표시였다면 초과분이 LP 데미지. 못 부수면 충격으로 ATK/DEF를 스트라이크의 절반만큼 깎는다. 몬스터가 없으면 LP에 직접!</p><p>● 카드 몬스터의 공격은 비스트의 HP를 깎는다(속성 상성 적용). 반격 피해는 없다.</p><p>● <b>쾌속</b>: 비스트가 몬스터를 격파했을 때 스피드 환산치가 그 몬스터 레벨×400 이상이면 한 번 더 행동.</p><p>● 카드의 「파괴」는 비스트 최대 HP의 35% 피해, 효과 데미지는 선두 비스트가 대신 받는다. 상태이상은 양쪽 모두에 통한다 — 몬스터는 독(매 턴 ATK/DEF -200), 화상(ATK -30%), 마비·수면(공격 불가).</p>`;
      m.className = 'modal';
      m.innerHTML = `<div class="mbox wide rules">${text}<button class="btn" data-act="mclose">닫기</button></div>`;
      const prev = this.acts;
      this.acts = Object.assign({}, prev, { mclose: () => { m.className = 'hidden'; this.acts = prev; } });
    },

    // ── 듀얼리스트 커맨드 ──
    duelCmd() {
      const bt = this.bt;
      this.cmdBack = () => { $('#b-cmd').innerHTML = cmdHTML; this.setMsg('내 턴 — 카드를 골라 행동하자.'); };
      const cmdHTML = `<button class="btn big" data-act="end">턴 종료</button><button class="btn" data-act="rules">룰</button>${bt.s.wild ? '<button class="btn" data-act="run">도망</button>' : ''}`;
      $('#b-cmd').innerHTML = cmdHTML;
      this.acts = this.baseActs = { end: () => this.done({ type: 'end' }), rules: () => this.rulesModal(), run: () => this.done({ type: 'run' }) };
      this.renderHand();
    },
    cancelBtn() { $('#b-cmd').innerHTML = `<button class="btn" data-act="cancel">취소</button>`; },
    selectHand(h) {
      const bt = this.bt, sd = bt.side(0), id = sd.hand[h], c = X.CARDS[id], req = bt.request(0);
      if (!c) return;
      G.sfx('sel');
      this.sel = { hand: h };
      document.querySelectorAll('#b-hand .card').forEach((x, k) => x.classList.toggle('sel', k === h));
      let btns = '';
      const acts = Object.assign({}, this.baseActs);
      if (req && req.kind === 'duel') {
        if (c.kind === 'mon') {
          const info = bt.canSummon(0, h);
          if (info) {
            const go = (pos) => {
              const mine = bt.monZones(0);
              if (!info.need) return this.done({ type: 'summon', hand: h, pos, tributes: [] });
              if (mine.length === info.need) return this.done({ type: 'summon', hand: h, pos, tributes: mine });
              const chosen = [];
              const more = () => { this.cancelBtn(); this.pick(0, mine.filter((z) => !chosen.includes(z)), `제물로 바칠 몬스터를 고르자. (${chosen.length}/${info.need})`, (z) => { chosen.push(z); if (chosen.length === info.need) this.done({ type: 'summon', hand: h, pos, tributes: chosen }); else more(); }); };
              more();
            };
            btns += `<button class="btn" data-act="s-atk">${info.need ? `제물 ${info.need}장 바쳐 ` : ''}소환 (공격 표시)</button><button class="btn" data-act="s-set">세트 (뒷면 수비)</button>`;
            acts['s-atk'] = () => go('atk'); acts['s-set'] = () => go('set');
          } else btns += `<div class="cd-note">${sd.summoned ? '이번 턴은 이미 소환했다.' : bt.tributeNeed(c) ? `제물이 ${bt.tributeNeed(c)}장 필요하다.` : '몬스터 존이 가득 찼다.'}</div>`;
        } else if (c.kind === 'spell') {
          const info = bt.spellInfo(0, h);
          if (info) {
            btns += `<button class="btn" data-act="cast">발동</button>`;
            acts.cast = () => {
              if (!info.target) return this.done({ type: 'spell', hand: h });
              const side = info.target === 'opp' ? 1 : 0;
              const zones = bt.monZones(side).filter((z) => side === 1 || !sd.mons[z].faceDown);
              if (zones.length === 1) return this.done({ type: 'spell', hand: h, target: zones[0] });
              this.cancelBtn();
              this.pick(side, zones, `「${c.name}」의 대상을 고르자.`, (z) => this.done({ type: 'spell', hand: h, target: z }));
            };
          } else btns += `<div class="cd-note">지금은 발동할 수 없다.</div>`;
        } else if (bt.freeZone(sd.st) >= 0) { btns += `<button class="btn" data-act="setst">세트</button>`; acts.setst = () => this.done({ type: 'setST', hand: h }); }
      }
      this.acts = acts;
      this.showDetail(X.cardDetail(id, `<div class="cd-btns">${btns}</div>`));
    },
    selectZone(side, d) {
      const bt = this.bt, v = this.v, sd = v.sides[side];
      if (sd.kind !== 'duelist') return;
      if (d.st != null) { const t = sd.st[+d.st]; if (t && t.id) { this.acts = Object.assign({}, this.baseActs); this.showDetail(X.cardDetail(t.id, t.faceDown ? '<div class="cd-note">세트된 카드</div>' : '')); } return; }
      const z = +d.zone, m = sd.mons[z];
      if (!m || m.hidden) return this.clearSel();
      G.sfx('sel');
      const acts = Object.assign({}, this.baseActs), req = bt.request(0);
      let btns = `<div class="cd-note">현재 ATK ${m.a} / DEF ${m.d} · ${m.faceDown ? '뒷면 수비' : m.pos === 'atk' ? '공격 표시' : '수비 표시'}${m.status ? ' · ' + X.STATUS[m.status] : ''}</div>`;
      if (side === 0 && req && req.kind === 'duel') {
        if (bt.canAttack(0, z)) {
          btns += `<button class="btn" data-act="attack">공격</button>`;
          acts.attack = () => {
            const opp = bt.side(1);
            if (opp.kind === 'tamer') return this.done({ type: 'attack', zone: z, target: 'beast' });
            const zones = bt.monZones(1);
            if (!zones.length) return this.done({ type: 'attack', zone: z, target: 'direct' });
            if (zones.length === 1) return this.done({ type: 'attack', zone: z, target: zones[0] });
            this.cancelBtn();
            this.pick(1, zones, '공격할 대상을 고르자.', (t) => this.done({ type: 'attack', zone: z, target: t }), (t) => { const T = v.sides[1].mons[t]; if (T.hidden) return ['?', '']; const val = T.pos === 'atk' ? T.a : T.d; return [`${m.a} ${m.a > val ? '>' : m.a === val ? '=' : '<'} ${val}`, m.a > val ? 'good' : 'bad']; });
          };
        } else if (!m.faceDown && m.pos === 'atk' && bt.s.turn <= 1) btns += `<div class="cd-note">첫 턴에는 공격할 수 없다.</div>`;
        if (bt.canChangePos(0, z)) { btns += `<button class="btn" data-act="pos">${m.faceDown ? '반전 소환' : m.pos === 'atk' ? '수비 표시로' : '공격 표시로'}</button>`; acts.pos = () => this.done({ type: 'pos', zone: z }); }
      }
      this.acts = acts;
      document.querySelectorAll('#battle .sel').forEach((x) => x.classList.remove('sel'));
      const e = $(`#bs${side} .mz[data-zone="${z}"]`); if (e) e.classList.add('sel');
      this.showDetail(X.cardDetail(m.id, `<div class="cd-btns">${btns}</div>`));
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
