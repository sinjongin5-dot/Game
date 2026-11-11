// 속성 상성 · 기술 · 비스트(테이머 문화권) 데이터
(function (root) {
  const X = root.XG;

  // 비스트와 카드 몬스터가 공유하는 9속성. 두 세계를 잇는 공통 언어다.
  X.TYPES = {
    normal: { name: '무', color: '#a8a290' },
    fire: { name: '불', color: '#f0672e' },
    water: { name: '물', color: '#3c8df0' },
    grass: { name: '풀', color: '#4fb84a' },
    elec: { name: '전기', color: '#f2c318' },
    earth: { name: '땅', color: '#b0844a' },
    wind: { name: '바람', color: '#6fd0c8' },
    light: { name: '빛', color: '#f5e79a' },
    dark: { name: '어둠', color: '#7a5aa8' },
  };
  const CHART = {
    fire: { grass: 2, wind: 2, fire: 0.5, water: 0.5, earth: 0.5 },
    water: { fire: 2, earth: 2, water: 0.5, grass: 0.5 },
    grass: { water: 2, earth: 2, fire: 0.5, grass: 0.5, wind: 0.5 },
    elec: { water: 2, wind: 2, elec: 0.5, grass: 0.5, earth: 0.5 },
    earth: { fire: 2, elec: 2, grass: 0.5, wind: 0.5 },
    wind: { grass: 2, earth: 2, elec: 0.5 },
    light: { dark: 2, light: 0.5 },
    dark: { light: 2, dark: 0.5 },
    normal: {},
  };
  // 공격 속성 -> 방어 속성 배열에 대한 배율
  X.eff = function (atkType, defTypes) {
    let m = 1;
    for (const d of defTypes) m *= (CHART[atkType] && CHART[atkType][d]) || 1;
    return m;
  };

  // 기술: [이름, 속성, 위력, 명중, PP, 효과]
  // 효과: st(상태이상 부여 확률), self/foe(능력 랭크), heal(회복 비율), drain, pri(선공)
  const M = (name, type, pow, acc, pp, fx) => ({ name, type, pow, acc, pp, fx: fx || {} });
  X.MOVES = {
    ram: M('들이받기', 'normal', 40, 100, 35),
    claw: M('발톱 긋기', 'normal', 45, 100, 30),
    dash: M('질풍 돌진', 'normal', 40, 100, 25, { pri: 1 }),
    crush: M('짓누르기', 'normal', 70, 95, 15),
    rampage: M('대난동', 'normal', 95, 85, 8),
    howl: M('위협의 포효', 'normal', 0, 100, 25, { foe: ['atk', -1] }),
    glare: M('노려보기', 'normal', 0, 100, 25, { foe: ['def', -1] }),
    brace: M('웅크리기', 'normal', 0, 100, 25, { self: ['def', 1] }),
    rouse: M('투지 끌어올리기', 'normal', 0, 100, 15, { self: ['atk', 2] }),
    nap: M('낮잠', 'normal', 0, 100, 8, { heal: 0.5 }),

    cinder: M('불씨', 'fire', 40, 100, 25, { st: ['brn', 10] }),
    flamefang: M('불꽃 송곳니', 'fire', 65, 95, 15, { st: ['brn', 15] }),
    blaze: M('화염 숨결', 'fire', 90, 100, 10, { st: ['brn', 10] }),
    wisp: M('도깨비 등불', 'fire', 0, 90, 15, { st: ['brn', 100] }),

    splash: M('물보라', 'water', 40, 100, 25),
    torrent: M('급류 돌진', 'water', 60, 100, 20),
    tidal: M('해일', 'water', 90, 100, 10),
    jet: M('물살 가르기', 'water', 40, 100, 20, { pri: 1 }),

    vine: M('덩굴 후려치기', 'grass', 45, 100, 25),
    leafblade: M('잎새 칼날', 'grass', 65, 100, 15),
    sap: M('생기 흡수', 'grass', 50, 100, 15, { drain: 1 }),
    bloom: M('만개의 폭풍', 'grass', 95, 90, 8),
    spore: M('잠의 포자', 'grass', 0, 75, 15, { st: ['slp', 100] }),
    toxin: M('독 꽃가루', 'grass', 0, 85, 20, { st: ['psn', 100] }),

    zap: M('찌릿 방전', 'elec', 40, 100, 25, { st: ['par', 10] }),
    arc: M('뇌격 돌진', 'elec', 65, 100, 15, { st: ['par', 20] }),
    thunder: M('벼락 강타', 'elec', 90, 100, 10, { st: ['par', 10] }),
    static: M('마비 전류', 'elec', 0, 90, 20, { st: ['par', 100] }),

    mud: M('진흙 끼얹기', 'earth', 40, 100, 25),
    rockfall: M('바위 떨구기', 'earth', 60, 90, 15),
    burrow: M('땅굴 습격', 'earth', 80, 100, 10),
    quake: M('대지 분쇄', 'earth', 100, 95, 8),

    gust: M('돌개바람', 'wind', 40, 100, 30),
    wingcut: M('날개 베기', 'wind', 60, 100, 20),
    gale: M('칼바람', 'wind', 75, 95, 15),
    tempest: M('폭풍 강하', 'wind', 105, 80, 6),

    glint: M('빛 구슬', 'light', 45, 100, 25),
    radiance: M('성스러운 광채', 'light', 70, 100, 15),
    verdict: M('심판의 빛', 'light', 95, 95, 8),
    mend: M('치유의 빛', 'light', 0, 100, 8, { heal: 0.5 }),

    nip: M('깨물기', 'dark', 55, 100, 25, { flinch: 20 }),
    // ── 확장 기술: 방어·연속기·반동기·급소기·날씨·혼란 ──
    guardup: M('방어 태세', 'normal', 0, 100, 10, { protect: 1, pri: 3 }),
    flurry: M('연속 할퀴기', 'normal', 18, 90, 20, { multi: [2, 5] }),
    reckless: M('돌진 강타', 'normal', 100, 100, 10, { recoil: 0.25 }),
    keenedge: M('급소 베기', 'normal', 60, 100, 15, { crit: 1 }),
    dizzy: M('어지럼 춤', 'normal', 0, 100, 15, { conf: 100 }),
    sunpray: M('쾌청 기원', 'fire', 0, 100, 5, { weather: 'sun' }),
    raincall: M('비 부르기', 'water', 0, 100, 5, { weather: 'rain' }),
    sandveil: M('모래 장막', 'earth', 0, 100, 5, { weather: 'sand' }),
    flareblitz: M('화염 돌격', 'fire', 110, 100, 8, { recoil: 0.25, st: ['brn', 10] }),
    seedvolley: M('씨앗 연사', 'grass', 22, 100, 20, { multi: [2, 5] }),
    stonerain: M('바위 세례', 'earth', 24, 90, 15, { multi: [2, 5] }),
    psyglare: M('현혹의 빛', 'light', 55, 100, 15, { conf: 30 }),
    ambush: M('기습', 'dark', 65, 100, 10, { pri: 1, crit: 1 }),
    skydive: M('급강하', 'wind', 85, 95, 10, { flinch: 30 }),
    voltcrash: M('뇌전 충돌', 'elec', 105, 100, 8, { recoil: 0.25 }),
    whirl: M('소용돌이 연타', 'water', 20, 95, 20, { multi: [2, 5] }),
    shade: M('그림자 발톱', 'dark', 70, 100, 15),
    eclipse: M('암흑 강타', 'dark', 90, 95, 8),
  };
  for (const k in X.MOVES) X.MOVES[k].id = k;

  // 비스트 종족: 기본 능력치 [HP, 공격, 방어, 스피드], 습득 기술 [레벨, 기술], 진화
  // look: 절차적 스프라이트 생성 파라미터 (js/ui/sprites.js)
  const B = (name, types, base, learn, o) => Object.assign({ name, types, base, learn, catchRate: 120, xp: 60 }, o);
  X.BEASTS = {
    // --- 스타터 3계열 ---
    embercub: B('불꼬미', ['fire'], [45, 60, 43, 62], [[1, 'claw'], [1, 'howl'], [6, 'cinder'], [11, 'dash'], [15, 'flamefang']],
      { evo: [16, 'flarehound'], catchRate: 45, xp: 64, look: { shape: 'quad', c: ['#f0672e', '#ffd9a0', '#ffcf3a'], ears: 'point', tail: 'flame', size: 0.72 }, desc: '꼬리 끝의 불씨로 기분을 알 수 있다.' }),
    flarehound: B('화르랑', ['fire'], [60, 80, 58, 80], [[1, 'claw'], [1, 'cinder'], [16, 'flamefang'], [20, 'rouse'], [25, 'crush'], [30, 'blaze']],
      { evo: [32, 'infernox'], catchRate: 45, xp: 140, look: { shape: 'quad', c: ['#e8501e', '#ffd9a0', '#ffcf3a'], ears: 'point', tail: 'flame', mane: 1, size: 0.86 }, desc: '달릴 때 갈기에서 불티가 흩날린다.' }),
    infernox: B('염왕호', ['fire', 'dark'], [78, 108, 72, 100], [[1, 'flamefang'], [1, 'rouse'], [32, 'shade'], [36, 'blaze'], [42, 'eclipse'], [48, 'rampage']],
      { catchRate: 45, xp: 230, look: { shape: 'quad', c: ['#c8381a', '#3a2a3a', '#ffb020'], ears: 'point', tail: 'flame', mane: 1, horn: 2, size: 1 }, desc: '불꽃 갈기를 두른 밤의 맹수.' }),
    aquaring: B('아쿠링', ['water'], [50, 50, 60, 45], [[1, 'ram'], [1, 'brace'], [6, 'splash'], [11, 'jet'], [15, 'torrent']],
      { evo: [16, 'aqualune'], catchRate: 45, xp: 64, look: { shape: 'blob', c: ['#3c8df0', '#d6f0ff', '#1b4fa8'], ears: 'fin', tail: 'fin', size: 0.7 }, desc: '몸의 고리 무늬에 물을 저장한다.' }),
    aqualune: B('아쿠룬', ['water'], [65, 68, 80, 58], [[1, 'ram'], [1, 'splash'], [16, 'torrent'], [20, 'glare'], [25, 'crush'], [30, 'tidal']],
      { evo: [32, 'tidedrake'], catchRate: 45, xp: 140, look: { shape: 'serpent', c: ['#2f7be0', '#d6f0ff', '#1b4fa8'], ears: 'fin', tail: 'fin', size: 0.86 }, desc: '달빛이 비치는 밤에 수면 위로 뛰어오른다.' }),
    tidedrake: B('해일드라', ['water', 'wind'], [85, 88, 100, 78], [[1, 'torrent'], [1, 'glare'], [32, 'gale'], [36, 'tidal'], [42, 'nap'], [48, 'tempest']],
      { catchRate: 45, xp: 230, look: { shape: 'serpent', c: ['#2466c8', '#d6f0ff', '#6fd0c8'], ears: 'fin', tail: 'fin', wings: 1, horn: 2, size: 1 }, desc: '날갯짓 한 번에 파도를 일으키는 수룡.' }),
    leafy: B('리피', ['grass'], [48, 52, 52, 55], [[1, 'ram'], [1, 'howl'], [6, 'vine'], [11, 'toxin'], [15, 'sap']],
      { evo: [16, 'leafron'], catchRate: 45, xp: 64, look: { shape: 'biped', c: ['#4fb84a', '#e8f7c0', '#f06fa0'], ears: 'leaf', tail: 'leaf', size: 0.7 }, desc: '머리의 새싹은 햇볕을 받으면 빙글 돈다.' }),
    leafron: B('리프론', ['grass'], [63, 70, 68, 72], [[1, 'vine'], [1, 'toxin'], [16, 'sap'], [20, 'leafblade'], [25, 'spore'], [30, 'crush']],
      { evo: [32, 'forestar'], catchRate: 45, xp: 140, look: { shape: 'biped', c: ['#3fa63c', '#e8f7c0', '#f06fa0'], ears: 'leaf', tail: 'leaf', mane: 1, size: 0.86 }, desc: '팔의 잎사귀는 강철도 벨 만큼 날카롭다.' }),
    forestar: B('포레스타', ['grass', 'light'], [82, 92, 88, 88], [[1, 'leafblade'], [1, 'spore'], [32, 'radiance'], [36, 'bloom'], [42, 'mend'], [48, 'verdict']],
      { catchRate: 45, xp: 230, look: { shape: 'biped', c: ['#2f8f38', '#f5f0c0', '#f5e79a'], ears: 'leaf', tail: 'leaf', mane: 1, horn: 1, wings: 1, size: 1 }, desc: '숲의 별이라 불리는 수호자.' }),
    // --- 야생 ---
    squeako: B('찌르쥐', ['normal'], [38, 48, 35, 68], [[1, 'ram'], [4, 'howl'], [8, 'dash'], [13, 'nip'], [19, 'crush']],
      { evo: [18, 'gnawlord'], catchRate: 220, xp: 50, look: { shape: 'quad', c: ['#b89a78', '#f2e2c8', '#e88a8a'], ears: 'round', tail: 'thin', size: 0.6 }, desc: '어디에나 사는 겁 많은 설치류.' }),
    gnawlord: B('찌르대장', ['normal'], [62, 82, 60, 92], [[1, 'ram'], [1, 'dash'], [18, 'nip'], [22, 'crush'], [28, 'rouse'], [35, 'rampage']],
      { catchRate: 110, xp: 130, look: { shape: 'quad', c: ['#9a7a58', '#f2e2c8', '#e85a5a'], ears: 'round', tail: 'thin', mane: 1, size: 0.85 }, desc: '무리를 이끄는 우두머리.' }),
    flitwing: B('파닥새', ['wind'], [40, 46, 38, 60], [[1, 'ram'], [4, 'gust'], [9, 'dash'], [14, 'wingcut'], [20, 'gale']],
      { evo: [20, 'stormhawk'], catchRate: 200, xp: 52, look: { shape: 'bird', c: ['#8fc7e0', '#fff4d6', '#f2a03a'], size: 0.62 }, desc: '아침마다 마을 지붕에서 지저귄다.' }),
    stormhawk: B('폭풍매', ['wind'], [68, 88, 62, 102], [[1, 'gust'], [1, 'dash'], [20, 'wingcut'], [24, 'glare'], [29, 'gale'], [38, 'tempest']],
      { catchRate: 90, xp: 150, look: { shape: 'bird', c: ['#4a8fc0', '#fff4d6', '#f2a03a'], horn: 1, size: 0.92 }, desc: '폭풍 속에서도 먹이를 놓치지 않는다.' }),
    wriggle: B('꼬물레', ['grass'], [40, 35, 45, 40], [[1, 'ram'], [5, 'vine'], [8, 'toxin'], [12, 'brace']],
      { evo: [12, 'mothra'], catchRate: 230, xp: 42, look: { shape: 'blob', c: ['#9fd060', '#f7f7c8', '#e06060'], ears: 'antenna', size: 0.55 }, desc: '잎사귀 한 장을 사흘에 걸쳐 먹는다.' }),
    mothra: B('나비령', ['grass', 'wind'], [62, 62, 58, 82], [[1, 'vine'], [1, 'toxin'], [12, 'gust'], [16, 'spore'], [21, 'sap'], [27, 'gale'], [34, 'bloom']],
      { catchRate: 100, xp: 135, look: { shape: 'bird', c: ['#c88ae0', '#fff0fa', '#60c060'], ears: 'antenna', size: 0.85 }, desc: '날개의 가루는 깊은 잠을 부른다.' }),
    sparklet: B('스파키', ['elec'], [38, 55, 36, 78], [[1, 'claw'], [5, 'zap'], [10, 'dash'], [15, 'static'], [19, 'arc']],
      { evo: [22, 'voltragon'], catchRate: 150, xp: 62, look: { shape: 'biped', c: ['#f2c318', '#fff8c8', '#3a3a50'], ears: 'point', tail: 'bolt', size: 0.64 }, desc: '볏에 전기를 모아 반짝거린다.' }),
    voltragon: B('볼트라곤', ['elec'], [64, 92, 62, 108], [[1, 'zap'], [1, 'static'], [22, 'arc'], [26, 'rouse'], [31, 'crush'], [37, 'thunder']],
      { catchRate: 70, xp: 160, look: { shape: 'biped', c: ['#e0a810', '#fff8c8', '#3a3a50'], ears: 'point', tail: 'bolt', horn: 2, mane: 1, size: 0.92 }, desc: '번개와 함께 나타나는 도마뱀 왕.' }),
    pebblit: B('돌멩구', ['earth'], [48, 58, 78, 22], [[1, 'ram'], [1, 'brace'], [7, 'mud'], [13, 'rockfall'], [19, 'crush']],
      { evo: [24, 'craggon'], catchRate: 170, xp: 60, look: { shape: 'golem', c: ['#a09080', '#d8ccb8', '#6a8a5a'], size: 0.64 }, desc: '굴러다니다 그대로 잠든다.' }),
    craggon: B('록타이탄', ['earth'], [82, 96, 120, 34], [[1, 'mud'], [1, 'brace'], [24, 'rockfall'], [28, 'burrow'], [34, 'crush'], [40, 'quake']],
      { catchRate: 60, xp: 170, look: { shape: 'golem', c: ['#807060', '#d8ccb8', '#f0672e'], horn: 2, size: 1 }, desc: '산 하나가 걸어 다니는 듯한 거인.' }),
    finlet: B('퐁어', ['water'], [42, 44, 46, 62], [[1, 'ram'], [5, 'splash'], [10, 'jet'], [16, 'torrent']],
      { evo: [22, 'wavelord'], catchRate: 200, xp: 50, look: { shape: 'fish', c: ['#58b0e8', '#e8f8ff', '#f08060'], size: 0.6 }, desc: '물 밖에서는 퐁퐁 튀어 다닌다.' }),
    wavelord: B('파도왕', ['water', 'dark'], [78, 98, 70, 84], [[1, 'splash'], [1, 'jet'], [22, 'nip'], [26, 'torrent'], [31, 'shade'], [37, 'tidal']],
      { catchRate: 70, xp: 165, look: { shape: 'fish', c: ['#2a5aa0', '#c8d8f0', '#e03a3a'], horn: 1, size: 0.98 }, desc: '해안을 지배하는 사나운 포식자.' }),
    charcoal: B('차콜', ['fire', 'earth'], [50, 62, 68, 30], [[1, 'ram'], [6, 'cinder'], [11, 'mud'], [17, 'flamefang'], [23, 'rockfall']],
      { evo: [28, 'magmaros'], catchRate: 140, xp: 66, look: { shape: 'golem', c: ['#4a4040', '#f0672e', '#ffcf3a'], size: 0.66 }, desc: '몸속에서 숯불이 계속 타오른다.' }),
    magmaros: B('마그마로스', ['fire', 'earth'], [80, 100, 102, 44], [[1, 'cinder'], [1, 'mud'], [28, 'flamefang'], [30, 'burrow'], [35, 'blaze'], [42, 'quake']],
      { catchRate: 55, xp: 175, look: { shape: 'golem', c: ['#3a3030', '#f0672e', '#ffcf3a'], horn: 2, tail: 'flame', size: 1 }, desc: '등의 분화구에서 용암을 뿜는다.' }),
    shadecat: B('섀도냥', ['dark'], [44, 60, 40, 75], [[1, 'claw'], [5, 'glare'], [9, 'nip'], [14, 'dash'], [20, 'shade']],
      { evo: [26, 'nightpard'], catchRate: 130, xp: 64, look: { shape: 'quad', c: ['#5a4a78', '#c8b8e8', '#f2e060'], ears: 'point', tail: 'thin', size: 0.64 }, desc: '그림자 속을 헤엄치듯 걷는다.' }),
    nightpard: B('나이트팬서', ['dark'], [70, 102, 64, 110], [[1, 'nip'], [1, 'glare'], [26, 'shade'], [30, 'rouse'], [36, 'crush'], [41, 'eclipse']],
      { catchRate: 55, xp: 172, look: { shape: 'quad', c: ['#3a2a58', '#c8b8e8', '#f2e060'], ears: 'point', tail: 'thin', mane: 1, size: 0.95 }, desc: '달 없는 밤에만 모습을 드러낸다.' }),
    lumi: B('루미', ['light'], [50, 45, 55, 58], [[1, 'ram'], [5, 'glint'], [10, 'brace'], [15, 'mend'], [20, 'radiance']],
      { evo: [28, 'seraphin'], catchRate: 110, xp: 68, look: { shape: 'blob', c: ['#fff0a8', '#ffffff', '#f5b8d8'], ears: 'round', wings: 1, size: 0.6 }, desc: '어두운 길을 밝혀 주는 작은 빛.' }),
    seraphin: B('세라핀', ['light', 'wind'], [80, 82, 86, 90], [[1, 'glint'], [1, 'mend'], [28, 'radiance'], [32, 'gale'], [38, 'verdict'], [44, 'tempest']],
      { catchRate: 45, xp: 180, look: { shape: 'bird', c: ['#fff0a8', '#ffffff', '#f5b8d8'], horn: 1, size: 0.98 }, desc: '여섯 날개로 하늘의 경계를 지킨다.' }),
    molekin: B('땅굴이', ['earth', 'dark'], [55, 70, 50, 60], [[1, 'claw'], [6, 'mud'], [12, 'nip'], [18, 'burrow'], [25, 'shade'], [33, 'quake']],
      { catchRate: 130, xp: 90, look: { shape: 'quad', c: ['#7a5a48', '#e8c8a8', '#f090a0'], ears: 'none', tail: 'thin', size: 0.72 }, desc: '하룻밤에 굴 열 개를 판다.' }),
    lilypad: B('연잎이', ['water', 'grass'], [52, 48, 56, 44], [[1, 'ram'], [5, 'splash'], [9, 'vine'], [14, 'sap'], [19, 'torrent']],
      { evo: [26, 'lotusprite'], catchRate: 150, xp: 62, look: { shape: 'blob', c: ['#58c0a0', '#e8fff0', '#f080b0'], ears: 'leaf', size: 0.62 }, desc: '머리의 연잎으로 비를 피한다.' }),
    lotusprite: B('연화귀', ['water', 'grass'], [84, 76, 88, 66], [[1, 'splash'], [1, 'vine'], [26, 'sap'], [28, 'spore'], [33, 'tidal'], [39, 'bloom']],
      { catchRate: 60, xp: 168, look: { shape: 'biped', c: ['#40a888', '#e8fff0', '#f080b0'], ears: 'leaf', mane: 1, size: 0.94 }, desc: '연꽃이 피면 주변의 물이 맑아진다.' }),
    grizzle: B('곰돌', ['normal'], [70, 72, 58, 38], [[1, 'claw'], [6, 'howl'], [12, 'crush'], [18, 'nap'], [24, 'rouse'], [32, 'rampage']],
      { catchRate: 110, xp: 110, look: { shape: 'biped', c: ['#8a6040', '#f0d8b0', '#402818'], ears: 'round', size: 0.9 }, desc: '꿀 냄새를 십 리 밖에서도 맡는다.' }),
    stormwing: B('뇌운조', ['elec', 'wind'], [85, 100, 80, 115], [[1, 'arc'], [1, 'gale'], [1, 'static'], [40, 'thunder'], [46, 'tempest']],
      { catchRate: 15, xp: 240, look: { shape: 'bird', c: ['#f2c318', '#fff8c8', '#3a6ae0'], horn: 2, size: 1.05 }, desc: '폭풍 구름을 타고 대륙을 떠도는 전설.' }),
    arcalon: B('아르카론', ['light', 'dark'], [100, 110, 100, 100], [[1, 'radiance'], [1, 'shade'], [1, 'mend'], [50, 'verdict'], [50, 'eclipse']],
      { catchRate: 8, xp: 300, look: { shape: 'quad', c: ['#f0f0ff', '#3a2a58', '#f5e79a'], ears: 'point', horn: 2, wings: 1, mane: 1, tail: 'flame', size: 1.08 }, desc: '대융합 때 태어났다는, 두 세계의 경계에 선 존재.' }),
  };
  for (const k in X.BEASTS) X.BEASTS[k].id = k;

  X.ITEMS = {
    capsule: { name: '링크 캡슐', price: 200, desc: '야생 비스트를 포획한다.', ball: 1 },
    supercap: { name: '하이 캡슐', price: 600, desc: '포획률이 높은 캡슐.', ball: 1.6 },
    potion: { name: '회복약', price: 250, desc: '비스트의 HP를 30 회복.', heal: 30 },
    hipotion: { name: '고급 회복약', price: 700, desc: '비스트의 HP를 80 회복.', heal: 80 },
    cure: { name: '만능 치료제', price: 300, desc: '상태이상을 모두 치료.', cure: 1 },
    revive: { name: '기력의 조각', price: 1200, desc: '쓰러진 비스트를 HP 절반으로 되살린다.', revive: 1 },
  };
  for (const k in X.ITEMS) X.ITEMS[k].id = k;

  X.STATUS = { psn: '독', brn: '화상', par: '마비', slp: '수면' };

  // 특성: 종마다 하나. 크로스전에서는 카드 몬스터에게도 영향을 준다.
  X.ABILITIES = {
    blaze: { name: '불씨 본능', desc: 'HP가 1/3 이하일 때 불 기술의 위력 1.5배.' },
    torrent: { name: '격류 본능', desc: 'HP가 1/3 이하일 때 물 기술의 위력 1.5배.' },
    overgrow: { name: '신록 본능', desc: 'HP가 1/3 이하일 때 풀 기술의 위력 1.5배.' },
    guts: { name: '오기', desc: '상태이상일 때 공격 1.5배.' },
    intim: { name: '기선 제압', desc: '등장 시 상대의 공격을 1랭크 내린다. 카드 몬스터는 전체 ATK -200.' },
    psn: { name: '독 가시', desc: '자신을 때린 상대를 30% 확률로 독에 걸리게 한다. 카드 몬스터에게도 통한다.' },
    static: { name: '대전 체질', desc: '자신을 때린 상대를 30% 확률로 마비시킨다. 카드 몬스터에게도 통한다.' },
    flame: { name: '달궈진 몸', desc: '자신을 때린 상대를 30% 확률로 화상 입힌다. 카드 몬스터에게도 통한다.' },
    sturdy: { name: '옹골참', desc: 'HP가 가득일 때 쓰러질 공격을 받아도 1로 버틴다. 「파괴」 효과에도 버틴다.' },
    speed: { name: '가속', desc: '매 턴 종료 시 스피드가 1랭크 오른다.' },
    regen: { name: '빛의 가호', desc: '매 턴 종료 시 HP를 조금 회복한다.' },
    thick: { name: '두꺼운 털가죽', desc: '불·물 속성 공격의 피해가 절반.' },
    rain: { name: '비구름 몰이', desc: '등장 시 비를 내린다. 물 +50% / 불 -50%, 물 몬스터 ATK +300.' },
    sand: { name: '모래 일으키기', desc: '등장 시 모래바람을 일으킨다. 땅 이외는 매 턴 피해, 땅 몬스터 DEF +400.' },
    sun: { name: '햇살 부르기', desc: '등장 시 햇살이 강해진다. 불 +50% / 물 -50%, 불 몬스터 ATK +300.' },
  };
  const AB = { embercub: 'blaze', flarehound: 'blaze', infernox: 'blaze', aquaring: 'torrent', aqualune: 'torrent', tidedrake: 'torrent', leafy: 'overgrow', leafron: 'overgrow', forestar: 'overgrow',
    squeako: 'guts', gnawlord: 'guts', flitwing: 'intim', stormhawk: 'intim', wriggle: 'psn', mothra: 'psn', sparklet: 'static', voltragon: 'static', pebblit: 'sturdy', craggon: 'sturdy',
    finlet: 'speed', wavelord: 'speed', charcoal: 'flame', magmaros: 'sun', shadecat: 'intim', nightpard: 'guts', lumi: 'regen', seraphin: 'regen', molekin: 'sand', lilypad: 'rain', lotusprite: 'rain',
    grizzle: 'thick', stormwing: 'static', arcalon: 'regen' };
  for (const k in X.BEASTS) X.BEASTS[k].ab = AB[k] || 'guts';
  // 확장 기술을 습득 목록에 추가 [종, 레벨, 기술]
  for (const [sp, lv, mv] of [['embercub', 13, 'keenedge'], ['flarehound', 23, 'sunpray'], ['infernox', 45, 'flareblitz'], ['aquaring', 13, 'guardup'], ['aqualune', 23, 'raincall'], ['tidedrake', 39, 'whirl'],
    ['leafy', 13, 'seedvolley'], ['leafron', 23, 'guardup'], ['forestar', 39, 'psyglare'], ['squeako', 11, 'flurry'], ['gnawlord', 31, 'reckless'], ['flitwing', 17, 'keenedge'], ['stormhawk', 33, 'skydive'],
    ['mothra', 24, 'dizzy'], ['sparklet', 17, 'keenedge'], ['voltragon', 41, 'voltcrash'], ['pebblit', 16, 'guardup'], ['craggon', 31, 'stonerain'], ['craggon', 37, 'sandveil'], ['wavelord', 34, 'ambush'],
    ['charcoal', 20, 'sunpray'], ['magmaros', 38, 'flareblitz'], ['shadecat', 17, 'ambush'], ['nightpard', 33, 'ambush'], ['lumi', 13, 'psyglare'], ['seraphin', 35, 'guardup'], ['molekin', 22, 'stonerain'],
    ['lilypad', 16, 'raincall'], ['lotusprite', 30, 'whirl'], ['grizzle', 28, 'reckless'], ['stormwing', 1, 'skydive'], ['arcalon', 1, 'psyglare']]) {
    X.BEASTS[sp].learn.push([lv, mv]); X.BEASTS[sp].learn.sort((a, b) => a[0] - b[0]);
  }
  // 지닌 도구: 비스트 한 마리가 하나씩 지닌다
  Object.assign(X.ITEMS, {
    leftovers: { id: 'leftovers', name: '남은 열매', price: 1500, hold: 1, desc: '[지닌 도구] 매 턴 HP를 조금 회복.' },
    orb: { id: 'orb', name: '생명의 구슬', price: 2500, hold: 1, desc: '[지닌 도구] 공격 1.3배. 공격할 때마다 HP가 조금 깎인다.' },
    sash: { id: 'sash', name: '기합의 띠', price: 1200, hold: 1, desc: '[지닌 도구] HP가 가득일 때 쓰러질 일격을 1번 버틴다.' },
    charm: { id: 'charm', name: '속성 부적', price: 1800, hold: 1, desc: '[지닌 도구] 자기 속성과 같은 기술의 위력 1.2배.' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
