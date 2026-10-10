  function mainAnnexBase(chapter, x, y) {
    const g = grid(ANNEX_W, ANNEX_H);
    // Three horizontal legs and two drops form a real S route, not an empty box.
    rect(g, 0, 4, 24, 7);
    rect(g, 8, 10, 26, 13);
    rect(g, 8, 16, 43, 19);
    rect(g, 22, 4, 26, 13);
    rect(g, 6, 10, 10, 19);
    // Thin 64px return decks make each drop reversible without a charged jump.
    rect(g, 24, 12, 26, 12, '-'); rect(g, 24, 10, 26, 10, '-');
    rect(g, 6, 18, 7, 18, '-'); rect(g, 9, 16, 10, 16, '-');
    // 64px steps, with 96px decks and 128px headroom, also work for Lin.
    for (let i = 0; i <= 6; i++) rect(g, 41 + i * 3, 16 - i * 2, 45 + i * 3, 19 - i * 2);
    rect(g, 60, 4, 63, 7);
    g[7][3] = 'C'; g[7][4] = 'E';
    g[19][12] = 'C'; g[19][13] = 'E';
    if (chapter === 1) rect(g, 5, 4, 5, 7, 'W');
    if (chapter === 2) { rect(g, 0, 4, 7, 4, 'M'); g[13][12] = 'V'; }
    if (chapter === 3 || chapter === 5) {
      rect(g, 37, 10, 45, 19);
      g[16][40] = chapter === 3 ? 'O' : 'N';
      // The rotating deck provides a quicker alternative to the lower stairs.
      rect(g, 36, 14, 50, 14, '-');
    }
    if (chapter === 3) g[20][42] = 'P';
    if (chapter === 4) {
      rect(g, 5, 8, 7, 13);
      g[7][5] = 'Q';
    }
    if (chapter === 6) {
      rect(g, 25, 20, 35, 20, 'o');
      rect(g, 24, 17, 34, 17, '-'); g[19][32] = '[';
    }
    if (chapter === 7 || chapter === 8) {
      rect(g, 34, 10, 46, 19);
      g[19][36] = 'U'; rect(g, 40, 14, 46, 14, '-');
      if (chapter === 8) g[20][42] = 'P';
    }
    return { id: 'r' + chapter + '.main-annex', title: titles[chapter - 1][0],
      x, y, rows: lines(g), kind: 'main', event: null,
      ports: { entry: { x: 16, y: 256 }, exit: { x: ANNEX_W * T - 16, y: 256 } } };
  }

  function skillRoomBase(chapter, annex) {
    const g = grid(16, 24);
    // Its bottom corridor replaces precisely the same-height upper S leg.
    rect(g, 0, 18, 15, 21);
    rect(g, 3, 7, 9, 21);
    rect(g, 1, 1, 14, 9);
    for (let i = 0; i < 6; i++) rect(g, i % 2 ? 7 : 3, 20 - i * 2, i % 2 ? 9 : 5, 20 - i * 2, '-');
    let goal = { x: 12 * T + 16, y: 10 * T };
    if (chapter === 2 || chapter === 7 || chapter === 8) {
      rect(g, 11, 5, 14, 5, '-'); goal.y = 5 * T;
      if (chapter === 7) g[9][9] = 'U';
      else { g[9][8] = 'V'; rect(g, 9, 3, 14, 3, 'M'); }
    }
    if (chapter === 3 || chapter === 5) {
      g[6][8] = chapter === 3 ? 'O' : 'N';
      rect(g, 11, 5, 14, 5, '-'); goal.y = 5 * T;
    }
    if (chapter === 4) {
      // The crank trial follows the access stair, rather than deleting its decks.
      rect(g, 10, 10, 12, 17); g[9][9] = 'Q'; goal.x = 13 * T + 16;
    }
    // Keep the access stair clear; the oil and fan test starts beyond its exit.
    if (chapter === 6) { rect(g, 11, 10, 14, 10, 'o'); g[9][12] = '['; }
    return { id: 'r' + chapter + '.skill', title: titles[chapter - 1][3],
      x: annex.x + 8 * T, y: annex.y - 14 * T, rows: lines(g), kind: 'skill',
      event: { id: 'connected.skill.' + chapter, label: titles[chapter - 1][3] + ' · 정비 설계도',
        cost: 0, reward: chapter === 1 ? 3 : 5, flag: 'connected.skill.' + chapter,
        requiresTitan: chapter === 1,
        x: goal.x, y: goal.y },
      ports: { entry: { x: 4 * T + 16, y: 22 * T }, goal } };
  }

  function eventRoomBase(chapter, annex) {
    const g = grid(16, 18);
    rect(g, 0, 0, 15, 3);
    rect(g, 1, 6, 14, 11);
    rect(g, 5, 0, 7, 11);
    rect(g, 10, 2, 13, 11);
    rect(g, 5, 4, 7, 4, '-');
    for (let i = 0; i < 5; i++) rect(g, i % 2 ? 12 : 10, 10 - i * 2, i % 2 ? 13 : 11, 10 - i * 2, '-');
    rect(g, 10, 4, 13, 4, '-');
    const flag = chapter === 4 ? 'shortcut.4-2' : chapter === 6 ? 'shortcut.6-3' :
      chapter === 7 ? 'shortcut.7-1' : 'connected.service.' + chapter;
    return { id: 'r' + chapter + '.event', title: titles[chapter - 1][4],
      x: annex.x + 20 * T, y: annex.y + 16 * T, rows: lines(g), kind: 'event',
      event: { id: 'connected.service.' + chapter, label: titles[chapter - 1][4] + ' · 잔류 동력 60',
        cost: 3, reward: 4, flag, x: 2 * T + 16, y: 12 * T },
      ports: { entry: { x: 6 * T + 16, y: 4 * T },
        dock: { x: 7 * T + 16, y: 12 * T } } };
  }


  // ================= PATCH v4 · per-chapter variants of the connector rooms =================
  // The three connector rooms used to be one drawing repeated eight times. Each chapter now gets its own seeded set of obstacles
  // (pillars, hanging blocks, spike pits, islands, floating planks, step blocks, crumbling bridges) and every edit has to pass a conservative
  // physics reach test (jump / cut-jump / air dash / drop-through, no wall jump): the player must still be able to get from the entry to the
  // exit, the benches, the skill goal and the event goal, and back. If nothing passes, the original room is used unchanged.
  const SOL = new Set(['#', '=', 'R', 'F', 'D', '>', '<', 'o']);   // 'W' (cracked wall) is passable here: the Titan punches through it
  const toGrid = rows => rows.map(r => r.split(''));
  function reachSet(G, start) {
    const HH = G.length, WW = G[0].length, TS_ = 32, HALF = 7.5, BH = 26;
    const ch = (tx, ty) => (tx < 0 || tx >= WW || ty < 0 || ty >= HH) ? '#' : G[ty][tx];
    const solid = (tx, ty) => SOL.has(ch(tx, ty)), oneway = (tx, ty) => ch(tx, ty) === '-', spike = (tx, ty) => ch(tx, ty) === '^';
    const standable = (tx, ty) => !solid(tx, ty) && !solid(tx, ty - 1) && !spike(tx, ty) && !spike(tx, ty - 1) && ch(tx, ty) !== 'R' && (solid(tx, ty + 1) || oneway(tx, ty + 1)) && ch(tx, ty + 1) !== 'R';
    const rectSolid = (l, t, r, b) => { for (let ty = Math.floor(t / TS_); ty <= Math.floor((b - .001) / TS_); ty++) for (let tx = Math.floor(l / TS_); tx <= Math.floor((r - .001) / TS_); tx++) if (solid(tx, ty)) return true; return false; };
    const hitsSpike = (x, y) => { for (let ty = Math.floor((y - BH) / TS_); ty <= Math.floor((y - .5) / TS_); ty++) for (let tx = Math.floor((x - HALF + 3) / TS_); tx <= Math.floor((x + HALF - 3) / TS_); tx++) if (spike(tx, ty) && y > ty * TS_ + 14) return true; return false; };
    const dt = 1 / 60;
    function flight(px, py, dir, jump, cutT, dashAt, drop) {
      const out = []; let x = px, y = py, vy = jump ? -540 : 0, t = 0, dashT = 0, cut = false, dashed = false, grounded = !jump && !drop, ow = drop ? .26 : 0;
      for (let i = 0; i < 120; i++) {
        t += dt; if (ow > 0) ow -= dt;
        let ax = dir * 215; if (dashAt != null && !dashed && t >= dashAt && dir !== 0) { dashed = true; dashT = .16; } if (dashT > 0) { dashT -= dt; ax = dir * 540; }
        if (grounded) { vy = 0; const below = rectSolid(x - HALF + 1, y + .5, x + HALF - 1, y + 1.5) || (ch(Math.floor(x / TS_), Math.floor((y + .5) / TS_)) === '-' && ow <= 0); if (!below) grounded = false; }
        if (!grounded) { if (dashT > 0) vy = 0; else { let gr = 1500; if (jump && !cut && Math.abs(vy) < 80) gr *= .5; else if (vy > 0) gr *= 1.7; vy = Math.min(vy + gr * dt, 640); } if (jump && !cut && t >= cutT && vy < 0) { vy *= .42; cut = true; } }
        const nx = x + ax * dt; if (!rectSolid(nx - HALF, y - BH, nx + HALF, y - .01)) x = nx;
        if (!grounded) {
          const ny = y + vy * dt;
          if (vy > 0) { const ty = Math.floor((ny - .001) / TS_); let hit = false; for (let tx = Math.floor((x - HALF) / TS_); tx <= Math.floor((x + HALF - .001) / TS_); tx++) { if (solid(tx, ty)) hit = true; else if (oneway(tx, ty) && y <= ty * TS_ + .5 && ow <= 0) hit = true; }
            if (hit) { y = ty * TS_; vy = 0; const cx = Math.floor(x / TS_), cy = ty - 1; if (standable(cx, cy)) out.push(cx + ',' + cy); return out; } y = ny; }
          else { if (rectSolid(x - HALF, ny - BH, x + HALF, ny - .01)) vy = 0; else y = ny; }
        } else { const cx = Math.floor(x / TS_), cy = Math.floor((y - .01) / TS_); if (standable(cx, cy)) out.push(cx + ',' + cy); }
        if (hitsSpike(x, y)) return out; if (y > HH * TS_ + 60) return out;
      }
      return out;
    }
    const seen = new Set([start.x + ',' + start.y]), q = [[start.x, start.y]];
    const V = []; for (const cut of [1e9, .2, .11]) V.push([0, true, cut, null]); for (const d of [-1, 1]) { for (const cut of [1e9, .2, .11]) for (const dash of [null, .03, .3]) V.push([d, true, cut, dash]); V.push([d, false, 0, null]); }
    while (q.length) { const [cx, cy] = q.shift(), px = cx * TS_ + 16, py = (cy + 1) * TS_, onOne = oneway(cx, cy + 1);
      for (const [d, j, cut, dash] of V) for (const o of flight(px, py, d, j, cut, dash, false)) if (!seen.has(o)) { seen.add(o); q.push(o.split(',').map(Number)); }
      if (onOne) for (const d of [-1, 0, 1]) for (const o of flight(px, py + 1, d, false, 0, null, true)) if (!seen.has(o)) { seen.add(o); q.push(o.split(',').map(Number)); } }
    return seen;
  }
  // composite of the three rooms in annex-local tiles: rows -14..33 -> 0..47
  const OY = 14;
  function composite(A, Sg, Eg) {
    const G = Array.from({ length: 48 }, () => Array(64).fill('#'));
    for (let y = 0; y < 24; y++) for (let x = 0; x < 64; x++) G[y + OY][x] = A[y][x];
    for (let y = 0; y < Sg.length; y++) for (let x = 0; x < Sg[0].length; x++) G[y - 14 + OY][8 + x] = Sg[y][x];
    for (let y = 0; y < Eg.length; y++) for (let x = 0; x < Eg[0].length; x++) G[y + 16 + OY][20 + x] = Eg[y][x];
    return G;
  }
  function checkDesign(chapter, A, Sg, Eg, keys) {
    const G = composite(A, Sg, Eg), R0 = reachSet(G, keys.entry); if (!R0.has(keys.exit.x + ',' + keys.exit.y)) return false;
    for (const k of keys.must) if (!R0.has(k.x + ',' + k.y)) return false;
    const back = reachSet(G, keys.exit); if (!back.has(keys.entry.x + ',' + keys.entry.y)) return false;
    for (const k of keys.back) { const r = reachSet(G, k); if (!r.has(keys.entry.x + ',' + keys.entry.y)) return false; }
    return true;
  }
  // ---- edits ----
  const gat = (G, x, y) => (y < 0 || y >= G.length || x < 0 || x >= G[0].length) ? '#' : G[y][x];
  const OPS = {
    pillar(G, R, x, y) { if (!(gat(G, x, y) === '.' && SOL.has(gat(G, x, y + 1)))) return null; const h = 1 + (R() < .35 ? 1 : 0); for (let k = 0; k < h; k++) if (gat(G, x, y - k) !== '.') return null; const out = []; for (let k = 0; k < h; k++) out.push([x, y - k, '#']); return out; },
    hang(G, R, x, y) { if (!(gat(G, x, y) === '.' && gat(G, x, y - 1) === '#')) return null; const h = 1 + (R() < .4 ? 1 : 0), out = []; for (let k = 0; k < h; k++) { if (gat(G, x, y + k) !== '.') return null; out.push([x, y + k, '#']); } return out; },
    pit(G, R, x, y) { const w = 2 + (R() < .35 ? 1 : 0), out = []; for (let k = 0; k < w; k++) { const xx = x + k; if (gat(G, xx, y) !== '.' || gat(G, xx, y + 1) !== '#' || gat(G, xx, y + 2) !== '#' || gat(G, xx, y - 1) !== '.') return null; out.push([xx, y + 1, '^']); } return out; },
    island(G, R, x, y) { const out = []; for (let k = 0; k < 3; k++) { const xx = x + k; if (!(gat(G, xx, y) === '.' && gat(G, xx, y - 1) === '.' && gat(G, xx, y - 2) === '.' && gat(G, xx, y + 1) === '#')) return null; out.push([xx, y, '#'], [xx, y - 1, '#']); } return out; },
    plank(G, R, x, y) { const h = 3, out = []; for (let k = 0; k < 3; k++) { const xx = x + k; if (!(gat(G, xx, y - h) === '.' && gat(G, xx, y - h + 1) === '.' && gat(G, xx, y - h - 1) === '.' && gat(G, xx, y) === '.' && SOL.has(gat(G, xx, y + 1)))) return null; out.push([xx, y - h, '-']); } return out; },
    step(G, R, x, y) { for (const xx of [x, x + 1]) if (!(gat(G, xx, y) === '.' && gat(G, xx, y - 1) === '.' && gat(G, xx, y - 2) === '.' && SOL.has(gat(G, xx, y + 1)))) return null; return [[x, y, '#'], [x + 1, y, '#'], [x + 1, y - 1, '#']]; },
    crumble(G, R, x, y) { const out = []; for (let k = 0; k < 3; k++) { const xx = x + k; if (!(gat(G, xx, y) === '.' && gat(G, xx, y + 1) === '#' && gat(G, xx, y + 2) === '#')) return null; out.push([xx, y + 1, 'R']); } return out; }
  };
  const OPW = { 1: { crumble: 3, pit: 2, pillar: 2, island: 1, hang: 1, plank: 1, step: 1 }, 2: { hang: 4, pillar: 2, plank: 2, pit: 1, step: 1 }, 3: { island: 2, step: 3, plank: 3, pillar: 1, pit: 1, hang: 1 }, 4: { pit: 3, island: 2, pillar: 2, step: 2, hang: 1, plank: 1 }, 5: { plank: 3, step: 2, island: 2, pit: 2, hang: 1, pillar: 1 }, 6: { pit: 3, pillar: 2, hang: 2, plank: 2, island: 1, step: 1 }, 7: { crumble: 2, pit: 2, island: 2, pillar: 2, step: 2, hang: 1 }, 8: { hang: 3, pillar: 2, plank: 2, step: 2, island: 1, pit: 1 } };
  function pickOp(R, ch) { const w = OPW[ch] || OPW[1]; let sum = 0; for (const k in w) sum += w[k]; let r = R() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'pillar'; }
  const KEYCH = /[^.#\-]/;
  function nearKey(G, x, y, d) { for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) { const c = G[yy] && G[yy][xx]; if (c && KEYCH.test(c) && c !== '^' && c !== 'R' && c !== '=' && c !== 'o') return true; } return false; }
  // landing zones under drops, hatches and the stair run stay clear of spikes and clutter
  function isProtected(which, x, y) {
    if (which === 'a') return x <= 1 || x >= 40 || (x >= 21 && x <= 27 && y >= 3 && y <= 14) || (x >= 5 && x <= 11 && y >= 9 && y <= 20) || (x >= 19 && x <= 36 && y >= 15);
    if (which === 's') return x <= 10 && y >= 9 || y >= 18 && x <= 2;
    return x >= 3 && x <= 14 && y <= 12 && !(y >= 6 && x >= 9 && x <= 14 && false);
  }
  // the stair run that carries the player up to the exit: a ramp (original), zigzag decks, or a long 1-tile serpentine
  const STAIRS = { 2: 'zig', 4: 'serp', 6: 'zig' };
  function restyle(A, style) {
    const B = A.map(r => r.slice());
    if (style === 'zig') {
      for (let y = 4; y <= 19; y++) for (let x = 40; x <= 63; x++) B[y][x] = '#';
      for (let y = 16; y <= 19; y++) for (let x = 36; x <= 53; x++) B[y][x] = '.';
      for (let y = 5; y <= 15; y++) for (let x = 46; x <= 53; x++) B[y][x] = '.';
      for (let y = 4; y <= 7; y++) for (let x = 54; x <= 63; x++) B[y][x] = '.';
      let k = 0; for (const r of [18, 16, 14, 12, 10]) { const a = k % 2 ? 50 : 46, b = k % 2 ? 53 : 49; for (let x = a; x <= b; x++) B[r][x] = '-'; k++; }
    } else if (style === 'serp') {
      for (let y = 4; y <= 19; y++) for (let x = 39; x <= 59; x++) B[y][x] = '#';
      for (let y = 4; y <= 7; y++) for (let x = 60; x <= 63; x++) B[y][x] = '.';
      for (let x = 39; x <= 63; x++) { const h = Math.floor((x - 39) / 2), srow = 19 - h; for (let y = srow - 3; y <= srow; y++) { if (y >= 4) B[y][x] = '.'; } for (let y = srow + 1; y <= 20; y++) B[y][x] = '#'; }
      for (let y = 4; y <= 7; y++) for (let x = 60; x <= 63; x++) B[y][x] = '.';
    }
    return B;
  }
  const designs = new Map();
  function designGen(chapter) {
    if (designs.has(chapter)) return designs.get(chapter);
    const a0 = mainAnnexBase(chapter, 0, 0), s0 = skillRoomBase(chapter, a0), e0 = eventRoomBase(chapter, a0);
    const fb = { a: a0, s: s0, e: e0, ok: false }; designs.set(chapter, fb);
    try {
      let A = toGrid(a0.rows); const Sg = toGrid(s0.rows), Eg = toGrid(e0.rows);
      const cells = []; for (let y = 0; y < 24; y++) for (let x = 0; x < 64; x++) if (A[y][x] === 'C') cells.push({ x, y: y + OY });
      const sg = s0.event, ev = e0.event; let sk = { x: Math.floor((sg.x - 16) / 32) + 8, y: Math.floor(sg.y / 32) - 1 - 14 + OY };
      // rooms whose goal sits above a mechanism (vent, spring pad, gear deck, geneva wheel) are proven up to that mechanism's floor cell
      let mech = null; for (let y = 0; y < Sg.length && !mech; y++) for (let x = 0; x < Sg[0].length; x++) if ('VUON'.includes(Sg[y][x])) { mech = { x, y }; break; }
      if (mech) sk = { x: mech.x + 8, y: 9 - 14 + OY };
      const evc = { x: Math.floor((ev.x - 16) / 32) + 20, y: Math.floor(ev.y / 32) - 1 + 16 + OY }, dock = { x: Math.floor((e0.ports.dock.x - 16) / 32) + 20, y: Math.floor(e0.ports.dock.y / 32) - 1 + 16 + OY };
      const keys = { entry: { x: 0, y: 7 + OY }, exit: { x: 63, y: 7 + OY }, must: [...cells, sk, evc, dock], back: [sk, evc] };
      if (!checkDesign(chapter, A, Sg, Eg, keys)) return fb;   // the base rooms must pass the test too, otherwise we cannot trust it
      const style = STAIRS[chapter]; if (style) { const A1 = restyle(A, style); if (checkDesign(chapter, A1, Sg, Eg, keys)) A = A1; }
      for (let attempt = 0; attempt < 6; attempt++) {
        const R = rng32(chapter * 7919 + attempt * 104729 + 17), A2 = A.map(r => r.slice()), S2 = Sg.map(r => r.slice()), E2 = Eg.map(r => r.slice());
        let ea = 0, es = 0, ee = 0, tries = 0;
        const apply = (G, which) => { const H0 = G.length, W0 = G[0].length; for (let i = 0; i < 60; i++) { const x = 1 + Math.floor(R() * (W0 - 3)), y = 2 + Math.floor(R() * (H0 - 4)); const op = pickOp(R, chapter); if (G[y][x] !== '.') continue;
            // never touch the overlay areas (their tiles win anyway) or anything near a bench / charger / mechanism
            if (which === 's' && mech && y < 10) continue;
            if (isProtected(which, x, y)) continue; if ((op === 'pit' || op === 'crumble') && which !== 'a') continue;
            if (which === 'a') { if (x >= 8 && x <= 23 && y >= 4 && y <= 9) continue; if (x >= 20 && x <= 35 && y >= 16) continue; if (y < 4) continue; }
            if (nearKey(G, x, y, 2)) continue; const edit = OPS[op](G, R, x, y); if (!edit) continue;
            const old = edit.map(([ex, ey]) => G[ey][ex]); for (const [ex, ey, c] of edit) G[ey][ex] = c;
            if (checkDesign(chapter, A2, S2, E2, keys)) return true; edit.forEach(([ex, ey], k) => { G[ey][ex] = old[k]; }); } return false; };
        for (let k = 0; k < 22; k++) if (apply(A2, 'a')) ea++;
        for (let k = 0; k < 5; k++) if (apply(S2, 's')) es++;
        for (let k = 0; k < 5; k++) if (apply(E2, 'e')) ee++;
        if (ea + es + ee >= 9) { const a1 = { ...a0, rows: A2.map(r => r.join('')) }, s1 = { ...s0, rows: S2.map(r => r.join('')) }, e1 = { ...e0, rows: E2.map(r => r.join('')) }; const out = { a: a1, s: s1, e: e1, ok: true, edits: [ea, es, ee] }; designs.set(chapter, out); return out; }
      }
    } catch (err) { if (typeof console !== 'undefined') console.error('annex variant', chapter, err); }
    return fb;
  }
  // the shipped rooms were produced by designGen and baked into PRE (tools/bake_annex.js); the search itself is only run when __ANNEX_GEN is set
  const PRE = /*@PRE_BEGIN*/{}/*@PRE_END*/;
  function design(chapter) {
    if (scope.__ANNEX_GEN) return designGen(chapter);
    if (designs.has(chapter)) return designs.get(chapter);
    const a0 = mainAnnexBase(chapter, 0, 0), s0 = skillRoomBase(chapter, a0), e0 = eventRoomBase(chapter, a0), P = PRE[chapter];
    const out = P ? { a: { ...a0, rows: P.a }, s: { ...s0, rows: P.s }, e: { ...e0, rows: P.e }, ok: true } : { a: a0, s: s0, e: e0, ok: false };
    designs.set(chapter, out); return out;
  }
  function mainAnnex(chapter, x, y) { const d = design(chapter); return { ...d.a, x, y }; }
  function skillRoom(chapter, annex) { const d = design(chapter); return { ...d.s, x: annex.x + 8 * T, y: annex.y - 14 * T }; }
  function eventRoom(chapter, annex) { const d = design(chapter); return { ...d.e, x: annex.x + 20 * T, y: annex.y + 16 * T }; }
  scope.__annexDesign = design;
  scope.__annexTools = { reachSet, composite, checkDesign, toGrid, mainAnnexBase, skillRoomBase, eventRoomBase, OY };
