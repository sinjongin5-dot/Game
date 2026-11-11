// 월드 데이터: 맵, NPC, 스토리 스크립트
// 스크립트는 async 함수이며 G(게임 API: say/choose/fight/give…)만 사용한다.
(function (root) {
  const X = root.XG;
  const MAPS = {};

  // ── 헬퍼 ──
  const talk = (id, x, y, look, name, lines, o) => Object.assign({ id, x, y, look, name, dir: 'down', script: (G) => G.say(lines, name) }, o);
  async function trainerScript(G, n) {
    if (G.p.defeated[n.id]) return G.say(n.after || '좋은 승부였어. 다음엔 지지 않아!', n.name);
    await G.say(n.pre, n.name);
    if ((await G.fight(n)) !== 'win') return;
    await G.say(n.post, n.name);
    if (n.onWin) await n.onWin(G, n);
  }
  const trainer = (id, x, y, dir, look, name, battle, pre, post, o) => Object.assign({ id, x, y, dir, look, name, battle, pre, post, sight: 3, script: trainerScript }, o);
  const tamer = (team, lvl, reward) => ({ kind: 'tamer', team, lvl, reward });
  const duelist = (deck, lvl, reward, o) => Object.assign({ kind: 'duelist', deck, lvl, reward }, o);
  const evoAt = (sp, lv) => { while (X.BEASTS[sp].evo && lv >= X.BEASTS[sp].evo[0]) sp = X.BEASTS[sp].evo[1]; return sp; };
  const COUNTER = { embercub: 'aquaring', aquaring: 'leafy', leafy: 'embercub' };
  const rivalStarter = (G, lv) => evoAt(COUNTER[G.p.starter || 'embercub'], lv);
  const thirdStarter = (G, lv) => evoAt(COUNTER[COUNTER[G.p.starter || 'embercub']], lv);

  // 실내 맵 생성: 벽으로 둘러싼 방 + 아래쪽 출구 매트
  function room(id, name, w, h, items, npcs, exit, o) {
    const rows = [];
    const fl = (o && o.floor) || 'o';
    for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += y === 0 || x === 0 || x === w - 1 || y === h - 1 ? 'x' : fl; rows.push(r.split('')); }
    const cx = Math.floor(w / 2);
    rows[h - 1][cx] = 'm';
    for (const [x, y, ch] of items) rows[y][x] = ch;
    MAPS[id] = { id, name, indoor: true, floor: fl, tiles: rows.map((r) => r.join('')), npcs, warps: [{ x: cx, y: h - 1, to: exit[0], tx: exit[1], ty: exit[2], dir: 'down' }], entry: [cx, h - 2] };
    return id;
  }
  const door = (x, y, to) => ({ x, y, to, door: true });
  const edge = (xs, ys, to, tx, ty, dir, gate) => { const out = []; for (const x of xs) for (const y of ys) out.push({ x, y, to, tx: tx == null ? x : tx, ty: ty == null ? y : ty, dir, gate }); return out; };

  function healRoom(id, town, ex, ey) {
    return room(id, '링커 센터', 9, 7, [[3, 2, 'c'], [4, 2, 'c'], [5, 2, 'c'], [1, 1, 'h'], [7, 1, 'p'], [6, 2, 'c'], [2, 2, 'c']], [
      { id: id + '_nurse', x: 4, y: 1, look: 'nurse', name: '센터 직원', dir: 'down', script: async (G) => {
        const c = await G.choose('어서 오세요, 링커 센터입니다. 무엇을 도와드릴까요?', ['비스트 회복', '비스트 보관함', '그만두기'], '센터 직원');
        if (c === 0) { G.healAll(); G.p.respawn = { map: town, x: ex, y: ey }; G.sfx('heal'); await G.say('비스트들이 모두 건강해졌어요! 덱도 새로 정돈해 드렸답니다.', '센터 직원'); }
        else if (c === 1) await G.openBox();
      } },
      talk(id + '_guest', 6, 4, 'kid', '손님', ['여기서 쉬면 비스트도 듀얼리스트도 기운이 난대.', '쓰러지면 마지막으로 들른 센터로 돌아오게 되니까, 새 마을에 오면 꼭 들러!']),
    ], [town, ex, ey]);
  }
  function martRoom(id, town, ex, ey, stock, extra) {
    return room(id, '상점', 9, 7, [[2, 2, 'c'], [3, 2, 'c'], [4, 2, 'c'], [5, 2, 'c'], [6, 2, 'c'], [1, 1, 'k'], [7, 1, 'k']], [
      { id: id + '_clerk', x: 3, y: 1, look: 'clerk', name: '점원', dir: 'down', script: async (G) => { await G.say('어서 오세요! 테이머 용품이라면 뭐든 있습니다.', '점원'); await G.openShop(stock); } },
    ].concat(extra || []), [town, ex, ey]);
  }

  // ═════════ 새싹 마을 ═════════
  MAPS.sprout = {
    id: 'sprout', name: '새싹 마을', bg: 'field',
    tiles: [
      'TTTTTTTTTTT==TTTTTTTTTTT',
      'T,.........==.........,T',
      'T..RRRR....==...BBBBB..T',
      'T..RRRR....==...BBBBB..T',
      'T..WDwW....==...WwDwW..T',
      'T...=......==.....=....T',
      'T...==================.T',
      'T..........==..........T',
      'T.,........==....GGGG..T',
      'T..........==....GGGG..T',
      'T..~~~.....==....WDwW..T',
      'T.~~~~~....========....T',
      'T..~~~.........,.......T',
      'T......S...............T',
      'T.,.................,..T',
      'TTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    signs: { '7,13': '새싹 마을 — 모든 모험이 싹트는 곳.' },
    warps: [door(4, 4, 'home'), door(18, 4, 'lab'), door(18, 10, 'leonhome'),
      ...edge([11, 12], [0], 'route1', null, 18, 'up', (G) => (G.p.team.length ? null : '비스트도 없이 풀숲에 나가는 건 위험해! 먼저 느티 박사님의 연구소에 들르자.'))],
    npcs: [
      talk('sp_girl', 8, 8, 'tamer_f', '마을 소녀', ['동쪽 마을들은 비스트와 함께 사는 테이머의 땅이야.', '북쪽 카드리아 시는 카드로 싸우는 듀얼리스트의 도시고.', '백 년 전 \'대융합\' 때 두 세계가 하나로 합쳐졌대. 신기하지?']),
      talk('sp_old', 14, 13, 'elder', '할아버지', ['테이머와 듀얼리스트는 오랫동안 서로를 이해하지 못했지.', '싸우는 방법이 전혀 다르니, 누가 더 강한지 겨룰 수조차 없었거든.', '그걸 바꾼 게 느티 박사의 \'크로스 링커\'란다.']),
    ],
  };
  room('home', '우리 집', 9, 7, [[1, 1, 'k'], [2, 1, 'k'], [7, 1, 'p'], [5, 3, 't'], [6, 3, 't']], [
    { id: 'mom', x: 3, y: 3, look: 'mom', name: '엄마', dir: 'down', script: async (G) => {
      if (!G.p.team.length) return G.say(['일어났구나! 느티 박사님이 연구소로 오라고 하셨어.', '드디어 네 첫 비스트를 받는 날이잖니. 어서 가 보렴!'], '엄마');
      G.healAll(); G.sfx('heal');
      await G.say(['어머, 우리 아이 왔구나. 따뜻한 수프 먹고 가렴.', '(비스트들이 모두 회복되었다!)'], '엄마');
    } },
  ], ['sprout', 4, 5]);
  room('lab', '느티 연구소', 11, 8, [[1, 1, 'k'], [2, 1, 'k'], [3, 1, 'k'], [8, 1, 'h'], [9, 1, 'k'], [2, 4, 't'], [8, 4, 't'], [9, 6, 'p']], [
    { id: 'prof', x: 5, y: 2, look: 'prof', name: '느티 박사', dir: 'down', script: async (G) => {
      if (G.p.team.length) {
        if (G.flag('emblem_wave') && !G.flag('prof_gift')) { G.setFlag('prof_gift'); G.give('supercap', 5); return G.say(['오오, 벌써 엠블럼을! 크로스 링커가 잘 작동하는 모양이구나.', '연구에 도움이 됐으니 이걸 가져가렴. (하이 캡슐 5개를 받았다!)'], '느티 박사'); }
        return G.say(['크로스 링커는 비스트의 힘과 카드의 힘을 같은 \'링크 레벨\'로 맞춰 주는 장치란다.', '덕분에 테이머와 듀얼리스트가 각자의 방식 그대로 겨룰 수 있지.', '네 여행이 두 문화를 잇는 다리가 되길 바란다!'], '느티 박사');
      }
      await G.say(['오, 왔구나! 기다리고 있었단다.', '이 아르카 대륙에는 두 가지 힘이 있지. 생명의 힘 \'비스트\', 그리고 봉인의 힘 \'카드\'.', '테이머는 비스트를 길러 싸우고, 듀얼리스트는 덱을 짜서 싸운단다.', '너에겐 둘 다 다룰 수 있는 희귀한 재능 — \'크로스 링커\'의 자질이 있어.', '자, 먼저 평생의 파트너가 될 비스트를 고르렴!'], '느티 박사');
      const sp = await G.chooseStarter(['embercub', 'aquaring', 'leafy']);
      G.p.starter = sp;
      G.addBeast(sp, 5);
      G.give('capsule', 5); G.give('potion', 3);
      G.sfx('get');
      await G.say([`${X.josa(X.BEASTS[sp].name, '을/를')} 골랐구나! 아주 좋은 선택이야.`, '링크 캡슐 5개와 회복약 3개, 그리고 이 \'크로스 링커\'를 주마.', '북쪽 카드리아 시에 가면 듀얼리스트들을 만날 수 있을 게다. 덱도 구해 보렴.', '대륙의 네 엠블럼을 모으면 크로스 시티의 \'크로스 리그\'에 도전할 수 있단다!'], '느티 박사');
      await G.say(['잠깐! 나도 방금 비스트를 받았다고.', '누가 더 잘 고른 건지, 지금 바로 확인해 보자!'], '레온');
      const r = await G.fight(MAPS.lab.npcs[1], null, { noLoss: true });
      await G.say(r === 'win' ? ['큭… 제법인데. 하지만 다음엔 안 져!', '난 테이머의 길로 리그 정상까지 갈 거야. 카드 같은 건 필요 없어!'] : ['봤지? 이게 테이머의 실력이야!', '분하면 강해져서 다시 덤벼. 난 먼저 간다!'], '레온');
      G.setFlag('leon1');
      G.healAll();
    } },
    { id: 'leon1', x: 7, y: 3, look: 'leon', name: '라이벌 레온', dir: 'left', show: (G) => !G.flag('leon1'), battle: { kind: 'tamer', team: (G) => [[rivalStarter(G, 5), 5]], lvl: 5, reward: 150 },
      script: (G) => G.say(G.p.team.length ? '…' : '박사님이 부르셨다며? 빨리 골라. 난 네가 고른 다음에 고를 거니까.', '레온') },
    talk('lab_aide', 2, 5, 'duelist_f', '연구원', ['저는 카드리아 출신 듀얼리스트예요. 박사님의 연구를 돕고 있죠.', '크로스 배틀에서는 비스트의 기술이 \'스트라이크\' 수치로 환산돼요.', '스트라이크가 몬스터의 ATK(수비 표시라면 DEF) 이상이면 파괴! 초과분은 LP 데미지가 되죠.', '반대로 카드 몬스터의 공격은 비스트의 HP를 깎고요. 속성 상성은 양쪽 모두에 적용된답니다.']),
  ], ['sprout', 18, 5]);
  room('leonhome', '레온의 집', 9, 7, [[1, 1, 'k'], [7, 1, 'p'], [4, 3, 't']], [
    { id: 'leonmom', x: 5, y: 2, look: 'mom', name: '레온 엄마', dir: 'down', script: async (G) => {
      if (G.flag('leonmom')) return G.say('레온 그 녀석, 듀얼리스트라면 질색을 하지만… 사실 어릴 땐 카드도 좋아했단다.', '레온 엄마');
      G.setFlag('leonmom'); G.give('potion', 2);
      await G.say(['어머, 레온의 친구구나. 우리 애랑 사이좋게 지내 주렴.', '이거 가져가. (회복약 2개를 받았다!)'], '레온 엄마');
    } },
  ], ['sprout', 18, 11]);

  // ═════════ 풀잎길 ═════════
  MAPS.route1 = {
    id: 'route1', name: '풀잎길', bg: 'field',
    tiles: [
      'TTTTTTTTTTT==TTTTTTTTTTT',
      'T:::.......==.......:::T',
      'T:::.......==.......:::T',
      'T:::..TT...==..........T',
      'T.....TT...==...TTT....T',
      'T..........==...TTT....T',
      'T....=========.........T',
      'T....==...........,....T',
      'T....==..::::::........T',
      'T....==..::::::...TT...T',
      'T....==..::::::...TT...T',
      'T....==................T',
      'T....==============....T',
      'T.,..............==....T',
      'T..TT....:::::...==....T',
      'T..TT....:::::...==....T',
      'T........:::::...==....T',
      'T..........=======.....T',
      'T..........==..........T',
      'TTTTTTTTTTT==TTTTTTTTTTT',
    ],
    enc: { rate: 0.13, list: [['squeako', 2, 4, 40], ['flitwing', 2, 4, 30], ['wriggle', 2, 4, 30]] },
    warps: [...edge([11, 12], [19], 'sprout', null, 1, 'down'), ...edge([11, 12], [0], 'cardia', null, 18, 'up')],
    npcs: [
      trainer('r1a', 16, 15, 'right', 'kid', '꼬마 테이머 민수', tamer([['squeako', 3], ['flitwing', 4]], 4, 120), '눈이 마주쳤으니 승부다! 테이머의 규칙이야!', '으아, 내 비스트들이…!'),
      trainer('r1b', 8, 10, 'left', 'tamer_f', '테이머 하나', tamer([['wriggle', 5], ['squeako', 5]], 5, 160), '풀숲에서 갓 잡은 아이들이야. 한번 볼래?', '아직 호흡이 안 맞았나 봐…', { sight: 2 }),
      trainer('r1c', 14, 3, 'left', 'duelist_m', '꼬마 듀얼리스트 태오', duelist('novice', 5, 200, { pack: 'pack1' }), ['어? 너 테이머야? 난 카드리아에서 온 듀얼리스트!', '그 팔찌… 크로스 링커잖아! 그럼 내 카드랑 네 비스트로 승부할 수 있겠네!'], ['와, 비스트는 HP가 있어서 한 방에 안 쓰러지는구나!', '재밌었어. 이 카드 팩 줄게!'], { sight: 2 }),
      talk('r1_tip', 3, 12, 'elder', '나그네', ['짙은 풀숲에서는 야생 비스트가 튀어나온다네.', '약하게 만든 다음 링크 캡슐을 던지면 동료로 만들 수 있지.', '상태이상에 걸린 비스트는 더 잘 잡힌다는 것도 기억해 두게.']),
    ],
  };

  // ═════════ 카드리아 시 ═════════
  MAPS.cardia = {
    id: 'cardia', name: '카드리아 시', bg: 'city',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T,........................,T',
      'T..BBBBBB....PPPPP...HHHH..T',
      'T..BBBBBB....PPPPP...HHHH..T',
      'T..BBBBBB....WwDwW...WDwW..T',
      'T..WwDDwW......=......=....T',
      'T....==........=......=....T',
      'T....=======================',
      'T....=======================',
      'T..........==..............T',
      'T..GGGG....==.....RRRR.....T',
      'T..GGGG....==.....RRRR.....T',
      'T..WDwW....==.....WwDW.....T',
      'T...=......==.......=......T',
      'T...=================......T',
      'T..........==..........S...T',
      'T.,........==..............T',
      'T..........==...........,..T',
      'T..........==..............T',
      'TTTTTTTTTTT==TTTTTTTTTTTTTTT',
    ],
    signs: { '23,15': '카드리아 시 — 덱에 혼을 담는 듀얼리스트의 도시.' },
    warps: [door(5, 5, 'cardia_hall'), door(6, 5, 'cardia_hall'), door(15, 4, 'cardia_cards'), door(22, 4, 'cardia_heal'), door(4, 12, 'cardia_mart'), door(20, 12, 'cardia_house'),
      ...edge([11, 12], [19], 'route1', null, 1, 'down'),
      ...edge([27], [7, 8], 'forest', 1, null, 'right', (G) => (G.flag('emblem_wave') ? null : '경비원: 속삭임 숲은 위험해. 듀얼 홀의 \'물결 엠블럼\'을 얻은 사람만 지나갈 수 있어!')).map((w) => Object.assign(w, { ty: w.y + 1 }))],
    npcs: [
      { id: 'mira0', x: 14, y: 16, look: 'mira', name: '미라', dir: 'left', sight: 3, show: (G) => !G.flag('deck'), battle: duelist('novice', 6, 250), script: async (G, n) => {
        await G.say(['잠깐, 거기 너! 그 팔찌는 크로스 링커?', '난 미라. 카드리아 최고의 듀얼리스트가 될 사람이야.', '테이머가 이 도시에 온 건 오랜만이네. …덱도 없이 왔어?', '좋아, 이건 내가 예전에 쓰던 덱이야. 너한테 줄게!'], '미라');
        G.giveDeck('starter'); G.setFlag('deck'); G.sfx('get');
        await G.say(['(스타터 덱 20장을 받았다! 메뉴의 \'덱\'에서 편집할 수 있다.)'], null);
        await G.say(['듀얼의 기본을 알려 줄게. 몬스터는 턴마다 1장 소환. 레벨 5 이상은 제물이 필요해.', '마법은 바로 발동, 함정은 세트해 두면 상대 턴에 발동할 수 있어.', '상대의 LP를 0으로 만들면 승리! 자, 그 덱으로 나와 듀얼이야!'], '미라');
        const r = await G.fight(n, null, { force: 'deck', noLoss: true });
        await G.say(r === 'win' ? ['…졌어. 처음치곤 제법이잖아?', '듀얼 홀의 세라 님은 나보다 훨씬 강해. 비스트로 도전해도, 덱으로 도전해도 받아 주실 거야.', '다음에 만나면 진짜 내 덱을 보여 줄게!'] : ['아직 멀었네. 하지만 감은 있어.', '카드 샵에서 팩을 사서 덱을 강화해 봐. 듀얼 홀의 세라 님께도 도전해 보고!'], '미라');
      } },
      talk('ca_guard', 25, 9, 'duelist_m', '경비원', ['동쪽은 속삭임 숲이야. 요즘 \'분리단\'이라는 수상한 녀석들이 드나든다는 소문이 있어.']),
      talk('ca_kid', 9, 15, 'kid', '소년', ['테이머랑 듀얼리스트가 싸우면 누가 이겨?', '아빠는 "그건 누가 더 자기 방식을 잘 아느냐에 달렸다"고 했어.']),
      talk('ca_lady', 17, 9, 'duelist_f', '듀얼리스트', ['비스트는 몬스터를 쓰러뜨리면 그 기세로 한 번 더 움직일 때가 있어. \'쾌속\'이라고 하지.', '스피드가 빠른 비스트 앞에 레벨 낮은 몬스터를 늘어놓는 건 위험하단 얘기야.']),
    ],
  };
  healRoom('cardia_heal', 'cardia', 22, 5);
  martRoom('cardia_mart', 'cardia', 4, 13, ['capsule', 'potion', 'cure']);
  room('cardia_cards', '카드 샵', 9, 7, [[2, 2, 'c'], [3, 2, 'c'], [4, 2, 'c'], [5, 2, 'c'], [6, 2, 'c'], [1, 1, 'k'], [7, 1, 'k'], [6, 4, 't']], [
    { id: 'cc_clerk', x: 4, y: 1, look: 'duelist_m', name: '카드 샵 주인', dir: 'down', script: async (G) => {
      if (!G.flag('deck')) return G.say('덱이 없으면 카드를 사도 쓸 수가 없지. 먼저 덱을 구해 오렴.', '카드 샵 주인');
      await G.say('어서 와! 새 카드가 들어왔어.', '카드 샵 주인');
      await G.openCardShop({ packs: ['pack1', 'pack2'], singles: ['steelsword', 'spring', 'lightbarrier', 'whelp', 'thornmail'] });
    } },
    talk('cc_fan', 6, 5, 'duelist_f', '카드 수집가', ['덱은 20장에서 30장. 같은 카드는 3장까지 넣을 수 있어.', '덱이 다 떨어지면 지니까, 너무 얇아도 문제야.']),
  ], ['cardia', 15, 5]);
  room('cardia_house', '카드리아 민가', 9, 7, [[1, 1, 'k'], [2, 1, 'k'], [7, 1, 'p'], [4, 3, 't']], [
    talk('ca_elder', 5, 2, 'elder', '은퇴한 듀얼 마스터', ['크로스 룰을 알고 싶은가? 핵심만 알려 주지.', '첫째, 테이머는 비스트가 전부 쓰러지면 패배. 듀얼리스트는 LP가 0이 되면 패배.', '둘째, 비스트의 기술은 \'스트라이크\'가 되어 몬스터의 ATK나 DEF와 겨룬다. 못 부숴도 충격으로 수치가 깎이지.', '셋째, 카드의 \'파괴\' 효과는 비스트에겐 큰 피해로, 효과 데미지는 선두 비스트의 HP 피해로 바뀐다.', '넷째, 독·마비·수면·화상은 비스트에게도 몬스터에게도 통한다. 서로의 규칙을 아는 자가 이기는 법이야.']),
  ], ['cardia', 20, 13]);
  room('cardia_hall', '카드리아 듀얼 홀', 11, 10, [[1, 1, 'z'], [9, 1, 'z'], [4, 1, 'k'], [6, 1, 'k']], [
    trainer('ch_t1', 3, 6, 'right', 'duelist_m', '견습 듀얼리스트 도윤', duelist('novice', 8, 300, { pack: 'pack1' }), '세라 님께 도전하려면 나부터 넘어야 해!', '크윽… 덱을 다시 짜야겠어.', { sight: 2 }),
    { id: 'sera', x: 5, y: 2, look: 'sera', name: '듀얼 마스터 세라', dir: 'down', battle: duelist('sera', 11, 900), script: async (G, n) => {
      if (G.flag('emblem_wave')) return G.say('물은 형태가 없기에 어떤 그릇에도 담기지. 크로스 링커인 너처럼 말이야.', n.name);
      await G.say(['어서 와요, 도전자. 나는 이 홀의 마스터, 세라.', '비스트든 덱이든, 당신의 방식으로 오세요. 나의 물의 덱이 모두 받아 줄 테니.'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      await G.say(['훌륭해요. 흐름을 읽는 눈이 있군요.', '약속대로 \'물결 엠블럼\'을 드리죠.'], n.name);
      await G.emblem('wave', '물결 엠블럼');
      G.giveCard('deepwarden', 1); G.giveCard('tome', 1);
      await G.say(['이 카드들도 가져가요. (심해 수호자, 지혜의 서를 받았다!)', '다음은 숲 너머 리파 마을의 테이머 도장이에요. 관장 가온은 풀의 달인이죠.'], n.name);
    } },
  ], ['cardia', 5, 6], { floor: 'e' });

  // ═════════ 속삭임 숲 ═════════
  MAPS.forest = {
    id: 'forest', name: '속삭임 숲', bg: 'forest',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTT::::....TTTT.....::::TTTT',
      'TT.::::....TTTT.....::::..TT',
      'T..::::..........TT.::::...T',
      'T........TT......TT........T',
      'T...TT...TT...........TT...T',
      'T...TT.......::::.....TT...T',
      'T............::::..........T',
      '======.......::::....=======',
      '======...TT..........=======',
      'T...==...TT..........==....T',
      'T...==========.......==....T',
      'T...........==..TT...==....T',
      'T.::::......==..TT...==....T',
      'T.::::......===========..,.T',
      'T.::::...TT.........::::...T',
      'TT.......TT.........::::..TT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    enc: { rate: 0.13, list: [['wriggle', 7, 9, 22], ['sparklet', 8, 11, 20], ['shadecat', 9, 11, 16], ['lilypad', 8, 10, 18], ['squeako', 8, 10, 16], ['mothra', 12, 13, 8]] },
    warps: [...edge([0], [8, 9], 'cardia', 26, null, 'left').map((w) => Object.assign(w, { ty: w.y - 1 })),
      ...edge([27], [8, 9], 'leafa', 1, null, 'right', (G) => (G.p.defeated.grunt1 ? null : '수상한 남자가 길을 막고 있다!')).map((w) => Object.assign(w, { ty: w.y - 1 }))],
    npcs: [
      trainer('f1', 8, 10, 'left', 'kid', '벌레잡이 소년 솔', tamer([['wriggle', 9], ['wriggle', 9], ['mothra', 12]], 10, 320), '숲의 벌레 비스트는 내가 제일 잘 알아!', '내 나비령이… 훌쩍.'),
      trainer('f2', 9, 13, 'right', 'duelist_f', '숲의 듀얼리스트 유나', duelist('forestduel', 12, 420, { pack: 'pack2' }), '숲의 고요함 속에서 덱을 다듬고 있었어. 한 판 어때?', '독과 포자의 덱… 아직 다듬을 게 많네.'),
      trainer('f3', 18, 12, 'right', 'tamer_m', '테이머 강현', tamer([['sparklet', 11], ['shadecat', 12]], 12, 400), '숲을 지나려면 통행료 대신 승부다!', '통행료는 내가 내야겠군…'),
      { id: 'grunt1', x: 23, y: 8, look: 'grunt', name: '분리단 단원', dir: 'left', sight: 3, show: (G) => !G.p.defeated.grunt1, battle: duelist('grunt', 13, 500, { pack: 'pack2' }), script: async (G, n) => {
        await G.say(['멈춰라! 여긴 우리 \'분리단\'이 조사 중이다.', '뭐? 크로스 링커? …그 장치가 문제란 말이다!', '비스트와 카드는 섞여선 안 돼. 두 세계는 다시 갈라져야 한다!'], n.name);
        if ((await G.fight(n)) !== 'win') return;
        await G.say(['이, 이럴 수가… 제로 님께 보고해야 해!', '(단원은 숲 너머로 달아났다.)'], n.name);
        G.refresh();
      } },
      talk('f_tip', 14, 4, 'tamer_f', '약초꾼', ['숲 깊은 곳에는 나비령이 산대. 날개 가루를 조심해.', '독에 걸린 카드 몬스터는 턴마다 ATK와 DEF가 200씩 깎인다더라. 비스트의 독 기술도 쓸모가 많다는 거지.']),
    ],
  };

  // ═════════ 리파 마을 ═════════
  MAPS.leafa = {
    id: 'leafa', name: '리파 마을', bg: 'field',
    tiles: [
      'TTTTTTTTTTT==TTTTTTTTTTT',
      'T,.........==.........,T',
      'T..GGGGG...==...HHHH...T',
      'T..GGGGG...==...HHHH...T',
      'T..WwDwW...==...WDwW...T',
      'T....=.....==....=.....T',
      'T....==============....T',
      '=============..........T',
      '=============..........T',
      'T..........==..........T',
      'T..RRRR....==...YYYY...T',
      'T..RRRR....==...YYYY...T',
      'T..WDwW....==...WDwW...T',
      'T...==============.....T',
      'T.,.................,..T',
      'TTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: [door(5, 4, 'leafa_gym'), door(17, 4, 'leafa_heal'), door(4, 12, 'leafa_house'), door(17, 12, 'leafa_mart'),
      ...edge([0], [7, 8], 'forest', 26, null, 'left').map((w) => Object.assign(w, { ty: w.y + 1 })),
      ...edge([11, 12], [0], 'coast', null, 18, 'up', (G) => (G.flag('emblem_leaf') ? null : '마을 사람: 해안길은 거친 비스트가 많아. 가온 관장님께 \'새잎 엠블럼\'을 받고 가렴.'))],
    npcs: [
      { id: 'leon2', x: 14, y: 2, look: 'leon', name: '라이벌 레온', dir: 'left', sight: 2, show: (G) => G.flag('emblem_leaf') && !G.p.defeated.leon2,
        battle: { kind: 'tamer', team: (G) => [['flitwing', 17], ['squeako', 17], [rivalStarter(G, 18), 18]], lvl: 18, reward: 700 }, script: async (G, n) => {
          await G.say(['여, 오랜만이다. 너도 엠블럼 두 개째냐?', '듣자 하니 카드까지 쓴다며? 테이머의 자존심도 없냐!', '좋아, 뭘 들고 오든 내 비스트들이 박살 내 주지!'], n.name);
          if ((await G.fight(n)) !== 'win') return;
          await G.say(['…졌다. 카드든 비스트든, 넌 진심으로 싸우는구나.', '쳇, 인정 못 해! 크로스 시티에서 다시 붙자!'], n.name);
          G.refresh();
        } },
      talk('le_girl', 8, 10, 'tamer_f', '마을 소녀', ['리파 마을은 테이머의 고향이야. 비스트와 함께 밭을 갈고, 함께 잠들지.', '듀얼리스트들은 비스트를 "살아있는 카드"라고 부른대. 실례지?']),
      talk('le_boy', 19, 8, 'kid', '소년', ['비스트는 레벨이 오르면 진화해! 스타터는 16, 그다음엔 32에 진화한대.']),
    ],
  };
  healRoom('leafa_heal', 'leafa', 17, 5);
  martRoom('leafa_mart', 'leafa', 17, 13, ['capsule', 'supercap', 'potion', 'hipotion', 'cure', 'revive'], [
    { id: 'le_card', x: 6, y: 4, look: 'duelist_m', name: '떠돌이 카드 상인', dir: 'left', script: async (G) => {
      if (!G.flag('deck')) return G.say('덱이 생기면 다시 오라고.', '떠돌이 카드 상인');
      await G.say('테이머 마을에서도 카드는 팔린다고. 구경해 봐.', '떠돌이 카드 상인');
      await G.openCardShop({ packs: ['pack1', 'pack2'], singles: ['miasma', 'squall', 'hex', 'irongolem', 'scout', 'mirrorwall'] });
    } },
  ]);
  room('leafa_house', '리파 민가', 9, 7, [[1, 1, 'k'], [7, 1, 'p'], [4, 3, 't']], [
    { id: 'le_gran', x: 5, y: 2, look: 'elder', name: '할머니', dir: 'down', script: async (G) => {
      if (G.flag('gran_gift')) return G.say(['해안 북쪽 모래톱에 번개 구름이 걸릴 때면, 전설의 새 \'뇌운조\'가 내려앉는단다.', '만나거든 하이 캡슐을 넉넉히 챙겨 가려무나.'], '할머니');
      G.setFlag('gran_gift'); G.addBeast('lumi', 14);
      await G.say(['젊은이, 비스트와 카드를 모두 아끼는 눈을 하고 있구먼.', '이 아이는 길 잃은 빛의 비스트란다. 자네가 데려가 주게.', '(루미가 동료가 되었다!)'], '할머니');
    } },
  ], ['leafa', 4, 13]);
  room('leafa_gym', '리파 테이머 도장', 11, 10, [[1, 1, 'p'], [9, 1, 'p'], [2, 4, 'p'], [8, 4, 'p']], [
    trainer('lg_t1', 7, 6, 'left', 'tamer_f', '도장 수련생 다래', tamer([['mothra', 15], ['lilypad', 15]], 15, 500), '관장님께 가려면 먼저 저를 이기세요!', '수련이 부족했네요…', { sight: 2 }),
    { id: 'gaon', x: 5, y: 2, look: 'gaon', name: '도장 관장 가온', dir: 'down', battle: tamer([['mothra', 16], ['lilypad', 16], ['leafron', 18]], 17, 1400), script: async (G, n) => {
      if (G.flag('emblem_leaf')) return G.say('비스트도 카드도, 결국 그걸 믿는 사람의 마음이 힘이 되는 거지.', n.name);
      await G.say(['허허, 크로스 링커라는 젊은이가 자네로군.', '나는 가온. 평생 풀의 비스트와 살아온 테이머일세.', '카드로 덤벼도 좋네. 내 비스트들은 종이 한 장에 쓰러지지 않으니!'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      await G.say(['허허허! 시원하게 졌구먼.', '\'새잎 엠블럼\'을 받게. 자네라면 두 세계의 다리가 될 수 있을 걸세.'], n.name);
      await G.emblem('leaf', '새잎 엠블럼');
      G.giveCard('worldtree', 1); G.give('hipotion', 3);
      await G.say(['이 카드는 옛 친구인 듀얼리스트가 맡긴 걸세. (세계수의 수호령, 고급 회복약 3개를 받았다!)', '북쪽 해안을 지나 잿빛 동굴을 넘으면 크로스 시티가 나온다네.'], n.name);
      G.refresh();
    } },
  ], ['leafa', 5, 5]);

  // ═════════ 물결 해안 ═════════
  MAPS.coast = {
    id: 'coast', name: '물결 해안', bg: 'coast',
    tiles: [
      '^^^^^^^^^^^C^^^^^^^^^^^^',
      '^^^^sssss.==.sssss^^^^^^',
      '^^sssssss.==.:::ssss^^^^',
      '~~ssssss..==.:::..sss~~~',
      '~~~sss....==.:::...ss~~~',
      '~~~~......==.........~~~',
      '~~~~..TT..==...TT....~~~',
      '~~~...TT..==...TT.....~~',
      '~~~.......==..........~~',
      '~~..::::..==..........~~',
      '~~..::::..=====...ss..~~',
      '~~~.::::.....==..ssss.~~',
      '~~~~.........==.sssss~~~',
      '~~~~~........==..sss~~~~',
      '~~~~~~.......==....~~~~~',
      'T~~~~~..::::.==....~~~~T',
      'TT.~~...::::.==.....~~TT',
      'TT......::::.==.......TT',
      'TT.........===........TT',
      'TTTTTTTTTTT==TTTTTTTTTTT',
    ],
    enc: { rate: 0.13, list: [['finlet', 15, 18, 24], ['lilypad', 15, 17, 16], ['flitwing', 16, 18, 14], ['pebblit', 15, 18, 18], ['grizzle', 17, 19, 12], ['lumi', 16, 18, 8], ['sparklet', 16, 18, 8]] },
    warps: [...edge([11, 12], [19], 'leafa', null, 1, 'down'), { x: 11, y: 0, to: 'cave', tx: 11, ty: 16, dir: 'up' }],
    npcs: [
      trainer('c1', 7, 8, 'right', 'fisher', '낚시꾼 만복', tamer([['finlet', 17], ['finlet', 17], ['lilypad', 18]], 18, 600), '오늘은 입질이 없어 심심하던 참이야. 한 판 하자고!', '허허, 월척은 자네였구먼.'),
      trainer('c2', 16, 14, 'left', 'duelist_m', '불꽃 듀얼리스트 화랑', duelist('fire', 20, 750, { pack: 'pack2' }), '바닷바람에도 꺼지지 않는 내 불의 덱을 봐라!', '내 불꽃이… 꺼졌다…', { sight: 2 }),
      trainer('c3', 13, 6, 'left', 'tamer_f', '등산가 보라', tamer([['pebblit', 19], ['grizzle', 20]], 20, 700), '동굴에 가기 전에 몸 좀 풀까!', '이 정도면 동굴도 문제없겠네.', { sight: 2 }),
      { id: 'mira2', x: 8, y: 2, look: 'mira', name: '미라', dir: 'right', sight: 2, show: (G) => !G.p.defeated.mira2, battle: duelist('mira2', 22, 1000), script: async (G, n) => {
        await G.say(['어머, 또 만났네. 엠블럼은 잘 모으고 있어?', '난 그동안 진짜 덱을 완성했어. 바람과 번개의 속공 덱!', '네 비스트든 덱이든, 전부 상대해 줄게!'], n.name);
        if ((await G.fight(n)) !== 'win') return;
        G.giveCard('twindancer', 1);
        await G.say(['…또 졌네. 넌 정말 이상한 애야. 테이머이면서 듀얼리스트라니.', '이 카드 가져가. (쌍검 무희를 받았다!) 크로스 시티에서 다시 겨루자!'], n.name);
        G.refresh();
      } },
      { id: 'stormwing', x: 17, y: 1, look: null, beast: 'stormwing', name: '뇌운조', dir: 'down', show: (G) => !G.flag('stormwing'), script: async (G) => {
        await X.Cine.shock();
        await G.say('키이이잉—! (전설의 비스트 뇌운조가 날개를 펼쳤다!)', null);
        const r = await G.wildBattle('stormwing', 30, { legend: true });
        if (r === 'captured' || r === 'win') { G.setFlag('stormwing'); G.refresh(); }
      } },
      talk('c_tip', 18, 10, 'fisher', '늙은 어부', ['북쪽 바위틈이 잿빛 동굴 입구라네.', '요즘 검은 옷 입은 녀석들이 드나들던데… 조심하게.']),
    ],
  };

  // ═════════ 잿빛 동굴 ═════════
  MAPS.cave = {
    id: 'cave', name: '잿빛 동굴', bg: 'cave',
    tiles: [
      '###########__###########',
      '#___;;;;____________;;_#',
      '#___;;;;______###___;;_#',
      '#_____________###______#',
      '#__###_________________#',
      '#__###______;;;;___##__#',
      '#___________;;;;___##__#',
      '#_____##____;;;;_______#',
      '#_____##_______________#',
      '#__;;;________###______#',
      '#__;;;________###___;;;#',
      '#__;;;______________;;;#',
      '#______##___________;;;#',
      '#______##______________#',
      '#___________;;;________#',
      '#__##_______;;;____##__#',
      '#__##______________##__#',
      '###########__###########',
    ],
    enc: { rate: 0.12, list: [['charcoal', 22, 25, 24], ['pebblit', 21, 24, 20], ['molekin', 22, 26, 22], ['shadecat', 22, 25, 16], ['sparklet', 22, 24, 10], ['craggon', 26, 27, 8]] },
    warps: [...edge([11, 12], [17], 'coast', 11, 1, 'down'),
      ...edge([11, 12], [0], 'crosscity', null, 18, 'up', (G) => (G.p.defeated.admin ? null : '분리단 간부가 출구를 막고 있다!')).map((w) => Object.assign(w, { tx: w.x + 3 }))],
    npcs: [
      trainer('v1', 9, 13, 'right', 'grunt', '분리단 단원', tamer([['shadecat', 23], ['molekin', 24]], 24, 800), '여기서부터는 분리단의 구역이다! 돌아가라!', '칫… 비스트만으론 부족했나.', { sight: 4 }),
      trainer('v2', 17, 8, 'left', 'grunt', '분리단 단원', duelist('admin', 25, 850, { pack: 'pack2' }), '세계는 갈라져야 순수해진다! 내 덱이 그걸 증명하지!', '순수한 덱이… 섞인 녀석에게 지다니.', { sight: 4 }),
      { id: 'admin', x: 11, y: 2, look: 'admin', name: '분리단 간부 벡스', dir: 'down', sight: 4, show: (G) => !G.p.defeated.admin, battle: tamer([['charcoal', 24], ['molekin', 25], ['nightpard', 26]], 26, 1500), script: async (G, n) => {
        await G.say(['네가 소문의 크로스 링커로군. 우리 단원들을 귀찮게 했다지?', '대융합은 재앙이었다. 테이머는 테이머끼리, 듀얼리스트는 듀얼리스트끼리 사는 게 옳아.', '제로 님이 크로스 리그에서 그걸 증명하실 거다. 넌 여기서 끝이고!'], n.name);
        if ((await G.fight(n)) !== 'win') return;
        G.give('revive', 2);
        await G.say(['크윽… 섞인 힘이 이 정도라고…?', '상관없다. 리그의 결승에서 제로 님이 모든 걸 끝내실 테니.', '(벡스는 어둠 속으로 사라졌다. 기력의 조각 2개를 주웠다!)'], n.name);
        G.refresh();
      } },
      { id: 'arcalon', x: 21, y: 3, look: null, beast: 'arcalon', name: '아르카론', dir: 'down', show: (G) => G.flag('champion') && !G.flag('arcalon'), script: async (G) => {
        await G.say(['……(빛과 어둠이 뒤섞인 비스트가 조용히 이쪽을 바라본다.)', '(대융합의 날 태어났다는 전설의 존재, 아르카론이다!)'], null);
        await X.Cine.shock();
        const r = await G.wildBattle('arcalon', 50, { legend: true });
        if (r === 'captured' || r === 'win') { G.setFlag('arcalon'); G.refresh(); }
      } },
    ],
  };

  // ═════════ 크로스 시티 ═════════
  MAPS.crosscity = {
    id: 'crosscity', name: '크로스 시티', bg: 'city',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T..........YYYYYYYY..........T',
      'T..........YYYYYYYY..........T',
      'T..........YYYYYYYY..........T',
      'T..........WwwDDwwW..........T',
      'T.,...........==...........,.T',
      'T..RRRRR......==......PPPPP..T',
      'T..RRRRR......==......PPPPP..T',
      'T..WwDwW......==......WwDwW..T',
      'T....=........==........=....T',
      'T....====================....T',
      'T.............==.............T',
      'T..HHHH.......==.......GGGG..T',
      'T..HHHH.......==.......GGGG..T',
      'T..WDwW.......==.......WDwW..T',
      'T...=.........==........=....T',
      'T...======================...T',
      'T.............==.............T',
      'T.,...........==...........,.T',
      'TTTTTTTTTTTTTT==TTTTTTTTTTTTTT',
    ],
    warps: [door(5, 8, 'cross_gym'), door(24, 8, 'cross_hall'), door(4, 14, 'cross_heal'), door(24, 14, 'cross_mart'),
      Object.assign(door(14, 4, 'arena'), { gate: (G) => (G.p.emblems.length >= 4 ? null : `접수원: 크로스 리그는 엠블럼 4개를 모은 사람만 입장할 수 있습니다. (현재 ${G.p.emblems.length}개)`) }),
      Object.assign(door(15, 4, 'arena'), { gate: (G) => (G.p.emblems.length >= 4 ? null : `접수원: 크로스 리그는 엠블럼 4개를 모은 사람만 입장할 수 있습니다. (현재 ${G.p.emblems.length}개)`) }),
      ...edge([14, 15], [19], 'cave', null, 1, 'down').map((w) => Object.assign(w, { tx: w.x - 3 }))],
    npcs: [
      talk('cc_a', 10, 11, 'tamer_m', '테이머', ['크로스 시티는 테이머와 듀얼리스트가 함께 사는 유일한 도시야.', '서쪽은 테이머 도장, 동쪽은 듀얼 홀. 두 엠블럼을 다 따야 리그에 나갈 수 있지.']),
      talk('cc_b', 19, 11, 'duelist_f', '듀얼리스트', ['챔피언 아리아 님은 상대가 고른 것의 "반대 방식"으로 싸우신대.', '비스트로 도전하면 덱으로, 덱으로 도전하면 비스트로. 그게 크로스 리그의 전통이래.']),
      talk('cc_c', 13, 6, 'kid', '소년', ['리그 경기장은 저 금빛 지붕 건물이야! 나도 크면 나갈 거야!']),
    ],
  };
  healRoom('cross_heal', 'crosscity', 4, 15);
  martRoom('cross_mart', 'crosscity', 24, 15, ['capsule', 'supercap', 'potion', 'hipotion', 'cure', 'revive'], [
    { id: 'cm_card', x: 6, y: 4, look: 'duelist_f', name: '카드 딜러', dir: 'left', script: async (G) => {
      if (!G.flag('deck')) return G.say('덱이 생기면 다시 오세요.', '카드 딜러');
      await G.say('대륙 최고의 카드만 취급합니다.', '카드 딜러');
      await G.openCardShop({ packs: ['pack2', 'pack3'], singles: ['smite', 'rebirth', 'tome', 'warbanner', 'stunsnare', 'holylancer', 'earthtitan', 'voltrix', 'leviar', 'lumiel'] });
    } },
  ]);
  room('cross_gym', '크로스 시티 테이머 도장', 11, 10, [[1, 1, 'z'], [9, 1, 'z'], [2, 5, 'p'], [8, 5, 'p']], [
    trainer('xg_t1', 3, 6, 'right', 'tamer_m', '도장 수련생 철민', tamer([['charcoal', 29], ['craggon', 30]], 30, 1100), '무진 관장님의 불꽃을 보려면 나부터다!', '뜨거운 승부였다…!', { sight: 2 }),
    { id: 'mujin', x: 5, y: 2, look: 'mujin', name: '도장 관장 무진', dir: 'down', battle: tamer([['craggon', 32], ['flarehound', 32], ['magmaros', 34]], 33, 2400), script: async (G, n) => {
      if (G.flag('emblem_magma')) return G.say('불은 대지를 만나 용암이 된다. 섞인다는 건, 약해지는 게 아니다.', n.name);
      await G.say(['왔는가, 크로스 링커. 나는 무진. 불과 대지의 테이머다.', '분리단 놈들은 섞이는 걸 두려워하지. 하지만 내 비스트를 봐라.', '불과 대지가 섞여 용암이 되었다! 자, 네 힘을 보여라!'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      await G.say(['훌륭하다! 온몸이 끓어오르는 승부였다.', '\'용암 엠블럼\'을 가져가라!'], n.name);
      await G.emblem('magma', '용암 엠블럼');
      G.giveCard('ignis', 1);
      await G.say('(염제 이그니스를 받았다!)', null);
    } },
  ], ['crosscity', 5, 9]);
  room('cross_hall', '크로스 시티 듀얼 홀', 11, 10, [[1, 1, 'z'], [9, 1, 'z'], [4, 1, 'k'], [6, 1, 'k']], [
    trainer('xh_t1', 7, 6, 'left', 'duelist_f', '엘리트 듀얼리스트 서린', duelist('elite', 30, 1100, { pack: 'pack3' }), '노아 님의 어둠에 닿기 전에, 내 바람부터 넘어 봐.', '바람이 멎었네…', { sight: 2 }),
    { id: 'noah', x: 5, y: 2, look: 'noah', name: '듀얼 마스터 노아', dir: 'down', battle: duelist('dark', 34, 2400), script: async (G, n) => {
      if (G.flag('emblem_shadow')) return G.say('어둠은 빛이 있어야 존재한다. 테이머와 듀얼리스트도 그런 사이일지 모르지.', n.name);
      await G.say(['…왔군. 나는 노아. 어둠의 덱을 다루는 자.', '함정, 리버스, 파괴. 듀얼의 진짜 무서움을 가르쳐 주마.', '비스트로 오든 덱으로 오든, 어둠은 평등하다.'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      await G.say(['……훌륭하다. 어둠 속에서도 길을 잃지 않는군.', '\'그림자 엠블럼\'을 주지.'], n.name);
      await G.emblem('shadow', '그림자 엠블럼');
      G.giveCard('nox', 1);
      await G.say('(명왕 녹스를 받았다!)', null);
    } },
  ], ['crosscity', 24, 9], { floor: 'e' });

  // ═════════ 크로스 아레나 (리그) ═════════
  room('arena', '크로스 아레나', 13, 11, [[1, 1, 'z'], [11, 1, 'z'], [1, 8, 'c'], [2, 8, 'c'], [5, 1, 'k'], [7, 1, 'k']], [
    { id: 'ar_nurse', x: 1, y: 9, look: 'nurse', name: '리그 의무관', dir: 'up', script: async (G) => { G.healAll(); G.sfx('heal'); await G.say('경기 전에 컨디션을 회복해 드렸습니다!', '리그 의무관'); } },
    { id: 'leon3', x: 3, y: 5, look: 'leon', name: '라이벌 레온', dir: 'right', battle: { kind: 'tamer', team: (G) => [['stormhawk', 37], ['gnawlord', 37], ['voltragon', 37], [rivalStarter(G, 38), 38]], lvl: 38, reward: 2500 }, script: async (G, n) => {
      if (G.p.defeated.leon3) return G.say('…나도 카드, 다시 해 볼까. 아, 아무것도 아니야!', n.name);
      await G.say(['준결승 상대는 나다. 여기까지 올 줄 알았어.', '난 끝까지 테이머로 싸운다. 그게 내 방식이니까!', '전력으로 와라, 라이벌!'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      await G.say(['하… 완패다. 방식이 달라도 강한 건 강한 거구나.', '가라. 결승에서 지면 가만 안 둬!'], n.name);
    } },
    { id: 'mira3', x: 9, y: 5, look: 'mira', name: '미라', dir: 'left', battle: duelist('mira3', 38, 2500), script: async (G, n) => {
      if (G.p.defeated.mira3) return G.say('있지, 나도 비스트 한 마리 키워 볼까 봐. …웃지 마!', n.name);
      await G.say(['또 다른 준결승은 나야. 약속대로 다시 만났네.', '이번 덱은 내 전부를 담았어. 카드리아의 긍지를 걸고!'], n.name);
      if ((await G.fight(n)) !== 'win') return;
      G.giveCard('lumiel', 1);
      await G.say(['…역시 넌 대단해. 듀얼리스트로서도, 테이머로서도.', '이 카드, 결승에서 써 줘. (천사장 루미엘을 받았다!)'], n.name);
    } },
    { id: 'aria', x: 6, y: 2, look: 'aria', name: '챔피언 아리아', dir: 'down',
      battle: { kind: 'both', team: (G) => [['seraphin', 42], ['magmaros', 42], ['lotusprite', 42], ['nightpard', 43], [thirdStarter(G, 44), 44]], deck: 'champion', lvl: 44, reward: 6000 }, script: async (G, n) => {
        if (G.flag('champion')) {
          const c = await G.choose('다시 한번 겨뤄 보겠나, 챔피언?', ['도전한다', '그만둔다'], n.name);
          if (c === 0) { G.healAll(); if ((await G.fight(n, null, { rematch: true })) === 'win') await G.say('역시 그대는 진짜다. 언제든 다시 오게.', n.name); }
          return;
        }
        if (!G.p.defeated.leon3 || !G.p.defeated.mira3) return G.say(['크로스 리그에 온 걸 환영하네, 도전자.', '결승은 준결승의 두 사람 — 레온과 미라를 모두 이긴 뒤일세.'], n.name);
        if (!G.p.defeated.zero2) {
          if (!G.flag('zero_seen')) {
            G.setFlag('zero_seen');
            await G.say(['드디어 결승이군. 그대와 겨룰 날을—', '…음? 누구냐!'], n.name);
            G.refresh();
            await X.Cine.shock();
            await G.say(['결승은 취소다. 이 리그 자체가 오늘로 끝이니까.', '나는 제로. 분리단을 이끄는 자.', '나 또한 너와 같은 크로스 링커였다. 두 힘을 다 가졌기에, 어느 쪽에도 속하지 못했지.', '섞인 세계는 누군가를 반드시 외톨이로 만든다. 그러니 내가 갈라놓겠다!'], '제로');
          } else await G.say('아직 서 있었나. 몇 번이든 상대해 주마.', '제로');
          const zero = MAPS.arena.npcs.find((x) => x.id === 'zero');
          if (!G.p.defeated.zero1) {
            await G.say('먼저 카드의 힘으로!', '제로');
            if ((await G.fight(zero, duelist('zero', 40, 0), { id: 'zero1' })) !== 'win') return;
            G.healAll();
            await G.say(['…제법이군. (아리아가 재빨리 그대의 비스트와 덱을 회복시켜 주었다!)'], '제로');
          }
          await G.say('이번엔 비스트의 힘으로! 양쪽 모두에서 널 꺾어야 의미가 있다!', '제로');
          if ((await G.fight(zero, tamer([['nightpard', 40], ['seraphin', 40], ['wavelord', 40], ['voltragon', 41]], 40, 4000), { id: 'zero2' })) !== 'win') return;
          await G.say(['……졌다. 카드로도, 비스트로도.', '너는 두 힘을 가지고도 외톨이가 아니구나. 라이벌이 있고, 동료가 있고.', '…내가 틀렸던 건, 세계가 아니라 나 자신이었나.', '(제로는 크로스 링커를 내려놓고 조용히 아레나를 떠났다.)'], '제로');
          G.healAll(); G.refresh();
          await G.say(['…고맙네. 리그를, 아니 이 대륙을 지켜 주었군.', '자, 방해꾼은 사라졌다. 컨디션은 회복시켜 두었네.', '준비가 되면 다시 말을 걸게. 진짜 결승을 시작하지!'], n.name);
          return;
        }
        await G.say(['나는 챔피언 아리아. 테이머이자 듀얼리스트.', '크로스 리그 결승의 전통을 알고 있겠지?', '그대가 비스트를 고르면 나는 덱으로, 덱을 고르면 나는 비스트로 맞서겠네.', '서로 다른 규칙으로 싸울 수 있다는 것 — 그것이 이 세계의 자랑이니까!'], n.name);
        if ((await G.fight(n)) !== 'win') return;
        G.setFlag('champion');
        G.giveCard('arcadragon', 1);
        await G.say(['……아름다운 승부였네.', '오늘부터 그대가 크로스 리그의 챔피언일세!', '이 카드를 받게. 대융합의 날 태어난 용, \'차원룡 아르카\'라네.'], n.name);
        await G.ending();
      } },
    { id: 'zero', x: 6, y: 5, look: 'zero', name: '제로', dir: 'up', show: (G) => G.flag('zero_seen') && !G.p.defeated.zero2, script: (G) => G.say('…챔피언에게 말을 걸어라. 승부는 그 앞에서다.', '제로') },
  ], ['crosscity', 14, 5], { floor: 'a' });

  // 문(door) 워프 보정: 실내 맵의 입구 좌표로 연결
  for (const m of Object.values(MAPS)) {
    for (const w of m.warps) if (w.door) { const t = MAPS[w.to]; w.tx = t.entry[0]; w.ty = t.entry[1]; w.dir = 'up'; }
    const W = Math.max(...m.tiles.map((r) => r.length));
    m.tiles.forEach((r, i) => { if (r.length !== W) console.warn('맵 행 길이 불일치', m.id, i, r.length, W); });
    m.w = W; m.h = m.tiles.length;
  }

  X.WORLD = { maps: MAPS, start: { map: 'home', x: 4, y: 4, dir: 'down' } };
  X.BLOCK = 'T~^#fSRBPGYHWwxcthkpz';
  X.QUEST = function (G) {
    const p = G.p;
    if (!p.team.length) return '느티 연구소에서 첫 비스트를 받자.';
    if (!G.flag('deck')) return '북쪽 풀잎길을 지나 카드리아 시로 가자.';
    if (!G.flag('emblem_wave')) return '카드리아 듀얼 홀의 마스터 세라에게 도전하자.';
    if (!p.defeated.grunt1) return '동쪽 속삭임 숲을 지나 리파 마을로 가자.';
    if (!G.flag('emblem_leaf')) return '리파 테이머 도장의 관장 가온에게 도전하자.';
    if (!p.defeated.admin) return '북쪽 물결 해안을 지나 잿빛 동굴을 돌파하자.';
    if (p.emblems.length < 4) return '크로스 시티의 테이머 도장과 듀얼 홀에서 엠블럼을 얻자.';
    if (!G.flag('champion')) return '크로스 아레나에서 리그를 제패하자!';
    if (!G.flag('arcalon')) return '잿빛 동굴 깊은 곳에 전설의 비스트가 나타났다는 소문이…';
    return '대륙의 챔피언! 도감과 카드 컬렉션을 완성해 보자.';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
