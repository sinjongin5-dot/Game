// AI 컨트롤러 — 엔진의 request()에 대해 action을 돌려주는 순수 함수.
// 사람/AI/원격 플레이어가 모두 같은 submit() 경로를 쓰므로, 네트워크 대전은 이 자리에 원격 컨트롤러를 끼우면 된다.
(function (root) {
  const X = root.XG;
  const C = () => X.CARDS;

  function usableMoves(bt, i) {
    const b = bt.active(i), out = [];
    b.moves.forEach((m, k) => m.pp > 0 && out.push(k));
    return out.length ? out : [-1];
  }
  const firstAlive = (bt, i) => bt.side(i).team.findIndex((b, k) => b.hp > 0 && k !== bt.side(i).active);

  function ttAI(bt, i) {
    const o = 1 - i, sd = bt.side(i), b = bt.active(i), foe = bt.active(o), moves = usableMoves(bt, i);
    if (sd.wild) return { type: 'move', move: moves[Math.floor(X.rngNext(bt.aiRng) * moves.length)] };
    const heal = potion(bt, i); if (heal) return heal;
    let best = moves[0], bs = -1;
    for (const k of moves) {
      const mv = bt.moveOf(i, k), fx = mv.fx;
      let sc = 0;
      if (mv.pow > 0) {
        const stab = X.BEASTS[b.sp].types.includes(mv.type) ? 1.5 : 1;
        const d = bt.dmgCalc(b.lv, bt.bAtk(i), bt.bDef(o), mv.pow, X.eff(mv.type, X.BEASTS[foe.sp].types) * stab * 0.92 * bt.atkMult(i, mv) * bt.defMult(o, mv.type)) * (fx.multi ? (fx.multi[0] + fx.multi[1]) / 2 : 1);
        sc = Math.min(d, foe.hp) / foe.maxhp * 100 + (d >= foe.hp ? 60 + (fx.pri ? 20 : 0) : 0);
      } else if (fx.st) sc = foe.status ? 0 : fx.st[0] === 'slp' || fx.st[0] === 'par' ? 42 : 30;
      else if (fx.conf) sc = bt.side(o).conf > 0 ? 0 : 32;
      else if (fx.weather) sc = bt.s.weather ? 0 : X.BEASTS[b.sp].types.includes({ sun: 'fire', rain: 'water', sand: 'earth' }[fx.weather]) ? 38 : 12;
      else if (fx.protect) sc = b.hp < b.maxhp * 0.5 ? 14 : 4;
      else if (fx.heal) sc = b.hp < b.maxhp * 0.4 ? 75 : 0;
      else if (fx.self) sc = sd.stages[fx.self[0]] < 2 && b.hp > b.maxhp * 0.6 ? 34 : 0;
      else if (fx.foe) sc = bt.side(o).stages[fx.foe[0]] > -2 ? 22 : 0;
      sc *= (mv.acc / 100) * (0.85 + X.rngNext(bt.aiRng) * 0.3);
      if (sc > bs) { bs = sc; best = k; }
    }
    return { type: 'move', move: best };
  }

  // 보스 테이머는 가방의 회복약을 쓴다 (체력이 30% 아래일 때)
  function potion(bt, i) {
    const sd = bt.side(i), b = bt.active(i);
    if (!sd.bag || b.hp <= 0 || b.hp > b.maxhp * 0.3) return null;
    const k = ['hipotion', 'potion'].find((x) => sd.bag[x] > 0);
    return k ? { type: 'item', item: k, target: sd.active } : null;
  }
  function crossTamerAI(bt, i) {
    const o = 1 - i, sd = bt.side(i), opp = bt.side(o), b = bt.active(i), zones = bt.monZones(o);
    const heal = potion(bt, i); if (heal) return heal;
    let best = null, bs = -1, maxStrike = 0;
    const consider = (a, sc) => { if (sc > bs) { bs = sc; best = a; } };
    const moves = usableMoves(bt, i);
    for (const k of moves) { const mv = bt.moveOf(i, k); if (mv.pow > 0) maxStrike = Math.max(maxStrike, bt.strikeBase(i, mv, null)); }
    for (const k of moves) {
      const mv = bt.moveOf(i, k), fx = mv.fx, acc = mv.acc / 100;
      if (mv.pow > 0) {
        if (!zones.length) { const S = bt.strikeBase(i, mv, null) * 0.96; consider({ type: 'move', move: k, target: 'direct' }, (S + (S >= opp.lp ? 1e6 : 0)) * acc); continue; }
        for (const z of zones) {
          const m = opp.mons[z], c = C()[m.id];
          const S = bt.strikeBase(i, mv, m.faceDown ? null : c.attr) * 0.96;
          const val = m.faceDown ? 1100 : m.pos === 'atk' ? bt.getAtk(o, m) : bt.getDef(o, m);
          let sc;
          if (S >= val) { const lpd = m.pos === 'atk' && !m.faceDown ? S - val : 0; sc = 1500 + lpd * 1.5 + (m.faceDown ? 0 : bt.getAtk(o, m) * (m.pos === 'atk' ? 1 : 0.3)) + (lpd >= opp.lp ? 1e6 : 0); }
          else sc = S * 0.4 + (m.pos === 'atk' ? bt.getAtk(o, m) * 0.15 : 0);
          consider({ type: 'move', move: k, target: z }, sc * acc);
        }
      } else if (fx.weather) { if (!bt.s.weather && X.BEASTS[b.sp].types.includes({ sun: 'fire', rain: 'water', sand: 'earth' }[fx.weather])) consider({ type: 'move', move: k }, 1100); }
      else if (fx.protect) { if (b.hp < b.maxhp * 0.45 && zones.some((z) => !opp.mons[z].faceDown && opp.mons[z].pos === 'atk')) consider({ type: 'move', move: k }, 900 * X.rngNext(bt.aiRng)); }
      else if (fx.st || fx.foe || fx.conf) {
        for (const z of zones) {
          const m = opp.mons[z];
          if (m.faceDown || m.pos !== 'atk') continue;
          const a = bt.getAtk(o, m);
          if (a <= maxStrike) continue;
          if (fx.st && !m.status) consider({ type: 'move', move: k, target: z }, (fx.st[0] === 'psn' || fx.st[0] === 'brn' ? 900 : 1300) * acc);
          if (fx.foe) consider({ type: 'move', move: k, target: z }, 700 * acc);
          if (fx.conf && !m.status) consider({ type: 'move', move: k, target: z }, 1200 * acc);
        }
      } else if (fx.heal) { if (b.hp < b.maxhp * 0.35) consider({ type: 'move', move: k }, 2600); }
      else if (fx.self) { if (sd.stages[fx.self[0]] < 2 && b.hp > b.maxhp * 0.6) consider({ type: 'move', move: k }, fx.self[0] === 'atk' ? 1300 + X.rngNext(bt.aiRng) * 400 : 500); }
    }
    return best || { type: 'move', move: moves[0], target: zones.length ? zones[0] : 'direct' };
  }

  function duelAI(bt, i) {
    const s = bt.s, o = 1 - i, sd = bt.side(i), opp = bt.side(o), cross = opp.kind === 'tamer', cards = C();
    const oppZones = cross ? [] : bt.monZones(o);
    let oppMax = 0, oppStrong = -1;
    for (const z of oppZones) { const m = opp.mons[z]; if (!m.faceDown && m.pos === 'atk') { const a = bt.getAtk(o, m); if (a > oppMax) { oppMax = a; oppStrong = z; } } }
    // 크로스: 상대 비스트가 이 카드에 낼 수 있는 최대 스트라이크 추정
    const threat = (attr) => {
      if (!cross || bt.active(o).hp <= 0) return 0;
      let t = 0;
      for (const m of bt.active(o).moves) { const mv = X.MOVES[m.id]; if (m.pp > 0 && mv.pow > 0) t = Math.max(t, bt.strikeBase(o, mv, attr)); }
      return t;
    };
    const myAtkMax = Math.max(0, ...bt.monZones(i).map((z) => (sd.mons[z].faceDown ? 0 : bt.getAtk(i, sd.mons[z]))));
    const pickOpp = () => (oppStrong >= 0 ? oppStrong : oppZones[0]);

    // 1) 드로우 계열 먼저
    for (let h = 0; h < sd.hand.length; h++) { const c = cards[sd.hand[h]]; if (c.kind === 'spell' && c.ops && c.ops[0].op === 'draw' && bt.spellInfo(i, h)) return { type: 'spell', hand: h }; }

    // 1.5) 특수 소환과 기동 효과
    for (let h = 0; h < sd.hand.length; h++) if (bt.canSpecial(i, h)) return { type: 'special', hand: h };
    for (const z of bt.monZones(i)) {
      if (!bt.canIgnite(i, z)) continue;
      const g = cards[sd.mons[z].id].fx.ign;
      if (g.cost === 'lp' ? sd.lp > 1500 && sd.deck.length > 3 : g.cost === 'self' ? (cross ? bt.active(o).hp > bt.active(o).maxhp * 0.4 : oppMax >= 1600 && oppMax > myAtkMax) : true) return { type: 'ign', zone: z };
    }

    // 2) 일반 소환
    if (!sd.summoned) {
      let pick = null, pv = -1;
      for (let h = 0; h < sd.hand.length; h++) {
        const info = bt.canSummon(i, h);
        if (!info) continue;
        const c = cards[sd.hand[h]];
        let tr = [];
        if (info.need) {
          tr = bt.monZones(i).sort((a, b) => bt.getAtk(i, sd.mons[a]) - bt.getAtk(i, sd.mons[b])).slice(0, info.need);
          if (Math.max(...tr.map((z) => cards[sd.mons[z].id].atk)) + 400 > c.atk) continue;
        }
        const v = c.atk + (info.need ? 300 : 0) + (c.fx.onSummon ? 150 : 0);
        if (v > pv) { pv = v; pick = { h, c, tr }; }
      }
      if (pick) {
        const c = pick.c;
        let set;
        if (c.fx.onFlip) set = true;
        else if (cross) { const over = threat(c.attr) - c.atk; set = over > 0 && (over >= sd.lp * 0.4) && c.def >= c.atk * 0.6; }
        else set = oppMax > c.atk && !(c.fx.onSummon && oppMax - c.atk < sd.lp / 3) && !pick.tr.length;
        return { type: 'summon', hand: pick.h, pos: set ? 'set' : 'atk', tributes: pick.tr };
      }
    }

    // 3) 마법
    for (let h = 0; h < sd.hand.length; h++) {
      const c = cards[sd.hand[h]];
      if (c.kind !== 'spell') continue;
      const info = bt.spellInfo(i, h);
      if (!info) continue;
      if (c.sub === 'equip') {
        const zs = bt.monZones(i).filter((z) => !sd.mons[z].faceDown && (c.equip.atk ? sd.mons[z].pos === 'atk' : true));
        if (!zs.length) continue;
        zs.sort((a, b) => bt.getAtk(i, sd.mons[b]) - bt.getAtk(i, sd.mons[a]));
        return { type: 'spell', hand: h, target: c.equip.atk ? zs[0] : zs[zs.length - 1] };
      }
      if (info.target === 'fusion') {
        const zs = bt.monZones(i).filter((z) => !sd.mons[z].faceDown).sort((a, b) => bt.getAtk(i, sd.mons[a]) - bt.getAtk(i, sd.mons[b])).slice(0, 2);
        const fid = bt.fusionOf(i, zs);
        if (fid && cards[fid].atk >= bt.getAtk(i, sd.mons[zs[1]]) + 500) return { type: 'spell', hand: h, mats: zs };
        continue;
      }
      if (c.sub === 'cont') { if (sd.st.some((t) => t && t.id === c.id) || !bt.monZones(i).length) continue; return { type: 'spell', hand: h }; }
      const op = c.ops[0];
      let use = false, target;
      if (info.target === 'opp') target = pickOpp();
      switch (op.op) {
        case 'dmg': use = true; break;
        case 'weather': { const attr = { sun: 'fire', rain: 'water', sand: 'earth' }[op.w]; use = (!s.weather || s.weather.w !== op.w) && bt.monZones(i).some((z) => cards[sd.mons[z].id].attr === attr); break; }
        case 'heal': use = sd.lp <= sd.maxLp * 0.7; break;
        case 'destroyST': use = true; break;
        case 'revive': use = sd.grave.some((id) => cards[id].kind === 'mon' && cards[id].atk >= 1200); break;
        case 'destroy': use = cross ? bt.active(o).hp > bt.active(o).maxhp * 0.3 : oppStrong < 0 || oppMax >= 1200 || oppMax > myAtkMax; break;
        case 'status': use = cross ? !bt.active(o).status : oppStrong >= 0 && !opp.mons[oppStrong].status && oppMax >= myAtkMax; break;
        case 'bounce': use = cross ? bt.aliveCount(o) > 1 && opp.stages.atk > 0 : oppStrong >= 0 && oppMax > myAtkMax; break;
        case 'atk':
          if (op.who === 'allOwn') use = s.turn > 1 && bt.monZones(i).some((z) => bt.canAttack(i, z));
          else use = cross ? opp.stages.atk > -2 : oppStrong >= 0 && oppMax >= myAtkMax;
          break;
      }
      if (use) return { type: 'spell', hand: h, target };
    }

    // 4) 표시 형식 변경
    for (const z of bt.monZones(i)) {
      if (!bt.canChangePos(i, z)) continue;
      const m = sd.mons[z], c = cards[m.id], a = bt.getAtk(i, m);
      if (m.faceDown) { if (c.fx.onFlip ? cross || oppZones.length : a >= 1000 && (cross || a >= oppMax)) return { type: 'pos', zone: z }; }
      else if (m.pos === 'def') { if (cross ? a >= 900 && threat(c.attr) - a < sd.lp * 0.4 : a > oppMax && a >= 800) return { type: 'pos', zone: z }; }
      else if (cross) { if (threat(c.attr) - a >= sd.lp && bt.getDef(i, m) > a) return { type: 'pos', zone: z }; }
      else if (a < oppMax && !oppZones.some((t) => { const T = opp.mons[t]; return !T.faceDown && (T.pos === 'atk' ? bt.getAtk(o, T) : bt.getDef(o, T)) < a; })) return { type: 'pos', zone: z };
    }

    // 5) 공격
    let bestAtk = null, bsc = 0;
    for (const z of bt.monZones(i)) {
      if (!bt.canAttack(i, z)) continue;
      const a = bt.getAtk(i, sd.mons[z]);
      if (cross) return { type: 'attack', zone: z, target: 'beast' };
      if (!oppZones.length || cards[sd.mons[z].id].fx.direct) return { type: 'attack', zone: z, target: 'direct' };
      for (const t of oppZones) {
        const T = opp.mons[t];
        let sc = 0;
        if (T.faceDown) sc = a >= 1400 ? 300 : 0;
        else if (T.pos === 'atk') { const v = bt.getAtk(o, T); sc = a > v ? 1000 + v + (a - v) : a === v && v >= 1500 ? 100 : 0; }
        else { const v = bt.getDef(o, T); sc = a > v ? 500 + v : 0; }
        if (sc > bsc) { bsc = sc; bestAtk = { type: 'attack', zone: z, target: t }; }
      }
    }
    if (bestAtk) return bestAtk;

    // 6) 함정 세트
    for (let h = 0; h < sd.hand.length; h++) if (cards[sd.hand[h]].kind === 'trap' && bt.freeZone(sd.st) >= 0) return { type: 'setST', hand: h };
    return { type: 'end' };
  }

  function trapAI(bt, i, req) {
    const ctx = req.ctx, src = bt.side(ctx.side);
    if (ctx.type === 'summon') { const m = src.mons[ctx.zone]; if (m && bt.getAtk(ctx.side, m) < 1000) return { type: 'trap', idx: null }; }
    return { type: 'trap', idx: req.options[0] };
  }

  X.AI = {
    decide(bt, i) {
      const req = bt.request(i);
      if (!req) return null;
      if (req.kind === 'switch') return { type: 'switch', to: firstAlive(bt, i) };
      if (req.kind === 'trap') return trapAI(bt, i, req);
      if (req.kind === 'tamer') return bt.mode === 'tt' ? ttAI(bt, i) : crossTamerAI(bt, i);
      return duelAI(bt, i);
    },
    // AI끼리 끝까지 진행 (시뮬레이션/테스트용)
    autoPlay(bt, limit = 4000) {
      let n = 0;
      while (!bt.over && n++ < limit) {
        let acted = false;
        for (const i of [0, 1]) {
          const a = X.AI.decide(bt, i);
          if (!a) continue;
          if (bt.submit(i, a) === false) {
            const req = bt.request(i);
            if (req.kind === 'duel' && a.type !== 'end') bt.submit(i, { type: 'end' });
            else throw new Error('AI illegal action: ' + JSON.stringify(a) + ' req=' + JSON.stringify(req));
          }
          acted = true;
          bt.events.length = 0;
        }
        if (!acted) throw new Error('deadlock');
      }
      return n;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
