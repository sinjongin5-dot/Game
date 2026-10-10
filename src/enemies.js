// ================= ENEMIES · PATCH v4 : more ways for the machines to fight back =================
// 1) The six classic machines pick a behaviour variant by chapter theme (Drone: stoop/sniper · Turret: burst/aimed/spread · Welder: lunge ·
//    Hopper: chain/stomp · Mortar: volley), so the same body no longer means the same fight.
// 2) Five new machines: Guard (shield), Bomber (air bomber), Sawblade (patrol saw), Mender (field medic), Mimic (ambusher).
// 3) Levels place them by theme (see placeExtras), away from checkpoints, the tutorial and boss halls.
(() => {
  'use strict';
  const CMB = window.GH_COMBAT;
  const dirTo = (a, x) => Math.sign(a.x - x) || 1;
  const hurtP = (g, p, kind, dir) => { try { return typeof mkill === 'function' ? mkill(g, p, kind, dir) : p.hurt(dir); } catch (e) { return p.hurt(dir); } };
  const sees = (g, x1, y1, x2, y2) => { const tm = g.level.tm, n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24)); for (let i = 1; i < n; i++) { const k = i / n; if (tm.solid(Math.floor((x1 + (x2 - x1) * k) / TS), Math.floor((y1 + (y2 - y1) * k) / TS))) return false; } return true; };
  const floorAhead = (g, x, y, d, r) => { const tm = g.level.tm, fx = Math.floor((x + d * r) / TS), c = tm.get(fx, Math.floor((y + 2) / TS)); return !tm.solid(fx, Math.floor((y - 10) / TS)) && (SOLID.has(c) || c === '-'); };
  const hpFix = cls => Object.defineProperty(cls.prototype, '_combatHealthInitialized', { get() { return true; }, set(v) {} });

  // ---- aimed bullet (also parry-able: it extends Bullet) -------------------------------------------------------------
  class AimBullet extends Bullet {
    constructor(g, x, y, vx, vy, col) { super(g, x, y, vx); this.vy = vy; this.col = col || C.brass; this.life = 3.2; }
    update(dt) { const g = this.g, p = g.player; this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
      if (this.life <= 0 || g.level.tm.solid(Math.floor(this.x / TS), Math.floor(this.y / TS))) { this.dead = true; g.particles.sparks(this.x, this.y, 5); return; }
      if (!p.dead && overlap(p.hbox(), this.box())) { this.dead = true; if (p.form === 'titan' && p.dashT > 0) g.particles.sparks(this.x, this.y, 8, C.cyan); else p.hurt(Math.sign(this.vx) || 1); }
      if (Math.random() < .5) g.particles.add({ x: this.x, y: this.y, vx: -this.vx * .08, vy: -this.vy * .08, life: .2, size: 2, color: C.fire, type: 'dot', add: true }); }
    draw(ctx) { ctx.fillStyle = 'rgba(0,0,0,.35)'; circ(ctx, this.x + 1, this.y + 1, 5); ctx.fillStyle = this.col; circ(ctx, this.x, this.y, 4.5); ctx.fillStyle = '#fff3d0'; circ(ctx, this.x - 1, this.y - 1, 1.6); }
    glow(ctx) { glow(ctx, this.x, this.y, 16, FI, .55); }
  }

  // ---- variant picking ------------------------------------------------------------------------------------------------
  const W = {
    blue:    { drone: [.7, .3, 0],   turret: [1, 0, 0, 0],      welder: [.8, .2], hopper: [.8, .2, 0],  mortar: [1, 0] },
    pipes:   { drone: [.35, .35, .3], turret: [.4, .6, 0, 0],    welder: [.5, .5], hopper: [.4, .6, 0],  mortar: [.7, .3] },
    brass:   { drone: [.3, .3, .4],  turret: [.2, .2, .6, 0],   welder: [.4, .6], hopper: [.3, .3, .4], mortar: [.5, .5] },
    cam:     { drone: [.2, .5, .3],  turret: [.3, .4, .3, 0],   welder: [.3, .7], hopper: [.2, .3, .5], mortar: [.4, .6] },
    fly:     { drone: [.2, .3, .5],  turret: [.2, .2, .2, .4], welder: [.4, .6], hopper: [.3, .5, .2], mortar: [.3, .7] },
    arc:     { drone: [.2, .4, .4],  turret: [.1, .3, .4, .2], welder: [.3, .7], hopper: [.2, .4, .4], mortar: [.3, .7] },
    furnace: { drone: [.3, .4, .3],  turret: [.2, .3, .3, .2], welder: [.2, .8], hopper: [.2, .3, .5], mortar: [.2, .8] },
    heart:   { drone: [.3, .4, .3],  turret: [.2, .3, .3, .2], welder: [.3, .7], hopper: [.3, .3, .4], mortar: [.3, .7] }
  };
  function variantOf(e, kind) {
    if (e._v !== undefined) return e._v;
    const th = (e.g.level && e.g.level.def && e.g.level.def.theme) || 'blue', w = (W[th] || W.blue)[kind];
    let r = hash(Math.round((e.x0 != null ? e.x0 : e.home != null ? e.home : e.x) / 6), Math.round(e.y / 6) + 17), v = 0;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { v = i; break; } v = i; }
    return (e._v = v);
  }
  const normal = e => e.dead || e._combatLaunch || e._combatDrop || e.stun > 0 || e._exNeutral;

  // ---- Drone: stoop / sniper ------------------------------------------------------------------------------------------
  {
    const _u = Drone.prototype.update, _d = Drone.prototype.draw;
    Drone.prototype.update = function (dt) {
      const v = variantOf(this, 'drone'); if (!v || normal(this)) return _u.call(this, dt);
      const g = this.g, p = g.player, tm = g.level.tm; this._cd = (this._cd == null ? 1 + Math.random() : this._cd) - dt; this._s = this._s || 'hover'; this._t = (this._t || 0) + dt;
      if (v === 1) {   // 급강하 드론
        if (this._s === 'hover') { _u.call(this, dt); if (this._cd <= 0 && !p.dead && Math.abs(p.x - this.x) < 240 && p.y - this.y > -10 && p.y - this.y < 280 && sees(g, this.x, this.y - 9, p.x, p.y - 14)) { this._s = 'tell'; this._t = 0; this._tx = p.x; this._ty = p.y - 14; g.audio.play('hum'); } return; }
        this.t += dt;
        if (this._s === 'tell') { this.x += (Math.random() - .5) * 1.4; if (this._t > .55) { this._s = 'dive'; this._t = 0; const dx = this._tx - this.x, dy = this._ty - (this.y - 9), d = Math.hypot(dx, dy) || 1; this._vx = dx / d * 430; this._vy = dy / d * 430; g.audio.play('flame'); } }
        else if (this._s === 'dive') { this.x += this._vx * dt; this.y += this._vy * dt; if (Math.random() < .6) g.particles.sparks(this.x, this.y - 9, 1, C.fireL, .3);
          if (tm.solid(Math.floor(this.x / TS), Math.floor((this.y - 9) / TS)) || this._t > .75) { if (tm.solid(Math.floor(this.x / TS), Math.floor((this.y - 9) / TS))) { this.x -= this._vx * dt; this.y -= this._vy * dt; g.particles.dust(this.x, this.y, 6, 1.1); } this._s = 'rise'; this._t = 0; this.stun = .9; } }
        else if (this._s === 'rise') { const dx = this.x0 - this.x, dy = this.base - this.y, d = Math.hypot(dx, dy); if (d < 8) { this._s = 'hover'; this._cd = 2.4; } else { this.x += dx / d * 150 * dt; this.y += dy / d * 150 * dt; } }
        enemyContact(g, this);
      } else {         // 저격 드론
        _u.call(this, dt);
        if (this._s === 'hover' && this._cd <= 0 && !p.dead && Math.hypot(p.x - this.x, p.y - this.y) < 430 && sees(g, this.x, this.y - 9, p.x, p.y - 14)) { this._s = 'tell'; this._t = 0; g.audio.play('hum'); }
        else if (this._s === 'tell') { this.y = this.base - 3; if (this._t > .6) { const sx = this.x, sy = this.y - 9, dx = p.x - sx, dy = (p.y - 14) - sy, d = Math.hypot(dx, dy) || 1; g.level.entities.push(new AimBullet(g, sx, sy, dx / d * 250, dy / d * 250)); g.audio.play('shoot'); g.particles.sparks(sx, sy, 4, C.fireL, .4); this._s = 'hover'; this._cd = 2.6; } }
      }
    };
    Drone.prototype.draw = function (ctx) { _d.call(this, ctx);
      const g = this.g, v = this._v || 0, x = this.x, y = this.y - 9;
      if (this._s === 'tell') { const k = clamp(this._t / .55, 0, 1); if (v === 1) { ctx.fillStyle = C.fire; ctx.font = 'bold 14px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 20); ctx.strokeStyle = `rgba(255,120,60,${.2 + .5 * k})`; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this._tx, this._ty); ctx.stroke(); ctx.setLineDash([]); }
        else { const p = g.player; ctx.strokeStyle = `rgba(255,70,50,${.15 + .6 * k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(p.x, p.y - 14); ctx.stroke(); } }
      if (v === 1) { ctx.fillStyle = '#7a2a16'; ctx.fillRect(x - 5, y + 8, 10, 3); }          // belly spike marks the stooper
      else if (v === 2) { ctx.fillStyle = '#1a2026'; ctx.fillRect(x + this.dir * 6, y + 2, this.dir * 12, 4); ctx.fillStyle = C.fireL; ctx.fillRect(x + this.dir * 16, y + 3, this.dir * 3, 2); } };
  }

  // ---- Turret: burst / aimed / spread ---------------------------------------------------------------------------------
  {
    const _u = Turret.prototype.update, _d = Turret.prototype.draw;
    Turret.prototype.update = function (dt) {
      const v = variantOf(this, 'turret'); if (!v || this.dead || this.stun > 0 || this._exNeutral) return _u.call(this, dt);
      const g = this.g, p = g.player; this.t += dt; this.recoil *= .85; this._s = this._s || 'idle'; this._t = (this._t || 0) + dt;
      const inRange = !p.dead && Math.abs(p.x - this.x) < (v === 2 ? 440 : 520) && Math.abs(p.y - this.y) < (v === 2 ? 340 : 170) && (v === 2 ? sees(g, this.x, this.y - 13, p.x, p.y - 14) : Math.sign(p.x - this.x) === this.dir);
      if (this._s === 'idle') { this.cd -= dt; if (this.cd <= 0 && inRange) { this._s = 'tell'; this._t = 0; g.audio.play('hum'); } }
      else if (this._s === 'tell') {
        if (v === 2) this.aimA = Math.atan2((p.y - 14) - (this.y - 13), p.x - this.x);
        if (this._t > (v === 2 ? .45 : .3)) { this._s = v === 1 ? 'burst' : 'idle'; this._t = 0; this._n = 0; this.recoil = 4;
          if (v === 2) { const sx = this.x + Math.cos(this.aimA) * 16, sy = this.y - 13 + Math.sin(this.aimA) * 16; g.level.entities.push(new AimBullet(g, sx, sy, Math.cos(this.aimA) * 270, Math.sin(this.aimA) * 270)); g.audio.play('shoot'); this.cd = 2.1; }
          else if (v === 3) { for (const da of [-.3, 0, .3]) { const a = (this.dir > 0 ? 0 : Math.PI) + da; g.level.entities.push(new AimBullet(g, this.x + this.dir * 16, this.y - 13, Math.cos(a) * 250, Math.sin(a) * 250)); } g.audio.play('shoot'); g.particles.steam(this.x + this.dir * 16, this.y - 13, 4, this.dir * 50, 0, 3); this.cd = 3; } } }
      else if (this._s === 'burst') { if (this._t >= this._n * .14 && this._n < 3) { this._n++; g.level.entities.push(new Bullet(g, this.x + this.dir * 16, this.y - 13, this.dir * 300)); g.audio.play('shoot'); this.recoil = 4; g.particles.steam(this.x + this.dir * 16, this.y - 13, 2, this.dir * 40, 0, 2); } if (this._n >= 3 && this._t > .5) { this._s = 'idle'; this.cd = 2.7; } }
      enemyContact(g, this);
    };
    Turret.prototype.draw = function (ctx) {
      const v = this._v || 0;
      if (v === 2 && this.aimA !== undefined) {   // aimed turret: its barrel follows the target
        const x = this.x, y = this.y; ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#1a2026'; ctx.fillRect(-12, -6, 24, 6); ctx.fillStyle = C.brassD; ctx.fillRect(-12, -6, 24, 1.5);
        ctx.fillStyle = '#3a4855'; ctx.beginPath(); ctx.arc(0, -8, 10, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(0, -13); ctx.rotate(this._s === 'idle' || this._s === 'burst' ? (this.dir > 0 ? 0 : Math.PI) : this.aimA); ctx.fillStyle = '#8a96a0'; ctx.fillRect(2 - this.recoil, -2.5, 16, 5); ctx.restore();
        ctx.fillStyle = this._s === 'tell' ? (Math.floor(this.t * 14) % 2 ? C.fireL : C.fire) : C.fire; circ(ctx, 0, -11, 2); ctx.restore();
        if (this._s === 'tell') { const k = clamp(this._t / .45, 0, 1); ctx.strokeStyle = `rgba(255,70,50,${.2 + .6 * k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + Math.cos(this.aimA) * 340, y - 13 + Math.sin(this.aimA) * 340); ctx.stroke(); }
        return;
      }
      _d.call(this, ctx);
      if (v === 1) { ctx.fillStyle = C.brass; const x = this.x, y = this.y; for (let i = 0; i < 3; i++) ctx.fillRect(x + this.dir * (6 + i * 4) - 1, y - 8, 2, 2); }
      else if (v === 3) { ctx.strokeStyle = C.brassL; ctx.lineWidth = 1.2; const x = this.x, y = this.y - 13; for (const a of [-.3, 0, .3]) { ctx.beginPath(); ctx.moveTo(x + this.dir * 8, y); ctx.lineTo(x + this.dir * (8 + 10 * Math.cos(a)), y + 10 * Math.sin(a)); ctx.stroke(); } }
      if (this._s === 'tell' && v !== 2) { ctx.fillStyle = C.fire; ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', this.x, this.y - 28); }
    };
  }

  // ---- Welder: lunge ------------------------------------------------------------------------------------------------
  {
    const _u = Welder.prototype.update, _d = Welder.prototype.draw;
    Welder.prototype.update = function (dt) {
      const v = variantOf(this, 'welder'); if (!v || normal(this)) return _u.call(this, dt);
      const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.st_t += dt;
      if (this.st === 'walk') { const nx = this.x + this.dir * 44 * dt; if (tm.solid(Math.floor((nx + this.dir * 14) / TS), Math.floor((this.y - 10) / TS)) || !floorAhead(g, this.x, this.y, this.dir, 14 + 44 * dt)) this.dir *= -1; else this.x = nx;
        if (!p.dead && Math.abs(p.x - this.x) < 170 && Math.abs(p.y - this.y) < 44) { this.dir = dirTo(p, this.x); this.st = 'ignite'; this.st_t = 0; g.audio.play('hum'); } }
      else if (this.st === 'ignite') { if (this.st_t > .4) { this.st = 'lunge'; this.st_t = 0; g.audio.play('flame'); } }
      else if (this.st === 'lunge') { const step = this.dir * 330 * dt, nx = this.x + step;
        if (!tm.solid(Math.floor((nx + this.dir * 14) / TS), Math.floor((this.y - 10) / TS)) && floorAhead(g, this.x, this.y, this.dir, 14 + Math.abs(step))) this.x = nx; else this.st_t = 9;
        for (let i = 0; i < 3; i++) g.particles.add({ x: this.x + this.dir * 14, y: this.y - 16, vx: this.dir * rand(120, 260), vy: rand(-40, 30), life: rand(.15, .3), size: rand(2, 5), grow: 10, color: Math.random() < .5 ? C.fire : C.fireL, type: 'circle', add: true });
        const b = this.dir > 0 ? { l: this.x + 8, r: this.x + 62, t: this.y - 26, b: this.y - 6 } : { l: this.x - 62, r: this.x - 8, t: this.y - 26, b: this.y - 6 };
        if (!p.dead && overlap(p.hbox(), b)) p.hurt(this.dir);
        if (this.st_t > .5) { this.st = 'cool'; this.st_t = 0; } }
      else if (this.st === 'cool') { if (Math.random() < .1) g.particles.steam(this.x + this.dir * 16, this.y - 16, 1, 0, -30, 2); if (this.st_t > 1.5) { this.st = 'walk'; this.st_t = 0; } }
      enemyContact(g, this);
    };
    Welder.prototype.draw = function (ctx) { _d.call(this, ctx);
      if (this._v && this.st === 'ignite') { ctx.fillStyle = C.fire; ctx.font = 'bold 13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', this.x, this.y - 36); }
      if (this._v && this.st === 'lunge') { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.dir, 1); ctx.fillStyle = 'rgba(255,170,70,.6)'; ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(60, -16); ctx.lineTo(14, -10); ctx.fill(); ctx.restore(); }
      if (this._v && this.st === 'walk') { ctx.fillStyle = '#7a2a16'; ctx.fillRect(this.x - 10, this.y - 28, 20, 2); } };
    Welder.prototype.glow = (g0 => function (ctx) { if (this._v && this.st === 'lunge') glow(ctx, this.x + this.dir * 40, this.y - 16, 70, FI, .55); else if (g0) g0.call(this, ctx); })(Welder.prototype.glow);
  }

  // ---- Hopper: chain / stomp ------------------------------------------------------------------------------------------
  {
    const _u = Hopper.prototype.update;
    Hopper.prototype.update = function (dt) {
      const v = variantOf(this, 'hopper'); if (!v || normal(this)) return _u.call(this, dt);
      const was = this.gr, g = this.g, p = g.player; _u.call(this, dt);
      if (was && !this.gr) {   // a hop just began
        if (v === 1) { this._n = (this._n || 0) + 1; if (this._n >= 3) { this.cd = 1.7; this._n = 0; } else this.cd = .26; }
        else if (v === 2) { this.vy = -560; this.vx *= 1.1; }
      }
      if (v === 2 && !was && this.gr) { g.camera.shake(.15); g.audio.play('stomp'); g.particles.ring(this.x, this.y - 4, C.fireL, 70, .3); g.particles.dust(this.x, this.y, 8, 1.4);
        if (!p.dead && p.grounded && Math.abs(p.x - this.x) < 74 && Math.abs(p.y - this.y) < 26) p.hurt(Math.sign(p.x - this.x) || 1); }
    };
    const _d = Hopper.prototype.draw;
    Hopper.prototype.draw = function (ctx) { _d.call(this, ctx); if (this._v === 2) { ctx.fillStyle = C.brassD; ctx.fillRect(this.x - 12, this.y - 4, 24, 3); } else if (this._v === 1) { ctx.fillStyle = C.cyan; ctx.fillRect(this.x - 3, this.y - 36, 6, 2); } };
  }

  // ---- Mortar: volley -------------------------------------------------------------------------------------------------
  {
    const _u = Mortar.prototype.update;
    Mortar.prototype.update = function (dt) {
      const v = variantOf(this, 'mortar'), cd0 = this.cd; _u.call(this, dt);
      if (v && !this.dead && cd0 <= 0 && this.cd > 3) {   // just fired: add two more shells landing either side of the first
        const g = this.g, p = g.player, T = clamp(Math.abs(p.x - this.x) / 240, .8, 1.6);
        for (const off of [-95, 95]) { const sx = this.x + this.dir * 10, sy = this.y - 24, tx = p.x + off, dy = (p.y - 6) - sy; g.level.entities.push(new MortarShell(g, sx, sy, (tx - sx) / T, (dy - .5 * 900 * T * T) / T)); }
        this.cd = 4.2; this.rec = 9;
      }
    };
  }

  // ======================= new machines =======================================================================================
  // 방패병 · Guard: a plated front. Light swings and shots glance off; heavy moves, the Titan, stomps and anything from behind get through.
  class Guard extends Enemy {
    constructor(g, x, y) { super(g, x, y); this.w = 28; this.h = 40; this.dir = -1; this.st = 'walk'; this.st_t = 0; this.hp = 5; this.maxHp = 5; this.home = x; this.brk = 0; }
    rimBox() { return { x: this.x - 24, y: this.y - 52, w: 48, h: 56 }; }
    front(p) { return (Math.sign(p.x - this.x) || this.dir) === this.dir; }
    onHit(hit) {
      const g = this.g, p = hit.player, kind = hit.kind, heavy = ['great', 'rush', 'tslam', 'tupper', 'plunge', 'pound', 'dash', 'stomp', 'wave'].includes(kind) || (kind === 'cyclone' && hit.finisher) || p.form === 'titan';
      const open = !this.front(p) || this.brk > 0 || this.st === 'cool' || hit.dir === 'down' || hit.dir === 'up';
      if (!open && !heavy) { this.guardFx = .25; g.particles.sparks(this.x + this.dir * 16, this.y - 22, 6, C.brassL, .7); g.audio.play('hit'); g.addPop && g.addPop(this.x, this.y - 54, 'GUARD', '#9ff8ff'); return { hit: true, damage: 0, killed: false, armored: true }; }
      if (!open && heavy && this.brk <= 0) { this.brk = 1.6; this.st = 'cool'; this.st_t = 0; this.stun = 0; g.particles.debris(this.x + this.dir * 14, this.y - 24, 8, [C.steel, C.brassL]); g.audio.play('break'); g.addPop && g.addPop(this.x, this.y - 54, '방패 파괴', '#ffe9a8'); }
      const dmg = +hit.damage || 0; this.hp -= dmg; this.hitUntil = g.time + .11; g.particles.sparks(this.x, this.y - 22, 8, C.fireL, .7);
      const killed = this.hp <= 0; if (killed) { this.destroy(); if (g.stats) g.stats.score += 220; g.addPop && g.addPop(this.x, this.y - 30, '+220', '#ffe9a8'); }
      return { hit: true, damage: dmg, killed };
    }
    update(dt) {
      const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.st_t += dt; this.brk = Math.max(0, this.brk - dt); this.guardFx = Math.max(0, (this.guardFx || 0) - dt);
      this.home = this.home == null ? this.x : this.home; this.st = this.st || 'walk';
      if (this.stun > 0) { this.stun -= dt; enemyContact(g, this); return; }
      if (this.st === 'walk') { const nx = this.x + this.dir * 34 * dt; if (Math.abs(nx - this.home) > 110 || tm.solid(Math.floor((nx + this.dir * 16) / TS), Math.floor((this.y - 12) / TS)) || !floorAhead(g, this.x, this.y, this.dir, 16 + 34 * dt)) this.dir *= -1; else this.x = nx;
        if (!p.dead && Math.abs(p.x - this.x) < 190 && Math.abs(p.y - this.y) < 56) { this.dir = dirTo(p, this.x); this.st = 'raise'; this.st_t = 0; g.audio.play('hum'); } }
      else if (this.st === 'raise') { if (this.st_t > .55) { this.st = 'bash'; this.st_t = 0; g.audio.play('stomp'); } }
      else if (this.st === 'bash') { const step = this.dir * 300 * dt, nx = this.x + step; if (!tm.solid(Math.floor((nx + this.dir * 18) / TS), Math.floor((this.y - 12) / TS)) && floorAhead(g, this.x, this.y, this.dir, 18 + Math.abs(step))) this.x = nx; else this.st_t = 9;
        if (Math.random() < .5) g.particles.dust(this.x - this.dir * 14, this.y, 1, 1);
        if (this.st_t > .42) { this.st = 'cool'; this.st_t = 0; g.camera.shake(.1); g.particles.sparks(this.x + this.dir * 20, this.y - 20, 6, C.brassL, .6); } }
      else if (this.st === 'cool') { if (this.st_t > 1.1) { this.st = 'walk'; this.st_t = 0; } }
      enemyContact(g, this);
    }
    draw(ctx) {
      const x = this.x, y = this.y, d = this.dir, up = this.st === 'raise' || this.st === 'bash', down = this.st === 'cool' || this.brk > 0, fl = this.hitUntil && this.g.time < this.hitUntil;
      ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
      ctx.fillStyle = '#14181c'; ctx.fillRect(-12, -6, 24, 6); ctx.fillStyle = '#34414c'; ctx.fillRect(-10, -26, 8, 20); ctx.fillRect(2, -26, 8, 20);   // legs
      ctx.fillStyle = '#26323c'; ctx.fillRect(-12, -42, 24, 20); ctx.fillStyle = C.brassD; ctx.fillRect(-12, -42, 24, 3); rivet(ctx, -8, -34, 1.2); rivet(ctx, 8, -34, 1.2);       // torso
      ctx.fillStyle = '#1a2026'; ctx.fillRect(-7, -52, 14, 10); ctx.fillStyle = '#0a0d10'; ctx.fillRect(1, -49, 6, 3); ctx.fillStyle = (up ? C.fireL : C.fire); ctx.fillRect(2, -48.5, 4, 2);   // head + visor
      if (!down) { // tower shield
        const lift = up ? -6 : 0; ctx.fillStyle = '#10151a'; ctx.fillRect(9, -50 + lift, 11, 46); ctx.fillStyle = this.guardFx > 0 ? '#bfeaff' : '#4a5864'; ctx.fillRect(10, -49 + lift, 9, 44); ctx.fillStyle = C.brass; ctx.fillRect(10, -49 + lift, 9, 3); ctx.fillRect(10, -7 + lift, 9, 3);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(11, -46 + lift, 2, 36); rivet(ctx, 14.5, -30 + lift, 1.3); if (this.guardFx > 0) { ctx.strokeStyle = 'rgba(160,240,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(9, -50 + lift, 11, 46); } }
      else { ctx.fillStyle = '#3a4855'; ctx.save(); ctx.translate(14, -4); ctx.rotate(.9); ctx.fillRect(-4, -20, 8, 24); ctx.fillStyle = C.brass; ctx.fillRect(-4, -20, 8, 3); ctx.restore(); }
      if (fl) { ctx.globalAlpha = .55; ctx.fillStyle = '#fff'; ctx.fillRect(-12, -42, 24, 20); ctx.globalAlpha = 1; }
      ctx.restore();
      if (this.st === 'raise') { ctx.fillStyle = C.fire; ctx.font = 'bold 13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 62); }
      if (this.brk > 0) { ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 9px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('✕', x, y - 60); }
    }
    glow(ctx) { if (this.st === 'bash') glow(ctx, this.x + this.dir * 16, this.y - 24, 40, FI, .35); }
  }
  hpFix(Guard);

  // 폭탄 드론 · Bomber: hangs above, then drops a bomb on whoever is underneath
  class BombDrop extends Bullet {
    constructor(g, x, y, vx) { super(g, x, y, vx); this.vy = 40; this.life = 3; this.w = 14; this.h = 14; this.arm = .12; }
    box() { return { l: this.x - 7, r: this.x + 7, t: this.y - 7, b: this.y + 7 }; }
    boom() { const g = this.g, p = g.player; this.dead = true; ghWorldSound(g, 'smallboom', this.x, this.y, { radius: 420, shake: .3 }); g.particles.sparks(this.x, this.y, 16); g.particles.steam(this.x, this.y, 8, 0, -40, 8); g.particles.ring(this.x, this.y, C.fire, 58, .3); g.particles.debris(this.x, this.y, 5, [C.steel, C.rust, C.brass]);
      if (!p.dead && Math.hypot(p.x - this.x, p.y - p.h / 2 - this.y) < 58) hurtP(g, p, 'blast', Math.sign(p.x - this.x) || 1); }
    update(dt) { const g = this.g, p = g.player; this.vy += 800 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; this.arm -= dt;
      if (this.life <= 0 || g.level.tm.solid(Math.floor(this.x / TS), Math.floor((this.y + 6) / TS))) { this.boom(); return; }
      if (this.arm <= 0 && !p.dead && overlap(p.hbox(), this.box())) this.boom();
      if (Math.random() < .5) g.particles.add({ x: this.x, y: this.y - 8, vx: rand(-10, 10), vy: rand(-30, -10), life: .25, size: 2, color: C.fireL, type: 'dot', add: true }); }
    draw(ctx) { ctx.fillStyle = '#10151a'; circ(ctx, this.x, this.y, 7.5); ctx.fillStyle = '#34414c'; circ(ctx, this.x - 1, this.y - 1, 6); ctx.fillStyle = C.fire; ctx.fillRect(this.x - 1, this.y - 11, 2, 4); ctx.fillStyle = '#fff2c0'; circ(ctx, this.x, this.y - 12, 1.6); }
    glow(ctx) { glow(ctx, this.x, this.y - 11, 16, FI, .6); }
  }
  class Bomber extends Enemy {
    constructor(g, x, y) { super(g, x, y - 80); this.w = 30; this.h = 20; this.x0 = x; this.base = this.y; this.dir = 1; this.hp = 2; this.maxHp = 2; this.cd = 1.5; }
    rimBox() { return { x: this.x - 22, y: this.y - 26, w: 44, h: 34 }; }
    update(dt) {
      const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.cd -= dt; this._s = this._s || 'patrol'; this._t = (this._t || 0) + dt;
      if (this.stun > 0) { this.stun -= dt; this.y = lerp(this.y, this.base + 6, .1); enemyContact(g, this); return; }
      const bob = Math.sin(this.t * 2.2) * 3, dx = p.x - this.x;
      if (this._s === 'patrol') {
        let tx = this.x; const near = !p.dead && Math.abs(dx) < 300 && p.y > this.y - 30 && p.y - this.y < 300;
        if (near) { const hold = Math.abs(dx) < 70 ? -Math.sign(dx) * 90 : Math.abs(dx) > 30 ? Math.sign(dx) * 80 : 0; tx = this.x + hold * dt; this.dir = Math.sign(dx) || this.dir; }
        else { tx = this.x + this.dir * 55 * dt; if (Math.abs(tx - this.x0) > 150) this.dir *= -1; }
        if (!tm.solid(Math.floor((tx + Math.sign(tx - this.x) * 14) / TS), Math.floor((this.y - 10) / TS))) this.x = tx; else this.dir *= -1;
        this.y = this.base + bob;
        if (near && Math.abs(dx) < 46 && this.cd <= 0) { this._s = 'tell'; this._t = 0; g.audio.play('hum'); }
      } else if (this._s === 'tell') { this.y = this.base + bob; this.x += (Math.random() - .5) * 1.2; if (this._t > .5) { g.level.entities.push(new BombDrop(g, this.x, this.y + 6, 0)); g.audio.play('shoot'); this._s = 'patrol'; this.cd = 2.6; } }
      enemyContact(g, this);
    }
    draw(ctx) { const x = this.x, y = this.y - 9, st = this.stun > 0, fl = this.hitUntil && this.g.time < this.hitUntil;
      ctx.strokeStyle = '#5a6c7a'; ctx.lineWidth = 1.5; line(ctx, x - 7, y - 8, x - 7, y - 13); line(ctx, x + 7, y - 8, x + 7, y - 13); const ra = st ? this.t * 3 : this.t * 40; ctx.strokeStyle = 'rgba(200,210,215,.7)'; ctx.lineWidth = 2; line(ctx, x - 7 - Math.cos(ra) * 9, y - 13, x - 7 + Math.cos(ra) * 9, y - 13); line(ctx, x + 7 - Math.cos(ra + 1) * 9, y - 13, x + 7 + Math.cos(ra + 1) * 9, y - 13);
      ctx.fillStyle = '#2a343d'; ctx.beginPath(); ctx.ellipse(x, y, 15, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#7a3a1a'; ctx.beginPath(); ctx.ellipse(x, y + 8, 7, 7, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = C.brassD; ctx.fillRect(x - 15, y + 1, 30, 2);   // bomb bay
      ctx.fillStyle = '#0a0d10'; circ(ctx, x + this.dir * 6, y, 3.6); ctx.fillStyle = st ? '#3a1a0e' : C.fire; circ(ctx, x + this.dir * 6, y, 2.2);
      if (this._s === 'tell') { ctx.fillStyle = C.fire; ctx.font = 'bold 13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 22); ctx.fillStyle = `rgba(255,120,60,${.2 + .4 * Math.sin(this.t * 30)})`; ctx.fillRect(x - 3, y + 14, 6, 300); }
      if (fl) { ctx.globalAlpha = .5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 15, 8, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } }
    glow(ctx) { if (this.stun <= 0) glow(ctx, this.x + this.dir * 6, this.y - 9, 18, FI, .4); }
  }
  hpFix(Bomber);

  // 회전톱 · Sawblade: patrols the floor, can't be hurt by a swing. Shots and dash slashes jam it for a couple of seconds; stomping it hurts.
  class Sawblade extends Enemy {
    constructor(g, x, y) { super(g, x, y); this.w = 30; this.h = 30; this.x0 = x; this.dir = 1; this.rot = 0; this.hp = Infinity; this.maxHp = Infinity; this.jam = 0; this.span = 150; }
    onHit(hit) { const g = this.g, p = hit.player;
      if (hit.kind === 'stomp') { hurtP(g, p, 'saw', dirTo(p, this.x)); return { hit: true, damage: 0, killed: false, armored: true }; }
      if (['shot', 'rush', 'great', 'tslam', 'wave', 'tupper', 'plunge', 'pound', 'dash'].includes(hit.kind) || p.form === 'titan') { this.jam = 2.4; g.particles.sparks(this.x, this.y - 14, 10, C.fireL, .8); g.audio.play('break'); g.addPop && g.addPop(this.x, this.y - 40, 'JAM', '#9ff8ff'); return { hit: true, damage: 0, killed: false, armored: true }; }
      g.particles.sparks(this.x, this.y - 14, 4, C.fireL, .6); g.audio.play('hit'); return { hit: true, damage: 0, killed: false, armored: true }; }
    update(dt) { const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.jam = Math.max(0, this.jam - dt); this.x0 = this.x0 == null ? this.x : this.x0;
      if (this.jam > 0) { if (Math.random() < .2) g.particles.sparks(this.x, this.y - 14, 1, C.fire, .4); this.rot += dt * 2; return; }
      const sp = 95 + (Math.abs(p.x - this.x) < 160 ? 40 : 0), nx = this.x + this.dir * sp * dt;
      if (Math.abs(nx - this.x0) > this.span || tm.solid(Math.floor((nx + this.dir * 16) / TS), Math.floor((this.y - 14) / TS)) || !floorAhead(g, this.x, this.y, this.dir, 16 + sp * dt)) { this.dir *= -1; } else this.x = nx;
      this.rot += this.dir * dt * 22; if (Math.random() < .3) g.particles.sparks(this.x - this.dir * 12, this.y - 1, 1, C.fire, .3);
      if (!p.dead && overlap(p.hbox(), this.box())) hurtP(g, p, 'saw', dirTo(p, this.x)); }
    box() { return { l: this.x - 13, r: this.x + 13, t: this.y - 28, b: this.y }; }
    lights(add, CYC, ORG) { add(this.x, this.y - 14, this.jam > 0 ? 24 : 44, ORG, this.jam > 0 ? .15 : .4); }
    draw(ctx) { const x = this.x, y = this.y - 14, r = 13; ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.fillStyle = this.jam > 0 ? '#5a626a' : '#aab4bc'; ctx.beginPath(); ctx.moveTo(Math.cos(a - .14) * r, Math.sin(a - .14) * r); ctx.lineTo(Math.cos(a + .08) * (r + 6), Math.sin(a + .08) * (r + 6)); ctx.lineTo(Math.cos(a + .2) * r, Math.sin(a + .2) * r); ctx.fill(); }
      const gr = ctx.createRadialGradient(-3, -3, 1, 0, 0, r); gr.addColorStop(0, '#6a7c8a'); gr.addColorStop(1, '#222c35'); ctx.fillStyle = gr; circ(ctx, 0, 0, r); ctx.fillStyle = '#10151a'; circ(ctx, 0, 0, 5); ctx.fillStyle = this.jam > 0 ? '#3a1a0e' : C.fire; circ(ctx, 0, 0, 2.4); ctx.restore();
      ctx.fillStyle = '#14181c'; ctx.fillRect(x - 16, y + 12, 32, 3); if (this.jam > 0) { ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 9px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('JAM', x, y - 22); } }
  }
  hpFix(Sawblade);

  // 수리 드론 · Mender: hovers behind the other machines and patches them up — it goes down first
  class Mender extends Enemy {
    constructor(g, x, y) { super(g, x, y - 70); this.w = 22; this.h = 18; this.base = this.y; this.x0 = x; this.hp = 2; this.maxHp = 2; this.cd = 2; this.dir = 1; }
    update(dt) { const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.cd -= dt;
      if (this.stun > 0) { this.stun -= dt; this.y = lerp(this.y, this.base + 8, .1); enemyContact(g, this); return; }
      let tgt = null, bd = 280; for (const e of g.level.entities) { if (e === this || e.dead || !(e instanceof Enemy) || e instanceof Mender || e.hp === Infinity || e._exNeutral || e instanceof Dummy) continue; const d = Math.abs(e.x - this.x) + Math.abs(e.y - this.y) * .6; if (d < bd) { bd = d; tgt = e; } }
      let gx = this.x0, gy = this.base; if (tgt) { gx = tgt.x - (p.x > tgt.x ? 1 : -1) * 40; gy = Math.min(this.base, tgt.y - 70); }
      const fleeDx = this.x - p.x, flee = !p.dead && Math.abs(fleeDx) < 110 && Math.abs(p.y - this.y) < 120; if (flee) gx = this.x + Math.sign(fleeDx || 1) * 80;
      const sp = flee ? 120 : 70, dx = gx - this.x, nx = this.x + clamp(dx, -sp * dt, sp * dt); if (!tm.solid(Math.floor((nx + Math.sign(dx) * 12) / TS), Math.floor((this.y - 10) / TS))) this.x = nx;
      this.y = lerp(this.y, gy + Math.sin(this.t * 2.6) * 3, .06); this.dir = Math.sign(tgt ? tgt.x - this.x : p.x - this.x) || this.dir;
      this._beam = Math.max(0, (this._beam || 0) - dt);
      if (tgt && this.cd <= 0 && sees(g, this.x, this.y - 8, tgt.x, tgt.y - 14)) { const hurt = tgt.hp < (tgt.maxHp || tgt.hp);
        this.cd = hurt ? 2.2 : 3.4; if (hurt) { tgt.hp = Math.min(tgt.maxHp, tgt.hp + 2); g.particles.sparks(tgt.x, tgt.y - 16, 10, '#9ff8c0', .6); g.addPop && g.addPop(tgt.x, tgt.y - 40, '+HP', '#9ff8c0'); g.audio.play('collect'); this._beam = .5; this._bt = { x: tgt.x, y: tgt.y - 16 }; } }
      enemyContact(g, this); }
    draw(ctx) { const x = this.x, y = this.y - 8, st = this.stun > 0, fl = this.hitUntil && this.g.time < this.hitUntil; const ra = st ? this.t * 3 : this.t * 34;
      ctx.strokeStyle = 'rgba(200,210,215,.7)'; ctx.lineWidth = 2; line(ctx, x - Math.cos(ra) * 10, y - 11, x + Math.cos(ra) * 10, y - 11); ctx.strokeStyle = '#5a6c7a'; ctx.lineWidth = 1.5; line(ctx, x, y - 6, x, y - 11);
      ctx.fillStyle = '#2f4a40'; ctx.beginPath(); ctx.ellipse(x, y, 11, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8e0cc'; ctx.fillRect(x - 3, y - 4, 6, 8); ctx.fillStyle = '#c0302a'; ctx.fillRect(x - 1, y - 3, 2, 6); ctx.fillRect(x - 3, y - 1, 6, 2);   // cross
      ctx.fillStyle = '#0a0d10'; circ(ctx, x + this.dir * 6, y + 1, 2.8); ctx.fillStyle = st ? '#3a1a0e' : '#9ff8c0'; circ(ctx, x + this.dir * 6, y + 1, 1.6);
      if (this._beam > 0 && this._bt) { ctx.strokeStyle = `rgba(159,248,192,${this._beam * 1.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this._bt.x, this._bt.y); ctx.stroke(); }
      if (fl) { ctx.globalAlpha = .5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 11, 7, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } }
    glow(ctx) { if (this.stun <= 0) glow(ctx, this.x, this.y - 8, 20, '120,255,190', .3); }
  }
  hpFix(Mender);

  // 잠복 상자 · Mimic: a crate that is not a crate. It waits for you to walk past, then springs.
  class Mimic extends Enemy {
    constructor(g, x, y) { super(g, x, y); this.w = 28; this.h = 26; this.hp = 4; this.maxHp = 4; this.st = 'dormant'; this.st_t = 0; this.dir = -1; this.vx = 0; this.vy = 0; this.home = x; }
    rimBox() { return { x: this.x - 22, y: this.y - 36, w: 44, h: 40 }; }
    onHit(hit) { if (this.st === 'dormant') { this.wake(); return { hit: true, damage: 0, killed: false, armored: true }; }
      const g = this.g, dmg = +hit.damage || 0; this.hp -= dmg; this.hitUntil = g.time + .11; g.particles.sparks(this.x, this.y - 14, 8, C.fireL, .7); if (!this.dead) this.stun = Math.max(this.stun || 0, .22);
      const killed = this.hp <= 0; if (killed) { this.destroy(); if (g.stats) g.stats.score += 200; g.addPop && g.addPop(this.x, this.y - 30, '+200', '#ffe9a8'); } return { hit: true, damage: dmg, killed }; }
    wake() { if (this.st !== 'dormant') return; this.st = 'reveal'; this.st_t = 0; this.g.audio.play('hum'); this.g.particles.dust(this.x, this.y, 6, 1); }
    update(dt) { const g = this.g, p = g.player, tm = g.level.tm; this.t += dt; this.st_t += dt; this.st = this.st || 'dormant';
      if (this.stun > 0) { this.stun -= dt; enemyContact(g, this); return; }
      if (this.st === 'dormant') { if (!p.dead && Math.abs(p.x - this.x) < 60 && Math.abs(p.y - this.y) < 50) this.wake(); return; }
      if (this.st === 'reveal') { this.dir = dirTo(p, this.x); this.x += (Math.random() - .5) * 1.6; if (this.st_t > .5) { this.st = 'pounce'; this.st_t = 0; this.vx = this.dir * 250; this.vy = -400; g.audio.play('stomp'); } }
      else if (this.st === 'pounce') { this.vy += 1500 * dt; const nx = this.x + this.vx * dt; if (!tm.rectSolid(nx - 12, this.y - 24, nx + 12, this.y - 2)) this.x = nx; else this.vx = 0; this.y += this.vy * dt;
        if (this.vy > 0 && tm.rectSolid(this.x - 11, this.y - 1, this.x + 11, this.y + 1)) { this.y = Math.floor((this.y + 1) / TS) * TS; this.vy = 0; this.st = 'chase'; this.st_t = 0; g.particles.dust(this.x, this.y, 8, 1.4); g.camera.shake(.12); } }
      else if (this.st === 'chase') { this.dir = dirTo(p, this.x); const nx = this.x + this.dir * 75 * dt; if (!tm.solid(Math.floor((nx + this.dir * 14) / TS), Math.floor((this.y - 12) / TS)) && floorAhead(g, this.x, this.y, this.dir, 14 + 75 * dt)) this.x = nx;
        if (this.st_t > 1.2 && !p.dead && Math.abs(p.x - this.x) < 120 && Math.random() < dt * 1.5) { this.st = 'pounce'; this.st_t = 0; this.vx = this.dir * 260; this.vy = -380; g.audio.play('stomp'); } }
      enemyContact(g, this); }
    draw(ctx) { const x = this.x, y = this.y, open = this.st === 'dormant' ? 0 : this.st === 'reveal' ? clamp(this.st_t / .5, 0, 1) : this.st === 'pounce' ? 1 : .35 + .25 * Math.sin(this.t * 10), fl = this.hitUntil && this.g.time < this.hitUntil;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#14110e'; ctx.fillRect(-14, -27, 28, 27); ctx.fillStyle = '#2b2a24'; ctx.fillRect(-13, -26, 26, 14); ctx.fillStyle = '#3a372c'; ctx.fillRect(-13, -26, 26, 3);
      ctx.strokeStyle = '#1a1812'; ctx.lineWidth = 1.4; ctx.strokeRect(-11, -24, 22, 10); line(ctx, -11, -24, 11, -14); line(ctx, 11, -24, -11, -14);
      ctx.save(); ctx.translate(-13, -13); ctx.rotate(-open * .9); ctx.fillStyle = '#2b2a24'; ctx.fillRect(0, -10, 26, 10); ctx.fillStyle = '#3a372c'; ctx.fillRect(0, -10, 26, 2); ctx.restore();
      ctx.fillStyle = '#0a0806'; ctx.fillRect(-12, -13, 24, 13 * Math.max(.15, open));
      if (open > .1) { ctx.fillStyle = '#e8e0cc'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 5, -13); ctx.lineTo(-8 + i * 5, -13 + 6 * open); ctx.lineTo(-6 + i * 5, -13); ctx.fill(); } ctx.fillStyle = C.fire; circ(ctx, -5, -7, 2); circ(ctx, 5, -7, 2); }
      else { ctx.fillStyle = '#8a7a3a'; ctx.fillRect(-3, -14, 6, 4); }   // the latch
      if (fl) { ctx.globalAlpha = .5; ctx.fillStyle = '#fff'; ctx.fillRect(-14, -27, 28, 27); ctx.globalAlpha = 1; } ctx.restore();
      if (this.st === 'reveal') { ctx.fillStyle = C.fire; ctx.font = 'bold 13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 36); } }
  }
  hpFix(Mimic);

  // ---- hit routing for the machines that decide their own damage ---------------------------------------------------------
  CMB.registerBossHit((t, hit) => { if (t instanceof Guard || t instanceof Sawblade || t instanceof Mimic) return t.onHit(hit); return null; });
  try { const K = window.GH_EXP && window.GH_EXP.debug && window.GH_EXP.debug.KILL; if (K) Object.assign(K, { Guard: 30, Bomber: 25, Sawblade: 0, Mender: 25, Mimic: 30 }); } catch (e) { /* economy table is optional */ }

  // ---- placement ---------------------------------------------------------------------------------------------------------
  const PLAN = {
    blue:    { main: ['Guard', 'Guard', 'Mimic'] },
    pipes:   { main: ['Bomber', 'Bomber', 'Mender', 'Mimic'] },
    brass:   { main: ['Guard', 'Sawblade', 'Sawblade', 'Bomber'] },
    cam:     { main: ['Sawblade', 'Sawblade', 'Guard', 'Mimic'] },
    fly:     { main: ['Bomber', 'Bomber', 'Mender', 'Guard'] },
    arc:     { main: ['Guard', 'Guard', 'Bomber', 'Mimic', 'Mender'] },
    furnace: { main: ['Guard', 'Sawblade', 'Mimic'] },
    heart:   { main: [] }
  };
  const ANNEX = { blue: ['Guard'], pipes: ['Bomber'], brass: ['Sawblade'], cam: ['Sawblade'], fly: ['Mender', 'Bomber'], arc: ['Guard'], furnace: ['Guard'], heart: [] };
  const CLS = { Guard, Bomber, Sawblade, Mender, Mimic };
  function placeExtras(lv, g, def) {
    const th = def.theme, tm = lv.tm, annex = tm.h === 24 && tm.w === 64;
    const list = annex ? (ANNEX[th] || []) : ((PLAN[th] || {}).main || []);
    if (!list.length || def.final || lv.boss) return;
    const R = rng32((def.id || 1) * 7727 + (annex ? 31 : 5)), solid = (x, y) => tm.solid(x, y), air = (x, y) => !tm.solid(x, y) && tm.get(x, y) !== '-';
    const avoid = lv.entities.filter(e => Number.isFinite(e.x) && Number.isFinite(e.y) && !(e instanceof Stain) && !(e instanceof Prop) && !(e instanceof Companion) && !/^(Sign|FxFlash|FxBolt)$/.test(e.constructor.name));
    const tutor = def.tutor ? TUT_W + 4 : 0, start = Math.max(12, tutor), end = tm.w - 10;
    // candidate floors: standing tile with 3 free rows above, 5 flat tiles wide, no spikes within 2 tiles
    const cand = [];
    for (let x = start; x < end; x++) for (let y = 3; y < tm.h - 1; y++) {
      if (!solid(x, y) || tm.get(x, y) === '^' || tm.get(x, y) === 'R') continue;
      if (!(air(x, y - 1) && air(x, y - 2) && air(x, y - 3))) continue;
      let ok = true; for (let k = -2; k <= 2; k++) { if (!solid(x + k, y) || !air(x + k, y - 1) || !air(x + k, y - 2)) { ok = false; break; } const c = tm.get(x + k, y); if (c === '^' || c === 'R' || c === 'o') { ok = false; break; } }
      if (ok) cand.push({ x, y });
    }
    if (!cand.length) return;
    const taken = [], need = list.length;
    for (let i = 0; i < need; i++) {
      // spread along the level: the i-th machine lives in the i-th slice
      const lo = Math.floor(cand.length * i / need), hi = Math.max(lo + 1, Math.floor(cand.length * (i + 1) / need));
      for (let tries = 0, pool = cand.slice(lo, hi); tries < 120 && pool.length; tries++) {
        if (tries === 60) pool = cand;   // the slice had no room: try anywhere in the level
        const c = pool[Math.floor(R() * pool.length)], px = c.x * TS + 16, py = c.y * TS;
        if (avoid.some(e => Math.abs(e.x - px) < (e instanceof Checkpoint || e instanceof Charger ? 130 : 170) && Math.abs(e.y - py) < 170)) continue;
        if (taken.some(t => Math.abs(t.x - px) < 220)) continue;
        const K = CLS[list[i]]; const e = new K(g, px, py); if (K === Sawblade) { e.span = 130; } lv.entities.push(e); taken.push({ x: px }); break;
      }
    }
  }
  const BaseLevel = Level;
  Level = class extends BaseLevel {
    constructor(g, def) { super(g, def); try { if (def && def.theme && def.intro && def.intro.length || (def && def.rows && def.rows.length === 24 && def.rows[0].length === 64)) placeExtras(this, g, def); } catch (e) { console.error('placeExtras', e); } }
  };
  window.GH_ENEMIES_V4 = { AimBullet, Guard, Bomber, BombDrop, Sawblade, Mender, Mimic, placeExtras, PLAN, variantOf };
})();
