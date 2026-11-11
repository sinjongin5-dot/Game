// 메뉴/오버레이: 타이틀, 메인 메뉴(비스트·덱·가방·정보), 상점, 보관함, 스타터 선택 등
(function (root) {
  const X = root.XG, G = X.G, A = X.Art;
  const $ = (s) => document.querySelector(s);
  const chip = (t) => `<span class="chip" style="background:${X.TYPES[t].color}">${X.TYPES[t].name}</span>`;
  const hpBar = (b) => { const p = (b.hp / b.maxhp) * 100; return `<div class="hpbar"><div class="hpfill ${p > 50 ? 'g' : p > 20 ? 'y' : 'r'}" style="width:${p}%"></div></div>`; };
  const EMBLEMS = { wave: ['물결', '#3c8df0'], leaf: ['새잎', '#4fb84a'], magma: ['용암', '#f0672e'], shadow: ['그림자', '#7a5aa8'] };
  const SINGLE_PRICE = { 1: 300, 2: 700, 3: 1600, 4: 5000 };

  // 오버레이 모달. render()가 HTML을 돌려주고, acts[data-act](dataset)가 클릭을 처리한다. close(value)로 닫는다.
  function modal(render, acts, opts = {}) {
    return new Promise((res) => {
      const ov = $('#overlay'), box = X.el('div', 'ov ' + (opts.cls || ''));
      ov.appendChild(box); ov.classList.remove('hidden');
      const api = {
        box, paint() { box.innerHTML = render(api); },
        close(v) { G.popInput(h); box.remove(); if (!ov.children.length) ov.classList.add('hidden'); res(v); },
      };
      const h = G.pushInput({ b: () => { if (!opts.noCancel) { G.sfx('sel'); api.close(null); } }, a: () => { if (opts.onA) opts.onA(api); } });
      box.onclick = (e) => { const t = e.target.closest('[data-act]'); if (t && !t.disabled && acts[t.dataset.act]) { G.sfx('sel'); acts[t.dataset.act](t.dataset, api); } };
      if (opts.hover) box.onmouseover = (e) => { const t = e.target.closest('[data-hover]'); if (t) opts.hover(t.dataset, api); };
      api.paint();
    });
  }

  const beastRow = (b, k, act, extra, dis) => `<button class="trow" data-act="${act}" data-i="${k}" ${dis ? 'disabled' : ''}><img src="${A.beastUrl(b.sp)}"><div><b>${b.name}</b> Lv.${b.lv} ${b.status ? `<span class="st st-${b.status}">${X.STATUS[b.status]}</span>` : ''}${b.hp <= 0 ? '<span class="st st-ko">기절</span>' : ''}${extra || ''}${hpBar(b)}<small>HP ${b.hp}/${b.maxhp}</small></div></button>`;
  function beastDetail(b) {
    const sp = X.BEASTS[b.sp], need = X.expFor(b.lv + 1) - X.expFor(b.lv), have = b.exp - X.expFor(b.lv);
    return `<div class="bd"><div class="bd-top"><img class="bd-spr" src="${A.beastUrl(b.sp)}"><div><div class="bd-name">${b.name} <span class="lv">Lv.${b.lv}</span></div><div>${sp.types.map(chip).join(' ')}</div><div class="bd-desc">${sp.desc}</div></div></div>
      <div class="bd-stats"><span>HP <b>${b.hp}/${b.maxhp}</b></span><span>공격 <b>${b.atk}</b></span><span>방어 <b>${b.def}</b></span><span>스피드 <b>${b.spd}</b></span></div>
      <div class="xpbar"><div style="width:${Math.min(100, (have / need) * 100)}%"></div></div><small>다음 레벨까지 ${Math.max(0, need - have)} EXP${sp.evo ? ` · Lv.${sp.evo[0]}에 진화` : ''}</small>
      <div class="bd-moves">${b.moves.map((m) => { const mv = X.MOVES[m.id]; return `<div class="mvrow" style="--tc:${X.TYPES[mv.type].color}"><b>${mv.name}</b><span>${X.TYPES[mv.type].name} · ${mv.pow ? '위력 ' + mv.pow : '변화'} · 명중 ${mv.acc}</span><span>PP ${m.pp}/${mv.pp}</span></div>`; }).join('')}</div></div>`;
  }

  const Menu = (X.Menu = {
    // ── 타이틀 ──
    title() {
      G.scene = 'title';
      const t = $('#title'), save = G.loadSave();
      const show = ['infernox', 'tidedrake', 'forestar', 'stormwing'].map((id) => `<img src="${A.beastUrl(id)}">`).join('');
      const cards = ['ignis', 'smite', 'lumiel', 'mirrorwall', 'nox'].map((id) => X.cardHTML(id)).join('');
      t.classList.remove('hidden');
      t.innerHTML = `<div class="t-art"><div class="t-beasts">${show}</div><div class="t-vs">×</div><div class="t-cards">${cards}</div></div>
        <div class="t-logo">CROSS<span>LINK</span></div><div class="t-sub">크로스링크 — 테이머와 듀얼리스트의 대륙</div>
        <div class="t-menu">${save ? '<button class="btn big" data-act="cont">이어하기</button>' : ''}<button class="btn big" data-act="new">새 게임</button><button class="btn" data-act="free">자유 대전</button><button class="btn" data-act="help">조작법</button></div>
        <div class="t-foot">비스트 룰 × 카드 룰 — 서로 다른 규칙으로 맞붙는 크로스 배틀 RPG</div>`;
      t.onclick = async (e) => {
        const a = e.target.closest('[data-act]'); if (!a) return;
        G.sfx('ok');
        if (a.dataset.act === 'cont') { G.p = Object.assign(G.newPlayer('하루'), save); G.startWorld(); }
        else if (a.dataset.act === 'new') this.newGame(!!save);
        else if (a.dataset.act === 'free') this.freeBattle();
        else this.help();
      };
    },
    async newGame(hasSave) {
      if (hasSave) { const c = await G.choose('저장된 데이터가 있다. 새로 시작하면 덮어쓰게 된다.', ['새로 시작한다', '취소'], null, 1); if (c !== 0) return; }
      const name = await modal(() => `<div class="mtitle">이름을 알려 주세요</div><input id="nm" maxlength="6" value="하루" autocomplete="off"><button class="btn big" data-act="ok">결정</button>`, { ok: (d, m) => m.close(($('#nm').value || '하루').trim().slice(0, 6) || '하루') }, { cls: 'small', noCancel: true });
      G.p = G.newPlayer(name);
      await G.fade(true);
      $('#title').classList.add('hidden');
      await G.fade(false);
      await X.Cine.intro(name);
      await G.fade(true);
      G.startWorld();
      await G.fade(false);
      G.run(() => G.say(['(이동: 방향키/WASD · 대화·조사: Z/Enter · 메뉴: X/Esc — 터치 화면에서는 십자 패드와 A·B 버튼)'], null));
    },
    help() {
      return modal(() => `<div class="mtitle">조작법</div><div class="rules"><p><b>이동</b> 방향키 / WASD (터치: 화면의 십자 패드)</p><p><b>대화·조사·확인</b> Z / Enter / Space (터치: A)</p><p><b>메뉴·취소</b> X / Esc (터치: B)</p><p><b>전투</b> 버튼과 카드를 클릭(탭)해 진행합니다. 메시지는 Z 또는 A로 넘길 수 있습니다.</p><p>NPC에게 승부를 걸면 <b>비스트</b>로 싸울지 <b>덱</b>으로 싸울지 고를 수 있습니다. 상대가 테이머든 듀얼리스트든 상관없이!</p></div><button class="btn" data-act="x">닫기</button>`, { x: (d, m) => m.close() });
    },
    // 자유 대전: 스토리와 무관하게 네 가지 대진을 바로 체험
    async freeBattle() {
      const TIER = [
        { n: '초급 (Lv.9)', lv: 9, team: [['embercub', 9], ['flitwing', 8], ['aquaring', 9]], foe: [['leafy', 9], ['sparklet', 8], ['squeako', 9]], deck: 'starter', fdeck: 'mira1' },
        { n: '중급 (Lv.24)', lv: 24, team: [['flarehound', 24], ['stormhawk', 23], ['aqualune', 24]], foe: [['leafron', 24], ['voltragon', 23], ['craggon', 24]], deck: 'mira2', fdeck: 'water' },
        { n: '상급 (Lv.42)', lv: 42, team: [['infernox', 43], ['tidedrake', 42], ['forestar', 42], ['voltragon', 41]], foe: [['seraphin', 42], ['magmaros', 42], ['nightpard', 42], ['lotusprite', 42]], deck: 'mira3', fdeck: 'dark' },
      ];
      const me = await G.choose('자유 대전 — 나는 어느 쪽으로 싸울까?', ['테이머 (비스트)', '듀얼리스트 (덱)', '돌아가기'], null, 2);
      if (me === 2) return;
      const foe = await G.choose('상대는?', ['테이머 (비스트)', '듀얼리스트 (덱)'], null);
      const ti = await G.choose('난이도는?', TIER.map((t) => t.n), null);
      const T = TIER[ti], h = { seed: (Math.random() * 2 ** 31) | 0 }, B = X.Battle, lp = X.lpForLevel(T.lv);
      const mk = (l) => l.map(([sp, lv]) => X.makeBeast(sp, lv, h));
      const s0 = me === 0 ? B.tamer('나', mk(T.team), { bag: { potion: 2, cure: 1 } }) : B.duelist('나', X.DECKS[T.deck], lp);
      const s1 = foe === 0 ? B.tamer('상대 테이머', mk(T.foe)) : B.duelist('상대 듀얼리스트', X.DECKS[T.fdeck], lp);
      $('#title').classList.add('hidden');
      await X.BattleUI.run({ sides: [s0, s1], link: T.lv, foeLook: foe === 0 ? 'tamer_m' : 'duelist_f', intro: '자유 대전 개시!', bg: ['field', 'coast', 'cave'][ti] });
      this.title();
    },

    // ── 메인 메뉴 ──
    open(tab) {
      const p = G.p;
      let cur = tab || 'team', sel = 0, cardSel = null, useItem = null;
      const tabs = [['team', '비스트'], ['deck', '덱'], ['bag', '가방'], ['info', '링커'], ['save', '저장'], ['close', '닫기']];
      const body = () => {
        if (cur === 'team') {
          if (!p.team.length) return '<div class="hint">아직 비스트가 없다.</div>';
          sel = Math.min(sel, p.team.length - 1);
          return `<div class="split"><div class="tlist">${useItem ? `<div class="hint">${X.ITEMS[useItem].name}을(를) 누구에게 쓸까? <button class="btn sm" data-act="nouse">취소</button></div>` : ''}${p.team.map((b, k) => beastRow(b, k, 'bsel', k === sel ? ' <i>◀</i>' : '')).join('')}</div><div>${beastDetail(p.team[sel])}<div class="cd-btns">${sel > 0 ? '<button class="btn" data-act="lead">선두로 보내기</button>' : '<span class="cd-note">선두 비스트 (전투에 먼저 나간다)</span>'}</div></div></div>`;
        }
        if (cur === 'deck') {
          if (!G.flag('deck')) return '<div class="hint">아직 덱이 없다. 카드리아 시에서 구할 수 있다고 한다.</div>';
          const inDeck = {}; for (const id of p.deck) inDeck[id] = (inDeck[id] || 0) + 1;
          const order = (a, b) => { const A1 = X.CARDS[a], B1 = X.CARDS[b], k = { mon: 0, spell: 1, trap: 2 }; return k[A1.kind] - k[B1.kind] || (B1.lv || 0) - (A1.lv || 0) || (B1.atk || 0) - (A1.atk || 0) || A1.name.localeCompare(B1.name); };
          const own = Object.keys(p.cards).filter((id) => p.cards[id] > 0).sort(order);
          const ok = p.deck.length >= X.DECK_MIN;
          return `<div class="deck-ed"><div class="col"><h3>보유 카드 <small>클릭: 덱에 넣기</small></h3><div class="cgrid">${own.map((id) => X.cardHTML(id, `data-act="add" data-id="${id}" data-hover="${id}"`, `<span class="cnt${(inDeck[id] || 0) >= Math.min(p.cards[id], X.COPY_MAX) ? ' full' : ''}">${inDeck[id] || 0}/${p.cards[id]}</span>`)).join('')}</div></div>
            <div class="col narrow"><h3>덱 <b class="${ok ? 'up' : 'dn'}">${p.deck.length}</b>/${X.DECK_MAX}장 <small>클릭: 빼기</small></h3><div class="dlist">${Object.keys(inDeck).sort(order).map((id) => `<button class="drow k-${X.CARDS[id].kind}" data-act="rem" data-id="${id}" data-hover="${id}"><span>${X.CARDS[id].name}</span><b>×${inDeck[id]}</b></button>`).join('')}</div>${ok ? '' : `<div class="cd-note dn">덱은 최소 ${X.DECK_MIN}장이어야 듀얼할 수 있다!</div>`}</div>
            <div class="col det" id="deck-det">${cardSel ? X.cardDetail(cardSel) : '<div class="hint">카드에 마우스를 올리거나 클릭하면 상세 정보가 표시된다.</div>'}</div></div>`;
        }
        if (cur === 'bag') {
          const ids = Object.keys(p.bag).filter((k) => p.bag[k] > 0);
          return `<div class="gold">소지금 ${p.gold} G</div><div class="tlist">${ids.length ? ids.map((k) => `<button class="trow" data-act="use" data-id="${k}"><div><b>${X.ITEMS[k].name}</b> ×${p.bag[k]}<br><small>${X.ITEMS[k].desc}</small></div></button>`).join('') : '<div class="hint">가방이 비어 있다.</div>'}</div>`;
        }
        if (cur === 'info') {
          const all = Object.keys(X.BEASTS), seen = all.filter((k) => p.seen[k]).length, caught = all.filter((k) => p.caught[k]).length;
          const cAll = Object.keys(X.CARDS).length, cOwn = Object.keys(p.cards).filter((k) => p.cards[k] > 0).length;
          const mins = Math.floor(p.time / 60000);
          return `<div class="info"><div class="quest">▶ ${X.QUEST(G)}</div>
            <div class="irow"><b>${p.name}</b> · ${p.gold} G · 플레이 ${Math.floor(mins / 60)}시간 ${mins % 60}분</div>
            <div class="emblems">${Object.entries(EMBLEMS).map(([k, [n, c]]) => `<div class="emb${p.emblems.includes(k) ? ' on' : ''}" style="--c:${c}"><i></i>${n}</div>`).join('')}</div>
            <div class="irow">비스트 도감: 발견 ${seen} / 포획 ${caught} / 전체 ${all.length} · 카드 컬렉션: ${cOwn} / ${cAll}종</div>
            <div class="dex">${all.map((k) => `<div class="dx${p.caught[k] ? ' c' : p.seen[k] ? ' s' : ''}" title="${p.seen[k] ? X.BEASTS[k].name : '???'}"><img src="${A.beastUrl(k)}"><small>${p.seen[k] ? X.BEASTS[k].name : '???'}</small></div>`).join('')}</div>
            <div class="cd-btns"><button class="btn" data-act="mute">효과음: ${G.mute ? '꺼짐' : '켜짐'}</button><button class="btn" data-act="help">조작법</button><button class="btn" data-act="totitle">타이틀로</button></div></div>`;
        }
        return '';
      };
      return modal(() => `<div class="menu"><div class="tabs">${tabs.map(([k, n]) => `<button class="tab${k === cur ? ' on' : ''}" data-act="tab" data-id="${k}">${n}</button>`).join('')}</div><div class="mbody">${body()}</div></div>`, {
        tab: (d, m) => {
          if (d.id === 'close') return m.close();
          if (d.id === 'save') { G.toast(G.save() ? '저장했다!' : '저장할 수 없는 환경이다.'); return; }
          cur = d.id; useItem = null; m.paint();
        },
        bsel: (d, m) => {
          const k = +d.i;
          if (useItem) {
            const it = X.ITEMS[useItem], b = p.team[k];
            const ok = it.heal ? b.hp > 0 && b.hp < b.maxhp : it.cure ? b.hp > 0 && b.status : it.revive ? b.hp <= 0 : false;
            if (!ok) { G.toast('효과가 없다.'); return; }
            p.bag[useItem]--;
            if (it.heal) b.hp = Math.min(b.maxhp, b.hp + it.heal); if (it.cure) { b.status = null; b.slp = 0; } if (it.revive) b.hp = Math.floor(b.maxhp / 2);
            G.sfx('heal'); G.toast(`${it.name}을(를) 사용했다.`);
            if (!p.bag[useItem]) useItem = null;
          }
          sel = k; m.paint();
        },
        nouse: (d, m) => { useItem = null; m.paint(); },
        lead: (d, m) => { const b = p.team.splice(sel, 1)[0]; p.team.unshift(b); sel = 0; m.paint(); },
        add: (d, m) => {
          const n = p.deck.filter((x) => x === d.id).length;
          cardSel = d.id;
          if (p.deck.length >= X.DECK_MAX) G.toast(`덱은 최대 ${X.DECK_MAX}장.`);
          else if (n >= Math.min(p.cards[d.id], X.COPY_MAX)) G.toast(n >= X.COPY_MAX ? `같은 카드는 ${X.COPY_MAX}장까지.` : '더 가진 카드가 없다.');
          else p.deck.push(d.id);
          keepScroll(m);
        },
        rem: (d, m) => { const i = p.deck.indexOf(d.id); if (i >= 0) p.deck.splice(i, 1); cardSel = d.id; keepScroll(m); },
        use: (d, m) => { const it = X.ITEMS[d.id]; if (it.ball) { G.toast('야생 비스트와의 전투 중에만 쓸 수 있다.'); return; } useItem = d.id; cur = 'team'; m.paint(); },
        mute: (d, m) => { G.mute = !G.mute; m.paint(); },
        help: () => this.help(),
        totitle: async (d, m) => { G.save(); m.close(); await G.fade(true); this.title(); await G.fade(false); },
      }, { cls: 'full', hover: (d) => { if (cur === 'deck' && cardSel !== d.hover) { cardSel = d.hover; const e = $('#deck-det'); if (e) e.innerHTML = X.cardDetail(cardSel); } } }).then(() => G.save());
      function keepScroll(m) { const a = m.box.querySelector('.cgrid'), b = m.box.querySelector('.dlist'), sa = a && a.scrollTop, sb = b && b.scrollTop; m.paint(); const a2 = m.box.querySelector('.cgrid'), b2 = m.box.querySelector('.dlist'); if (a2) a2.scrollTop = sa; if (b2) b2.scrollTop = sb; }
    },

    // ── 상점 ──
    shop(stock) {
      const p = G.p;
      return modal(() => `<div class="mtitle">상점 <span class="gold">${p.gold} G</span></div><div class="tlist">${stock.map((k) => { const it = X.ITEMS[k]; return `<button class="trow" data-act="buy" data-id="${k}" ${p.gold < it.price ? 'disabled' : ''}><div><b>${it.name}</b> <span class="price">${it.price} G</span> <small>(보유 ${p.bag[k] || 0})</small><br><small>${it.desc}</small></div></button>`; }).join('')}</div><button class="btn" data-act="x">나가기</button>`, {
        buy: (d, m) => { const it = X.ITEMS[d.id]; if (p.gold < it.price) return; p.gold -= it.price; G.give(d.id); G.sfx('get'); m.paint(); },
        x: (d, m) => m.close(),
      }, { cls: 'mid' });
    },
    cardShop(stock) {
      const p = G.p;
      let det = null;
      return modal(() => `<div class="mtitle">카드 샵 <span class="gold">${p.gold} G</span></div><div class="split"><div class="tlist">
        ${stock.packs.map((k) => { const pk = X.PACKS[k]; return `<button class="trow pack" data-act="pack" data-id="${k}" ${p.gold < pk.price ? 'disabled' : ''}><div><b>${pk.name}</b> <span class="price">${pk.price} G</span><br><small>${pk.desc}</small></div></button>`; }).join('')}
        ${stock.singles.map((k) => { const c = X.CARDS[k], pr = SINGLE_PRICE[c.tier]; return `<button class="trow" data-act="single" data-id="${k}" data-hover="${k}" ${p.gold < pr ? 'disabled' : ''}><img src="${A.cardUrl(k)}"><div><b>${c.name}</b> <span class="price">${pr} G</span> <small>(보유 ${p.cards[k] || 0})</small></div></button>`; }).join('')}
        </div><div id="shop-det">${det ? X.cardDetail(det) : '<div class="hint">팩에서는 무작위 카드 3장이 나온다. 단품 카드에 마우스를 올리면 상세 정보가 보인다.</div>'}</div></div><button class="btn" data-act="x">나가기</button>`, {
        pack: async (d, m) => { const pk = X.PACKS[d.id]; if (p.gold < pk.price) return; p.gold -= pk.price; const got = X.openPack(d.id, G.holder()); for (const c of got) G.giveCard(c); G.sfx('get'); m.paint(); await this.showCards(`${pk.name} 개봉!`, got); },
        single: (d, m) => { const pr = SINGLE_PRICE[X.CARDS[d.id].tier]; if (p.gold < pr) return; p.gold -= pr; G.giveCard(d.id); det = d.id; G.sfx('get'); m.paint(); },
        x: (d, m) => m.close(),
      }, { cls: 'wide', hover: (d) => { det = d.hover; const e = $('#shop-det'); if (e) e.innerHTML = X.cardDetail(det); } });
    },
    showCards(title, ids) {
      return modal(() => `<div class="mtitle">${title}</div><div class="reveal">${ids.map((id) => `<div class="rv">${X.cardHTML(id)}<small>${X.CARDS[id].text || (X.CARDS[id].kind === 'mon' ? 'ATK ' + X.CARDS[id].atk + ' / DEF ' + X.CARDS[id].def : '')}</small></div>`).join('')}</div><button class="btn big" data-act="x">확인</button>`, { x: (d, m) => m.close() }, { cls: 'mid', onA: (m) => m.close() });
    },
    showEvolution(old, b) {
      return modal(() => `<div class="evo"><img src="${A.beastUrl(b.sp)}"><div class="mtitle">축하합니다! ${old}${X.josa(old, '은/는').slice(old.length)} ${X.josa(X.BEASTS[b.sp].name, '으로/로')} 진화했다!</div><div>${X.BEASTS[b.sp].types.map(chip).join(' ')}</div><div class="bd-desc">${X.BEASTS[b.sp].desc}</div><button class="btn big" data-act="x">확인</button></div>`, { x: (d, m) => m.close() }, { cls: 'small', onA: (m) => m.close() });
    },
    async learnMove(b, moveId) {
      const mv = X.MOVES[moveId];
      const row = (m, k) => `<button class="move" data-act="pick" data-i="${k}" style="--tc:${X.TYPES[m.type].color}"><b>${m.name}</b><span>${X.TYPES[m.type].name} · ${m.pow ? '위력 ' + m.pow : '변화'} · 명중 ${m.acc}</span></button>`;
      const r = await modal(() => `<div class="mtitle">${X.josa(b.name, '은/는')} 「${mv.name}」을(를) 배우고 싶어 한다!</div><div class="hint">하지만 기술은 4개까지. 잊게 할 기술을 고르자.</div><div class="moves col1">${b.moves.map((m, k) => row(X.MOVES[m.id], k)).join('')}</div><div class="hint">새 기술 ↓</div><div class="moves col1">${row(mv, -1).replace('data-act="pick"', 'data-act="none" disabled')}</div><button class="btn" data-act="skip">배우지 않는다</button>`, { pick: (d, m) => m.close(+d.i), skip: (d, m) => m.close(-1) }, { cls: 'mid', noCancel: true });
      if (r >= 0) { const old = X.MOVES[b.moves[r].id].name; b.moves[r] = { id: moveId, pp: mv.pp }; await G.say(`${X.josa(b.name, '은/는')} ${X.josa(old, '을/를')} 잊고 ${X.josa(mv.name, '을/를')} 배웠다!`); }
    },
    starter(list) {
      let sel = null;
      return modal(() => `<div class="mtitle">파트너를 고르자</div><div class="starters">${list.map((id) => { const s = X.BEASTS[id]; return `<button class="starter${sel === id ? ' on' : ''}" data-act="sel" data-id="${id}"><img src="${A.beastUrl(id)}"><b>${s.name}</b>${s.types.map(chip).join('')}<small>${s.desc}</small></button>`; }).join('')}</div><button class="btn big" data-act="ok" ${sel ? '' : 'disabled'}>${sel ? X.josa(X.BEASTS[sel].name, '으로/로') + ' 결정!' : '비스트를 선택'}</button>`, { sel: (d, m) => { sel = d.id; m.paint(); }, ok: (d, m) => sel && m.close(sel) }, { cls: 'wide', noCancel: true });
    },
    box() {
      const p = G.p;
      return modal(() => `<div class="mtitle">비스트 보관함</div><div class="split"><div><h3>동행 (${p.team.length}/6) <small>클릭: 맡기기</small></h3><div class="tlist">${p.team.map((b, k) => beastRow(b, k, 'dep', '', p.team.length <= 1)).join('')}</div></div><div><h3>보관함 (${p.box.length}) <small>클릭: 데려가기</small></h3><div class="tlist">${p.box.length ? p.box.map((b, k) => beastRow(b, k, 'wd', '', p.team.length >= 6)).join('') : '<div class="hint">보관함이 비어 있다.</div>'}</div></div></div><button class="btn" data-act="x">닫기</button>`, {
        dep: (d, m) => { if (p.team.length <= 1) return; const b = p.team.splice(+d.i, 1)[0]; X.healBeast(b); p.box.push(b); m.paint(); },
        wd: (d, m) => { if (p.team.length >= 6) return; p.team.push(p.box.splice(+d.i, 1)[0]); m.paint(); },
        x: (d, m) => m.close(),
      }, { cls: 'wide' });
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
