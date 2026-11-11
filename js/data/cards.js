// 카드(듀얼리스트 문화권) 데이터: 몬스터 · 마법 · 함정, 기본 덱, 카드 팩
(function (root) {
  const X = root.XG;
  const C = {};
  const mon = (id, name, attr, lv, atk, def, tier, look, text, fx) =>
    (C[id] = { id, kind: 'mon', name, attr, lv, atk, def, tier, look, text: text || '', fx: fx || {} });
  const spell = (id, name, sub, tier, icon, text, o) => (C[id] = Object.assign({ id, kind: 'spell', name, sub, tier, icon, text }, o));
  const trap = (id, name, trigger, tier, icon, text, ops) => (C[id] = { id, kind: 'trap', name, trigger, tier, icon, text, ops });
  const L = (shape, c, o) => Object.assign({ shape, c }, o);

  // ── 몬스터: 티어 1 (입문) ──
  mon('leafsprite', '풀잎 요정', 'grass', 2, 600, 900, 1, L('biped', ['#6fd060', '#f5ffd8', '#f080b0'], { ears: 'leaf', wings: 1, size: 0.6 }));
  mon('embergob', '불씨 도깨비', 'fire', 3, 1000, 400, 1, L('biped', ['#e8501e', '#ffd9a0', '#ffcf3a'], { horn: 2, gear: 'club', size: 0.7 }));
  mon('dropknight', '물방울 기사', 'water', 3, 900, 1100, 1, L('biped', ['#3c8df0', '#d6f0ff', '#c8d0e0'], { armor: 1, gear: 'sword', size: 0.72 }));
  mon('stoneguard', '돌 방패병', 'earth', 3, 500, 1500, 1, L('golem', ['#a09080', '#d8ccb8', '#607088'], { gear: 'shield', size: 0.78 }));
  mon('windblade', '바람 검사', 'wind', 4, 1300, 800, 1, L('biped', ['#58b8b0', '#f0fff8', '#e0e0f0'], { gear: 'sword', mane: 1, size: 0.8 }));
  mon('boltimp', '번개 임프', 'elec', 2, 800, 300, 1, L('biped', ['#f2c318', '#fff8c8', '#3a3a50'], { horn: 2, wings: 1, tail: 'bolt', size: 0.6 }),
    '소환 시: 상대에게 200 데미지.', { onSummon: [{ op: 'dmg', n: 200 }] });
  mon('lampmonk', '등불 수도사', 'light', 2, 500, 800, 1, L('biped', ['#e8d8a0', '#fff8e0', '#f5e79a'], { robe: 1, gear: 'staff', size: 0.7 }),
    '소환 시: LP를 400 회복.', { onSummon: [{ op: 'heal', n: 400 }] });
  mon('bookworm', '떠돌이 책벌레', 'normal', 2, 400, 600, 1, L('blob', ['#b8a078', '#f2e8d0', '#6080c0'], { ears: 'antenna', size: 0.6 }),
    '파괴 시: 카드를 1장 드로우.', { onDestroy: [{ op: 'draw', n: 1 }] });
  mon('whelp', '새끼 화룡', 'fire', 4, 1400, 900, 1, L('quad', ['#d84a2a', '#ffd9a0', '#ffcf3a'], { horn: 2, wings: 1, tail: 'flame', size: 0.78 }));
  mon('shadowrat', '그림자 쥐', 'dark', 2, 700, 500, 1, L('quad', ['#5a4a78', '#c8b8e8', '#f06060'], { ears: 'round', tail: 'thin', size: 0.58 }));
  // ── 티어 2 (중급) ──
  mon('irongolem', '강철 골렘', 'earth', 4, 1200, 1900, 2, L('golem', ['#7888a0', '#c8d4e8', '#f0b030'], { horn: 1, size: 0.92 }));
  mon('galerider', '폭풍 매기사', 'wind', 4, 1600, 1000, 2, L('bird', ['#4a8fc0', '#fff4d6', '#c8d0e0'], { horn: 1, gear: 'spear', size: 0.88 }));
  mon('deepwarden', '심해 수호자', 'water', 4, 1500, 1400, 2, L('fish', ['#2a6ab8', '#c8e8ff', '#f0c040'], { horn: 1, size: 0.9 }));
  mon('flamelancer', '불꽃 창병', 'fire', 4, 1500, 800, 2, L('biped', ['#e8501e', '#ffd9a0', '#c8d0e0'], { armor: 1, gear: 'spear', size: 0.84 }),
    '관통: 수비 몬스터를 공격해도 초과분만큼 데미지.', { pierce: true });
  mon('thunderarcher', '뇌전 궁수', 'elec', 4, 1400, 900, 2, L('biped', ['#e0a810', '#fff8c8', '#3a3a50'], { gear: 'bow', mane: 1, size: 0.82 }),
    '소환 시: 상대의 가장 강한 몬스터를 마비시킨다.', { onSummon: [{ op: 'status', who: 'strongest', st: 'par' }] });
  mon('toadshaman', '독버섯 주술사', 'grass', 3, 900, 1000, 2, L('biped', ['#8a60b8', '#f0e0ff', '#e04060'], { robe: 1, gear: 'staff', ears: 'round', size: 0.72 }),
    '소환 시: 상대의 가장 강한 몬스터를 독에 걸리게 한다.', { onSummon: [{ op: 'status', who: 'strongest', st: 'psn' }] });
  mon('nightblade', '암흑 암살자', 'dark', 4, 1700, 600, 2, L('biped', ['#3a2a58', '#c8b8e8', '#e03a3a'], { gear: 'dual', mane: 1, size: 0.84 }));
  mon('holylancer', '성창의 기사', 'light', 4, 1600, 1200, 2, L('biped', ['#f0e8c0', '#ffffff', '#f5c840'], { armor: 1, gear: 'spear', wings: 1, size: 0.86 }));
  mon('devourbug', '그림자 포식충', 'dark', 2, 450, 600, 2, L('blob', ['#4a3a68', '#a898c8', '#f04040'], { ears: 'antenna', horn: 2, size: 0.62 }),
    '리버스: 상대의 가장 강한 몬스터를 파괴.', { onFlip: [{ op: 'destroy', who: 'strongest' }] });
  mon('twindancer', '쌍검 무희', 'wind', 4, 1100, 700, 2, L('biped', ['#58b8b0', '#fff0f8', '#f080b0'], { gear: 'dual', mane: 1, size: 0.78 }),
    '한 턴에 2번 공격할 수 있다.', { twice: true });
  mon('gravekeeper', '묘지기 까마귀', 'dark', 3, 800, 1200, 2, L('bird', ['#3a3a4a', '#a8a8c0', '#f0c040'], { size: 0.72 }),
    '파괴 시: 상대에게 500 데미지.', { onDestroy: [{ op: 'dmg', n: 500 }] });
  mon('pyromancer', '화염 마도사', 'fire', 4, 1300, 1000, 2, L('biped', ['#c8381a', '#ffd9a0', '#ffcf3a'], { robe: 1, gear: 'staff', horn: 1, size: 0.82 }),
    '자신의 불 속성 몬스터 전체의 ATK +300.', { aura: { attr: 'fire', atk: 300 } });
  mon('scout', '전령 다람쥐', 'normal', 2, 600, 400, 2, L('quad', ['#c89058', '#fff0d8', '#6080c0'], { ears: 'round', tail: 'leaf', size: 0.58 }),
    '소환 시: 덱에서 레벨 4 이하 몬스터 1장을 패에 넣는다.', { onSummon: [{ op: 'search' }] });
  // ── 티어 3 (상급 / 제물 소환) ──
  mon('earthtitan', '대지의 거신', 'earth', 6, 2200, 2400, 3, L('golem', ['#806848', '#e0c8a0', '#58a858'], { horn: 2, size: 1.05 }));
  mon('tempestdragon', '폭풍룡 템페스트', 'wind', 6, 2400, 1600, 3, L('serpent', ['#3aa898', '#e0fff8', '#f0f0ff'], { horn: 2, wings: 1, size: 1.05 }),
    '소환 시: 상대의 마법·함정 1장을 파괴.', { onSummon: [{ op: 'destroyST' }] });
  mon('leviar', '해왕 리바이어', 'water', 7, 2700, 2000, 3, L('serpent', ['#1b4fa8', '#c8e8ff', '#f0c040'], { horn: 2, ears: 'fin', tail: 'fin', size: 1.1 }),
    '소환 시: 상대 몬스터 전체의 ATK -500.', { onSummon: [{ op: 'atk', who: 'allOpp', n: -500 }] });
  mon('ignis', '염제 이그니스', 'fire', 7, 2800, 1800, 3, L('biped', ['#c8281a', '#ffb060', '#ffcf3a'], { horn: 2, wings: 1, tail: 'flame', gear: 'sword', size: 1.08 }),
    '소환 시: 상대에게 800 데미지.', { onSummon: [{ op: 'dmg', n: 800 }] });
  mon('voltrix', '뇌신 볼트릭스', 'elec', 6, 2300, 1500, 3, L('quad', ['#e0a810', '#fff8c8', '#3a6ae0'], { horn: 2, mane: 1, tail: 'bolt', size: 1.02 }),
    '한 턴에 2번 공격할 수 있다.', { twice: true });
  mon('lumiel', '천사장 루미엘', 'light', 8, 3000, 2500, 3, L('biped', ['#f8f0d0', '#ffffff', '#f5c840'], { wings: 1, robe: 1, gear: 'staff', horn: 1, size: 1.1 }),
    '소환 시: LP를 1000 회복.', { onSummon: [{ op: 'heal', n: 1000 }] });
  mon('nox', '명왕 녹스', 'dark', 8, 3000, 2000, 3, L('biped', ['#2a1a48', '#8868c0', '#e03a3a'], { horn: 2, wings: 1, robe: 1, gear: 'spear', size: 1.1 }),
    '소환 시: 상대의 가장 강한 몬스터를 파괴.', { onSummon: [{ op: 'destroy', who: 'strongest' }] });
  mon('worldtree', '세계수의 수호령', 'grass', 6, 2000, 2600, 3, L('golem', ['#3f8f38', '#d8f0b0', '#f080b0'], { ears: 'leaf', horn: 2, size: 1.05 }),
    '소환 시: 묘지의 몬스터 1장을 특수 소환.', { onSummon: [{ op: 'revive' }] });
  mon('arcadragon', '차원룡 아르카', 'light', 8, 3200, 2800, 4, L('serpent', ['#e8e8ff', '#3a2a58', '#f5e79a'], { horn: 2, wings: 1, mane: 1, size: 1.15 }),
    '소환 시: 상대 몬스터 전체의 ATK -500. 관통.', { onSummon: [{ op: 'atk', who: 'allOpp', n: -500 }], pierce: true });

  // ── 마법 ──
  spell('fireball', '화염탄', 'normal', 1, 'fire', '상대에게 500 데미지.', { ops: [{ op: 'dmg', n: 500 }] });
  spell('spring', '치유의 샘', 'normal', 1, 'heal', 'LP를 800 회복.', { ops: [{ op: 'heal', n: 800 }] });
  spell('tome', '지혜의 서', 'normal', 2, 'book', '카드를 2장 드로우.', { ops: [{ op: 'draw', n: 2 }] });
  spell('smite', '낙뢰', 'normal', 2, 'bolt', '상대 몬스터 1장을 파괴.', { target: 'opp', ops: [{ op: 'destroy', who: 'target' }] });
  spell('squall', '돌풍', 'normal', 1, 'wind', '상대의 마법·함정 1장을 파괴.', { ops: [{ op: 'destroyST' }] });
  spell('rebirth', '소생의 주문', 'normal', 2, 'revive', '자신 묘지의 가장 강한 몬스터를 특수 소환.', { ops: [{ op: 'revive' }] });
  spell('steelsword', '강철 검', 'equip', 1, 'sword', '장착 몬스터의 ATK +500.', { target: 'own', equip: { atk: 500, def: 0 } });
  spell('aegis', '수호의 방패', 'equip', 1, 'shield', '장착 몬스터의 DEF +800.', { target: 'own', equip: { atk: 0, def: 800 } });
  spell('miasma', '독안개', 'normal', 1, 'poison', '상대 몬스터 1장을 독에 걸리게 한다.', { target: 'opp', ops: [{ op: 'status', who: 'target', st: 'psn' }] });
  spell('lullaby', '자장가', 'normal', 2, 'sleep', '상대 몬스터 1장을 잠들게 한다.', { target: 'opp', ops: [{ op: 'status', who: 'target', st: 'slp' }] });
  spell('warbanner', '전의의 깃발', 'cont', 2, 'banner', '[지속] 자신 몬스터 전체의 ATK +200.', { aura: { atk: 200 } });
  spell('hex', '약화의 저주', 'normal', 1, 'curse', '상대 몬스터 1장의 ATK -600.', { target: 'opp', ops: [{ op: 'atk', who: 'target', n: -600 }] });
  spell('recall', '귀환의 바람', 'normal', 2, 'recall', '상대 몬스터 1장을 주인의 패로 되돌린다.', { target: 'opp', ops: [{ op: 'bounce', who: 'target' }] });
  spell('warcry', '광전사의 함성', 'normal', 2, 'cry', '이번 턴 자신 몬스터 전체의 ATK +400.', { ops: [{ op: 'atk', who: 'allOwn', n: 400, temp: true }] });
  spell('meteor', '유성우', 'normal', 3, 'meteor', '상대에게 1000 데미지.', { ops: [{ op: 'dmg', n: 1000 }] });

  // ── 함정 ──
  trap('mirrorwall', '거울 방벽', 'attack', 2, 'mirror', '상대 공격 선언 시: 그 공격 몬스터를 파괴.', [{ op: 'destroy', who: 'attacker' }]);
  trap('lightbarrier', '빛의 장막', 'attack', 1, 'barrier', '상대 공격 선언 시: 그 공격을 무효로 한다.', [{ op: 'negate' }]);
  trap('sinkhole', '꺼지는 땅', 'summon', 2, 'pit', '상대가 몬스터를 소환했을 때: 그 몬스터를 파괴.', [{ op: 'destroy', who: 'summoned' }]);
  trap('thornmail', '가시 갑옷', 'attack', 1, 'thorn', '상대 공격 선언 시: 공격 몬스터의 ATK -700.', [{ op: 'atk', who: 'attacker', n: -700 }]);
  trap('stunsnare', '마비 덫', 'attack', 2, 'snare', '상대 공격 선언 시: 공격을 무효로 하고 마비시킨다.', [{ op: 'negate' }, { op: 'status', who: 'attacker', st: 'par' }]);
  trap('backfire', '역류의 불길', 'attack', 2, 'backfire', '상대 공격 선언 시: 상대에게 600 데미지.', [{ op: 'dmg', n: 600 }]);

  // ══ 확장 카드: 특수 소환 · 토큰 · 기동 효과 · 전투 내성 · 직접 공격 · 융합 · 날씨 · 카운터 함정 ══
  mon('vanguard', '질풍의 선봉', 'wind', 4, 1500, 600, 2, L('biped', ['#58b8b0', '#f0fff8', '#f2c94c'], { armor: 1, gear: 'spear', wings: 1, size: 0.8 }),
    '자신 필드에 몬스터가 없으면 패에서 특수 소환할 수 있다.', { special: 'empty' });
  mon('wraith', '망령 기사', 'dark', 5, 2000, 1500, 3, L('biped', ['#4a3a68', '#a898c8', '#58d0c0'], { armor: 1, gear: 'sword', horn: 2, size: 0.95 }),
    '자신 묘지에 몬스터가 3장 이상이면 패에서 특수 소환할 수 있다.', { special: 'grave3' });
  mon('nestbird', '둥지 지키는 새', 'wind', 3, 800, 1200, 2, L('bird', ['#c89058', '#fff0d8', '#f2a03a'], { size: 0.72 }),
    '소환 시: 「새끼새 토큰」(300/300) 1장을 수비 표시로 특수 소환.', { onSummon: [{ op: 'token', id: 'tok_chick' }] });
  mon('tok_chick', '새끼새 토큰', 'wind', 1, 300, 300, 9, L('bird', ['#f2d868', '#fff8d8', '#f2a03a'], { size: 0.5 }), '토큰. 필드를 떠나면 사라진다.');
  mon('gladiator', '투기장의 패자', 'earth', 4, 1500, 1200, 2, L('biped', ['#b0844a', '#f0d8b0', '#c8d0e0'], { armor: 1, gear: 'club', mane: 1, size: 0.9 }),
    '전투로 상대를 쓰러뜨릴 때마다 ATK +300.', { onKill: [{ op: 'atk', who: 'self', n: 300 }] });
  mon('magpie', '저격수 까치', 'wind', 3, 1000, 500, 2, L('bird', ['#3a3a4a', '#f0f0f8', '#3f78d0'], { gear: 'bow', size: 0.68 }),
    '상대 필드에 몬스터가 있어도 직접 공격할 수 있다.', { direct: true });
  mon('crystalturtle', '수정 거북', 'water', 4, 800, 2000, 2, L('quad', ['#58c0c8', '#e0fff8', '#a8e0f0'], { ears: 'none', horn: 1, size: 0.82 }),
    '한 턴에 한 번, 전투로 파괴되지 않는다.', { guard: true });
  mon('powdermage', '화약 술사', 'fire', 3, 1100, 800, 2, L('biped', ['#a04828', '#ffd9a0', '#f2c318'], { robe: 1, gear: 'staff', size: 0.74 }),
    '[기동] 한 턴에 한 번: 상대에게 300 데미지.', { ign: { ops: [{ op: 'dmg', n: 300 }] } });
  mon('archsage', '대현자 오르도', 'light', 4, 1400, 1500, 3, L('biped', ['#e8e0f8', '#ffffff', '#8a58c0'], { robe: 1, gear: 'staff', mane: 1, size: 0.86 }),
    '[기동] 한 턴에 한 번, LP 500을 지불: 카드를 1장 드로우.', { ign: { cost: 'lp', ops: [{ op: 'draw', n: 1 }] } });
  mon('effigy', '제물의 인형', 'dark', 2, 300, 300, 2, L('blob', ['#6a5a48', '#d8c8a8', '#e03a3a'], { ears: 'antenna', size: 0.56 }),
    '[기동] 이 카드를 제물로 바쳐: 상대의 가장 강한 몬스터를 파괴.', { ign: { cost: 'self', ops: [{ op: 'destroy', who: 'strongest' }] } });
  mon('rainmaiden', '비를 부르는 무녀', 'water', 3, 1000, 1300, 2, L('biped', ['#3c8df0', '#f0f8ff', '#f080b0'], { robe: 1, gear: 'staff', ears: 'fin', size: 0.76 }),
    '소환 시: 비를 내린다. (물 몬스터 ATK +300, 불 -300)', { onSummon: [{ op: 'weather', w: 'rain' }] });
  // 융합 몬스터 (덱에 넣지 않는다. 「융합」으로 소재 2장의 속성에 따라 나온다)
  mon('fus_blazewing', '폭염룡 블레이즈윙', 'fire', 8, 2800, 2000, 9, L('serpent', ['#e8501e', '#ffd9a0', '#6fd0c8'], { horn: 2, wings: 1, tail: 'flame', size: 1.12 }),
    '[융합: 불+바람] 소환 시: 상대에게 600 데미지.', { onSummon: [{ op: 'dmg', n: 600 }] });
  mon('fus_tidalrock', '심해거신 타이달록', 'water', 8, 2600, 2900, 9, L('golem', ['#2a6ab8', '#c8e8ff', '#b0844a'], { horn: 2, size: 1.12 }),
    '[융합: 물+땅] 한 턴에 한 번, 전투로 파괴되지 않는다.', { guard: true });
  mon('fus_twilight', '혼돈기사 트와일라잇', 'light', 8, 3000, 2400, 9, L('biped', ['#f0e8ff', '#3a2a58', '#f2c94c'], { armor: 1, gear: 'dual', wings: 1, horn: 2, size: 1.12 }),
    '[융합: 빛+어둠] 소환 시: 상대의 가장 강한 몬스터를 파괴.', { onSummon: [{ op: 'destroy', who: 'strongest' }] });
  mon('fus_stormbolt', '뇌운룡 스톰볼트', 'elec', 8, 2700, 1900, 9, L('quad', ['#f2c318', '#fff8c8', '#6fd0c8'], { horn: 2, wings: 1, tail: 'bolt', mane: 1, size: 1.1 }),
    '[융합: 전기+바람] 한 턴에 2번 공격할 수 있다.', { twice: true });
  mon('fus_yggdra', '세계수룡 유그드', 'grass', 8, 2500, 2700, 9, L('serpent', ['#3f9a48', '#d8f0b0', '#3c8df0'], { horn: 2, ears: 'leaf', tail: 'leaf', size: 1.12 }),
    '[융합: 풀+물] 소환 시: LP를 1000 회복.', { onSummon: [{ op: 'heal', n: 1000 }] });
  mon('fus_chimera', '합성수 키메라', 'normal', 7, 2400, 2000, 9, L('quad', ['#b89a78', '#f2e2c8', '#8a58c0'], { horn: 2, wings: 1, tail: 'thin', mane: 1, size: 1.08 }),
    '[융합: 그 밖의 조합] 관통.', { pierce: true });
  spell('fusion', '융합', 'normal', 2, 'fusion', '자신 필드의 앞면 몬스터 2장을 소재로, 속성 조합에 맞는 융합 몬스터를 특수 소환.', { fusion: true });
  spell('sunfield', '타오르는 태양', 'normal', 2, 'sun', '햇살이 강해진다. 불 몬스터 ATK +300 / 물 -300. 비스트의 불 기술도 강해진다.', { ops: [{ op: 'weather', w: 'sun' }] });
  spell('rainfield', '장대비', 'normal', 2, 'rain', '비가 내린다. 물 몬스터 ATK +300 / 불 -300. 비스트의 물 기술도 강해진다.', { ops: [{ op: 'weather', w: 'rain' }] });
  spell('sandfield', '모래 폭풍', 'normal', 2, 'sand', '모래바람이 분다. 땅 몬스터 DEF +400. 땅 이외의 비스트는 매 턴 피해.', { ops: [{ op: 'weather', w: 'sand' }] });
  trap('spellseal', '마법 봉쇄', 'spell', 2, 'seal', '[카운터] 상대가 마법 카드를 발동했을 때: 그 발동을 무효로 한다.', [{ op: 'negate' }]);
  trap('ambushpit', '매복', 'attack', 2, 'snare', '상대 공격 선언 시: 「새끼새 토큰」 2장을 수비 표시로 특수 소환.', [{ op: 'token', id: 'tok_chick', n: 2 }]);
  X.FUSIONS = { 'fire+wind': 'fus_blazewing', 'earth+water': 'fus_tidalrock', 'dark+light': 'fus_twilight', 'elec+wind': 'fus_stormbolt', 'grass+water': 'fus_yggdra', any: 'fus_chimera' };
  C.tok_chick.token = true;

  X.CARDS = C;

  // 덱 프리셋: {카드ID: 장수}
  const D = (o) => { const a = []; for (const k in o) for (let i = 0; i < o[k]; i++) a.push(k); return a; };
  X.DECKS = {
    starter: D({ leafsprite: 2, embergob: 2, dropknight: 2, stoneguard: 2, windblade: 2, boltimp: 1, lampmonk: 1, bookworm: 1, whelp: 1, shadowrat: 1, fireball: 1, spring: 1, steelsword: 1, hex: 1, lightbarrier: 1 }),
    novice: D({ leafsprite: 2, embergob: 2, shadowrat: 2, stoneguard: 2, boltimp: 2, bookworm: 2, windblade: 2, whelp: 1, fireball: 2, spring: 1, steelsword: 1, thornmail: 1 }),
    mira1: D({ windblade: 2, whelp: 2, dropknight: 2, boltimp: 2, lampmonk: 1, embergob: 2, stoneguard: 1, bookworm: 2, fireball: 2, steelsword: 2, hex: 1, lightbarrier: 1 }),
    sera: D({ dropknight: 3, stoneguard: 2, lampmonk: 2, bookworm: 2, windblade: 2, leafsprite: 2, deepwarden: 1, spring: 1, aegis: 1, miasma: 1, hex: 1, lightbarrier: 1, thornmail: 1 }),
    water: D({ dropknight: 3, deepwarden: 2, stoneguard: 1, lampmonk: 2, bookworm: 2, windblade: 1, leviar: 1, spring: 2, aegis: 1, miasma: 1, hex: 1, lightbarrier: 2, thornmail: 1, crystalturtle: 1, rainmaiden: 1 }),
    grunt: D({ shadowrat: 3, embergob: 2, boltimp: 2, gravekeeper: 2, nightblade: 1, whelp: 2, stoneguard: 2, fireball: 2, miasma: 1, hex: 2, thornmail: 1 }),
    forestduel: D({ leafsprite: 1, toadshaman: 2, windblade: 2, galerider: 1, bookworm: 1, scout: 2, stoneguard: 2, irongolem: 1, worldtree: 1, miasma: 2, spring: 1, squall: 1, lightbarrier: 1, nestbird: 1, rainmaiden: 1 }),
    fire: D({ embergob: 1, whelp: 3, flamelancer: 2, pyromancer: 2, scout: 1, gravekeeper: 1, ignis: 1, fireball: 2, warcry: 1, steelsword: 1, backfire: 2, meteor: 1, powdermage: 1, sunfield: 1, fusion: 1 }),
    mira2: D({ windblade: 3, galerider: 2, twindancer: 2, holylancer: 1, scout: 2, bookworm: 2, thunderarcher: 2, tempestdragon: 1, steelsword: 1, tome: 1, hex: 1, warcry: 1, thornmail: 1, lightbarrier: 1, squall: 1 }),
    elite: D({ windblade: 1, galerider: 2, twindancer: 2, holylancer: 2, scout: 1, thunderarcher: 2, tempestdragon: 1, voltrix: 1, steelsword: 1, tome: 1, smite: 1, warcry: 1, mirrorwall: 1, lightbarrier: 1, squall: 1, vanguard: 1, magpie: 1, fusion: 1 }),
    admin: D({ nightblade: 2, gravekeeper: 2, devourbug: 2, toadshaman: 2, thunderarcher: 1, irongolem: 2, nox: 1, earthtitan: 1, hex: 1, smite: 1, miasma: 1, sinkhole: 1, stunsnare: 1, backfire: 1, effigy: 1, wraith: 1, spellseal: 1 }),
    dark: D({ nightblade: 2, devourbug: 2, gravekeeper: 2, toadshaman: 1, scout: 1, irongolem: 2, nox: 1, tempestdragon: 1, earthtitan: 1, smite: 2, rebirth: 1, tome: 1, sinkhole: 1, mirrorwall: 1, stunsnare: 1, effigy: 1, wraith: 1, spellseal: 1, fusion: 1 }),
    mira3: D({ galerider: 2, holylancer: 3, twindancer: 2, thunderarcher: 2, scout: 1, tempestdragon: 1, voltrix: 1, lumiel: 1, steelsword: 1, tome: 1, smite: 1, rebirth: 1, warbanner: 1, mirrorwall: 1, lightbarrier: 1, vanguard: 1, magpie: 1, fusion: 1, spellseal: 1 }),
    zero: D({ nightblade: 2, holylancer: 2, devourbug: 1, scout: 1, irongolem: 2, pyromancer: 1, flamelancer: 1, nox: 1, lumiel: 1, arcadragon: 1, leviar: 1, smite: 2, rebirth: 1, tome: 1, meteor: 1, sinkhole: 1, mirrorwall: 1, stunsnare: 1, wraith: 1, archsage: 1, fusion: 1, spellseal: 1 }),
    champion: D({ holylancer: 2, galerider: 2, deepwarden: 2, scout: 1, thunderarcher: 2, irongolem: 1, earthtitan: 1, ignis: 1, leviar: 1, lumiel: 1, arcadragon: 1, smite: 2, rebirth: 1, tome: 1, warbanner: 1, mirrorwall: 2, lightbarrier: 1, archsage: 1, crystalturtle: 1, fusion: 1, rainfield: 1, spellseal: 1 }),
  };

  // 카드 팩: 티어별 무작위 3장
  X.PACKS = {
    pack1: { name: '새싹 팩', price: 400, tiers: [1, 1, 1, 2], desc: '입문용 카드 3장.' },
    pack2: { name: '폭풍 팩', price: 900, tiers: [1, 2, 2, 2, 3], desc: '중급 카드 중심 3장.' },
    pack3: { name: '군주 팩', price: 1800, tiers: [2, 2, 3, 3], desc: '상급 카드가 잘 나오는 3장.' },
  };
  X.openPack = function (packId, holder) {
    const p = X.PACKS[packId], out = [];
    for (let i = 0; i < 3; i++) {
      const tier = p.tiers[Math.floor(X.rngNext(holder) * p.tiers.length)];
      const pool = Object.values(C).filter((c) => c.tier === tier); // 티어 9(토큰·융합)는 팩에 나오지 않는다
      out.push(pool[Math.floor(X.rngNext(holder) * pool.length)].id);
    }
    return out;
  };
  X.DECK_MIN = 20; X.DECK_MAX = 30; X.COPY_MAX = 3;
})(typeof globalThis !== 'undefined' ? globalThis : this);
