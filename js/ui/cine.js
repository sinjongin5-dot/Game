// 컷씬·연출: 레터박스, 대화 초상화, 대결 전 VS 화면, 오프닝, 엠블럼 수여, 진화, 엔딩 크레딧
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, el = X.el;
  const $ = (s) => document.querySelector(s);
  const wait = X.wait;
  let names = null;

  // 화면 전체를 덮는 연출 레이어. A/클릭으로 넘길 수 있는 Promise를 돌려준다.
  function layer(cls, html) {
    const c = $('#cine');
    c.className = cls; c.innerHTML = html; c.classList.remove('hidden');
    return c;
  }
  function close() { const c = $('#cine'); c.className = 'hidden'; c.innerHTML = ''; }
  // 누를 때까지(또는 ms 경과까지) 기다린다
  function press(ms) {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; G.popInput(h); $('#cine').onclick = null; clearTimeout(t); res(); };
      const h = G.pushInput({ a: fin, b: fin });
      $('#cine').onclick = fin;
      const t = ms ? setTimeout(fin, ms) : 0;
    });
  }
  // 타자기 자막
  async function caption(text) {
    const e = $('#cine .cap');
    if (!e) return;
    e.textContent = '';
    let skip = false;
    const h = G.pushInput({ a: () => (skip = true), b: () => (skip = true) });
    $('#cine').onclick = () => (skip = true);
    for (let i = 0; i <= text.length && !skip; i += 2) { e.textContent = text.slice(0, i); await wait(22); }
    e.textContent = text;
    G.popInput(h);
    await wait(120);
    await press(5200);
  }
  const spr = (id, cls) => `<img class="${cls || ''}" src="${A.beastUrl(id)}">`;
  const por = (look, cls) => `<img class="${cls || ''}" src="${A.portrait(look)}">`;

  const Cine = (X.Cine = {
    // 말하는 사람 이름 -> 캐릭터 외형 (대화 초상화용)
    lookOf(name) {
      if (!name) return null;
      if (!names) {
        names = { 레온: 'leon', 미라: 'mira', 제로: 'zero' };
        for (const m of Object.values(X.WORLD.maps)) for (const n of m.npcs) if (n.look && n.name && !names[n.name]) names[n.name] = n.look;
      }
      if (G.p && name === G.p.name) return 'hero';
      return names[name] || null;
    },
    bars(on) { $('#stage').classList.toggle('letterbox', !!on); },
    // 충격 연출: 흰 섬광 + 화면 흔들림
    async shock() {
      G.sfx('faint');
      const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      X.OW.shake = 26;
      await wait(650);
    },

    // 대결 전 VS 화면
    async vs(me, foe, label) {
      G.sfx('ok');
      const side = (o, cls) => `<div class="vs-side ${cls}"><div class="vs-bg"></div>${o.beast ? spr(o.beast, 'vs-por beast') : por(o.look || 'kid', 'vs-por')}<div class="vs-name">${o.name}</div></div>`;
      layer('vs', `${side(me, 'l')}${side(foe, 'r')}<div class="vs-slash"></div><div class="vs-mark">VS</div><div class="vs-label">${label}</div>`);
      await wait(520); G.sfx('hit');
      await press(1500);
      $('#cine').classList.add('out');
      await wait(260);
      close();
    },

    // 오프닝: 네 장의 그림과 자막
    async intro(name) {
      const beasts = ['embercub', 'aquaring', 'leafy', 'flitwing', 'sparklet'].map((b, i) => spr(b, 'ib' + i)).join('');
      const cards = ['whelp', 'fireball', 'windblade', 'mirrorwall', 'lampmonk'].map((c, i) => X.cardHTML(c, `style="--i:${i}"`)).join('');
      const scenes = [
        [`<div class="in-s s1"><div class="half l"><div class="glow"></div>${beasts}</div><div class="half r"><div class="glow"></div><div class="fan">${cards}</div></div><div class="seam"></div></div>`, '아르카 대륙 — 백 년 전, 생명의 세계와 봉인의 세계가 하나로 합쳐졌다. 사람들은 그날을 \'대융합\'이라 부른다.'],
        [`<div class="in-s s2"><div class="duo l">${por('tamer_m', 'p')}${spr('flarehound', 'b')}</div><div class="q">?</div><div class="duo r">${por('duelist_f', 'p')}<div class="c">${X.cardHTML('nightblade')}</div></div></div>`, '비스트와 함께 사는 테이머, 카드에 혼을 담는 듀얼리스트. 싸우는 방식이 전혀 다른 두 문화는 서로를 이해하지 못했다.'],
        [`<div class="in-s s3"><div class="ring"><i></i><i></i><i></i></div>${spr('lumi', 'lb')}<div class="lc">${X.cardHTML('holylancer')}</div><div class="beam b1"></div><div class="beam b2"></div></div>`, '그러던 어느 날, 한 연구자가 두 힘을 같은 무대에 올리는 장치를 만들어 냈다. 그 이름은 — 크로스 링커.'],
        [`<div class="in-s s4"><div class="sun"></div><div class="hill h1"></div><div class="hill h2"></div><div class="house"></div>${por('hero', 'hero')}</div>`, `그리고 오늘. 새싹 마을의 ${name}에게, 연구소에서 한 통의 연락이 온다…`],
      ];
      layer('intro', `<div class="in-stage"></div><div class="cap"></div><button class="in-skip">건너뛰기 ▶▶</button>`);
      let skipped = false;
      $('#cine .in-skip').onclick = (e) => { e.stopPropagation(); skipped = true; G.key('a'); };
      for (const [html, text] of scenes) {
        if (skipped) break;
        $('#cine .in-stage').innerHTML = html;
        await caption(text);
        if (skipped) break;
        $('#cine .in-stage').firstChild.classList.add('out');
        await wait(320);
      }
      $('#cine').classList.add('out');
      await wait(400);
      close();
    },

    // 엠블럼 수여
    async emblem(name, color, count) {
      G.sfx('win');
      layer('embc', `<div class="rays"></div><div class="emb-gem" style="--c:${color}"><i></i></div><div class="emb-t1">엠블럼 획득!</div><div class="emb-t2">${name}</div><div class="emb-dots">${[0, 1, 2, 3].map((i) => `<b class="${i < count ? 'on' : ''}"></b>`).join('')}</div>`);
      await wait(900);
      await press(6000);
      close();
    },

    // 진화: 실루엣이 번갈아 깜빡이다 빛과 함께 새 모습으로
    async evolve(oldSp, oldName, b) {
      layer('evo2', `<div class="rays"></div><div class="evo-box"><img class="o" src="${A.beastUrl(oldSp)}"><img class="n" src="${A.beastUrl(b.sp)}"></div><div class="evo-t">…어라? ${oldName}의 모습이…!</div>`);
      G.sfx('heal');
      await wait(2300);
      G.sfx('win');
      $('#cine').classList.add('done');
      $('#cine .evo-t').innerHTML = `축하합니다! ${X.josa(oldName, '은/는')} <b>${X.josa(X.BEASTS[b.sp].name, '으로/로')}</b> 진화했다!`;
      await wait(500);
      await press(8000);
      close();
    },

    // 엔딩 크레딧
    async credits() {
      const all = Object.keys(X.BEASTS).filter((k) => G.p.caught[k]);
      const parade = (all.length ? all : ['embercub', 'aquaring', 'leafy']).map((k, i) => `<img src="${A.beastUrl(k)}" style="animation-delay:${i * 0.12}s">`).join('');
      const lines = ['크로스링크', '', '— 테이머와 듀얼리스트의 대륙 —', '', `챔피언  ${G.p.name}`, '', '라이벌  레온 · 미라', '듀얼 마스터  세라 · 노아', '도장 관장  가온 · 무진', '챔피언  아리아', '그리고  제로', '', `함께한 비스트 ${all.length}종`, `모은 카드 ${Object.keys(G.p.cards).filter((k) => G.p.cards[k] > 0).length}종`, '', '서로 다른 규칙으로 싸울 수 있다는 것,', '그것이 이 세계의 자랑이다.', '', '플레이해 주셔서 감사합니다!'];
      layer('credits', `<div class="rays"></div><div class="cr-roll">${lines.map((l, i) => `<div class="${i === 0 ? 'big' : ''}">${l || '&nbsp;'}</div>`).join('')}</div><div class="cr-parade">${parade}</div>`);
      await wait(1500);
      await press(17000);
      $('#cine').classList.add('out');
      await wait(400);
      close();
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
