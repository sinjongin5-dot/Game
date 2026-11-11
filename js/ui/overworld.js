// 필드 (2.5D): CSS 3D 장면 — 기울어진 지면, 입체 건물, 카메라를 향해 서 있는 나무·소품·캐릭터.
// 게임 로직(이동, NPC 시야, 워프, 조우)은 타일 좌표 그대로이고, 그리는 방식만 3D다.
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, el = X.el;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const STEP = 150;          // 한 칸 이동 시간(ms)
  const TS = 48, PX = 3;     // 지면 위 타일 크기, 픽셀 아트 배율
  const TILT = 50 * Math.PI / 180, CO = Math.cos(TILT), SI = Math.sin(TILT);
  const ROOF = 'RBPGYH', WALL = 'WwD';
  const FEET = 0.82;         // 캐릭터가 타일 안에서 서는 깊이 (같은 칸의 풀숲 뒤에 서도록)

  // 3D 면 하나: 왼쪽 위 꼭짓점 o에서 u(가로)·v(세로 아래 방향) 축으로 펼친다.
  function face(w, h, o, u, v, cls, css) {
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const d = el('div', 'f3 ' + (cls || ''));
    d.style.cssText = `width:${w}px;height:${h}px;transform:matrix3d(${u[0]},${u[1]},${u[2]},0,${v[0]},${v[1]},${v[2]},0,${n[0]},${n[1]},${n[2]},0,${o[0]},${o[1]},${o[2]},1);${css || ''}`;
    return d;
  }
  // 카메라를 향해 서는 판(빌보드). (x, y)는 지면 위 밑변 왼쪽 끝.
  const boardM = (x, y, h) => `matrix3d(1,0,0,0,0,${CO},${-SI},0,0,${SI},${CO},0,${x},${y - h * CO},${h * SI},1)`;
  function board(x, y, w, h, cls, css) { const d = el('div', 'f3 ' + (cls || '')); d.style.cssText = `width:${w}px;height:${h}px;transform:${boardM(x, y, h)};${css || ''}`; return d; }

  const OW = (X.OW = {
    map: null, npcs: [], pl: { x: 0, y: 0, dir: 'down', t: 0, moving: false }, time: 0, bang: null,

    init() {
      this.scene = document.querySelector('#scene');
      this.plane = document.querySelector('#plane');
      const touch = document.querySelector('#touch'), ov = document.querySelector('#overlay');
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(50, now - last); last = now;
        if (G.scene === 'world') { this.update(dt); this.draw(); }
        touch.style.visibility = G.scene === 'world' && ov.classList.contains('hidden') ? '' : 'hidden';
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    load(id, x, y, dir) {
      const m = (this.map = X.WORLD.maps[id]), p = G.p;
      Object.assign(this.pl, { x, y, dir: dir || 'down', moving: false, t: 0 });
      p.map = id; p.x = x; p.y = y; p.dir = this.pl.dir;
      this.build();
      this.refreshNpcs();
      if (this._name !== m.name) { this._name = m.name; G.toast(m.name, 2200); }
    },
    tile(x, y) { const m = this.map; return x < 0 || y < 0 || x >= m.w || y >= m.h ? null : m.tiles[y][x]; },
    npcAt(x, y) { return this.npcs.find((n) => n.x === x && n.y === y); },
    passable(x, y) { const c = this.tile(x, y); return c != null && !X.BLOCK.includes(c) && !this.npcAt(x, y); },

    // ── 장면 구성 ──
    // 세워지는 타일의 밑바닥에 깔 평면 타일
    base(ch) {
      const m = this.map;
      if ('TfS:'.includes(ch)) return ch === ':' ? ':' : '.';
      if (ch === '^' || ch === 'C') return '1';
      if (ch === '#') return '2';
      if (ROOF.includes(ch)) return '3';
      if (ch === 'W' || ch === 'w') return '4';
      if (ch === 'D') return '5';
      if (ch === 'x') return '6';
      if ('kptchz'.includes(ch)) return m.floor || 'o';
      return ch;
    },
    propKey(ch, x, y) {
      const m = this.map;
      if (ch === 'x') return y === m.h - 1 ? 'xs' : 'xb';
      return 'T^#fSC:kptchz'.includes(ch) ? ch : null;
    },
    build() {
      const m = this.map, pl = this.plane;
      pl.innerHTML = '';
      this.scene.className = 'bg-' + (m.bg || 'indoor');
      // 지면
      const gc = document.createElement('canvas');
      gc.width = m.w * 16; gc.height = m.h * 16; gc.className = 'ground';
      gc.style.width = m.w * TS + 'px'; gc.style.height = m.h * TS + 'px';
      const g = (this.gctx = gc.getContext('2d'));
      this.anim = [];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const b = this.base(m.tiles[y][x]);
        g.drawImage(A.drawTile(b, 0), x * 16, y * 16);
        if (b === '~') this.anim.push([x, y]);
      }
      pl.appendChild(gc);
      // 세워지는 소품: 같은 줄에 이어진 것은 한 장의 띠로 묶는다
      const sh = (x, y, w, h, a) => { g.fillStyle = `rgba(10,8,24,${a})`; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill(); };
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w;) {
          const k = this.propKey(m.tiles[y][x], x, y);
          if (!k) { x++; continue; }
          let n = 1;
          while (x + n < m.w && this.propKey(m.tiles[y][x + n], x + n, y) === k) n++;
          const P = A.prop(k), h = P.h * PX;
          pl.appendChild(board(x * TS, (y + (k === ':' ? 1 : 0.98)) * TS, n * TS, h, 'prop p-' + (k === ':' ? 'grass' : k), `background-image:url(${P.url});background-size:${TS}px ${h}px`));
          if (k === 'T' || k === 'p' || k === 'z') for (let i = 0; i < n; i++) sh((x + i) * 16 + 9, y * 16 + 15, 7, 2.5, 0.25);
          x += n;
        }
      }
      // 건물: 지붕 줄 영역을 3D 상자로 올린다 (정면 벽 + 박공 지붕 + 옆벽)
      for (let y = 1; y < m.h; y++) {
        for (let x = 0; x < m.w;) {
          if (!WALL.includes(m.tiles[y][x]) || !ROOF.includes(m.tiles[y - 1][x])) { x++; continue; }
          let n = 1;
          while (x + n < m.w && WALL.includes(m.tiles[y][x + n])) n++;
          let rows = 0;
          while (y - 1 - rows >= 0 && ROOF.includes(m.tiles[y - 1 - rows][x])) rows++;
          this.building(x, y, n, rows, g);
          x += n;
        }
      }
      // 플레이어
      this.plShadow = el('div', 'f3 shadow3');
      this.plEl = el('div', 'f3 ent');
      pl.appendChild(this.plShadow); pl.appendChild(this.plEl);
      this.npcEls = [];
      this._plKey = '';
    },
    building(x, y, n, rows, g) {
      const m = this.map, pl = this.plane, rc = m.tiles[y - 1][x];
      const X0 = x * TS, W = n * TS, yF = y * TS, D = rows * TS, yB = yF - D, H = 72, R = Math.min(46, D * 0.42), L = Math.hypot(D / 2, R);
      const chars = m.tiles[y].slice(x, x + n);
      const kinds = [...chars].map((c, i) => { const w = m.warps.find((v) => v.door && v.x === x + i && v.y === y); return w ? ['heal', 'mart', 'cards', 'gym', 'hall', 'arena', 'lab'].find((k) => w.to.includes(k)) || null : null; });
      const roof = `background-image:url(${A.tileUrl(rc)});background-size:${TS}px ${TS}px`;
      const gable = `clip-path:polygon(0 ${R}px,50% 0,100% ${R}px,100% 100%,0 100%)`;
      pl.appendChild(face(D, H + R, [X0, yB, H + R], [0, 1, 0], [0, 0, -1], 'bw-side', gable));
      pl.appendChild(face(D, H + R, [X0 + W, yB, H + R], [0, 1, 0], [0, 0, -1], 'bw-side', gable));
      pl.appendChild(face(W, H, [X0, yB, H], [1, 0, 0], [0, 0, -1], 'bw-side'));
      pl.appendChild(face(W, L, [X0, yB, H], [1, 0, 0], [0, D / 2 / L, R / L], 'bw-roof back', roof));
      pl.appendChild(face(W + 12, L + 8, [X0 - 6, yF - D / 2, H + R], [1, 0, 0], [0, D / 2 / L, -R / L], 'bw-roof', roof));
      pl.appendChild(face(W, H, [X0, yF, H], [1, 0, 0], [0, 0, -1], 'bw-front', `background-image:url(${A.wallTex(chars, kinds)});background-size:100% 100%`));
      g.fillStyle = 'rgba(10,8,24,0.28)'; g.fillRect(x * 16 + n * 16, (y - rows) * 16 + 4, 5, rows * 16);
    },
    refreshNpcs() {
      if (!this.map) return;
      this.npcs = this.map.npcs.filter((n) => !n.show || n.show(G));
      for (const e of this.npcEls || []) e.remove();
      this.npcEls = [];
      for (const n of this.npcs) {
        const px = n.x * TS, py = (n.y + FEET) * TS;
        const s = el('div', 'f3 shadow3'); s.style.transform = `translate3d(${px + 6}px,${py - 9}px,1px)`;
        const d = n.beast ? board(px - 12, py, 72, 72, 'ent beast', `background-image:url(${A.beastUrl(n.beast)})`) : board(px, py, TS, TS, 'ent', `background-image:url(${A.charFrame(n.look, n.dir, 0)})`);
        d._npc = n; d._dir = n.dir;
        this.plane.appendChild(s); this.plane.appendChild(d);
        this.npcEls.push(s, d);
      }
    },

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
      if (this.passable(nx, ny)) { pl.moving = true; pl.t = 0; const c = this.tile(nx, ny); this.puff(c === ':' ? nx * TS : pl.x * TS, ((c === ':' ? ny : pl.y) + FEET) * TS, c === ':'); }
    },

    onStep() {
      const pl = this.pl, m = this.map;
      const w = m.warps.find((v) => v.x === pl.x && v.y === pl.y);
      if (w) return G.run(async () => { await G.fade(true); this.load(w.to, w.tx, w.ty, w.dir); this.draw(); await G.fade(false); });
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
    // 조우 연출: 화면이 원형으로 닫힌다
    async flash() { const f = document.querySelector('#fade'); G.sfx('ok'); f.classList.add('iris'); await X.wait(700); f.classList.add('on'); f.classList.remove('iris'); },
    // 지면 위의 짧은 효과 (발먼지, 풀잎)
    puff(x, y, grass) {
      if (grass) for (let i = 0; i < 5; i++) { const d = board(x + 14 + Math.random() * 20, y + 2, 8, 8 + Math.random() * 16, ''); d.appendChild(el('div', 'leaf')).style.cssText = `--dx:${(Math.random() - 0.5) * 50}px;--dy:${-20 - Math.random() * 26}px`; this.plane.appendChild(d); setTimeout(() => d.remove(), 520); }
      else { const d = el('div', 'f3'); d.style.transform = `translate3d(${x + 11}px,${y - 8}px,2px)`; d.appendChild(el('div', 'puff')); this.plane.appendChild(d); setTimeout(() => d.remove(), 440); }
    },

    interact() {
      const pl = this.pl, [dx, dy] = DIRS[pl.dir];
      const x = pl.x + dx, y = pl.y + dy;
      let n = this.npcAt(x, y);
      if (!n && this.tile(x, y) === 'c') n = this.npcAt(x + dx, y + dy); // 카운터 너머
      if (n) return G.run(async () => { if (n.look) n.dir = OPP[pl.dir]; G.sfx('sel'); await n.script(G, n); });
      const sign = this.map.signs && this.map.signs[x + ',' + y];
      if (sign) return G.run(() => G.say(sign));
      const c = this.tile(x, y);
      if (c === 'k') return G.run(() => G.say('책이 빼곡히 꽂혀 있다. 「비스트와 카드의 공존에 관하여」…'));
      if (c === 'h' && !this.map.id.includes('heal')) return G.run(() => G.say('무언가를 분석하는 기계다. 화면에 "LINK"라는 글자가 깜빡인다.'));
    },

    draw() {
      const m = this.map, pl = this.pl;
      if (!m) return;
      const f = pl.moving ? pl.t / STEP : 0;
      const px = (pl.x + DIRS[pl.dir][0] * f) * TS, py = (pl.y + DIRS[pl.dir][1] * f + FEET) * TS;
      // 카메라: 실내는 방 중앙 고정, 실외는 플레이어를 따라가되 맵 가장자리에서 멈춘다
      const mw = m.w * TS, mh = m.h * TS;
      let cx, cy;
      if (m.indoor) { cx = mw / 2; cy = mh / 2 + 30; }
      else { cx = Math.max(380, Math.min(mw - 380, px + TS / 2)); cy = Math.max(200, Math.min(mh - 120, py)); }
      // 카메라는 목표를 부드럽게 따라간다 (맵을 옮긴 직후에는 즉시 이동)
      if (this._camMap !== m) { this._camMap = m; this.cx = cx; this.cy = cy; }
      this.cx += (cx - this.cx) * 0.16; this.cy += (cy - this.cy) * 0.16;
      this.plane.style.transform = `translate3d(${-this.cx}px,${-this.cy}px,0)`;
      // 플레이어
      const bob = pl.moving ? Math.abs(Math.sin((pl.t / STEP) * Math.PI)) * 4 : 0;
      this.plEl.style.transform = boardM(px, py, TS + bob * 2);
      this.plShadow.style.transform = `translate3d(${px + 6}px,${py - 9}px,1px)`;
      const key = pl.dir + (pl.moving ? Math.floor(pl.t / 75) % 2 : 0);
      if (key !== this._plKey) { this._plKey = key; this.plEl.style.backgroundImage = `url(${A.charFrame('hero', pl.dir, pl.moving ? Math.floor(pl.t / 75) % 2 : 0)})`; }
      // NPC 방향/느낌표
      for (const e of this.npcEls) {
        const n = e._npc;
        if (!n) continue;
        if (n.look && e._dir !== n.dir) { e._dir = n.dir; e.style.backgroundImage = `url(${A.charFrame(n.look, n.dir, 0)})`; }
        e.classList.toggle('bang', this.bang === n);
      }
      // 물결
      const fr = Math.floor(this.time / 500) % 2;
      if (fr !== this._fr) { this._fr = fr; for (const [x, y] of this.anim) this.gctx.drawImage(A.drawTile('~', fr), x * 16, y * 16); }
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
