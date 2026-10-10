// ================= COMBAT · PATCH v4 : more ways to fight =================
// Lin   : hold X after a swing → charge · release = Great Slash / ↑ Cyclone / air ↓ Plunge · X during a dash = Dash Slash · tap A = Steam Shot (22 soul)
// Titan : hold X after a punch → release = Piston Slam (ground wave) / ↑ Piston Uppercut · tap A = Cannon Shot
// Everything goes through GH_COMBAT.applyHit, so mid-bosses, Dummies and every enemy treat these like any other hit.
(() => {
  'use strict';
  const CMB = window.GH_COMBAT;
  if (!CMB || typeof CMB.applyHit !== 'function') return;
  const CHARGE_SHOW = .2, CHARGE_FULL = .6, FOCUS_DELAY = .17, SHOT_COST = 22, SHOT_CD = .28;
  const hint = (g, key, text) => { try { const m = g.M(); if (!m[key]) { m[key] = 1; g.toast(text); g.persist(); } } catch (e) {} };
  const hitList = g => { const s = new Set(g.level.entities || []); if (g.boss) s.add(g.boss); if (g.final) s.add(g.final); return Array.from(s); };
  const rect = b => b && [b.l, b.r, b.t, b.b].every(Number.isFinite);

  // ---- friendly projectiles --------------------------------------------------------------------------------------------
  class SteamShot extends Entity {
    constructor(g, x, y, dx, dy, dmg, big) { super(g, x, y); this.vx = dx * (big ? 470 : 560); this.vy = dy * (big ? 470 : 560); this.life = big ? .9 : .75; this.dmg = dmg; this.big = big; this.pierce = big ? 2 : 1; this.hitSet = new Set(); this.sid = CMB.actionId('shot'); this.w = 14; this.h = 10; }
    box() { const r = this.big ? 11 : 8; return { l: this.x - r, r: this.x + r, t: this.y - r + 2, b: this.y + r - 2 }; }
    pop() { const g = this.g; this.dead = true; g.particles.sparks(this.x, this.y, 6, C.cyan, .6); g.particles.steam(this.x, this.y, 3, 0, -20, 3); }
    update(dt) {
      const g = this.g; this.t += dt; this.life -= dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.life <= 0 || g.level.tm.solid(Math.floor(this.x / TS), Math.floor(this.y / TS))) { this.pop(); return; }
      if (Math.random() < .7) g.particles.add({ x: this.x, y: this.y, vx: -this.vx * .08, vy: -this.vy * .08, life: .25, size: this.big ? 5 : 3, color: 'rgb(225,240,245)', type: 'steam', grow: 14, alpha: .35, drag: 2 });
      const box = this.box();
      for (const e of g.level.entities) {
        if (e.dead || this.hitSet.has(e) || e === this) continue;
        if (e instanceof Bullet) { if (overlap(box, e.box())) { e.dead = true; this.hitSet.add(e); g.particles.sparks(e.x, e.y, 6, C.cyan, .6); g.addPop && g.addPop(e.x, e.y - 12, 'PARRY', '#9ff8ff'); } continue; }
        if (!(e instanceof Enemy) || window.GH_WORLD_ACTORS?.isNeutral(e) || !overlap(box, e.box())) continue;
        this.hitSet.add(e);
        const r = CMB.applyHit(e, { id: this.sid + ':' + this.hitSet.size, player: g.player, kind: 'shot', damage: this.dmg, dir: 'side', box });
        if (r.hit) { g.particles.sparks(this.x, this.y, 8, C.cyan, .8); g.audio.play('hit'); if (--this.pierce <= 0) { this.pop(); return; } }
      }
    }
    draw(ctx) { const x = this.x, y = this.y, r = this.big ? 9 : 6; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.fillStyle = 'rgba(150,240,255,.5)'; ctx.beginPath(); ctx.ellipse(-r, 0, r * 2, r * .7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#eafcff'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill(); ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.ellipse(r * .2, 0, r * .55, r * .4, 0, 0, 7); ctx.fill(); ctx.restore(); }
    glow(ctx) { glow(ctx, this.x, this.y, this.big ? 34 : 24, CY, .55); }
    lights(add, CYC) { add(this.x, this.y, 70, CYC, .5); }
  }
  class GroundWave extends Entity {   // the Titan's slam: a low shock that runs along the floor
    constructor(g, x, y, dir) { super(g, x, y); this.dir = dir; this.run = 0; this.hitSet = new Set(); this.sid = CMB.actionId('wave'); this.w = 40; this.h = 36; }
    box() { return { l: this.x - 22, r: this.x + 22, t: this.y - 38, b: this.y }; }
    update(dt) {
      const g = this.g, tm = g.level.tm; this.t += dt; const step = 320 * dt; this.x += this.dir * step; this.run += step;
      if (this.run > 420 || tm.solid(Math.floor((this.x + this.dir * 20) / TS), Math.floor((this.y - 12) / TS))) { this.dead = true; g.particles.dust(this.x, this.y, 6, 1.2); return; }
      if (Math.random() < .6) g.particles.dust(this.x - this.dir * 12, this.y, 1, .8);
      for (const e of g.level.entities) {
        if (e.dead || this.hitSet.has(e) || !(e instanceof Enemy) || window.GH_WORLD_ACTORS?.isNeutral(e) || !overlap(this.box(), e.box())) continue;
        this.hitSet.add(e); const r = CMB.applyHit(e, { id: this.sid + ':' + this.hitSet.size, player: g.player, kind: 'wave', damage: 3, dir: 'side', box: this.box() });
        if (r.hit && e instanceof Roller) e.stunIt();
      }
    }
    draw(ctx) { const x = this.x, y = this.y, d = this.dir; ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
      ctx.fillStyle = 'rgba(120,230,255,.7)'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.quadraticCurveTo(-8, -38, 16, -22); ctx.quadraticCurveTo(2, -14, 10, 0); ctx.fill();
      ctx.fillStyle = 'rgba(235,252,255,.9)'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-4, -22, 9, -14); ctx.quadraticCurveTo(0, -8, 4, 0); ctx.fill(); ctx.restore(); }
    glow(ctx) { glow(ctx, this.x, this.y - 14, 40, CY, .5); }
  }

  // ---- shared helpers --------------------------------------------------------------------------------------------------
  function strike(p, box, spec) {
    const g = p.g; let landed = false, killed = false;
    if (!rect(box)) return false;
    for (const e of hitList(g)) {
      if (e.dead) continue;
      if (e instanceof Bullet) { if (overlap(box, e.box())) { e.dead = true; landed = true; g.particles.sparks(e.x, e.y, 10, C.cyan, .7); g.addPop && g.addPop(e.x, e.y - 14, 'PARRY', '#9ff8ff'); g.soul += 11; } continue; }
      if (!(e instanceof Enemy) || window.GH_WORLD_ACTORS?.isNeutral(e)) continue;
      if (!overlap(box, e.box())) continue;
      const r = CMB.applyHit(e, { id: spec.id, player: p, kind: spec.kind, damage: spec.damage, dir: spec.dir || 'side', box, path: spec.path, comboStage: 0, finisher: !!spec.finisher });
      if (!r.hit) continue;
      landed = true; if (r.killed) killed = true;
      if (e instanceof Roller && spec.breakArmor) e.stunIt();
      if (!r.killed && spec.knock && e.hp !== Infinity && !(e instanceof Turret) && !(e instanceof ExpBoss0)) {   // shove light machines; bosses and turrets hold their ground
        const kx = Math.sign(e.x - p.x) || p.facing, nx = e.x + kx * spec.knock;
        if (!g.level.tm.solid(Math.floor((nx + kx * 12) / TS), Math.floor((e.y - 8) / TS))) { e.x = nx; if (e.x0 != null) e.x0 += kx * spec.knock; }
      }
      if (!r.killed && spec.stun && e.stun != null) e.stun = Math.max(e.stun || 0, spec.stun);
      p._hvHit = true;
    }
    if (landed) { g.hitstop = Math.max(g.hitstop || 0, spec.stop || .06); g.camera.shake(spec.shake || .2); }
    return landed;
  }
  const ExpBoss0 = (() => { try { return window.GH_EXP && window.GH_EXP.debug && window.GH_EXP.debug.ExpBram ? Object.getPrototypeOf(window.GH_EXP.debug.ExpBram) : function () {}; } catch (e) { return function () {}; } })();
  function cancelSwing(p) { if (p._combatAttack) { p._combatAttack = null; p.atkT = 0; p.atkCD = 0; p._combatClip = null; p.slashFx = null; } if (p._combatQueue) p._combatQueue.attack = null; }

  // ---- the moves --------------------------------------------------------------------------------------------------------
  Object.assign(Player.prototype, {
    startHeavy(dir) {
      const g = this.g, f = this.facing, titan = this.form === 'titan';
      cancelSwing(this);
      if (!titan) {
        if (dir === 'up') { this._hv = { kind: 'cyclone', t: 0, dur: .54, f, id: CMB.actionId('cyclone'), ticks: 0 }; this.vy = Math.min(this.vy, -170); this.grounded = false; this.coyote = 0; this.ifT = Math.max(this.ifT || 0, .25); g.audio.play('dash'); }
        else if (dir === 'down' && !this.grounded) { this._hv = { kind: 'plunge', t: 0, dur: 2.2, f, id: CMB.actionId('plunge'), hit2: false }; this.vx *= .2; g.audio.play('pound'); }
        else { this._hv = { kind: 'great', t: 0, dur: .38, f, id: CMB.actionId('great'), done: false }; this.ifT = Math.max(this.ifT || 0, .12); g.audio.play('dash'); }
      } else {
        if (dir === 'up') this._hv = { kind: 'tupper', t: 0, dur: .46, f, id: CMB.actionId('tupper'), done: false };
        else this._hv = { kind: 'tslam', t: 0, dur: .56, f, id: CMB.actionId('tslam'), done: false };
        g.audio.play('tstep');
      }
      g.particles.sparks(this.x, this.y - this.h * .5, 8, '#eafcff', .6);
    },
    startRush() {
      const g = this.g; cancelSwing(this);
      this.ldT = Math.max(this.ldT, .24); this.ifT = Math.max(this.ifT || 0, .22);
      this._hv = { kind: 'rush', t: 0, dur: .3, f: this.dashDir || this.facing, id: CMB.actionId('rush') };
      g.audio.noise(.12, 'bandpass', 2400, .16, 0, 1.4, 900); g.particles.ring(this.x, this.y - 14, 'rgba(220,250,255,.9)', 36, .22);
      hint(g, 'rushHint', 'C 대시 중 X — 돌진 베기 · 적을 베면 대시가 바로 돌아온다');
    },
    heavyStep(dt) {
      const H = this._hv, g = this.g; if (!H) return;
      H.t += dt; const f = H.f, k = H.t / H.dur;
      if (H.kind === 'great') {
        if (H.t < .1) { this.vx *= .5; }
        else if (H.t < .28) {
          this.moveX(f * 240 * dt);
          if (!H.done) { H.done = true; g.audio.play('stomp'); g.camera.shake(.3);
            g.particles.dust(this.x + f * 40, this.y, 8, 1.4); }
          const box = { l: f > 0 ? this.x - 6 : this.x - 104, r: f > 0 ? this.x + 104 : this.x + 6, t: this.y - this.h - 16, b: this.y + 6 };
          strike(this, box, { id: H.id, kind: 'great', damage: 4, knock: 36, stun: .6, breakArmor: true, stop: .1, shake: .35, finisher: true });
        }
      } else if (H.kind === 'cyclone') {
        if (!this.grounded) this.vy = Math.min(this.vy, 60) * .6;
        const due = Math.floor((H.t - .06) / .12) + 1;
        while (H.ticks < due && H.ticks < 4) { H.ticks++; g.audio.noise(.08, 'bandpass', 2200, .13, 0, 1.4, 900);
          strike(this, { l: this.x - 78, r: this.x + 78, t: this.y - this.h - 26, b: this.y + 10 }, { id: H.id + ':' + H.ticks, kind: 'cyclone', damage: 1, knock: 10, stun: .3, stop: .035, shake: .1, breakArmor: H.ticks === 4 }); }
      } else if (H.kind === 'plunge') {
        if (!this.grounded) {
          this.vy = Math.max(this.vy, 820); this.vx *= .5;
          if (Math.random() < .6) g.particles.sparks(this.x, this.y - 30, 1, C.cyan, .3);
          if (strike(this, { l: this.x - 20, r: this.x + 20, t: this.y - 8, b: this.y + 34 }, { id: H.id + ':air', kind: 'plunge', damage: 2, stun: .4, stop: .07, shake: .2, dir: 'down' })) { this.vy = -330; this.grounded = false; this.ldAir = true; this.airDash = true; this._hv = null; return; }
        } else if (H.t > .06) {
          g.audio.play('smallboom'); g.camera.shake(.55); g.particles.ring(this.x, this.y, 'rgba(230,250,255,.95)', 96, .35); g.particles.dust(this.x - 18, this.y, 8, 1.8); g.particles.dust(this.x + 18, this.y, 8, 1.8); g.particles.sparks(this.x, this.y, 12, '#e6f4fa', .8);
          strike(this, { l: this.x - 100, r: this.x + 100, t: this.y - 52, b: this.y + 12 }, { id: H.id + ':land', kind: 'plunge', damage: 3, knock: 28, stun: .7, breakArmor: true, stop: .1, shake: .4, dir: 'down', finisher: true });
          this._hv = null; return;
        }
      } else if (H.kind === 'rush') {
        const box = { l: f > 0 ? this.x - 14 : this.x - 76, r: f > 0 ? this.x + 76 : this.x + 14, t: this.y - this.h - 6, b: this.y + 4 };
        if (strike(this, box, { id: H.id, kind: 'rush', damage: 2, knock: 24, stun: .45, stop: .06, shake: .18, breakArmor: true })) { this.ldCD = Math.min(this.ldCD, .2); this.airDash = true; this.ldAir = true; }
        if (this.ldT <= 0 && H.t > .1) { this._hv = null; return; }
      } else if (H.kind === 'tslam') {
        if (H.t > .16 && !H.done) { H.done = true; g.audio.play('tland'); g.camera.shake(.45); g.particles.dust(this.x + f * 36, this.y, 10, 1.8); g.particles.ring(this.x + f * 36, this.y - 4, C.cyan, 60, .3);
          strike(this, { l: f > 0 ? this.x : this.x - 78, r: f > 0 ? this.x + 78 : this.x, t: this.y - this.h - 10, b: this.y + 6 }, { id: H.id, kind: 'tslam', damage: 3, knock: 24, stun: .6, breakArmor: true, stop: .12, shake: .4, finisher: true });
          fxAdd(g, new GroundWave(g, this.x + f * 44, this.y, f));
          const tm = g.level.tm, bx = { l: f > 0 ? this.x : this.x - 78, r: f > 0 ? this.x + 78 : this.x, t: this.y - this.h, b: this.y };
          for (let ty = Math.floor(bx.t / TS); ty <= Math.floor((bx.b - 1) / TS); ty++) for (let tx = Math.floor(bx.l / TS); tx <= Math.floor((bx.r - 1) / TS); tx++) if (tm.get(tx, ty) === 'W') g.breakGroup(tx, ty); }
      } else if (H.kind === 'tupper') {
        if (H.t > .12 && !H.done) { H.done = true; g.audio.play('tland'); g.camera.shake(.4);
          strike(this, { l: this.x - 44, r: this.x + 44, t: this.y - this.h - 84, b: this.y - this.h + 14 }, { id: H.id, kind: 'tupper', damage: 4, dir: 'up', stun: .8, breakArmor: true, stop: .12, shake: .35, finisher: true }); }
      }
      if (this._hv && H.t >= H.dur && H.kind !== 'plunge') this._hv = null;
      if (this._hv && H.kind === 'plunge' && H.t > H.dur) this._hv = null;
    },
    chargeStep(dt, inp, ctl) {
      const C = this._ch;
      if (!ctl || this.ldT > 0 || this.dashT > 0 || this.focusing || this.pounding) { this._ch = null; return; }
      if (inp.pressed('attack') && !this._hv) { this._ch = { t: 0, ready: false }; return; }
      if (!C) return;
      if (!inp.down('attack')) {
        this._ch = null;
        if (C.ready && !this._hv) this.startHeavy(CMB.snapshotDirection(inp, this));
        return;
      }
      C.t += dt;
      if (C.t > CHARGE_SHOW && this.grounded) this.vx = clamp(this.vx, -110, 110);
      if (!C.ready && C.t >= CHARGE_FULL) { C.ready = true; this.g.audio.play('bolt'); this.g.particles.ring(this.x, this.y - this.h * .55, '#ffffff', 34, .3); this.g.particles.sparks(this.x, this.y - this.h * .5, 8, '#eafcff', .5);
        hint(this.g, 'chargeHint', this.form === 'titan' ? 'X 길게 → 놓으면 피스톤 강타  ·  ↑ 로 놓으면 어퍼컷' : 'X 길게 → 놓으면 충전 베기  ·  ↑ 회전 베기  ·  공중 ↓ 급강하'); }
    },
    shotCast(inp) {
      const g = this.g; if ((this._shotCD || 0) > 0) return;
      if (g.soul < SHOT_COST) { g.audio.play('denied'); hint(g, 'shotHint0', '증기탄은 소울 ' + SHOT_COST + '이 필요하다 — 적을 쳐서 모으자'); return; }
      g.soul -= SHOT_COST; this._shotCD = SHOT_CD;
      const up = inp.down('up'), titan = this.form === 'titan', f = this.facing;
      const dx = up ? 0 : f, dy = up ? -1 : 0, x = this.x + dx * 16, y = this.y - this.h * (titan ? .55 : .6) + dy * 14;
      fxAdd(g, new SteamShot(g, x, y, dx, dy, titan ? 3 : 2, titan));
      g.audio.play('shoot'); g.audio.noise(.14, 'highpass', 2400, .14); g.particles.steam(x, y, 4, dx * 80, dy * 80, 3); g.particles.ring(x, y, 'rgba(210,250,255,.9)', 22, .18);
      this.recoilT = .06; this.recoilV = -f * 120 * (up ? 0 : 1); this.sx = .9; this.sy = 1.08;
    }
  });

  // ---- wiring ---------------------------------------------------------------------------------------------------------
  const _fs = Player.prototype.focusStep;
  Player.prototype.focusStep = function (dt, inp) {
    const down = inp.down('focus');
    if (down) { if (this.focusing) this._fUsed = true; this._fh = (this._fh || 0) + dt; }
    else {
      const was = this._fh || 0, used = this._fUsed;
      this._fh = 0; this._fUsed = false;
      if (was > 0 && !used && was < .42 && !this.focusing && this.tf <= 0) this.shotCast(inp);
    }
    if (down && !this.focusing && this._fh < FOCUS_DELAY) {   // a quick tap is a shot, not the start of a heal
      const f = Object.create(inp); f.down = n => n === 'focus' ? false : inp.down(n); f.pressed = n => n === 'focus' ? false : inp.pressed(n);
      return _fs.call(this, dt, f);
    }
    return _fs.call(this, dt, inp);
  };
  const _upd = Player.prototype.update;
  Player.prototype.update = function (dt, inp) {
    const g = this.g;
    if (this.dead) { this._ch = null; this._hv = null; return _upd.call(this, dt, inp); }
    this._shotCD = Math.max(0, (this._shotCD || 0) - dt);
    const ctl = !(this.frozen || this.frozenT > 0) && this.tf <= 0 && g.state === 'play' && !g.dialogue.active && !g.director.active && !this.onRail;
    if (!ctl) this._ch = null;
    if (this.tf > 0) this._hv = null;
    if (ctl && this.form === 'normal' && this.ldT > 0 && !this._hv && inp.pressed('attack')) this.startRush();
    if (this._hv) { this.atkCD = Math.max(this.atkCD || 0, .05); }
    this.chargeStep(dt, inp, ctl);
    const r = _upd.call(this, dt, inp);
    if (this.dead) return r;
    if (this._hv) this.heavyStep(dt);
    if (g.soul >= SHOT_COST && g.state === 'play') hint(g, 'shotHint', 'A 짧게 — 증기탄 (소울 ' + SHOT_COST + ')  ·  A 길게 — 회복');
    return r;
  };
  // a move in progress blocks ordinary swings; hits cancel everything
  const _sa = Player.prototype.startAttack;
  Player.prototype.startAttack = function (inp) { if (this._hv) return false; return _sa.call(this, inp); };
  const _hurt = Player.prototype.hurt;
  Player.prototype.hurt = function (...a) { const hp = this.hp, r = _hurt.apply(this, a); if (this.dead || this.hp < hp) { this._hv = null; this._ch = null; } return r; };

  // ---- poses and effects ---------------------------------------------------------------------------------------------
  {
    const _dl = drawLin;
    drawLin = function (ctx, x, y, f, st, t, o) {
      const p = typeof game !== 'undefined' && game.player;
      if (p && p._hv && o && o.sx === p.sx && o.sy === p.sy && Math.abs(x - p.x) < .5 && Math.abs(y - p.y) < 8) {
        const H = p._hv, k = clamp(H.t / H.dur, 0, 1);
        if (H.kind === 'cyclone') { f = Math.floor(H.t * 16) % 2 ? -f : f; o = Object.assign({}, o, { atkDir: 'side', atk: (H.t * 3.2) % 1 }); }
        else if (H.kind === 'plunge') o = Object.assign({}, o, { atkDir: 'down', atk: .7 });
        else o = Object.assign({}, o, { atkDir: 'side', atk: H.kind === 'great' ? clamp((H.t - .04) / .26, 0, 1) : clamp(k * 1.6, 0, 1) });
      } else if (p && p._ch && p._ch.t > CHARGE_SHOW && o && o.sx === p.sx && Math.abs(x - p.x) < .5 && Math.abs(y - p.y) < 8 && !p.focusing && p.atkT <= 0) {
        o = Object.assign({}, o, { atkDir: 'side', atk: .05 });   // wrench drawn back while the charge builds
      }
      return _dl(ctx, x, y, f, st, t, o);
    };
    const _dt = drawTitan;
    drawTitan = function (ctx, x, y, f, o) {
      const p = typeof game !== 'undefined' && game.player;
      if (p && p.form === 'titan' && p._hv && o && o.sx === p.sx && Math.abs(y - p.y) < 4) { const H = p._hv; o = Object.assign({}, o, { punchDir: H.kind === 'tupper' ? 'up' : 'side', punch: clamp(H.t / H.dur * 1.5, 0, 1) }); }
      return _dt(ctx, x, y, f, o);
    };
    const _pg = Player.prototype.glow;
    Player.prototype.glow = function (ctx) {
      _pg.call(this, ctx); if (this.dead) return;
      const g = this.g, C0 = this._ch, H = this._hv, cx = this.x, cy = this.y - this.h * .55;
      if (C0 && C0.t > CHARGE_SHOW) {
        const k = clamp((C0.t - CHARGE_SHOW) / (CHARGE_FULL - CHARGE_SHOW), 0, 1);
        if (C0.ready) { const pl = .6 + .4 * Math.sin(g.time * 30); glow(ctx, cx, cy, 44, '230,252,255', .45 * pl); ctx.strokeStyle = 'rgba(255,255,255,' + (.6 + .4 * pl) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 7); ctx.stroke(); }
        else { glow(ctx, cx, cy, 20 + k * 20, '170,240,255', .12 + .25 * k); ctx.strokeStyle = 'rgba(170,240,255,' + (.35 + .4 * k) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 34 - k * 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); }
      }
      if (H) {
        const k = clamp(H.t / H.dur, 0, 1), a = H.kind === 'plunge' ? 1 : Math.sin(Math.min(1, k) * Math.PI), f = H.f;
        ctx.save(); ctx.translate(cx, cy); ctx.lineCap = 'round';
        if (H.kind === 'great' || H.kind === 'rush' || H.kind === 'tslam') {
          const R = H.kind === 'great' ? 78 : H.kind === 'tslam' ? 66 : 54, sw = H.kind === 'rush' ? .9 : 1.45, prog = ease.outCubic(clamp((H.t - .05) / .25, 0, 1));
          for (let i = 0; i < 3; i++) { ctx.strokeStyle = i ? 'rgba(150,240,255,' + .3 * a + ')' : 'rgba(255,255,255,' + .75 * a + ')'; ctx.lineWidth = (i ? 6 : 3) * (H.kind === 'great' ? 1.4 : 1); ctx.beginPath();
            if (f > 0) ctx.arc(f * 8, 0, R - i * 5, -sw, -sw + 2 * sw * prog); else ctx.arc(f * 8, 0, R - i * 5, Math.PI + sw - 2 * sw * prog, Math.PI + sw); ctx.stroke(); }
          glow(ctx, 0, 0, R * 1.3, '170,240,255', .1 * a);
        } else if (H.kind === 'cyclone') {
          for (let i = 0; i < 3; i++) { const an = H.t * 22 + i * 2.1; ctx.strokeStyle = 'rgba(' + (i ? '150,240,255' : '255,255,255') + ',' + (.7 - i * .15) + ')'; ctx.lineWidth = 4 - i; ctx.beginPath(); ctx.arc(0, 0, 58 + i * 5, an, an + 1.6); ctx.stroke(); }
          glow(ctx, 0, 0, 90, '170,240,255', .16);
        } else if (H.kind === 'plunge') {
          for (let i = 0; i < 4; i++) { ctx.strokeStyle = 'rgba(200,245,255,' + (.5 - i * .1) + ')'; ctx.lineWidth = 3 - i * .5; ctx.beginPath(); ctx.moveTo(-8 + i * 5, -60 - i * 10); ctx.lineTo(-8 + i * 5, -20); ctx.stroke(); }
          glow(ctx, 0, 8, 44, '210,250,255', .3);
        } else if (H.kind === 'tupper') {
          ctx.strokeStyle = 'rgba(190,250,255,' + .8 * a + ')'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -this.h * .4, 56, -Math.PI * .85, -Math.PI * .15); ctx.stroke(); glow(ctx, 0, -50, 70, CY, .2 * a);
        }
        ctx.restore();
      }
    };
  }

  window.GH_COMBAT_V4 = { SteamShot, GroundWave, strike };
})();
