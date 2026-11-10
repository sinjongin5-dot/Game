// 전투 엔진 — 세 가지 대전 방식을 하나의 결정론적 상태 기계로 처리한다.
//   tt    : 테이머 vs 테이머   (비스트 룰: 동시 선택, 스피드 순 행동)
//   dd    : 듀얼리스트 vs 듀얼리스트 (카드 룰: 번갈아 턴, 소환/마법/함정)
//   cross : 테이머 vs 듀얼리스트 (크로스 룰: 각 진영이 자기 규칙을 유지한 채 대결)
//
// 인터페이스 (멀티플레이 확장을 고려한 커맨드/이벤트 구조):
//   battle.request(side)        -> 그 진영이 지금 내려야 할 결정 (없으면 null)
//   battle.submit(side, action) -> 처리 후 이벤트 배열 (불법 행동이면 false, 상태 불변)
//   Battle.viewFor(state, side) -> 상대의 비공개 정보(패, 덱, 뒷면 카드)를 가린 상태
// 상태(this.s)는 순수 JSON이며 RNG 시드도 그 안에 있어, 시드 + 행동 열만으로 완전히 재현된다.
(function (root) {
  const X = root.XG;

  // 크로스 룰 환산 상수 (tools/sim.js 시뮬레이션으로 조정)
  X.CROSS = {
    LINK: 2300, LINKP: 1.43, // 링크 계수 K = LINK / 링크레벨^LINKP. 비스트 능력치 1 = 카드 수치 K
    BURN: 0.8,      // 효과 데미지 n -> 비스트 최대 HP의 (n / 시작 LP x BURN) 비율
    BASEPOW: 60,    // 위력 60 기술 = 공격 환산치 그대로
    STAB: 1.2,      // 자속 보정
    MONPOW: 62,     // 카드 몬스터가 비스트를 칠 때의 기술 위력 환산
    DESTROY: 0.35,  // '파괴' 효과 -> 비스트 최대 HP 비율 피해
    IMPACT: 0.5,    // 파괴하지 못한 몬스터의 ATK/DEF를 스트라이크의 이 비율만큼 깎음
    SPDLV: 400,     // 쾌속: 스피드 환산치 >= 격파 몬스터 레벨 x 이 값이면 추가 행동
  };
  const STRUGGLE = { id: 'struggle', name: '발버둥', type: 'normal', pow: 35, acc: 100, pp: 1, fx: {} };
  const stg = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
  const J = X.josa;
  const STAT_KO = { atk: '공격', def: '방어', spd: '스피드' };

  class Battle {
    constructor(o) {
      // 초기 조건과 행동 기록: (init, log)만 있으면 어느 기기에서든 같은 전투가 재현된다 (리플레이/락스텝/서버 검증용)
      this.init = X.clone({ seed: o.seed, sides: o.sides, link: o.link, wild: o.wild, noRun: o.noRun, expSide: o.expSide });
      this.log = [];
      this.aiRng = { seed: (o.seed | 0) ^ 0x5bd1e995 }; // AI 전용 난수 (전투 난수와 분리해 재현성 유지)
      this.s = {
        seed: o.seed | 0 || 1, turn: 0, cur: 0, wild: !!o.wild, noRun: !!o.noRun,
        expSide: o.expSide == null ? null : o.expSide, result: null, wait: null, uid: 1,
        choices: [null, null], follow: false, runTries: 0, sides: o.sides,
        link: Math.max(1, o.link || 10), // 링크 레벨: 듀얼리스트 쪽의 '격'. 크로스 환산의 기준이 된다.
      };
      this.events = [];
      const k = o.sides.map((x) => x.kind);
      this.mode = k[0] === 'tamer' && k[1] === 'tamer' ? 'tt' : k[0] === 'duelist' && k[1] === 'duelist' ? 'dd' : 'cross';
      this.s.mode = this.mode;
      for (const sd of this.s.sides) if (sd.kind === 'duelist') { X.shuffle(sd.deck, this.s); for (let i = 0; i < 4; i++) sd.hand.push(sd.deck.pop()); }
      if (this.mode === 'tt') this.ev('배틀 시작!');
      else {
        this.s.cur = this.mode === 'dd' ? (this.rnd() < 0.5 ? 0 : 1) : k.indexOf('duelist');
        this.ev(this.mode === 'dd' ? '듀얼 개시!' : '크로스 배틀 개시!');
        this.startTurn();
      }
    }

    static tamer(name, team, o = {}) {
      let a = team.findIndex((b) => b.hp > 0);
      if (a < 0) a = 0;
      const down = []; team.forEach((b, k) => b.hp <= 0 && down.push(k));
      return { kind: 'tamer', name, team, active: a, stages: { atk: 0, def: 0, spd: 0 }, bag: o.bag || null, part: [a], learn: [], down, wild: !!o.wild };
    }
    static duelist(name, deck, lp, o = {}) {
      return { kind: 'duelist', name, lp, maxLp: lp, deck: deck.slice(), hand: [], grave: [], mons: [null, null, null], st: [null, null, null], summoned: false, expLv: o.expLv || 0 };
    }

    // ───────── 공통 ─────────
    rnd() { return X.rngNext(this.s); }
    get K() { return Battle.linkK(this.s.link); }
    static linkK(link) { return link >= 9 ? X.CROSS.LINK / Math.pow(link, X.CROSS.LINKP) : 1650 / (1.3 * link + 5); }
    get over() { return !!this.s.result; }
    halted() { return !!this.s.result || !!this.s.wait; }
    side(i) { return this.s.sides[i]; }
    active(i) { const sd = this.s.sides[i]; return sd.team[sd.active]; }
    // 표시용 파생값(현재 ATK/DEF)을 상태에 기록
    derive() { this.s.sides.forEach((sd, i) => { if (sd.kind === 'duelist') for (const m of sd.mons) if (m) { m.a = this.getAtk(i, m); m.d = this.getDef(i, m); } }); }
    view(me) { this.derive(); return Battle.viewFor(this.s, me); }
    ev(text, fx) { this.derive(); this.events.push({ text, fx: fx || null, s: X.clone(this.s) }); }
    finish(winner, reason, text) {
      if (this.s.result) return;
      this.s.result = { winner, reason };
      this.s.wait = null;
      if (text) this.ev(text);
      const es = this.s.expSide;
      if (winner != null && winner === es && this.side(es).kind === 'tamer' && this.side(1 - es).kind === 'duelist')
        this.giveExp(es, this.side(1 - es).expLv * 42 * X.EXP_MULT);
    }

    request(i) {
      const s = this.s;
      if (s.result) return null;
      const w = s.wait;
      if (w) {
        if (w.kind === 'switch') return w.sides.includes(i) ? { kind: 'switch', forced: true } : null;
        return w.side === i ? { kind: 'trap', options: w.options, ctx: w.ctx } : null;
      }
      if (this.mode === 'tt') return s.choices[i] ? null : { kind: 'tamer' };
      if (s.cur !== i) return null;
      return s.sides[i].kind === 'tamer' ? { kind: 'tamer', cross: true } : { kind: 'duel' };
    }

    submit(i, a) {
      const n = this.events.length;
      const ok = this._submit(i, a);
      if (ok) this.log.push([i, X.clone(a)]);
      return ok ? this.events.slice(n) : false;
    }
    _submit(i, a) {
      const req = this.request(i), s = this.s;
      if (!req || !a) return false;
      if (req.kind === 'switch') {
        if (a.type !== 'switch' || !this.canSwitch(i, a.to)) return false;
        const w = s.wait;
        w.sides.splice(w.sides.indexOf(i), 1);
        this.switchIn(i, a.to);
        if (!w.sides.length) { s.wait = null; if (this.mode !== 'tt' && s.cur === i) this.advance(); }
        return true;
      }
      if (req.kind === 'trap') {
        if (a.type !== 'trap' || (a.idx != null && !req.options.includes(a.idx))) return false;
        const ctx = s.wait.ctx;
        s.wait = null;
        this.resumeTrap(ctx, a.idx == null ? null : a.idx);
        return true;
      }
      if (req.kind === 'tamer') return this.mode === 'tt' ? this.ttChoose(i, a) : this.crossTamer(i, a);
      return this.duelAct(i, a);
    }

    // ───────── 비스트 계산 ─────────
    bAtk(i) { const b = this.active(i); return b.atk * stg(this.side(i).stages.atk) * (b.status === 'brn' ? 0.5 : 1); }
    bDef(i) { return this.active(i).def * stg(this.side(i).stages.def); }
    bSpd(i) { const b = this.active(i); return b.spd * stg(this.side(i).stages.spd) * (b.status === 'par' ? 0.5 : 1); }
    canSwitch(i, to) { const sd = this.side(i), b = sd.team[to]; return !!b && b.hp > 0 && to !== sd.active; }
    aliveCount(i) { return this.side(i).team.filter((b) => b.hp > 0).length; }
    moveOf(i, idx) { const b = this.active(i); if (idx === -1) return b.moves.every((m) => m.pp <= 0) ? STRUGGLE : null; const m = b.moves[idx]; return m && m.pp > 0 ? X.MOVES[m.id] : null; }

    switchIn(i, to, quiet) {
      const sd = this.side(i);
      sd.active = to;
      sd.stages = { atk: 0, def: 0, spd: 0 };
      if (!sd.part.includes(to)) sd.part.push(to);
      if (!quiet) this.ev(`${sd.name}${sd.wild ? '' : '의'} ${J(sd.team[to].name, '이/가')} 나섰다!`, { k: 'enter', side: i });
    }
    stage(i, stat, n) {
      const st = this.side(i).stages, b = this.active(i), old = st[stat];
      st[stat] = X.clamp(old + n, -6, 6);
      if (st[stat] === old) return this.ev(`${b.name}의 ${STAT_KO[stat]}은 더 이상 변하지 않는다!`);
      this.ev(`${b.name}의 ${J(STAT_KO[stat], '이/가')} ${Math.abs(n) > 1 ? '크게 ' : ''}${n > 0 ? '올랐다' : '떨어졌다'}!`, { k: n > 0 ? 'buff' : 'debuff', side: i });
    }
    setBeastStatus(i, st, quiet) {
      const b = this.active(i);
      if (b.hp <= 0) return false;
      if (b.status) { if (!quiet) this.ev(`${J(b.name, '은/는')} 이미 상태이상이다.`); return false; }
      b.status = st;
      if (st === 'slp') b.slp = 1 + Math.floor(this.rnd() * 3);
      this.ev(`${J(b.name, '은/는')} ${{ psn: '독에 걸렸다', brn: '화상을 입었다', par: '마비되었다', slp: '잠들어 버렸다' }[st]}!`, { k: 'status', side: i });
      return true;
    }
    hurtBeast(i, dmg, fx) {
      const b = this.active(i);
      dmg = Math.max(1, Math.round(dmg));
      b.hp = Math.max(0, b.hp - dmg);
      return dmg;
    }
    // 행동 전 상태이상 체크. 행동 불가면 false
    preMove(i) {
      const b = this.active(i);
      if (b.status === 'slp') {
        if (--b.slp > 0) { this.ev(`${J(b.name, '은/는')} 쿨쿨 자고 있다.`); return false; }
        b.status = null; this.ev(`${J(b.name, '은/는')} 눈을 떴다!`);
      }
      if (b.status === 'par' && this.rnd() < 0.25) { this.ev(`${J(b.name, '은/는')} 몸이 저려 움직일 수 없다!`); return false; }
      return true;
    }
    tickBeast(i) {
      const b = this.active(i);
      if (b.hp <= 0 || !b.status) return;
      if (b.status === 'psn') { this.hurtBeast(i, b.maxhp / 8); this.ev(`${J(b.name, '은/는')} 독의 피해를 입었다!`, { k: 'hit', side: i }); }
      else if (b.status === 'brn') { this.hurtBeast(i, b.maxhp / 16); this.ev(`${J(b.name, '은/는')} 화상의 피해를 입었다!`, { k: 'hit', side: i }); }
      this.checkFaint(i);
    }
    // 쓰러짐 처리. 교체가 필요하면 wait를 건다.
    checkFaint(i) {
      const sd = this.side(i), b = this.active(i), s = this.s;
      if (sd.kind !== 'tamer' || b.hp > 0 || sd.down.includes(sd.active)) return false;
      sd.down.push(sd.active); b.status = null; b.slp = 0;
      this.ev(`${sd.wild ? '야생의 ' : ''}${J(b.name, '은/는')} 쓰러졌다!`, { k: 'faint', side: i });
      const o = 1 - i;
      if (s.expSide === o && this.side(o).kind === 'tamer') this.giveExp(o, Math.floor((X.BEASTS[b.sp].xp * b.lv) / 7 * (s.wild ? 1 : 1.5) * X.EXP_MULT));
      if (!this.aliveCount(i)) { this.finish(o, 'ko', `${J(sd.name, '은/는')} 더 싸울 비스트가 없다!`); return true; }
      if (s.wait && s.wait.kind === 'switch') { if (!s.wait.sides.includes(i)) s.wait.sides.push(i); }
      else s.wait = { kind: 'switch', sides: [i] };
      return true;
    }
    giveExp(i, total) {
      const sd = this.side(i);
      const part = sd.part.filter((x) => sd.team[x].hp > 0);
      if (!part.length || total <= 0) return;
      const each = Math.max(1, Math.floor(total / part.length));
      for (const x of part) {
        const b = sd.team[x];
        if (b.lv >= 100) continue;
        this.ev(`${J(b.name, '은/는')} 경험치 ${each}을 얻었다!`);
        for (const up of X.gainExp(b, each)) {
          this.ev(`${J(b.name, '은/는')} 레벨 ${up.lv}${up.lv % 10 === 0 || [1, 3, 6, 7, 8].includes(up.lv % 10) ? '이' : '가'} 되었다!`, { k: 'levelup', side: i });
          for (const m of up.learned) this.ev(`${J(b.name, '은/는')} 새로 ${J(X.MOVES[m].name, '을/를')} 배웠다!`);
          for (const m of up.pending) sd.learn.push({ idx: x, move: m });
        }
      }
      sd.part = [sd.active];
    }
    useItem(i, a) {
      const sd = this.side(i), it = X.ITEMS[a.item], b = sd.team[a.target];
      if (!sd.bag || !(sd.bag[a.item] > 0) || !it || !b) return false;
      if (it.heal) { if (b.hp <= 0 || b.hp >= b.maxhp) return false; }
      else if (it.cure) { if (b.hp <= 0 || !b.status) return false; }
      else if (it.revive) { if (b.hp > 0) return false; }
      else return false;
      return () => {
        sd.bag[a.item]--;
        if (it.heal) b.hp = Math.min(b.maxhp, b.hp + it.heal);
        if (it.cure) { b.status = null; b.slp = 0; }
        if (it.revive) { b.hp = Math.floor(b.maxhp / 2); sd.down = sd.down.filter((k) => k !== a.target); }
        this.ev(`${J(sd.name, '은/는')} ${J(it.name, '을/를')} 사용했다! ${J(b.name, '이/가')} ${it.heal ? '회복했다' : it.cure ? '말끔히 나았다' : '기운을 되찾았다'}.`, { k: 'heal', side: i });
      };
    }

    // ───────── 비스트 룰 (tt) ─────────
    ttChoose(i, a) {
      const s = this.s, sd = this.side(i);
      if (a.type === 'move') { if (!this.moveOf(i, a.move)) return false; }
      else if (a.type === 'switch') { if (!this.canSwitch(i, a.to)) return false; }
      else if (a.type === 'item') { if (!this.useItem(i, a)) return false; }
      else if (a.type === 'capture') { if (!s.wild || this.side(1 - i).wild !== true || !sd.bag || !(sd.bag[a.item] > 0) || !X.ITEMS[a.item].ball) return false; }
      else if (a.type === 'run') { if (!s.wild || s.noRun) return false; }
      else return false;
      s.choices[i] = a;
      if (s.choices[0] && s.choices[1]) this.resolveRound();
      return true;
    }
    resolveRound() {
      const s = this.s;
      s.turn++;
      const acts = [0, 1].map((i) => {
        const a = s.choices[i];
        const cls = a.type === 'move' ? ((this.moveOf(i, a.move) || STRUGGLE).fx.pri || 0) : a.type === 'run' ? 9 : a.type === 'switch' ? 7 : 8;
        return { i, a, cls, spd: this.bSpd(i), tie: this.rnd() };
      }).sort((x, y) => y.cls - x.cls || y.spd - x.spd || y.tie - x.tie);
      s.choices = [null, null];
      for (const { i, a } of acts) {
        if (this.over) return;
        if (a.type === 'run') this.tryRun(i);
        else if (a.type === 'capture') this.tryCapture(i, a.item);
        else if (a.type === 'item') { const f = this.useItem(i, a); if (f) f(); }
        else if (a.type === 'switch') { if (this.canSwitch(i, a.to)) { this.ev(`${J(this.side(i).name, '은/는')} ${J(this.active(i).name, '을/를')} 불러들였다.`); this.switchIn(i, a.to); } }
        else if (this.active(i).hp > 0 && this.active(1 - i).hp > 0) this.ttMove(i, a.move);
      }
      if (this.over) return;
      for (const i of [0, 1]) { this.tickBeast(i); if (this.over) return; }
    }
    tryRun(i) {
      const s = this.s; s.runTries++;
      const my = this.bSpd(i), foe = this.bSpd(1 - i);
      if (my >= foe || this.rnd() < (my * 128 / foe + 30 * s.runTries) / 256) this.finish(null, 'fled', '무사히 도망쳤다!');
      else this.ev('도망칠 수 없었다!');
    }
    tryCapture(i, itemId) {
      const sd = this.side(i), foe = this.active(1 - i), it = X.ITEMS[itemId];
      sd.bag[itemId]--;
      this.ev(`${J(sd.name, '은/는')} ${J(it.name, '을/를')} 던졌다!`, { k: 'capsule', side: 1 - i });
      const rate = X.BEASTS[foe.sp].catchRate;
      const p = Math.min(1, (((3 * foe.maxhp - 2 * foe.hp) * rate * it.ball) / (3 * foe.maxhp)) * (foe.status ? 1.5 : 1) / 255);
      if (this.rnd() < p) { this.s.captured = true; this.finish(i, 'capture', `신난다! ${J(foe.name, '을/를')} 포획했다!`); }
      else this.ev(this.rnd() < 0.5 ? '아쉽다! 조금만 더 하면 잡을 수 있었는데!' : '아앗! 캡슐에서 튀어나왔다!');
    }
    dmgCalc(lv, atk, def, pow, mult) { return Math.floor((Math.floor((2 * lv) / 5 + 2) * pow * atk / def) / 50 + 2) * mult; }
    ttMove(i, idx) {
      const o = 1 - i, b = this.active(i), foe = this.active(o);
      if (!this.preMove(i)) return;
      const mv = this.moveOf(i, idx) || STRUGGLE;
      if (idx >= 0 && b.moves[idx]) b.moves[idx].pp--;
      this.ev(`${this.side(i).wild ? '야생의 ' : ''}${b.name}의 ${mv.name}!`, { k: 'move', side: i, type: mv.type });
      if (this.rnd() * 100 >= mv.acc) return this.ev('그러나 빗나갔다!');
      const fx = mv.fx;
      if (mv.pow > 0) {
        const e = X.eff(mv.type, X.BEASTS[foe.sp].types);
        const crit = this.rnd() < 1 / 16;
        const stab = X.BEASTS[b.sp].types.includes(mv.type) ? 1.5 : 1;
        const d = this.hurtBeast(o, this.dmgCalc(b.lv, this.bAtk(i), this.bDef(o), mv.pow, e * stab * (crit ? 1.5 : 1) * (0.85 + this.rnd() * 0.15)));
        this.ev(crit ? '급소에 맞았다!' : e > 1 ? '효과가 굉장했다!' : e < 1 ? '효과가 별로인 듯하다…' : `${foe.name}에게 ${d}의 피해!`, { k: 'hit', side: o, type: mv.type, n: d });
        if (fx.drain && b.hp > 0) { b.hp = Math.min(b.maxhp, b.hp + Math.ceil(d / 2)); this.ev(`${J(b.name, '은/는')} 생기를 흡수했다!`, { k: 'heal', side: i }); }
        if (fx.st && foe.hp > 0 && !foe.status && this.rnd() * 100 < fx.st[1]) this.setBeastStatus(o, fx.st[0], true);
        this.checkFaint(o);
      } else this.selfOrFoeFx(i, mv, () => { if (fx.st) this.setBeastStatus(o, fx.st[0]); if (fx.foe) this.stage(o, fx.foe[0], fx.foe[1]); });
    }
    // 변화기 공통 처리 (자기 강화/회복은 어느 룰에서나 동일)
    selfOrFoeFx(i, mv, foeFn) {
      const b = this.active(i), fx = mv.fx;
      if (fx.self) this.stage(i, fx.self[0], fx.self[1]);
      if (fx.heal) {
        if (b.hp >= b.maxhp) this.ev('그러나 HP가 가득 차 있다!');
        else { b.hp = Math.min(b.maxhp, b.hp + Math.floor(b.maxhp * fx.heal)); this.ev(`${J(b.name, '은/는')} 체력을 회복했다!`, { k: 'heal', side: i }); }
      }
      if (fx.st || fx.foe) foeFn();
    }

    // ───────── 턴 진행 (dd / cross) ─────────
    startTurn() {
      const s = this.s, i = s.cur, sd = this.side(i);
      s.turn++; s.follow = false;
      this.ev(`── ${sd.name}의 턴 ──`, { k: 'turn', side: i });
      if (sd.kind !== 'duelist') return;
      sd.summoned = false;
      for (const m of sd.mons) if (m) { m.attacks = 0; m.moved = false; }
      if (s.turn > 1) {
        if (!sd.deck.length) return this.finish(1 - i, 'deck', `${J(sd.name, '은/는')} 더 이상 드로우할 카드가 없다!`);
        this.draw(i, 1);
      }
    }
    advance() { if (this.over) return; this.s.cur = 1 - this.s.cur; this.startTurn(); }
    draw(i, n) {
      const sd = this.side(i);
      let c = 0;
      while (n-- > 0 && sd.deck.length) { sd.hand.push(sd.deck.pop()); c++; }
      if (c) this.ev(`${J(sd.name, '은/는')} 카드를 ${c}장 드로우했다.`, { k: 'draw', side: i });
    }
    endTamerTurn(i) {
      if (this.halted()) return;
      this.tickBeast(i);
      if (this.halted()) return;
      this.advance();
    }
    endDuelTurn(i) {
      const sd = this.side(i);
      sd.mons.forEach((m, z) => {
        if (!m) return;
        m.tmpAtk = 0;
        if (m.status === 'psn') {
          m.atkMod -= 200; m.defMod -= 200;
          const c = X.CARDS[m.id];
          if (c.atk + m.atkMod <= 0) { this.ev(`${J(c.name, '은/는')} 독으로 쓰러졌다!`); this.destroyMon(i, z); }
        } else if ((m.status === 'par' || m.status === 'slp') && --m.stTurns <= 0) { m.status = null; this.ev(`${X.CARDS[m.id].name}의 상태이상이 풀렸다.`); }
      });
      if (this.halted()) return;
      this.advance();
    }

    // ───────── 카드 계산 ─────────
    aura(i, card, key) {
      const sd = this.side(i);
      let v = 0;
      for (const m of sd.mons) if (m && !m.faceDown) { const a = X.CARDS[m.id].fx.aura; if (a && (!a.attr || a.attr === card.attr)) v += a[key] || 0; }
      for (const t of sd.st) if (t && !t.faceDown) { const a = X.CARDS[t.id].aura; if (a && (!a.attr || a.attr === card.attr)) v += a[key] || 0; }
      return v;
    }
    equipSum(i, m, key) { let v = 0; for (const t of this.side(i).st) if (t && t.equipTo === m.uid) v += X.CARDS[t.id].equip[key]; return v; }
    getAtk(i, m) { const c = X.CARDS[m.id]; return Math.max(0, Math.round((c.atk + m.atkMod + (m.tmpAtk || 0) + this.equipSum(i, m, 'atk') + this.aura(i, c, 'atk')) * (m.status === 'brn' ? 0.7 : 1))); }
    getDef(i, m) { const c = X.CARDS[m.id]; return Math.max(0, c.def + m.defMod + this.equipSum(i, m, 'def') + this.aura(i, c, 'def')); }
    monZones(i) { const out = []; this.side(i).mons.forEach((m, z) => m && out.push(z)); return out; }
    freeZone(arr) { return arr.findIndex((x) => !x); }
    eligibleTraps(i, trig) {
      const sd = this.side(i), out = [];
      if (sd.kind !== 'duelist') return out;
      sd.st.forEach((t, z) => { if (t && t.faceDown && t.setTurn < this.s.turn && X.CARDS[t.id].trigger === trig) out.push(z); });
      return out;
    }
    tributeNeed(card) { return card.lv >= 7 ? 2 : card.lv >= 5 ? 1 : 0; }
    canSummon(i, h) {
      const sd = this.side(i), c = X.CARDS[sd.hand[h]];
      if (!c || c.kind !== 'mon' || sd.summoned) return null;
      const need = this.tributeNeed(c), have = this.monZones(i).length;
      if (have < need || (need === 0 && have >= 3)) return null;
      return { need };
    }
    canAttack(i, z) {
      const m = this.side(i).mons[z];
      return !!m && this.s.turn > 1 && !m.faceDown && m.pos === 'atk' && m.attacks < (X.CARDS[m.id].fx.twice ? 2 : 1) && m.status !== 'par' && m.status !== 'slp';
    }
    canChangePos(i, z) { const m = this.side(i).mons[z]; return !!m && !m.moved && m.turn < this.s.turn && !m.attacks && m.status !== 'slp'; }
    // 마법 발동 가능 여부. {target:'opp'|'own'|null} 또는 null
    spellInfo(i, h) {
      const sd = this.side(i), c = X.CARDS[sd.hand[h]], o = 1 - i, opp = this.side(o);
      if (!c || c.kind !== 'spell') return null;
      if (c.sub !== 'normal' && this.freeZone(sd.st) < 0) return null;
      if (c.sub === 'equip') return sd.mons.some((m) => m && !m.faceDown) ? { target: 'own' } : null;
      if (c.target === 'opp') { if (opp.kind === 'tamer') return { target: null }; return this.monZones(o).length ? { target: 'opp' } : null; }
      for (const op of c.ops || []) {
        if (op.op === 'destroyST' && !(opp.kind === 'duelist' && opp.st.some((t) => t))) return null;
        if (op.op === 'revive' && !(sd.grave.some((id) => X.CARDS[id].kind === 'mon') && this.freeZone(sd.mons) >= 0)) return null;
        if (op.op === 'atk' && op.who === 'allOwn' && !sd.mons.some((m) => m && !m.faceDown)) return null;
      }
      return { target: null };
    }

    // ───────── 카드 룰 행동 ─────────
    duelAct(i, a) {
      const s = this.s, sd = this.side(i), o = 1 - i, opp = this.side(o);
      switch (a.type) {
        case 'summon': {
          const info = this.canSummon(i, a.hand);
          if (!info) return false;
          const tr = a.tributes || [];
          if (tr.length !== info.need || new Set(tr).size !== tr.length || tr.some((z) => !sd.mons[z])) return false;
          const c = X.CARDS[sd.hand[a.hand]];
          sd.hand.splice(a.hand, 1);
          for (const z of tr) this.toGrave(i, z);
          const set = a.pos === 'set', z = this.freeZone(sd.mons);
          const m = (sd.mons[z] = this.newMon(c.id, set ? 'def' : 'atk', set));
          sd.summoned = true;
          this.ev(set ? `${J(sd.name, '은/는')} 몬스터를 뒷면 수비로 세트했다.` : `${J(sd.name, '은/는')} ${tr.length ? '제물을 바쳐 ' : ''}${J(c.name, '을/를')} 소환! (ATK ${c.atk})`, { k: 'summon', side: i, zone: z });
          if (set) return true;
          if (c.fx.onSummon) this.runOps(c.fx.onSummon, { side: i, name: c.name });
          if (this.halted() || sd.mons[z] !== m) return true;
          const traps = this.eligibleTraps(o, 'summon');
          if (traps.length) s.wait = { kind: 'trap', side: o, options: traps, ctx: { type: 'summon', side: i, zone: z, uid: m.uid } };
          return true;
        }
        case 'spell': {
          const info = this.spellInfo(i, a.hand);
          if (!info) return false;
          const c = X.CARDS[sd.hand[a.hand]];
          if (info.target === 'opp' && !opp.mons[a.target]) return false;
          if (info.target === 'own' && !(sd.mons[a.target] && !sd.mons[a.target].faceDown)) return false;
          sd.hand.splice(a.hand, 1);
          this.ev(`${J(sd.name, '은/는')} 마법 카드 「${c.name}」 발동!`, { k: 'spell', side: i, card: c.id });
          if (c.sub === 'equip') { sd.st[this.freeZone(sd.st)] = { id: c.id, faceDown: false, equipTo: sd.mons[a.target].uid }; this.ev(`${X.CARDS[sd.mons[a.target].id].name}에게 장착되었다.`, { k: 'buff', side: i, zone: a.target }); }
          else if (c.sub === 'cont') sd.st[this.freeZone(sd.st)] = { id: c.id, faceDown: false };
          else { this.runOps(c.ops, { side: i, name: c.name, target: a.target }); sd.grave.push(c.id); }
          return true;
        }
        case 'setST': {
          const c = X.CARDS[sd.hand[a.hand]], z = this.freeZone(sd.st);
          if (!c || c.kind !== 'trap' || z < 0) return false;
          sd.hand.splice(a.hand, 1);
          sd.st[z] = { id: c.id, faceDown: true, setTurn: s.turn };
          this.ev(`${J(sd.name, '은/는')} 카드를 1장 세트했다.`, { k: 'set', side: i });
          return true;
        }
        case 'pos': {
          if (!this.canChangePos(i, a.zone)) return false;
          const m = sd.mons[a.zone], c = X.CARDS[m.id];
          m.moved = true;
          if (m.faceDown) {
            m.faceDown = false; m.pos = 'atk';
            this.ev(`${J(sd.name, '은/는')} ${J(c.name, '을/를')} 반전 소환!`, { k: 'summon', side: i, zone: a.zone });
            if (c.fx.onFlip) this.runOps(c.fx.onFlip, { side: i, name: c.name });
          } else { m.pos = m.pos === 'atk' ? 'def' : 'atk'; this.ev(`${J(c.name, '은/는')} ${m.pos === 'atk' ? '공격' : '수비'} 표시가 되었다.`); }
          return true;
        }
        case 'attack': {
          if (!this.canAttack(i, a.zone)) return false;
          const m = sd.mons[a.zone];
          let target = a.target;
          if (opp.kind === 'tamer') target = 'beast';
          else if (this.monZones(o).length) { if (!opp.mons[target]) return false; }
          else target = 'direct';
          m.attacks++;
          const c = X.CARDS[m.id];
          this.ev(`${c.name}의 공격!${target === 'direct' ? ' 다이렉트 어택!' : ''}`, { k: 'attack', side: i, zone: a.zone, target });
          const ctx = { type: 'attack', side: i, zone: a.zone, uid: m.uid, target };
          const traps = this.eligibleTraps(o, 'attack');
          if (traps.length) s.wait = { kind: 'trap', side: o, options: traps, ctx };
          else this.resolveAttack(ctx, false);
          return true;
        }
        case 'run': {
          if (!s.wild || s.noRun) return false;
          this.finish(null, 'fled', '무사히 도망쳤다!');
          return true;
        }
        case 'end': this.endDuelTurn(i); return true;
      }
      return false;
    }
    newMon(id, pos, faceDown) { return { uid: this.s.uid++, id, pos, faceDown, turn: this.s.turn, attacks: 0, moved: false, atkMod: 0, defMod: 0, tmpAtk: 0, status: null, stTurns: 0 }; }
    // 필드를 떠날 때의 정리 (장착 카드는 묘지로)
    toGrave(i, z, toHand) {
      const sd = this.side(i), m = sd.mons[z];
      sd.mons[z] = null;
      (toHand ? sd.hand : sd.grave).push(m.id);
      sd.st.forEach((t, k) => { if (t && t.equipTo === m.uid) { sd.grave.push(t.id); sd.st[k] = null; } });
      return m;
    }
    destroyMon(i, z) {
      const m = this.side(i).mons[z];
      if (!m) return;
      const c = X.CARDS[m.id];
      this.toGrave(i, z);
      this.ev(`${J(c.name, '이/가')} 파괴되었다!`, { k: 'destroy', side: i, zone: z });
      if (c.fx.onDestroy) this.runOps(c.fx.onDestroy, { side: i, name: c.name });
    }
    hurtLP(i, n, text) {
      const sd = this.side(i);
      n = Math.max(0, Math.round(n));
      if (!n) return;
      sd.lp = Math.max(0, sd.lp - n);
      this.ev(text || `${sd.name}에게 ${n} 데미지!`, { k: 'lp', side: i, n });
      if (sd.lp <= 0) this.finish(1 - i, 'lp', `${sd.name}의 LP가 0이 되었다!`);
    }
    // 플레이어에게 가는 효과 데미지. 테이머는 LP가 없으므로 선두 비스트가 대신 받는다 (n/K HP).
    hurtPlayer(i, n) {
      const sd = this.side(i);
      if (sd.kind === 'duelist') return this.hurtLP(i, n);
      const b = this.active(i), d = this.hurtBeast(i, b.maxhp * n / this.side(1 - i).maxLp * X.CROSS.BURN);
      this.ev(`${J(b.name, '이/가')} 대신 ${d}의 피해를 받았다!`, { k: 'hit', side: i, n: d });
      this.checkFaint(i);
    }

    // 대상 해석: {side, zone} (테이머 쪽은 zone === 'beast')
    unit(who, ctx) {
      const o = 1 - ctx.side, opp = this.side(o);
      if (who === 'attacker') return ctx.attacker;
      if (who === 'summoned') return ctx.summoned;
      if (opp.kind === 'tamer') return { side: o, zone: 'beast' };
      if (who === 'target') return opp.mons[ctx.target] ? { side: o, zone: ctx.target } : null;
      if (who === 'strongest') {
        let best = null, bv = -1;
        opp.mons.forEach((m, z) => { if (!m) return; const v = m.faceDown ? 0 : this.getAtk(o, m) + 1; if (v > bv) { bv = v; best = z; } });
        return best == null ? null : { side: o, zone: best };
      }
      return null;
    }
    unitAlive(u) {
      if (!u) return false;
      if (u.zone === 'beast') return this.active(u.side).hp > 0;
      const m = this.side(u.side).mons[u.zone];
      return !!m && (u.uid == null || m.uid === u.uid);
    }
    // ── 크로스 환산: 카드 효과가 비스트에게 닿을 때 ──
    unitDestroy(u) {
      if (!this.unitAlive(u)) return;
      if (u.zone !== 'beast') return this.destroyMon(u.side, u.zone);
      const b = this.active(u.side), d = this.hurtBeast(u.side, b.maxhp * X.CROSS.DESTROY);
      this.ev(`파괴의 힘이 ${J(b.name, '을/를')} 덮쳤다! ${d}의 피해!`, { k: 'hit', side: u.side, n: d });
      this.checkFaint(u.side);
    }
    unitAtk(u, n, temp) {
      if (!this.unitAlive(u)) return;
      if (u.zone === 'beast') return this.stage(u.side, 'atk', (n > 0 ? 1 : -1) * (Math.abs(n) >= 500 ? 2 : 1));
      const m = this.side(u.side).mons[u.zone];
      if (temp) m.tmpAtk = (m.tmpAtk || 0) + n; else m.atkMod += n;
      if (!m.faceDown) this.ev(`${X.CARDS[m.id].name}의 ATK ${n > 0 ? '+' : ''}${n}!`, { k: n > 0 ? 'buff' : 'debuff', side: u.side, zone: u.zone });
    }
    unitStatus(u, st) {
      if (!this.unitAlive(u)) return;
      if (u.zone === 'beast') return this.setBeastStatus(u.side, st);
      const m = this.side(u.side).mons[u.zone], c = X.CARDS[m.id];
      if (m.status) return this.ev(`${J(m.faceDown ? '그 몬스터' : c.name, '은/는')} 이미 상태이상이다.`);
      m.status = st;
      m.stTurns = (st === 'slp' ? 2 : 1) + (this.s.cur === u.side ? 1 : 0);
      this.ev(`${J(m.faceDown ? '세트 몬스터' : c.name, '은/는')} ${{ psn: '독에 걸렸다 (매 턴 ATK/DEF -200)', brn: '화상을 입었다 (ATK 30% 감소)', par: '마비되어 다음 턴 공격할 수 없다', slp: '잠들어 공격할 수 없다' }[st]}!`, { k: 'status', side: u.side, zone: u.zone });
    }
    unitBounce(u) {
      if (!this.unitAlive(u)) return;
      const sd = this.side(u.side);
      if (u.zone !== 'beast') { const m = this.toGrave(u.side, u.zone, true); return this.ev(`${J(X.CARDS[m.id].name, '은/는')} 패로 되돌아갔다!`, { k: 'destroy', side: u.side, zone: u.zone }); }
      const others = sd.team.map((b, k) => k).filter((k) => k !== sd.active && sd.team[k].hp > 0);
      if (!others.length) return this.ev('그러나 교체할 비스트가 없다!');
      this.ev(`${J(this.active(u.side).name, '은/는')} 바람에 휩쓸려 물러났다!`);
      this.switchIn(u.side, others[Math.floor(this.rnd() * others.length)]);
    }

    runOps(ops, ctx) {
      const res = {}, i = ctx.side, o = 1 - i, sd = this.side(i), opp = this.side(o);
      for (const op of ops) {
        if (this.over) break;
        switch (op.op) {
          case 'dmg': this.hurtPlayer(o, op.n); break;
          case 'heal': sd.lp += op.n; this.ev(`${sd.name}의 LP가 ${op.n} 회복되었다.`, { k: 'heal', side: i, lp: 1 }); break;
          case 'draw': this.draw(i, op.n); break;
          case 'negate': res.negate = true; break;
          case 'destroy': this.unitDestroy(this.unit(op.who, ctx)); break;
          case 'status': this.unitStatus(this.unit(op.who, ctx), op.st); break;
          case 'bounce': this.unitBounce(this.unit(op.who, ctx)); break;
          case 'atk': {
            if (op.who === 'allOwn') sd.mons.forEach((m, z) => m && !m.faceDown && this.unitAtk({ side: i, zone: z }, op.n, op.temp));
            else if (op.who === 'allOpp') { if (opp.kind === 'tamer') this.unitAtk({ side: o, zone: 'beast' }, op.n); else opp.mons.forEach((m, z) => m && !m.faceDown && this.unitAtk({ side: o, zone: z }, op.n, op.temp)); }
            else this.unitAtk(this.unit(op.who, ctx), op.n, op.temp);
            break;
          }
          case 'destroyST': {
            if (opp.kind !== 'duelist') break;
            const zs = []; opp.st.forEach((t, z) => t && zs.push(z));
            if (!zs.length) break;
            const z = zs.find((k) => !opp.st[k].faceDown) ?? zs[Math.floor(this.rnd() * zs.length)];
            const t = opp.st[z]; opp.st[z] = null; opp.grave.push(t.id);
            this.ev(`${opp.name}의 「${X.CARDS[t.id].name}」이(가) 파괴되었다!`, { k: 'destroy', side: o });
            break;
          }
          case 'revive': {
            const z = this.freeZone(sd.mons);
            let best = -1;
            sd.grave.forEach((id, k) => { const c = X.CARDS[id]; if (c.kind === 'mon' && c.name !== ctx.name && (best < 0 || c.atk > X.CARDS[sd.grave[best]].atk)) best = k; });
            if (z < 0 || best < 0) break;
            const id = sd.grave.splice(best, 1)[0];
            sd.mons[z] = this.newMon(id, 'atk', false);
            this.ev(`${J(X.CARDS[id].name, '이/가')} 묘지에서 되살아났다!`, { k: 'summon', side: i, zone: z });
            break;
          }
          case 'search': {
            const idxs = []; sd.deck.forEach((id, k) => { const c = X.CARDS[id]; if (c.kind === 'mon' && c.lv <= 4) idxs.push(k); });
            if (!idxs.length) break;
            const id = sd.deck.splice(idxs[Math.floor(this.rnd() * idxs.length)], 1)[0];
            sd.hand.push(id);
            this.ev(`${J(sd.name, '은/는')} 덱에서 몬스터 1장을 패에 넣었다.`, { k: 'draw', side: i });
            break;
          }
        }
      }
      return res;
    }

    resumeTrap(ctx, idx) {
      const owner = 1 - ctx.side;
      let neg = false;
      if (idx != null) {
        const sd = this.side(owner), t = sd.st[idx], c = X.CARDS[t.id];
        sd.st[idx] = null; sd.grave.push(c.id);
        this.ev(`${sd.name}의 함정 발동! 「${c.name}」`, { k: 'trap', side: owner, card: c.id });
        const u = ctx.type === 'beastMove' || ctx.type === 'switchIn' ? { side: ctx.side, zone: 'beast' } : { side: ctx.side, zone: ctx.zone, uid: ctx.uid };
        neg = !!this.runOps(c.ops, { side: owner, name: c.name, attacker: u, summoned: u }).negate;
      }
      if (ctx.type === 'beastMove') this.beastStrike(ctx, neg);
      else if (ctx.type === 'attack') this.resolveAttack(ctx, neg);
      else if (ctx.type === 'switchIn') this.endTamerTurn(ctx.side);
    }

    resolveAttack(ctx, neg) {
      const i = ctx.side, o = 1 - i, sd = this.side(i), opp = this.side(o), A = sd.mons[ctx.zone];
      if (this.over || !A || A.uid !== ctx.uid) return;
      if (neg) return this.ev('공격은 무효가 되었다!');
      const ca = X.CARDS[A.id], a = this.getAtk(i, A);
      if (opp.kind === 'tamer') {
        // 카드 몬스터 -> 비스트: 비스트 룰의 데미지 공식으로 HP를 깎는다 (속성 상성 적용)
        if (this.active(o).hp <= 0) return;
        const b = this.active(o), e = X.eff(ca.attr, X.BEASTS[b.sp].types);
        const d = this.hurtBeast(o, Battle.monHit(a, this.bDef(o), e * (0.9 + this.rnd() * 0.1), this.s.link));
        this.ev(`${b.name}에게 ${d}의 피해!${e > 1 ? ' 효과가 굉장했다!' : e < 1 ? ' 효과가 별로인 듯하다…' : ''}`, { k: 'hit', side: o, type: ca.attr, n: d });
        this.checkFaint(o);
        return;
      }
      if (ctx.target === 'direct') return this.hurtLP(o, a);
      const T = opp.mons[ctx.target];
      if (!T) return;
      const ct = X.CARDS[T.id], flipped = T.faceDown;
      if (flipped) { T.faceDown = false; this.ev(`뒷면 몬스터는 ${ct.name}! (DEF ${this.getDef(o, T)})`, { k: 'flip', side: o, zone: ctx.target }); }
      if (T.pos === 'atk') {
        const t = this.getAtk(o, T);
        if (a > t) { this.destroyMon(o, ctx.target); this.hurtLP(o, a - t); }
        else if (a === t) { this.destroyMon(o, ctx.target); if (sd.mons[ctx.zone] === A) this.destroyMon(i, ctx.zone); }
        else { this.destroyMon(i, ctx.zone); this.hurtLP(i, t - a); }
      } else {
        const d = this.getDef(o, T);
        if (a > d) { this.destroyMon(o, ctx.target); if (ca.fx.pierce) this.hurtLP(o, a - d, `관통! ${opp.name}에게 ${a - d} 데미지!`); }
        else if (a < d) this.hurtLP(i, d - a, `수비를 뚫지 못했다! ${sd.name}에게 ${d - a} 반사 데미지!`);
        else this.ev('공격이 막혔다!');
      }
      if (flipped && ct.fx.onFlip && !this.over) { this.ev(`${ct.name}의 리버스 효과!`); this.runOps(ct.fx.onFlip, { side: o, name: ct.name }); }
    }
    static monHit(atk, def, mult, link) {
      const A = atk / Battle.linkK(link), lv = link;
      return Math.max(1, Math.floor(((Math.floor((2 * lv) / 5 + 2) * X.CROSS.MONPOW * A / def) / 50 + 2) * mult));
    }

    // ───────── 크로스 룰: 테이머의 턴 ─────────
    // 스트라이크 = 공격 x K x (위력/60) x 자속 x 상성. 카드 룰대로 ATK/DEF와 비교한다.
    strikeBase(i, mv, attr) {
      const b = this.active(i), K = X.CROSS;
      return this.bAtk(i) * this.K * (mv.pow / K.BASEPOW) * (X.BEASTS[b.sp].types.includes(mv.type) ? K.STAB : 1) * (attr ? X.eff(mv.type, [attr]) : 1);
    }
    crossTamer(i, a) {
      const s = this.s, o = 1 - i, opp = this.side(o), b = this.active(i);
      if (a.type === 'switch') {
        if (!this.canSwitch(i, a.to)) return false;
        this.ev(`${J(this.side(i).name, '은/는')} ${J(b.name, '을/를')} 불러들였다.`);
        this.switchIn(i, a.to);
        const traps = this.eligibleTraps(o, 'summon');
        if (traps.length) s.wait = { kind: 'trap', side: o, options: traps, ctx: { type: 'switchIn', side: i } };
        else this.endTamerTurn(i);
        return true;
      }
      if (a.type === 'item') { const f = this.useItem(i, a); if (!f) return false; f(); this.endTamerTurn(i); return true; }
      if (a.type !== 'move') return false;
      const mv = this.moveOf(i, a.move);
      if (!mv) return false;
      const zones = this.monZones(o);
      let target = null;
      if (mv.pow > 0 || mv.fx.st || mv.fx.foe) {
        if (zones.length) { if (!opp.mons[a.target]) return false; target = a.target; }
        else target = mv.pow > 0 ? 'direct' : null;
      }
      if (!this.preMove(i)) { this.endTamerTurn(i); return true; }
      if (a.move >= 0) b.moves[a.move].pp--;
      this.ev(`${b.name}의 ${mv.name}!`, { k: 'move', side: i, type: mv.type, target });
      if (mv.pow > 0) {
        const ctx = { type: 'beastMove', side: i, mv: mv.id, target };
        const traps = this.eligibleTraps(o, 'attack');
        if (traps.length) s.wait = { kind: 'trap', side: o, options: traps, ctx };
        else this.beastStrike(ctx, false);
        return true;
      }
      if (this.rnd() * 100 >= mv.acc) this.ev('그러나 빗나갔다!');
      else this.selfOrFoeFx(i, mv, () => {
        if (target == null) return this.ev('그러나 대상이 없다!');
        const u = { side: o, zone: target };
        if (mv.fx.st) this.unitStatus(u, mv.fx.st[0]);
        if (mv.fx.foe) { const m = opp.mons[target], n = -300 * Math.abs(mv.fx.foe[1]); if (mv.fx.foe[0] === 'def') { m.defMod += n; this.ev(`${m.faceDown ? '세트 몬스터' : X.CARDS[m.id].name}의 DEF ${n}!`, { k: 'debuff', side: o, zone: target }); } else this.unitAtk(u, n); }
      });
      this.endTamerTurn(i);
      return true;
    }
    beastStrike(ctx, neg) {
      const i = ctx.side, o = 1 - i, opp = this.side(o), s = this.s, K = X.CROSS;
      if (this.halted()) return;
      const b = this.active(i), mv = ctx.mv === 'struggle' ? STRUGGLE : X.MOVES[ctx.mv];
      if (neg) { this.ev('공격은 무효가 되었다!'); return this.endTamerTurn(i); }
      if (this.rnd() * 100 >= mv.acc) { this.ev('그러나 빗나갔다!'); return this.endTamerTurn(i); }
      const crit = this.rnd() < 1 / 16;
      const roll = (crit ? 1.4 : 1) * (0.92 + this.rnd() * 0.08);
      let kill = null;
      if (ctx.target === 'direct' || !opp.mons[ctx.target]) {
        const S = Math.round(this.strikeBase(i, mv, null) * roll / 10) * 10;
        this.hurtLP(o, S, `${crit ? '급소 일격! ' : ''}다이렉트 어택! ${opp.name}에게 ${S} 데미지!`);
      } else {
        const z = ctx.target, m = opp.mons[z], c = X.CARDS[m.id], flipped = m.faceDown;
        if (flipped) { m.faceDown = false; this.ev(`뒷면 몬스터는 ${c.name}!`, { k: 'flip', side: o, zone: z }); }
        const e = X.eff(mv.type, [c.attr]);
        const S = Math.round(this.strikeBase(i, mv, c.attr) * roll / 10) * 10;
        const val = m.pos === 'atk' ? this.getAtk(o, m) : this.getDef(o, m);
        const tag = `${crit ? '급소 일격! ' : ''}${e > 1 ? '효과가 굉장했다! ' : e < 1 ? '효과가 별로인 듯하다… ' : ''}`;
        this.ev(`${tag}스트라이크 ${S} vs ${m.pos === 'atk' ? 'ATK' : 'DEF'} ${val}`, { k: 'hit', side: o, zone: z, type: mv.type });
        if (S >= val) {
          kill = c;
          this.destroyMon(o, z);
          if (m.pos === 'atk' && !this.over) this.hurtLP(o, S - val);
        } else {
          const n = Math.round(S * K.IMPACT / 50) * 50;
          m.atkMod -= n; m.defMod -= n;
          this.ev(`${J(c.name, '은/는')} 버텨냈지만 충격으로 ATK/DEF가 ${n} 감소했다!`, { k: 'debuff', side: o, zone: z });
          if (mv.fx.st && !m.status && this.rnd() * 100 < mv.fx.st[1]) this.unitStatus({ side: o, zone: z }, mv.fx.st[0]);
        }
        if (mv.fx.drain && b.hp > 0 && b.hp < b.maxhp) { b.hp = Math.min(b.maxhp, b.hp + Math.ceil(b.maxhp / 8)); this.ev(`${J(b.name, '은/는')} 생기를 흡수했다!`, { k: 'heal', side: i }); }
        if (flipped && c.fx.onFlip && !this.over) { this.ev(`${c.name}의 리버스 효과!`); this.runOps(c.fx.onFlip, { side: o, name: c.name }); }
      }
      if (this.halted()) return;
      if (kill && !s.follow && this.bSpd(i) * this.K >= kill.lv * K.SPDLV) {
        s.follow = true;
        return this.ev(`쾌속! ${J(b.name, '은/는')} 한 번 더 행동할 수 있다!`, { k: 'buff', side: i });
      }
      this.endTamerTurn(i);
    }

    // 기록으로부터 전투를 재현한다. 반환된 Battle의 상태는 원본과 완전히 같아야 한다.
    static replay(init, log) {
      const o = X.clone(init), bt = new Battle(o);
      for (const [i, a] of log) if (bt.submit(i, a) === false) throw new Error('replay: illegal action ' + JSON.stringify(a));
      return bt;
    }
    // 상대의 비공개 정보를 가린 상태 (네트워크 전송/관전용)
    static viewFor(state, me) {
      const v = X.clone(state);
      v.sides.forEach((sd, i) => {
        if (sd.kind !== 'duelist') return;
        sd.deck = sd.deck.map(() => null);
        if (i === me) return;
        sd.hand = sd.hand.map(() => null);
        sd.mons = sd.mons.map((m) => (m && m.faceDown ? { uid: m.uid, faceDown: true, pos: m.pos, status: m.status, hidden: true } : m));
        sd.st = sd.st.map((t) => (t && t.faceDown ? { faceDown: true, hidden: true } : t));
      });
      return v;
    }
  }

  X.Battle = Battle;
})(typeof globalThis !== 'undefined' ? globalThis : this);
