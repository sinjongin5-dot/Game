// 게임 코어: 플레이어 상태, 입력, 대화창, 저장, 전투 진입, 스크립트 API(G)
(function (root) {
  const X = root.XG;
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'crosslink_save_v1';
  const A0 = X.Art;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  X.wait = wait;
  X.el = function (tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ── 효과음 (WebAudio 신시사이저) ──
  let actx = null;
  const SFX = { sel: [660, 0.05, 'square'], ok: [880, 0.07, 'square'], hit: [140, 0.12, 'sawtooth'], heal: [520, 0.25, 'sine', 780], get: [660, 0.3, 'triangle', 990], bump: [110, 0.06, 'square'], faint: [300, 0.35, 'sawtooth', 80], card: [420, 0.06, 'triangle', 620], win: [523, 0.5, 'triangle', 1046], step: [0, 0, ''] };
  function sfx(name) {
    if (G.mute) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const [f, d, type, f2] = SFX[name] || SFX.sel;
      if (!f) return;
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* 오디오 불가 환경 */ }
  }

  const G = (X.G = {
    p: null, lock: 0, mute: false, held: [], inputStack: [], sfx,

    // ── 플레이어 상태 ──
    newPlayer(name) {
      return { name, map: X.WORLD.start.map, x: X.WORLD.start.x, y: X.WORLD.start.y, dir: 'down', team: [], box: [], cards: {}, deck: [], bag: {}, gold: 600, flags: {}, emblems: [], defeated: {}, seen: {}, caught: {}, starter: null, respawn: { map: 'sprout', x: 4, y: 5 }, rng: (Math.random() * 2 ** 31) | 0, time: 0 };
    },
    flag(k) { return !!this.p.flags[k]; },
    setFlag(k) { this.p.flags[k] = 1; },
    holder() { const p = this.p; return { get seed() { return p.rng; }, set seed(v) { p.rng = v; } }; },
    give(item, n = 1) { this.p.bag[item] = (this.p.bag[item] || 0) + n; },
    giveCard(id, n = 1) { this.p.cards[id] = (this.p.cards[id] || 0) + n; },
    giveDeck(deckId) { for (const id of X.DECKS[deckId]) this.giveCard(id); if (!this.p.deck.length) this.p.deck = X.DECKS[deckId].slice(); },
    addBeast(sp, lv, beast) {
      const b = beast || X.makeBeast(sp, lv, this.holder());
      this.p.seen[b.sp] = 1; this.p.caught[b.sp] = 1;
      (this.p.team.length < 6 ? this.p.team : this.p.box).push(b);
      return this.p.team.includes(b);
    },
    healAll() { for (const b of this.p.team) X.healBeast(b); },
    async emblem(id, name) {
      this.setFlag('emblem_' + id);
      if (!this.p.emblems.includes(id)) this.p.emblems.push(id);
      sfx('win');
      await X.Cine.emblem(name, { wave: '#3c8df0', leaf: '#4fb84a', magma: '#f0672e', shadow: '#7a5aa8' }[id] || '#f2c94c', this.p.emblems.length);
    },
    refresh() { X.OW.refreshNpcs(); },

    // ── 저장 ──
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.p)); return true; } catch (e) { return false; }
    },
    loadSave() {
      try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },

    // ── 입력 ──
    pushInput(h) { this.inputStack.push(h); return h; },
    popInput(h) { const i = this.inputStack.indexOf(h); if (i >= 0) this.inputStack.splice(i, 1); },
    key(k) {
      const h = this.inputStack[this.inputStack.length - 1];
      if (h && h[k]) return h[k]();
      if (h) return;
      if (this.scene === 'world' && !this.lock) { if (k === 'a') X.OW.interact(); else if (k === 'b') X.Menu.open(); }
    },

    // ── 대화 ──
    async say(lines, name) {
      for (const t of [].concat(lines)) await Dlg.show(t, name);
      Dlg.hide();
    },
    async choose(prompt, options, name, cancelIdx) {
      if (prompt) await Dlg.show(prompt, name, true);
      const r = await Dlg.choices(options, cancelIdx);
      Dlg.hide();
      return r;
    },
    toast(text, ms = 1800) { const t = $('#toast'); t.textContent = text; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), ms); },
    async fade(on) { $('#fade').classList.toggle('on', on); await wait(220); },

    // 스크립트 실행 (필드 조작 잠금)
    async run(fn, cine) {
      this.lock++;
      if (cine) X.Cine.bars(true);
      try { await fn(); } catch (e) { console.error(e); this.toast('오류: ' + e.message, 4000); }
      this.lock--;
      X.Cine.bars(false); X.OW.focus = null;
      Dlg.hide();
      if (this.scene === 'world') { this.refresh(); this.save(); }
    },

    // ── 전투 진입 ──
    mkTeam(spec) { return (typeof spec === 'function' ? spec(this) : spec).map(([sp, lv, item]) => { const b = X.makeBeast(sp, lv, this.holder()); if (item) b.item = item; return b; }); },
    async pickMode(force) {
      const p = this.p, canB = p.team.some((b) => b.hp > 0), canD = p.deck.length >= X.DECK_MIN;
      if (force) return force;
      if (canB && canD) return (await this.choose('어떤 방식으로 싸울까?', ['비스트로 싸운다', '덱으로 듀얼한다'])) === 0 ? 'beast' : 'deck';
      return canB ? 'beast' : canD ? 'deck' : null;
    },
    // NPC와의 승부. 반환: 'win' | 'lose'
    async fight(npc, bo, opts = {}) {
      const p = this.p, b = bo || npc.battle, id = opts.id || npc.id, B = X.Battle;
      const mode = await this.pickMode(opts.force);
      if (!mode) { await this.say('싸울 수 있는 비스트도, 덱도 없다…!'); return 'lose'; }
      const kind = b.kind === 'both' ? (mode === 'beast' ? 'duelist' : 'tamer') : b.kind;
      const lp = X.lpForLevel(b.lvl);
      const me = mode === 'beast' ? B.tamer(p.name, p.team, { bag: p.bag }) : B.duelist(p.name, p.deck, lp);
      let foe;
      if (kind === 'tamer') { foe = B.tamer(npc.name, this.mkTeam(b.team)); for (const x of foe.team) p.seen[x.sp] = 1; }
      else foe = B.duelist(npc.name, X.DECKS[b.deck], lp, { expLv: b.lvl });
      const label = mode === 'beast' ? (kind === 'tamer' ? '비스트 배틀' : '크로스 배틀') : kind === 'tamer' ? '크로스 배틀' : '듀얼';
      await X.Cine.vs({ name: p.name, look: 'hero' }, { name: npc.name, look: npc.look }, label);
      const res = await X.BattleUI.run({ sides: [me, foe], link: b.lvl, expSide: mode === 'beast' ? 0 : null, foeLook: npc.look, intro: `${X.josa(npc.name, '이/가')} 승부를 걸어왔다! 【${label}】`, bg: X.OW.map.bg || 'indoor' });
      await this.afterBattle(me);
      if (res.winner === 0) {
        const stt = (p.stats = p.stats || {});
        stt.wins = (stt.wins || 0) + 1; if (label === '크로스 배틀') stt.cross = (stt.cross || 0) + 1;
        stt[mode === 'beast' ? 'beastWins' : 'deckWins'] = (stt[mode === 'beast' ? 'beastWins' : 'deckWins'] || 0) + 1;
        if (opts.rematch) stt.rematch = (stt.rematch || 0) + 1;
        const first = !p.defeated[id];
        p.defeated[id] = 1;
        const gold = opts.rematch ? Math.floor(b.reward / 4) : b.reward;
        if (gold && (first || opts.rematch)) { p.gold += gold; sfx('get'); await this.say(`승리했다! 상금으로 ${gold}골드를 받았다.`); }
        if (b.pack && first) { const got = X.openPack(b.pack, this.holder()); for (const c of got) this.giveCard(c); await X.Menu.showCards(`${X.PACKS[b.pack].name}을(를) 받았다!`, got); }
        return 'win';
      }
      if (opts.noLoss) { this.healAll(); return 'lose'; }
      await this.whiteout();
      return 'lose';
    },
    // 야생 조우. 반환: 'captured' | 'win' | 'lose' | 'fled'
    async wildBattle(sp, lv, opts = {}) {
      const p = this.p, B = X.Battle;
      const mode = await this.pickMode(p.team.some((b) => b.hp > 0) ? 'beast' : null);
      if (!mode) return 'fled';
      const wild = X.makeBeast(sp, lv, this.holder());
      p.seen[sp] = 1;
      const me = mode === 'beast' ? B.tamer(p.name, p.team, { bag: p.bag }) : B.duelist(p.name, p.deck, X.lpForLevel(lv));
      const foe = B.tamer(wild.name, [wild], { wild: true });
      if (opts.legend) await X.Cine.vs({ name: p.name, look: 'hero' }, { name: wild.name, beast: sp }, '전설의 비스트');
      const res = await X.BattleUI.run({ sides: [me, foe], link: lv, wild: true, expSide: mode === 'beast' ? 0 : null, intro: `${opts.legend ? '전설의 비스트' : '야생의'} ${X.josa(wild.name, '이/가')} 나타났다!`, bg: X.OW.map.bg || 'field' });
      if (res.reason === 'capture') {
        wild.status = null; wild.slp = 0;
        const inTeam = this.addBeast(sp, lv, wild);
        await this.say(inTeam ? `${X.josa(wild.name, '이/가')} 동료가 되었다!` : `${X.josa(wild.name, '은/는')} 보관함으로 전송되었다.`);
      }
      await this.afterBattle(me);
      if (res.reason === 'capture') return 'captured';
      if (res.reason === 'fled') return 'fled';
      if (res.winner === 0) return 'win';
      await this.whiteout();
      return 'lose';
    },
    // 전투 후 처리: 기술 습득 선택, 진화
    async afterBattle(me) {
      const p = this.p;
      if (me.kind !== 'tamer') return;
      for (const b of p.team) { if (b.hp <= 0) { b.status = null; b.slp = 0; } }
      for (const L of me.learn) await X.Menu.learnMove(p.team[L.idx], L.move);
      for (const b of p.team) {
        while (b.hp > 0 && X.canEvolve(b)) {
          const old = b.name, oldSp = b.sp;
          const r = X.evolve(b);
          p.seen[b.sp] = 1; p.caught[b.sp] = 1;
          sfx('win');
          await X.Cine.evolve(oldSp, old, b);
          for (const m of r.news) { if (b.moves.length < 4) { b.moves.push({ id: m, pp: X.MOVES[m].pp }); await this.say(`${X.josa(b.name, '은/는')} ${X.josa(X.MOVES[m].name, '을/를')} 배웠다!`); } else await X.Menu.learnMove(b, m); }
        }
      }
    },
    // 배틀 타워: 연승할수록 강해지는 상대. 이길 때마다 BP를 얻는다.
    async tower() {
      const p = this.p, nm = '배틀 타워 접수원', stt = (p.stats = p.stats || {});
      for (;;) {
        const c = await this.choose(`배틀 타워에 어서 오세요! 최고 기록 ${stt.tower || 0}연승 · 보유 ${p.bp || 0} BP`, ['도전한다', 'BP 교환소', '설명을 듣는다', '그만둔다'], nm, 3);
        if (c === 3) return;
        if (c === 2) { await this.say(['타워에서는 층마다 무작위 상대가 나옵니다. 테이머일 수도, 듀얼리스트일 수도 있죠.', '층이 오를수록 상대가 강해지고, 매 층 승리 후 회복해 드립니다.', '이길 때마다 층수만큼 BP를 얻고, 지면 도전이 끝납니다. BP는 교환소에서 희귀한 도구와 카드로 바꿀 수 있어요.'], nm); continue; }
        if (c === 1) { await X.Menu.bpShop(); continue; }
        const top = Math.max(12, ...p.team.map((b) => b.lv)), h = this.holder(), rnd = () => X.rngNext(h);
        let floor = 0;
        for (;;) {
          floor++;
          this.healAll();
          const lvl = Math.min(70, top - 3 + floor), [npc, bt] = X.TOWER.make(this, floor, lvl, rnd);
          const r = await this.fight(npc, bt, { id: 'tower', noLoss: true, rematch: false });
          if (r !== 'win') { floor--; await this.say(`도전 종료! 이번 기록은 ${floor}연승입니다.`, nm); break; }
          p.bp = (p.bp || 0) + floor; stt.tower = Math.max(stt.tower || 0, floor);
          sfx('get');
          if ((await this.choose(`${floor}연승! ${floor} BP를 얻었습니다. (보유 ${p.bp} BP)`, ['다음 층으로', '여기서 그만둔다'], nm, 1)) !== 0) break;
        }
        this.healAll(); this.save();
      }
    },
    async whiteout() {
      const p = this.p, loss = Math.min(p.gold, Math.floor(p.gold * 0.1));
      p.gold -= loss;
      await this.say(['눈앞이 캄캄해졌다…', loss ? `정신을 차려 보니 링커 센터였다. (${loss}골드를 잃었다)` : '정신을 차려 보니 익숙한 곳이었다.']);
      this.healAll();
      await this.fade(true);
      X.OW.load(p.respawn.map, p.respawn.x, p.respawn.y, 'down');
      await this.fade(false);
    },
    async ending() {
      sfx('win');
      await this.say(['— 그날, 아르카 대륙에 새로운 챔피언이 탄생했다.', '비스트를 기르는 테이머이자, 덱을 다루는 듀얼리스트.', '서로 다른 규칙으로 싸우던 두 문화는, 한 사람의 여행을 통해 조금 더 가까워졌다.', '레온은 몰래 카드 팩을 샀고, 미라는 작은 비스트를 키우기 시작했다고 한다.'], null);
      await X.Cine.credits();
      await this.say('(모험은 계속된다. 잿빛 동굴 깊은 곳에서 무언가가 깨어났다…)', null);
    },
    openShop: (stock) => X.Menu.shop(stock),
    openCardShop: (stock) => X.Menu.cardShop(stock),
    openBox: () => X.Menu.box(),
    chooseStarter: (list) => X.Menu.starter(list),

    // ── 부팅 ──
    boot() {
      const stage = $('#stage');
      // 화면에 맞춰 960x600 스테이지를 확대/축소. 바깥 여백(안전 영역, 좌우 거터)은 CSS 패딩에서 읽는다.
      const fit = () => {
        const px = (el, k) => parseFloat(getComputedStyle(el)[k]) || 0, R = document.documentElement, B = document.body;
        const l = px(B, 'paddingLeft') + px(R, 'paddingLeft'), r = px(B, 'paddingRight') + px(R, 'paddingRight'), t = px(R, 'paddingTop') + px(B, 'paddingTop'), bt = px(R, 'paddingBottom') + px(B, 'paddingBottom');
        const w = innerWidth - l - r, h = innerHeight - t - bt, s = Math.min(w / 960, h / 600);
        stage.style.transform = `translate(${l + (w - 960 * s) / 2}px, ${t + (h - 600 * s) / 2}px) scale(${s})`;
      };
      addEventListener('resize', fit); fit();
      const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', z: 'a', Enter: 'a', ' ': 'a', x: 'b', Escape: 'b', Backspace: 'b' };
      const down = (k) => { if (['up', 'down', 'left', 'right'].includes(k)) { if (!G.held.includes(k)) G.held.push(k); G.key(k); } else G.key(k); };
      const up = (k) => { const i = G.held.indexOf(k); if (i >= 0) G.held.splice(i, 1); };
      addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) down(k); });
      addEventListener('keyup', (e) => { const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (k) up(k); });
      addEventListener('blur', () => (G.held.length = 0));
      // 터치 패드
      const touch = $('#touch');
      const showTouch = () => touch.classList.remove('hidden');
      if (matchMedia('(pointer: coarse)').matches) showTouch();
      addEventListener('touchstart', showTouch, { once: true, passive: true });
      for (const b of touch.querySelectorAll('button')) {
        const k = b.dataset.d || b.dataset.k;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(k); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => up(k));
      }
      $('#btn-menu').onclick = () => G.key('b');
      $('#dialog').addEventListener('pointerdown', () => G.key('a'));
      X.OW.init();
      X.Menu.title();
    },
    startWorld() {
      this.scene = 'world';
      $('#title').classList.add('hidden');
      X.OW.load(this.p.map, this.p.x, this.p.y, this.p.dir);
    },
  });

  // ── 대화창 ──
  const Dlg = {
    show(text, name, keep) {
      return new Promise((res) => {
        const box = $('#dialog'), tx = $('#dlg-text'), nm = $('#dlg-name');
        box.classList.remove('hidden');
        nm.textContent = name || ''; nm.style.display = name ? '' : 'none';
        const pt = $('#dlg-port'), lk = X.Cine.lookOf(name);
        if (lk) { const u = A0.portrait(lk); if (pt.dataset.u !== u) { pt.dataset.u = u; pt.src = u; pt.classList.remove('pop'); void pt.offsetWidth; pt.classList.add('pop'); } }
        pt.classList.toggle('hidden', !lk); box.classList.toggle('has-port', !!lk);
        $('#dlg-next').style.visibility = 'hidden';
        let i = 0, done = false;
        const fin = () => { done = true; tx.textContent = text; clearInterval(tm); $('#dlg-next').style.visibility = keep ? 'hidden' : 'visible'; if (keep) end(); };
        const tm = setInterval(() => { i += 2; tx.textContent = text.slice(0, i); if (i >= text.length) fin(); }, 16);
        const end = () => { G.popInput(h); res(); };
        const h = G.pushInput({ a: () => { if (!done) fin(); else if (!keep) { sfx('sel'); end(); } }, b: () => { if (!done) fin(); else if (!keep) end(); } });
      });
    },
    hide() { $('#dialog').classList.add('hidden'); $('#choices').classList.add('hidden'); },
    choices(options, cancelIdx) {
      return new Promise((res) => {
        const box = $('#choices');
        box.innerHTML = ''; box.classList.remove('hidden');
        let cur = 0;
        const items = options.map((o, i) => { const b = X.el('button', 'choice', o); b.onclick = () => pick(i); b.onmouseenter = () => { cur = i; paint(); }; box.appendChild(b); return b; });
        const paint = () => items.forEach((b, i) => b.classList.toggle('on', i === cur));
        const pick = (i) => { sfx('ok'); G.popInput(h); box.classList.add('hidden'); res(i); };
        const h = G.pushInput({ up: () => { cur = (cur + options.length - 1) % options.length; paint(); sfx('sel'); }, down: () => { cur = (cur + 1) % options.length; paint(); sfx('sel'); }, a: () => pick(cur), b: () => { if (cancelIdx != null) pick(cancelIdx); } });
        paint();
      });
    },
  };
  X.Dlg = Dlg;
})(typeof globalThis !== 'undefined' ? globalThis : this);
