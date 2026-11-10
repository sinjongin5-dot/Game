// 필드: 타일맵 렌더링, 이동, NPC 상호작용/시야, 워프, 야생 조우
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, T = 16;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const STEP = 150; // 한 칸 이동 시간(ms)

  const OW = (X.OW = {
    map: null, npcs: [], pl: { x: 0, y: 0, dir: 'down', fx: 0, fy: 0, t: 0, moving: false }, time: 0, bang: null,

    init() {
      this.cv = document.querySelector('#world');
      this.g = this.cv.getContext('2d');
      this.g.imageSmoothingEnabled = false;
      let last = performance.now();
      const touch = document.querySelector('#touch'), ov = document.querySelector('#overlay');
      const loop = (now) => { const dt = Math.min(50, now - last); last = now; if (G.scene === 'world') { this.update(dt); this.draw(); } touch.style.visibility = G.scene === 'world' && ov.classList.contains('hidden') ? '' : 'hidden'; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },

    load(id, x, y, dir) {
      const m = (this.map = X.WORLD.maps[id]), p = G.p;
      Object.assign(this.pl, { x, y, dir: dir || 'down', moving: false, t: 0 });
      p.map = id; p.x = x; p.y = y; p.dir = this.pl.dir;
      this.refreshNpcs();
      if (this._name !== m.name) { this._name = m.name; G.toast(m.name, 2200); }
    },
    refreshNpcs() { if (this.map) this.npcs = this.map.npcs.filter((n) => !n.show || n.show(G)); },
    tile(x, y) { const m = this.map; return x < 0 || y < 0 || x >= m.w || y >= m.h ? null : m.tiles[y][x]; },
    npcAt(x, y) { return this.npcs.find((n) => n.x === x && n.y === y); },
    passable(x, y) { const c = this.tile(x, y); return c != null && !X.BLOCK.includes(c) && !this.npcAt(x, y); },

    update(dt) {
      const pl = this.pl;
      this.time += dt;
      G.p.time += dt;
      if (pl.moving) {
        pl.t += dt;
        if (pl.t >= STEP) { pl.moving = false; pl.t = 0; pl.x += DIRS[pl.dir][0]; pl.y += DIRS[pl.dir][1]; G.p.x = pl.x; G.p.y = pl.y; this.onStep(); }
        return;
      }
      if (G.lock || G.inputStack.length || !G.held.length) return;
      const d = G.held[G.held.length - 1], [dx, dy] = DIRS[d];
      pl.dir = d; G.p.dir = d;
      const nx = pl.x + dx, ny = pl.y + dy;
      const w = this.map.warps.find((v) => v.x === nx && v.y === ny);
      if (w && w.gate) { const msg = w.gate(G); if (msg) { G.held.length = 0; return G.run(() => G.say(msg)); } }
      if (this.passable(nx, ny)) { pl.moving = true; pl.t = 0; }
    },

    onStep() {
      const pl = this.pl, m = this.map;
      const w = m.warps.find((v) => v.x === pl.x && v.y === pl.y);
      if (w) return G.run(async () => { await G.fade(true); this.load(w.to, w.tx, w.ty, w.dir); await G.fade(false); });
      // 트레이너의 시야
      for (const n of this.npcs) {
        if (!n.sight || G.p.defeated[n.id]) continue;
        const [dx, dy] = DIRS[n.dir];
        for (let k = 1; k <= n.sight; k++) {
          const x = n.x + dx * k, y = n.y + dy * k;
          if (x === pl.x && y === pl.y) {
            return G.run(async () => { G.held.length = 0; this.bang = n; G.sfx('ok'); await X.wait(550); this.bang = null; pl.dir = OPP[n.dir]; await n.script(G, n); });
          }
          if (!this.passable(x, y)) break;
        }
      }
      const c = this.tile(pl.x, pl.y);
      if (m.enc && (c === ':' || c === ';') && Math.random() < m.enc.rate) {
        const total = m.enc.list.reduce((a, e) => a + e[3], 0);
        let r = Math.random() * total, pick = m.enc.list[0];
        for (const e of m.enc.list) { if ((r -= e[3]) < 0) { pick = e; break; } }
        const lv = pick[1] + Math.floor(Math.random() * (pick[2] - pick[1] + 1));
        G.held.length = 0;
        G.run(async () => { await this.flash(); await G.wildBattle(pick[0], lv); });
      }
    },
    async flash() { for (let i = 0; i < 2; i++) { await G.fade(true); await G.fade(false); } },

    interact() {
      const pl = this.pl, [dx, dy] = DIRS[pl.dir];
      let x = pl.x + dx, y = pl.y + dy;
      let n = this.npcAt(x, y);
      if (!n && this.tile(x, y) === 'c') n = this.npcAt(x + dx, y + dy); // 카운터 너머
      if (n) return G.run(async () => { if (n.look) n.dir = OPP[pl.dir]; G.sfx('sel'); await n.script(G, n); });
      const sign = this.map.signs && this.map.signs[x + ',' + y];
      if (sign) return G.run(() => G.say(sign));
      const c = this.tile(x, y);
      if (c === 'k') return G.run(() => G.say('책이 빼곡히 꽂혀 있다. 「비스트와 카드의 공존에 관하여」…'));
      if (c === 'h' && !this.map.id.includes('heal')) return G.run(() => G.say('무언가를 분석하는 기계다. 화면에 "LINK"라는 글자가 깜빡인다.'));
    },

    // 건물 용도를 알려 주는 문 위 간판
    doorIcon(g, to, x, y) {
      const kind = ['heal', 'mart', 'cards', 'gym', 'hall', 'arena', 'lab'].find((k) => to.includes(k));
      if (!kind) return;
      const R = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(x + a, y + b, w, h); };
      R(-1, -1, 14, 12, '#1a1626'); R(0, 0, 12, 10, '#f8f4e8');
      if (kind === 'heal') { R(5, 1, 2, 8, '#e03a5a'); R(2, 4, 8, 2, '#e03a5a'); }
      else if (kind === 'mart') { R(3, 2, 6, 6, '#e0a820'); R(4, 1, 4, 8, '#e0a820'); R(5, 3, 2, 4, '#fff3c0'); }
      else if (kind === 'cards') { R(2, 1, 5, 7, '#8a58c0'); R(5, 2, 5, 7, '#2f9a8a'); R(7, 4, 1, 3, '#fff'); }
      else if (kind === 'gym') { R(2, 5, 8, 4, '#3f9a48'); R(1, 2, 2, 2, '#3f9a48'); R(4, 1, 2, 2, '#3f9a48'); R(7, 1, 2, 2, '#3f9a48'); R(9, 3, 2, 2, '#3f9a48'); }
      else if (kind === 'hall') { R(3, 1, 6, 8, '#3a2a58'); R(5, 3, 2, 4, '#f2c94c'); R(4, 4, 4, 2, '#f2c94c'); }
      else if (kind === 'arena') { R(2, 1, 8, 4, '#e0a820'); R(4, 5, 4, 2, '#e0a820'); R(5, 7, 2, 1, '#e0a820'); R(3, 8, 6, 1, '#8a6a20'); }
      else { R(5, 1, 2, 3, '#58b0e8'); R(3, 4, 6, 5, '#58b0e8'); R(4, 5, 2, 2, '#d6f0ff'); }
    },

    draw() {
      const g = this.g, m = this.map, pl = this.pl, VW = 320, VH = 200;
      if (!m) return;
      const f = pl.moving ? pl.t / STEP : 0;
      const px = (pl.x + DIRS[pl.dir][0] * f) * T, py = (pl.y + DIRS[pl.dir][1] * f) * T;
      const mw = m.w * T, mh = m.h * T;
      const cx = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, px + 8 - VW / 2));
      const cy = mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, py + 8 - VH / 2));
      const ox = -Math.round(cx), oy = -Math.round(cy);
      g.fillStyle = m.indoor ? '#15121f' : '#2f8a3c';
      g.fillRect(0, 0, VW, VH);
      const frame = Math.floor(this.time / 500) % 2;
      const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(m.w - 1, Math.ceil((cx + VW) / T));
      const y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(m.h - 1, Math.ceil((cy + VH) / T));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.drawImage(A.drawTile(m.tiles[y][x], frame), x * T + ox, y * T + oy);
      for (const w of m.warps) if (w.door) this.doorIcon(g, w.to, w.x * T + ox + 2, (w.y - 1) * T + oy + 3);
      // 캐릭터 (y 순서로 정렬)
      const ents = this.npcs.map((n) => ({ y: n.y * T, n }));
      ents.push({ y: py, me: true });
      ents.sort((a, b) => a.y - b.y);
      for (const e of ents) {
        if (e.me) {
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(Math.round(px) + 3 + ox, Math.round(py) + 12 + oy, 10, 3);
          g.drawImage(A.drawChar('hero', pl.dir, pl.moving ? Math.floor(pl.t / 75) % 2 : 0), Math.round(px) + ox, Math.round(py) - 4 + oy);
        } else {
          const n = e.n, sx = n.x * T + ox, sy = n.y * T + oy;
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(sx + 3, sy + 12, 10, 3);
          if (n.beast) g.drawImage(A.beast(n.beast), sx - 4, sy - 10 + (frame ? 1 : 0), 24, 24);
          else g.drawImage(A.drawChar(n.look, n.dir, 0), sx, sy - 4);
          if (this.bang === n) { g.fillStyle = '#fff'; g.fillRect(sx + 5, sy - 17, 7, 11); g.fillStyle = '#e03a3a'; g.fillRect(sx + 7, sy - 15, 3, 5); g.fillRect(sx + 7, sy - 9, 3, 2); }
        }
      }
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
