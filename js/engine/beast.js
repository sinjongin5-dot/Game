// 비스트 개체: 생성, 능력치, 경험치, 레벨업, 진화
(function (root) {
  const X = root.XG;

  X.EXP_MULT = 4; // 짧은 플레이 타임에 맞춘 성장 배율
  X.expFor = (lv) => Math.floor(0.8 * lv * lv * lv);

  X.calcStats = function (b) {
    const sp = X.BEASTS[b.sp], [hp, atk, def, spd] = sp.base, iv = b.iv;
    const st = (base, i) => Math.floor(((base * 2 + i) * b.lv) / 100) + 5;
    const oldMax = b.maxhp || 0;
    b.maxhp = Math.floor(((hp * 2 + iv[0]) * b.lv) / 100) + b.lv + 10;
    b.atk = st(atk, iv[1]); b.def = st(def, iv[2]); b.spd = st(spd, iv[3]);
    if (oldMax && b.hp > 0) b.hp = Math.min(b.maxhp, b.hp + (b.maxhp - oldMax));
    return b;
  };

  X.movesAt = function (spId, lv) {
    const ids = [];
    for (const [l, m] of X.BEASTS[spId].learn) if (l <= lv && !ids.includes(m)) ids.push(m);
    return ids.slice(-4).map((id) => ({ id, pp: X.MOVES[id].pp }));
  };

  X.makeBeast = function (spId, lv, holder) {
    const r = () => Math.floor(X.rngNext(holder) * 16);
    const b = { sp: spId, name: X.BEASTS[spId].name, lv, exp: X.expFor(lv), iv: [r(), r(), r(), r()], status: null, slp: 0, moves: X.movesAt(spId, lv) };
    X.calcStats(b);
    b.hp = b.maxhp;
    return b;
  };

  // 경험치 획득. 반환: [{lv, learned:[기술ID], pending:[기술ID]}] (pending = 기술 칸이 꽉 차 선택이 필요한 기술)
  X.gainExp = function (b, amount) {
    const ups = [];
    if (b.lv >= 100) return ups;
    b.exp += amount;
    while (b.lv < 100 && b.exp >= X.expFor(b.lv + 1)) {
      b.lv++;
      X.calcStats(b);
      const up = { lv: b.lv, learned: [], pending: [] };
      for (const [l, m] of X.BEASTS[b.sp].learn) {
        if (l !== b.lv || b.moves.some((x) => x.id === m)) continue;
        if (b.moves.length < 4) { b.moves.push({ id: m, pp: X.MOVES[m].pp }); up.learned.push(m); }
        else up.pending.push(m);
      }
      ups.push(up);
    }
    return ups;
  };

  X.canEvolve = (b) => { const e = X.BEASTS[b.sp].evo; return e && b.lv >= e[0] ? e[1] : null; };
  X.evolve = function (b) {
    const to = X.canEvolve(b);
    if (!to) return null;
    const wasDefault = b.name === X.BEASTS[b.sp].name;
    b.sp = to;
    if (wasDefault) b.name = X.BEASTS[to].name;
    X.calcStats(b);
    const news = [];
    for (const [l, m] of X.BEASTS[to].learn) {
      if (l > b.lv || l < X.BEASTS[to].learn.reduce((a, x) => Math.max(a, x[0] <= b.lv ? x[0] : 0), 0)) continue;
      if (!b.moves.some((x) => x.id === m)) news.push(m);
    }
    return { to, news };
  };

  X.healBeast = function (b) {
    b.hp = b.maxhp; b.status = null; b.slp = 0;
    for (const m of b.moves) m.pp = X.MOVES[m.id].pp;
  };

  // 듀얼 LP는 상대의 '격(레벨)'에 맞춰 정해진다. 카드의 절대 수치와 비스트의 레벨 성장을 맞물리게 하는 장치.
  X.lpForLevel = (lv) => Math.round((1400 + lv * 65) / 100) * 100;
})(typeof globalThis !== 'undefined' ? globalThis : this);
