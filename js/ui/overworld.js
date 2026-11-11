// 필드 (2.5D): CSS 3D 장면 — 기울어진 지면, 입체 건물, 카메라를 향해 서 있는 나무·소품·캐릭터.
// 그 위에 지역별 분위기(날리는 입자, 구름 그림자, 원경, 빛줄기)와 연출용 카메라(줌·집중)를 얹는다.
// 게임 로직(이동, NPC 시야, 워프, 조우)은 타일 좌표 그대로이고, 그리는 방식만 3D다.
(function (root) {
  const X = root.XG, G = X.G, A = X.Art, el = X.el;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const STEP = 150;          // 한 칸 이동 시간(ms)
  const TS = 48;             // 지면 위 타일 크기
  const TILT = 50 * Math.PI / 180, CO = Math.cos(TILT), SI = Math.sin(TILT);
  const ROOF = 'RBPGYH', WALL = 'WwD';
  const FEET = 0.82;         // 캐릭터가 타일 안에서 서는 깊이 (같은 칸의 풀숲 뒤에 서도록)
  const CW = 54, CH = 72;    // 캐릭터 표시 크기 (24x32 x 2.25)

  // 3D 면 하나: 왼쪽 위 꼭짓점 o에서 u(가로)·v(세로 아래 방향) 축으로 펼친다.
  function face(w, h, o, u, v, cls, css) {
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const d = el('div', 'f3 ' + (cls || ''));
    d.style.cssText = `width:${w}px;height:${h}px;transform:matrix3d(${u[0]},${u[1]},${u[2]},0,${v[0]},${v[1]},${v[2]},0,${n[0]},${n[1]},${n[2]},0,${o[0]},${o[1]},${o[2]},1);${css || ''}`;
    return d;
  }
  // 카메라를 향해 서는 판(빌보드). (x, y)는 지면 위 밑변 왼쪽 끝.
  // 바깥 요소가 3D 위치를 잡고, 안쪽 요소(.bi)가 그림과 CSS 애니메이션(흔들림·숨쉬기)을 맡는다.
  const boardM = (x, y, h) => `matrix3d(1,0,0,0,0,${CO},${-SI},0,0,${SI},${CO},0,${x},${y - h * CO},${h * SI},1)`;
  function board(x, y, w, h, cls, css) {
    const d = el('div', 'f3');
    d.style.cssText = `width:${w}px;height:${h}px;transform:${boardM(x, y, h)}`;
    const i = el('div', 'bi ' + (cls || '')); if (css) i.style.cssText = css;
    d.appendChild(i);
    return d;
  }

  // 지역별 떠다니는 입자: [개수, 색, 크기, 가로 속도, 세로 속도, 깜빡임]
  const ATMO = {
    field: [[22, '#ffd8ec', 4, 22, 14, 0], [10, '#ffffff', 3, 16, 10, 0]],
    forest: [[20, '#f8ffa0', 4, 6, -4, 1], [12, '#6fbf58', 5, 14, 26, 0]],
    coast: [[16, '#ffffff', 3, 0, 0, 1], [8, '#e8f8ff', 4, 26, 6, 0]],
    cave: [[26, '#b8a8c8', 2, 4, -3, 1]],
    city: [[18, '#ffe9a8', 3, 5, -6, 1]],
    indoor: [[14, '#fff4d0', 2, 3, -4, 1]],
  };

  const OW = (X.OW = {
    map: null, npcs: [], pl: { x: 0, y: 0, dir: 'down', t: 0, moving: false }, time: 0, bang: null, focus: null, zoom: 1, walk: 0,

    init() {
      this.scene = document.querySelector('#scene');
      this.cam = document.querySelector('#cam');
      this.plane = document.querySelector('#plane');
      this.far = document.querySelector('#far');
      this.atmo = document.querySelector('#atmo').getContext('2d');
      const touch = document.querySelector('#touch'), ov = document.querySelector('#overlay');
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(50, now - last); last = now;
        if (G.scene === 'world') { this.update(dt); this.draw(dt); }
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
      const m = this.map, pl = this.plane, bg = m.bg || 'indoor';
      pl.innerHTML = '';
      this.scene.className = 'bg-' + bg;
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
      // 벽·나무 밑의 접지 그림자
      const sh = (x, y, w, h, a) => { g.fillStyle = `rgba(10,8,24,${a})`; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill(); };
      // 세워지는 소품: 같은 줄에 이어진 것은 한 장의 띠로 묶는다
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w;) {
          const k = this.propKey(m.tiles[y][x], x, y);
          if (!k) { x++; continue; }
          let n = 1;
          while (x + n < m.w && this.propKey(m.tiles[y][x + n], x + n, y) === k) n++;
          const P = A.prop(k), h = P.h * 3;
          const d = board(x * TS, (y + (k === ':' ? 1 : 0.98)) * TS, n * TS, h, 'prop p-' + (k === ':' ? 'grass' : k), `background-image:url(${P.url});background-size:${TS}px ${h}px`);
          if (k === 'T' || k === ':') d.firstChild.style.animationDelay = -((x * 37 + y * 91) % 40) / 10 + 's';
          pl.appendChild(d);
          if (k === 'T' || k === 'p' || k === 'z') for (let i = 0; i < n; i++) sh((x + i) * 16 + 9, y * 16 + 15, 7, 2.5, 0.28);
          if ((k === '#' || k === '^' || k === 'xb') && y + 1 < m.h) { g.fillStyle = 'rgba(10,8,24,0.22)'; g.fillRect(x * 16, (y + 1) * 16, n * 16, 3); }
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
      // 구름 그림자 (실외)
      if (!m.indoor && bg !== 'cave') { const c = el('div', 'f3 clouds'); c.style.cssText = `width:${m.w * TS}px;height:${m.h * TS}px;transform:translateZ(1px)`; pl.appendChild(c); }
      // 플레이어
      this.plShadow = el('div', 'f3 shadow3');
      this.plEl = board(0, 0, CW, CH, 'ent');
      pl.appendChild(this.plShadow); pl.appendChild(this.plEl);
      this.npcEls = [];
      this._plKey = '';
      // 분위기 입자
      this.motes = [];
      for (const [n, c, s, vx, vy, tw] of ATMO[bg] || []) for (let i = 0; i < n; i++) this.motes.push({ x: Math.random() * 960, y: Math.random() * 600, c, s, vx: vx * (0.5 + Math.random()), vy: vy * (0.5 + Math.random()), tw, ph: Math.random() * 6 });
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
      pl.appendChild(face(W, H, [X0, yF, H], [1, 0, 0], [0, 0, -1], 'bw-front', `background-image:url(${A.wallTex(chars, kinds).toDataURL ? A.wallTex(chars, kinds).toDataURL() : A.wallTex(chars, kinds)});background-size:100% 100%`));
      // 굴뚝과 처마 그림자
      if (rows >= 2) pl.appendChild(face(16, 30, [X0 + W - 44, yF - D * 0.62, H + R * 0.55 + 30], [1, 0, 0], [0, 0, -1], 'bw-chim'));
      g.fillStyle = 'rgba(10,8,24,0.3)'; g.fillRect(x * 16 + n * 16, (y - rows) * 16 + 4, 6, rows * 16);
      g.fillStyle = 'rgba(10,8,24,0.2)'; g.fillRect(x * 16, y * 16, n * 16, 3);
    },
    refreshNpcs() {
      if (!this.map) return;
      this.npcs = this.map.npcs.filter((n) => !n.show || n.show(G));
      for (const e of this.npcEls || []) e.remove();
      this.npcEls = [];
      for (const n of this.npcs) {
        const px = n.x * TS, py = (n.y + FEET) * TS;
        const s = el('div', 'f3 shadow3'); s.style.transform = `translate3d(${px + 6}px,${py - 9}px,1px)`;
        const d = n.beast ? board(px - 18, py, 84, 84, 'ent beast', `background-image:url(${A.beastUrl(n.beast)})`) : board(px - 3, py, CW, CH, 'ent idle', `background-image:url(${A.charFrame(n.look, n.dir, 0)});animation-delay:${-((n.x * 3 + n.y * 7) % 20) / 10}s`);
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
        pl.t += dt; this.walk += dt;
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
      if (w) return G.run(async () => { await G.fade(true); this.load(w.to, w.tx, w.ty, w.dir); this.draw(0); await G.fade(false); });
      // 트레이너의 시야: 눈이 마주치면 카메라가 둘 사이로 다가가고 느낌표가 뜬다
      for (const n of this.npcs) {
        if (!n.sight || G.p.defeated[n.id]) continue;
        const [dx, dy] = DIRS[n.dir];
        for (let k = 1; k <= n.sight; k++) {
          const x = n.x + dx * k, y = n.y + dy * k;
          if (x === pl.x && y === pl.y) {
            return G.run(async () => {
              G.held.length = 0; this.bang = n; G.sfx('ok');
              this.focus = { x: (n.x + pl.x) / 2, y: (n.y + pl.y) / 2, zoom: 1.22 };
              await X.wait(750); this.bang = null; pl.dir = OPP[n.dir];
              await n.script(G, n);
            }, true);
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
      if (n) return G.run(async () => {
        if (n.look) n.dir = OPP[pl.dir];
        G.sfx('sel');
        this.focus = { x: (n.x + pl.x) / 2, y: (n.y + pl.y) / 2, zoom: n.battle ? 1.2 : 1.1 };
        await n.script(G, n);
      }, !!n.battle);
      const sign = this.map.signs && this.map.signs[x + ',' + y];
      if (sign) return G.run(() => G.say(sign));
      const c = this.tile(x, y);
      if (c === 'k') return G.run(() => G.say('책이 빼곡히 꽂혀 있다. 「비스트와 카드의 공존에 관하여」…'));
      if (c === 'h' && !this.map.id.includes('heal')) return G.run(() => G.say('무언가를 분석하는 기계다. 화면에 "LINK"라는 글자가 깜빡인다.'));
    },

    draw(dt) {
      const m = this.map, pl = this.pl;
      if (!m) return;
      const f = pl.moving ? pl.t / STEP : 0;
      const px = (pl.x + DIRS[pl.dir][0] * f) * TS, py = (pl.y + DIRS[pl.dir][1] * f + FEET) * TS;
      // 카메라: 실내는 방 중앙 고정, 실외는 플레이어를 따라가되 맵 가장자리에서 멈춘다. 연출 중에는 focus가 우선.
      const mw = m.w * TS, mh = m.h * TS;
      let cx, cy, zt = 1;
      if (this.focus) { cx = (this.focus.x + 0.5) * TS; cy = (this.focus.y + 0.9) * TS; zt = this.focus.zoom || 1; }
      else if (m.indoor) { cx = mw / 2; cy = mh / 2 + 30; }
      else { cx = Math.max(380, Math.min(mw - 380, px + TS / 2)); cy = Math.max(200, Math.min(mh - 120, py)); }
      if (this._camMap !== m) { this._camMap = m; this.cx = cx; this.cy = cy; this.zoom = 1; }
      const k = this.focus ? 0.08 : 0.16;
      this.cx += (cx - this.cx) * k; this.cy += (cy - this.cy) * k; this.zoom += (zt - this.zoom) * 0.08;
      const sx = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake > 0.3 ? (Math.random() - 0.5) * this.shake : 0;
      if (this.shake) this.shake *= 0.9;
      this.plane.style.transform = `translate3d(${-this.cx + sx}px,${-this.cy + sy}px,0)`;
      this.cam.style.transform = `scale(${this.zoom.toFixed(4)}) rotateX(50deg)`;
      this.far.style.backgroundPosition = `${-this.cx * 0.06}px 100%, ${-this.cx * 0.12}px 100%`;
      // 플레이어 (4프레임 걷기)
      const fr = pl.moving ? Math.floor(this.walk / (STEP / 2)) % 4 : 0;
      this.plEl.style.transform = boardM(px - 3, py, CH);
      this.plShadow.style.transform = `translate3d(${px + 6}px,${py - 9}px,1px)`;
      const key = pl.dir + fr;
      if (key !== this._plKey) { this._plKey = key; this.plEl.firstChild.style.backgroundImage = `url(${A.charFrame('hero', pl.dir, fr)})`; }
      // NPC 방향/느낌표
      for (const e of this.npcEls) {
        const n = e._npc;
        if (!n) continue;
        if (n.look && e._dir !== n.dir) { e._dir = n.dir; e.firstChild.style.backgroundImage = `url(${A.charFrame(n.look, n.dir, 0)})`; }
        e.classList.toggle('bang', this.bang === n);
      }
      // 물결
      const wf = Math.floor(this.time / 500) % 2;
      if (wf !== this._fr) { this._fr = wf; for (const [x, y] of this.anim) this.gctx.drawImage(A.drawTile('~', wf), x * 16, y * 16); }
      this.drawAtmo(dt || 16);
    },
    // 화면 위에 떠다니는 입자 (꽃잎, 반딧불, 먼지, 윤슬)
    drawAtmo(dt) {
      const g = this.atmo, t = this.time / 1000, ds = dt / 1000;
      g.clearRect(0, 0, 960, 600);
      for (const p of this.motes) {
        p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 8) * ds; p.y += (p.vy + Math.cos(t * 1.1 + p.ph) * 5) * ds;
        if (p.x > 970) p.x = -8; if (p.x < -10) p.x = 968; if (p.y > 610) p.y = -8; if (p.y < -10) p.y = 608;
        const a = p.tw ? 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.2 + p.ph)) : 0.85;
        g.globalAlpha = a; g.fillStyle = p.c;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
        if (p.tw) { g.globalAlpha = a * 0.25; g.fillRect(Math.round(p.x) - p.s, Math.round(p.y) - p.s, p.s * 3, p.s * 3); }
      }
      g.globalAlpha = 1;
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
