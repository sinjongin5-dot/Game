// ================= BACKGROUND · PATCH v4 : every chapter gets its own skyline =================
// The original builder draws one skyline recipe and only re-tints it, so chapters 4-6 (cam / fly / arc) were literally the same picture.
// This pass repaints the three middle layers per theme with chapter landmarks (clock tower, pipe organ, gear tower, press hall, flywheel,
// tesla yard, blast furnaces, the heart), adds slow animated landmarks, and gives each chapter its own air (snow ash, drips, lint, oil, wind, static).
(() => {
  'use strict';
  const poly = (x, pts, fill) => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); if (fill) x.fillStyle = fill; x.fill(); };
  const env = (th, bg, seed) => {
    const R = rng32(seed), SW = bg.SW, SH = bg.SH, T = THEMES[th], fog = T.fog, base = parseColor(T.mid);
    const FA = [.82, .66, .5, .3, .12], DS = [.7, .5, .35, .2, .05], DK = [.15, .25, .35, .5, .62];
    const col = i => desat(mixC(mixC(base, [10, 14, 18], DK[i]), fog, FA[i]), DS[i]);
    const lamp = T.lamp.c, lit = i => mixC(col(i), mixC(lamp, [255, 170, 90], .4), .75 - i * .1);
    const each3 = (x, w, fn) => { for (const o of [-SW, 0, SW]) if (x + o < SW && x + o + w > 0) fn(x + o); };
    return { R, SW, SH, T, fog, col, lit, each3, base };
  };
  const clearL = (bg, i) => { const c = bg.layers[i].c, x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); return x; };
  const S = (c, a) => rgbS(c, a);

  const ART = {};

  // ---------------------------------------------------------------- ch1 · the stopped district: a clock tower that stopped at 3:15, a dead tram line, laundry
  ART.blue = {
    seed: 1101, ambient: 'ash', gears: false,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520;
      // dead tram viaduct
      for (let k = 0; k < 9; k++) { const px = 40 + k * 150; each3(px, 30, bx => { x.fillStyle = S(cc); x.fillRect(bx, yb - 150, 22, 160); x.fillRect(bx - 6, yb - 156, 34, 10); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb - 170, SW, 14); x.fillStyle = S(mixC(cc, lc, .15)); x.fillRect(0, yb - 170, SW, 2);
      const tx = 360 + R() * 360; each3(tx, 120, bx => { x.fillStyle = S(mixC(cc, [0, 0, 0], .2)); rr(x, bx, yb - 214, 110, 44, 8); x.fill(); x.fillStyle = S(lc, .5); for (let i = 0; i < 4; i++) x.fillRect(bx + 10 + i * 24, yb - 202, 14, 14); x.fillStyle = S(cc); x.fillRect(bx + 44, yb - 226, 22, 12); });
      // the clock tower, stopped at 3:15
      const cx0 = 700 + R() * 200; each3(cx0 - 110, 220, bx0 => { const bx = bx0 + 110, tw = 104, top = yb - 340;
        x.fillStyle = S(cc); x.fillRect(bx - tw / 2, top, tw, 360); x.fillRect(bx - tw / 2 - 10, top - 14, tw + 20, 16); poly(x, [[bx - tw / 2 - 10, top - 14], [bx, top - 82], [bx + tw / 2 + 10, top - 14]], S(cc));
        x.fillStyle = S(mixC(cc, lc, .3)); circ(x, bx, top + 62, 40); x.fillStyle = S(mixC(cc, [0, 0, 0], .55)); circ(x, bx, top + 62, 35);
        x.strokeStyle = S(mixC(cc, lc, .55), .9); x.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; line(x, bx + Math.cos(a) * 29, top + 62 + Math.sin(a) * 29, bx + Math.cos(a) * 33, top + 62 + Math.sin(a) * 33); }
        x.lineWidth = 3; line(x, bx, top + 62, bx + 27, top + 62); x.lineWidth = 3.4; line(x, bx, top + 62, bx, top + 62 - 20);   // 3:15
        x.strokeStyle = S(mixC(cc, [0, 0, 0], .6), .9); x.lineWidth = 2; line(x, bx - 22, top + 40, bx - 4, top + 70); line(x, bx - 4, top + 70, bx - 12, top + 92);
        x.fillStyle = S(lc, .35); for (let i = 0; i < 3; i++) x.fillRect(bx - 8 + (i % 2) * 6, top + 130 + i * 56, 5, 22); });
      // a stationary crane
      const gx = 100 + R() * 200; each3(gx, 260, bx => { x.strokeStyle = S(cc); x.lineWidth = 4; line(x, bx + 20, yb, bx + 20, yb - 240); line(x, bx + 20, yb - 240, bx + 220, yb - 214); line(x, bx + 20, yb - 240, bx - 40, yb - 226); x.lineWidth = 1.5; line(x, bx + 200, yb - 216, bx + 200, yb - 120); x.strokeRect(bx + 190, yb - 120, 20, 16); for (let i = 0; i < 9; i++) line(x, bx + 20 + i * 22, yb - 240 + i * 2.8, bx + 31 + i * 22, yb - 236 + i * 2.8); });
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540; let px = 0;
      while (px < SW) { const w = 80 + R() * 110, h = 110 + R() * 170; each3(px, w, bx => {
          x.fillStyle = S(cc); x.fillRect(bx, yb - h, w, h + 300); x.fillStyle = S(mixC(cc, lc, .1)); x.fillRect(bx, yb - h, w, 3);
          for (let wy = yb - h + 14; wy < yb - 16; wy += 17) for (let wx = bx + 8; wx < bx + w - 10; wx += 14) { const on = R() < .05; x.fillStyle = on ? S(lc, .9) : S(mixC(cc, [0, 0, 0], .4)); x.fillRect(wx, wy, 8, 10); if (!on && R() < .3) { x.fillStyle = S(mixC(cc, lc, .1), .8); x.fillRect(wx, wy, 8, 4); } }   // shuttered windows
          if (R() < .55) { x.strokeStyle = S(mixC(cc, [0, 0, 0], .35)); x.lineWidth = 1; const ly = yb - h + 36 + R() * 40, lx2 = bx + w + 30 + R() * 40; x.beginPath(); x.moveTo(bx + w, ly); x.quadraticCurveTo((bx + w + lx2) / 2, ly + 22, lx2, ly + 4); x.stroke(); for (let i = 1; i < 5; i++) { const t = i / 5.5, lx = bx + w + (lx2 - bx - w) * t, lyy = ly + 22 * 2 * t * (1 - t) + 4 * t; x.fillStyle = S(mixC(cc, lc, .18 + (i % 3) * .06), .85); x.fillRect(lx - 3, lyy, 6, 11); } }   // laundry
          if (R() < .5) { const tw = 20 + R() * 16, tx0 = bx + R() * (w - tw); x.fillStyle = S(mixC(cc, lc, .08)); x.fillRect(tx0, yb - h - 28, tw, 28); poly(x, [[tx0 - 2, yb - h - 28], [tx0 + tw / 2, yb - h - 40], [tx0 + tw + 2, yb - h - 28]], S(cc)); x.fillRect(tx0 + 3, yb - h, 3, 12); x.fillRect(tx0 + tw - 6, yb - h, 3, 12); }
          if (R() < .5) { x.strokeStyle = S(cc); x.lineWidth = 1.5; const ax = bx + R() * w; line(x, ax, yb - h, ax, yb - h - 34); line(x, ax - 8, yb - h - 26, ax + 8, yb - h - 26); line(x, ax - 5, yb - h - 18, ax + 5, yb - h - 18); } });
        px += w + R() * 24 - 14; }
      // the only lit window in the district
      const lx = 200 + R() * 800; each3(lx, 14, bx => { x.fillStyle = 'rgba(255,196,110,.9)'; x.fillRect(bx, yb - 150, 8, 10); }); this._warm = lx; },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3);
      for (let i = 0; i < 4; i++) { const px = 80 + i * 320 + R() * 60; each3(px, 60, bx => { x.fillStyle = S(cc); x.fillRect(bx, 140, 10, 700); x.fillRect(bx - 34, 150, 78, 7); for (const o of [-30, -10, 14, 36]) { x.fillStyle = S(mixC(cc, lc, .2)); x.fillRect(bx + o, 140, 4, 12); } x.fillStyle = S(cc); x.fillRect(bx - 12, 330, 36, 4); poly(x, [[bx - 10, 334], [bx + 22, 334], [bx + 14, 350], [bx - 2, 350]], S(mixC(cc, [0, 0, 0], .3))); }); }
      x.strokeStyle = S(cc); x.lineWidth = 2; for (let k = 0; k < 4; k++) { const y0 = 150 + k * 4; for (let i = 0; i < 5; i++) { const xa = 80 + i * 320 + 90, xb = xa + 320; x.beginPath(); x.moveTo(xa, y0 + (k - 1) * 5); x.quadraticCurveTo((xa + xb) / 2, y0 + 44 + k * 3, xb, y0 + (k - 1) * 5); x.stroke(); } }
      for (let i = 0; i < 6; i++) { const bx0 = R() * SW; each3(bx0, 24, bx => { x.fillStyle = S(mixC(cc, [210, 190, 120], .1)); x.fillRect(bx, 400 + R() * 200, 4, 60); x.fillStyle = S(cc); x.fillRect(bx - 14, 396, 32, 16); x.fillStyle = S(mixC(cc, lc, .3)); x.fillRect(bx - 12, 398, 28, 3); }); } }
  };

  // ---------------------------------------------------------------- ch2 · the pipe maze: pipe organ, water towers, manifolds
  ART.pipes = {
    seed: 2203, ambient: 'drip', gears: false,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, hi = mixC(cc, [200, 230, 215], .14);
      // the pipe organ
      for (let o = 0; o < 2; o++) { const x0 = 140 + o * 640 + R() * 60, n = 16; each3(x0, n * 22 + 40, bx => { x.fillStyle = S(mixC(cc, [0, 0, 0], .25)); x.fillRect(bx - 8, yb - 54, n * 22 + 16, 70);
          for (let i = 0; i < n; i++) { const h = 120 + Math.abs(Math.sin(i * .55 + o)) * 190 + R() * 30, w = 16 + (i % 3) * 3, px = bx + i * 22; x.fillStyle = S(cc); x.fillRect(px, yb - h, w, h); x.fillStyle = S(hi, .5); x.fillRect(px + 2, yb - h, 3, h); x.fillStyle = S(mixC(cc, [0, 0, 0], .45)); x.fillRect(px + w - 4, yb - h, 4, h);
            x.fillStyle = S(mixC(cc, [0, 0, 0], .5)); x.beginPath(); x.ellipse(px + w / 2, yb - h, w / 2, 3, 0, 0, 7); x.fill(); for (let y = yb - h + 24; y < yb - 40; y += 54) { x.fillStyle = S(hi, .45); x.fillRect(px - 2, y, w + 4, 5); } } }); }
      // water towers on stilts
      for (let i = 0; i < 2; i++) { const wx = 80 + i * 560 + R() * 160; each3(wx - 60, 160, bx0 => { const bx = bx0 + 60; x.fillStyle = S(cc); x.beginPath(); x.ellipse(bx, yb - 280, 52, 38, 0, 0, 7); x.fill(); x.fillRect(bx - 52, yb - 280, 104, 36); x.beginPath(); x.ellipse(bx, yb - 244, 52, 14, 0, 0, Math.PI); x.fill();
          x.strokeStyle = S(cc); x.lineWidth = 6; line(x, bx - 40, yb - 244, bx - 52, yb); line(x, bx + 40, yb - 244, bx + 52, yb); x.lineWidth = 2.5; for (let k = 0; k < 4; k++) { const y0 = yb - 230 + k * 58; line(x, bx - 40 - k * 3, y0, bx + 40 + k * 3, y0 + 30); line(x, bx + 40 + k * 3, y0, bx - 40 - k * 3, y0 + 30); }
          x.fillStyle = S(hi, .4); x.fillRect(bx - 50, yb - 296, 100, 3); x.fillStyle = S(lc, .5); x.fillRect(bx + 20, yb - 270, 6, 6); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, hi = mixC(cc, [190, 225, 210], .12); let px = 0;
      while (px < SW) { const w = 90 + R() * 120, h = 60 + R() * 90; each3(px, w, bx => { x.fillStyle = S(cc); rr(x, bx, yb - h, w, h + 300, 6); x.fill(); x.fillStyle = S(hi, .5); x.fillRect(bx + 4, yb - h, w - 8, 3);
          for (let i = 0; i < Math.floor(w / 34); i++) { x.fillStyle = S(mixC(cc, [0, 0, 0], .5)); circ(x, bx + 22 + i * 34, yb - h + 26, 10); x.fillStyle = R() < .3 ? S(lc, .8) : S(mixC(cc, [0, 0, 0], .3)); circ(x, bx + 22 + i * 34, yb - h + 26, 7); }
          x.strokeStyle = S(hi, .6); x.lineWidth = 6; const vx = bx + 10 + R() * (w - 20); line(x, vx, yb - h, vx, yb - h - 40 - R() * 50); x.lineWidth = 3; line(x, vx - 8, yb - h - 30, vx + 8, yb - h - 30);
          if (R() < .6) { const rx = bx + w - 30, ry = yb - h - 26; x.strokeStyle = S(hi, .7); x.lineWidth = 2; x.beginPath(); x.arc(rx, ry, 18, 0, 7); x.stroke(); for (let k = 0; k < 4; k++) { const a = k * 1.571; line(x, rx - Math.cos(a) * 18, ry - Math.sin(a) * 18, rx + Math.cos(a) * 18, ry + Math.sin(a) * 18); } }
          x.strokeStyle = S(cc); x.lineWidth = 2; for (let k = 0; k < 3; k++) { const sx = bx + 6 + k * (w - 12) / 2; line(x, sx, yb - h - 4, sx, yb - h - 70); } for (let k = 0; k < 4; k++) line(x, bx + 6, yb - h - 8 - k * 16, bx + w - 6, yb - h - 8 - k * 16); }); px += w + R() * 20 - 10; } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), hi = mixC(cc, [180, 235, 205], .2), dk = mixC(cc, [0, 0, 0], .4);
      for (let i = 0; i < 3; i++) { const px = 90 + i * 400 + R() * 60, w = 40 + R() * 16; each3(px - 12, w + 40, bx0 => { const bx = bx0 + 12; x.fillStyle = S(cc); x.fillRect(bx, 0, w, 800); x.fillStyle = S(hi, .6); x.fillRect(bx + 4, 0, 6, 800); x.fillStyle = S(dk); x.fillRect(bx + w - 8, 0, 8, 800); for (let y = 30; y < 800; y += 110) { x.fillStyle = S(hi, .8); x.fillRect(bx - 10, y, w + 20, 12); x.fillStyle = S(dk); x.fillRect(bx - 10, y + 9, w + 20, 3); for (let b = 0; b < 4; b++) { x.fillStyle = S(dk); circ(x, bx - 5 + b * (w + 10) / 3, y + 6, 1.8); } } }); }
      for (let i = 0; i < 4; i++) { const y0 = 80 + i * 170 + R() * 50, h = 30 + R() * 10; x.fillStyle = S(cc); x.fillRect(0, y0, SW, h); x.fillStyle = S(hi, .55); x.fillRect(0, y0 + 3, SW, 4); x.fillStyle = S(dk); x.fillRect(0, y0 + h - 7, SW, 7);
        for (let k = 0; k < 14; k++) { const jx = k * 94 + R() * 30; x.fillStyle = S(hi, .7); x.fillRect(jx, y0 - 5, 12, h + 10); x.fillStyle = S(dk); x.fillRect(jx + 8, y0 - 5, 4, h + 10); } }
      for (let i = 0; i < 9; i++) { const vx = R() * SW, vy = 80 + R() * 620; each3(vx - 26, 52, bx0 => { const bx = bx0 + 26; x.fillStyle = S(hi); circ(x, bx, vy, 17); x.fillStyle = S(dk); circ(x, bx, vy, 12); x.strokeStyle = S(hi, .9); x.lineWidth = 2; for (let k = 0; k < 3; k++) { const a = k * 2.094 + i; line(x, bx, vy, bx + Math.cos(a) * 11, vy + Math.sin(a) * 11); } }); } }
  };

  // ---------------------------------------------------------------- ch3 · the gear tower: a stack of meshing wheels around one axle, brass clock cases
  ART.brass = {
    seed: 3307, ambient: 'lint', gears: true,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, brs = mixC(cc, [220, 170, 80], .14);
      const gearAt = (gx, gy, r, n, sol) => { x.fillStyle = S(sol); gearPath(x, gx, gy, r, n, 0, Math.max(5, r * .13)); x.fill(); x.fillStyle = S(mixC(cc, [0, 0, 0], .55)); circ(x, gx, gy, r * .62); x.strokeStyle = S(sol); x.lineWidth = Math.max(3, r * .1); for (let i = 0; i < 6; i++) { const a = i * 1.047; line(x, gx, gy, gx + Math.cos(a) * r * .66, gy + Math.sin(a) * r * .66); } x.fillStyle = S(sol); circ(x, gx, gy, r * .2); };
      for (let o = 0; o < 2; o++) { const ax = 220 + o * 640 + R() * 100; each3(ax - 150, 300, bx0 => { const bx = bx0 + 150; x.fillStyle = S(cc); x.fillRect(bx - 12, yb - 480, 24, 520);
          gearAt(bx, yb - 80, 110, 18, brs); gearAt(bx + 150, yb - 150, 74, 14, cc); gearAt(bx - 138, yb - 190, 64, 12, brs); gearAt(bx + 18, yb - 300, 88, 16, cc); gearAt(bx - 110, yb - 380, 46, 10, brs); gearAt(bx + 112, yb - 380, 52, 11, brs); x.fillStyle = S(mixC(brs, lc, .4), .8); circ(x, bx, yb - 80, 8); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, brs = mixC(cc, [230, 180, 90], .16); let px = 0;
      while (px < SW) { const w = 70 + R() * 70, h = 150 + R() * 150; each3(px, w, bx => {
          x.fillStyle = S(cc); x.fillRect(bx, yb - h, w, h + 300); x.beginPath(); x.arc(bx + w / 2, yb - h, w / 2, Math.PI, 0); x.fill();   // grandfather case
          x.fillStyle = S(brs, .7); x.fillRect(bx + 4, yb - h, 3, h); x.fillRect(bx + w - 7, yb - h, 3, h);
          x.fillStyle = S(mixC(cc, [0, 0, 0], .5)); circ(x, bx + w / 2, yb - h - 8, w * .32); x.strokeStyle = S(brs); x.lineWidth = 2; x.beginPath(); x.arc(bx + w / 2, yb - h - 8, w * .32, 0, 7); x.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; line(x, bx + w / 2 + Math.cos(a) * w * .27, yb - h - 8 + Math.sin(a) * w * .27, bx + w / 2 + Math.cos(a) * w * .3, yb - h - 8 + Math.sin(a) * w * .3); }
          line(x, bx + w / 2, yb - h - 8, bx + w / 2 + w * .17, yb - h - 8 - w * .08); line(x, bx + w / 2, yb - h - 8, bx + w / 2 - w * .03, yb - h - 8 - w * .2);
          const gl = x.createLinearGradient(0, yb - h + 40, 0, yb - 20); gl.addColorStop(0, S(mixC(cc, lc, .15), .5)); gl.addColorStop(1, S(cc, 0)); x.fillStyle = gl; x.fillRect(bx + 10, yb - h + 40, w - 20, h - 60);   // glass front with weights
          x.fillStyle = S(brs, .8); circ(x, bx + w * .35, yb - h * .35, 7); circ(x, bx + w * .65, yb - h * .5, 7); x.strokeStyle = S(brs, .6); x.lineWidth = 1.5; line(x, bx + w * .35, yb - h + 50, bx + w * .35, yb - h * .35 - 6); line(x, bx + w * .65, yb - h + 50, bx + w * .65, yb - h * .5 - 6); });
        px += w + R() * 36; } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), brs = mixC(cc, [230, 180, 90], .22), dk = mixC(cc, [0, 0, 0], .4);
      for (let i = 0; i < 4; i++) { const px = 60 + i * 320 + R() * 80; each3(px, 40, bx => { x.fillStyle = S(cc); x.fillRect(bx, 0, 22, 800); x.fillStyle = S(brs, .55); for (let y = 0; y < 800; y += 14) { poly(x, [[bx - 2, y], [bx + 24, y + 7], [bx + 24, y + 11], [bx - 2, y + 4]], S(brs, .55)); } x.fillStyle = S(dk); x.fillRect(bx + 17, 0, 5, 800); }); }
      for (let i = 0; i < 3; i++) { const y0 = 120 + i * 220 + R() * 60; x.strokeStyle = S(cc); x.lineWidth = 7; line(x, 0, y0, SW, y0); x.strokeStyle = S(brs, .5); x.lineWidth = 2; for (let k = 0; k < SW; k += 18) line(x, k, y0 - 4, k + 9, y0 + 4); }
      for (let i = 0; i < 6; i++) { const cx0 = R() * SW, cy0 = 90 + R() * 600; each3(cx0 - 40, 80, bx0 => { const bx = bx0 + 40; x.fillStyle = S(brs); gearPath(x, bx, cy0, 26, 12, 0, 5); x.fill(); x.fillStyle = S(dk); circ(x, bx, cy0, 17); x.fillStyle = S(brs); circ(x, bx, cy0, 6); }); } }
  };

  // ---------------------------------------------------------------- ch4 · the cam workshop: press hall, cam discs, conveyors
  ART.cam = {
    seed: 4409, ambient: 'oil', gears: true,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, ora = mixC(cc, [255, 150, 60], .12);
      for (let k = 0; k < 4; k++) { const px = 30 + k * 320 + R() * 50; each3(px, 220, bx => {
          x.fillStyle = S(cc); x.fillRect(bx, yb - 330, 40, 340); x.fillRect(bx + 150, yb - 330, 40, 340); x.fillRect(bx - 12, yb - 360, 214, 44); x.fillStyle = S(mixC(cc, [0, 0, 0], .3)); x.fillRect(bx + 36, yb - 100, 118, 100);   // C-frame presses
          x.fillStyle = S(cc); x.fillRect(bx + 80, yb - 316, 30, 120); x.fillRect(bx + 56, yb - 200, 78, 40);                                                                                    // ram + die
          x.fillStyle = S(ora, .6); x.fillRect(bx + 56, yb - 164, 78, 4); x.fillStyle = S(lc, .5); x.fillRect(bx + 4, yb - 352, 6, 6);
          x.strokeStyle = S(cc); x.lineWidth = 4; x.beginPath(); x.arc(bx + 95, yb - 392, 22, 0, 7); x.stroke(); for (let i = 0; i < 4; i++) { const a = i * 1.571 + k; line(x, bx + 95, yb - 392, bx + 95 + Math.cos(a) * 22, yb - 392 + Math.sin(a) * 22); } });
      }
      for (let k = 0; k < 3; k++) { const cx0 = 140 + k * 420 + R() * 80, r = 54 + R() * 30; each3(cx0 - r, r * 2, bx0 => { const bx = bx0 + r; x.fillStyle = S(mixC(cc, [0, 0, 0], .15)); x.beginPath(); x.ellipse(bx, yb - 80, r, r * .8, .3, 0, 7); x.fill(); x.fillStyle = S(mixC(cc, [0, 0, 0], .5)); circ(x, bx - r * .22, yb - 80, r * .26); x.strokeStyle = S(ora, .5); x.lineWidth = 2; x.beginPath(); x.ellipse(bx, yb - 80, r - 6, r * .8 - 5, .3, 0, 7); x.stroke(); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, ora = mixC(cc, [255, 160, 60], .2);
      // gantry with conveyor lines (the crates ride them live)
      for (let k = 0; k < 3; k++) { const y0 = yb - 120 - k * 90; x.fillStyle = S(cc); x.fillRect(0, y0, SW, 8); x.fillStyle = S(ora, .35); x.fillRect(0, y0, SW, 2); for (let i = 0; i < SW; i += 44) { x.strokeStyle = S(cc); x.lineWidth = 2; x.beginPath(); x.moveTo(i, y0 + 8); x.lineTo(i + 22, y0 + 22); x.lineTo(i + 44, y0 + 8); x.stroke(); } for (let i = 0; i < SW; i += 220 + k * 24) { x.fillStyle = S(cc); x.fillRect(i, y0, 10, yb - y0 + 400); } }
      let px = 0; while (px < SW) { const w = 70 + R() * 80, h = 60 + R() * 70; each3(px, w, bx => {   // machine bodies + robot arms
          x.fillStyle = S(cc); x.fillRect(bx, yb - h, w, h + 300); x.fillStyle = S(ora, .5); for (let i = 0; i < w / 14; i++) { x.fillRect(bx + i * 14 + 2, yb - h, 7, 5); }
          if (R() < .6) { const ax = bx + w * .5, ay = yb - h; x.strokeStyle = S(cc); x.lineWidth = 7; line(x, ax, ay, ax + 24, ay - 54); x.lineWidth = 6; line(x, ax + 24, ay - 54, ax + 72, ay - 40); x.lineWidth = 3; line(x, ax + 72, ay - 40, ax + 76, ay - 18); line(x, ax + 76, ay - 18, ax + 66, ay - 12); line(x, ax + 76, ay - 18, ax + 84, ay - 12); x.fillStyle = S(ora, .7); circ(x, ax, ay, 6); circ(x, ax + 24, ay - 54, 5); } }); px += w + R() * 30; } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), ora = mixC(cc, [255, 150, 60], .3), dk = mixC(cc, [0, 0, 0], .4);
      for (let k = 0; k < 2; k++) { const y0 = 70 + k * 40; x.fillStyle = S(cc); x.fillRect(0, y0, SW, 14); x.fillStyle = S(dk); x.fillRect(0, y0 + 10, SW, 4); for (let i = 0; i < SW; i += 160) { x.fillStyle = S(cc); x.fillRect(i, y0, 16, 800); } }
      for (let i = 0; i < 4; i++) { const hx = 100 + i * 310 + R() * 70; each3(hx, 40, bx => { x.strokeStyle = S(cc); x.lineWidth = 3; line(x, bx + 10, 84, bx + 10, 240 + R() * 80); x.lineWidth = 5; x.beginPath(); x.arc(bx + 10, 330, 16, -.4, Math.PI + .3, true); x.stroke(); x.fillStyle = S(cc); x.fillRect(bx + 2, 84, 16, 20); }); }
      for (let i = 0; i < 8; i++) { const wx = R() * SW, wy = 200 + R() * 520; each3(wx - 20, 40, bx0 => { const bx = bx0 + 20; x.fillStyle = S(cc); x.fillRect(bx - 12, wy, 24, 40); x.fillStyle = S(ora); for (let k = 0; k < 3; k++) x.fillRect(bx - 10, wy + 4 + k * 11, 20, 6); x.fillStyle = S(lc, .8); circ(x, bx + 16, wy + 6, 3); }); } }
  };

  // ---------------------------------------------------------------- ch5 · the flywheel hall: a colossal wheel, drive belts, governors
  ART.fly = {
    seed: 5521, ambient: 'wind', gears: false,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, cy = mixC(cc, [90, 230, 220], .1);
      for (let k = 0; k < 3; k++) { const px = 120 + k * 430 + R() * 80; each3(px - 60, 120, bx0 => { const bx = bx0 + 60; x.fillStyle = S(cc); x.fillRect(bx - 22, yb - 360, 44, 380); x.fillRect(bx - 40, yb - 372, 80, 20); x.fillStyle = S(cy, .5); x.fillRect(bx - 22, yb - 360, 5, 380); for (let y = yb - 340; y < yb - 20; y += 56) { x.fillStyle = S(mixC(cc, [0, 0, 0], .4)); x.fillRect(bx - 22, y, 44, 4); } x.fillStyle = S(lc, .6); circ(x, bx, yb - 392, 4); }); }   // bearing towers (the wheel itself is live)
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, cy = mixC(cc, [100, 235, 220], .16); let px = 0;
      while (px < SW) { const w = 80 + R() * 90, h = 70 + R() * 130; each3(px, w, bx => { x.fillStyle = S(cc); rr(x, bx, yb - h, w, h + 300, 12); x.fill(); x.fillStyle = S(cy, .55); x.fillRect(bx + 8, yb - h + 6, w - 16, 3);
          x.strokeStyle = S(cy, .5); x.lineWidth = 2; x.beginPath(); x.arc(bx + w / 2, yb - h + 38, 17, 0, 7); x.stroke(); for (let i = 0; i < 6; i++) { const a = i * 1.047; line(x, bx + w / 2, yb - h + 38, bx + w / 2 + Math.cos(a) * 17, yb - h + 38 + Math.sin(a) * 17); }
          if (R() < .55) { const gx = bx + w + 6, gy = yb - h - 40; x.strokeStyle = S(cc); x.lineWidth = 3; line(x, gx, gy, gx, yb - h); x.fillStyle = S(cc); circ(x, gx - 14, gy + 14, 7); circ(x, gx + 14, gy + 14, 7); x.lineWidth = 2; line(x, gx, gy, gx - 14, gy + 14); line(x, gx, gy, gx + 14, gy + 14); circ(x, gx, gy - 4, 5); }
          if (R() < .5) { x.strokeStyle = S(cc); x.lineWidth = 3; x.beginPath(); for (let k = 0; k < 8; k++) { const sx = bx + 10 + (k % 2 ? 6 : 24), sy = yb - h - 8 - k * 7; if (k) x.lineTo(sx, sy); else x.moveTo(sx, sy); } x.stroke(); } }); px += w + R() * 28 - 8; } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), cy = mixC(cc, [100, 235, 225], .24), dk = mixC(cc, [0, 0, 0], .4);
      for (let k = 0; k < 5; k++) { const x0 = R() * SW, y0 = 60 + R() * 200, len = 260 + R() * 260, a = .5 + R() * .5; each3(x0, len, bx => { x.strokeStyle = S(dk); x.lineWidth = 12; line(x, bx, y0, bx + len * Math.cos(a), y0 + len * Math.sin(a)); x.strokeStyle = S(cc); x.lineWidth = 8; line(x, bx, y0, bx + len * Math.cos(a), y0 + len * Math.sin(a)); x.fillStyle = S(cc); circ(x, bx, y0, 20); circ(x, bx + len * Math.cos(a), y0 + len * Math.sin(a), 20); x.fillStyle = S(dk); circ(x, bx, y0, 9); circ(x, bx + len * Math.cos(a), y0 + len * Math.sin(a), 9); }); }
      for (let i = 0; i < 3; i++) { const px = 150 + i * 420 + R() * 60; each3(px, 40, bx => { x.fillStyle = S(cc); x.fillRect(bx, 0, 26, 800); x.fillStyle = S(cy, .5); x.fillRect(bx + 3, 0, 4, 800); for (let y = 40; y < 800; y += 130) { x.fillStyle = S(dk); x.fillRect(bx - 8, y, 42, 10); } }); } }
  };

  // ---------------------------------------------------------------- ch6 · the arc gallery: tesla towers, insulators, capacitor banks
  ART.arc = {
    seed: 6607, ambient: 'static', gears: false,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, vio = mixC(cc, [170, 140, 255], .22);
      this.coils = [];
      for (let k = 0; k < 4; k++) { const px = 100 + k * 310 + R() * 60, h = 250 + R() * 130; this.coils.push({ x: px, y: yb - h - 34 }); each3(px - 60, 120, bx0 => { const bx = bx0 + 60;
          poly(x, [[bx - 40, yb], [bx - 14, yb - h], [bx + 14, yb - h], [bx + 40, yb]], S(cc)); x.strokeStyle = S(vio, .55); x.lineWidth = 2; for (let i = 1; i < 9; i++) { const y = yb - h * i / 9, w = 14 + 26 * (1 - i / 9); line(x, bx - w, y, bx + w, y + 5); }
          x.fillStyle = S(vio, .6); x.beginPath(); x.ellipse(bx, yb - h - 18, 38, 15, 0, 0, 7); x.fill(); x.fillStyle = S(mixC(cc, [0, 0, 0], .4)); x.beginPath(); x.ellipse(bx, yb - h - 18, 24, 8, 0, 0, 7); x.fill(); x.fillStyle = S(cc); circ(x, bx, yb - h - 34, 10); x.fillStyle = S(lc, .8); circ(x, bx, yb - h - 36, 3); }); }
      for (let k = 0; k < 6; k++) { const px = 40 + k * 210 + R() * 60; each3(px, 40, bx => { x.fillStyle = S(cc); for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(bx + 10, yb - 24 - i * 14, 22 - i * 1.5, 6, 0, 0, 7); x.fill(); } x.fillRect(bx + 8, yb - 130, 4, 130); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, vio = mixC(cc, [180, 150, 255], .22); let px = 0;
      while (px < SW) { const w = 100 + R() * 110, h = 50 + R() * 70; each3(px, w, bx => { x.fillStyle = S(cc); x.fillRect(bx, yb - h, w, h + 300); x.fillStyle = S(vio, .5); x.fillRect(bx, yb - h, w, 3);
          const n = Math.floor(w / 22); for (let i = 0; i < n; i++) { const jx = bx + 8 + i * 22; x.fillStyle = S(mixC(cc, [0, 0, 0], .35)); rr(x, jx, yb - h - 44, 14, 46, 5); x.fill(); x.fillStyle = R() < .5 ? S(vio, .85) : S(lc, .5); x.fillRect(jx + 3, yb - h - 41, 8, 6); x.fillStyle = S(mixC(cc, vio, .2)); x.fillRect(jx - 2, yb - h - 8, 18, 4); x.fillRect(jx + 4, yb - h - 52, 6, 8); }
          x.strokeStyle = S(cc); x.lineWidth = 1.5; for (let i = 0; i < n - 1; i++) { x.beginPath(); x.moveTo(bx + 15 + i * 22, yb - h - 52); x.quadraticCurveTo(bx + 26 + i * 22, yb - h - 44, bx + 37 + i * 22, yb - h - 52); x.stroke(); } }); px += w + R() * 30; } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), vio = mixC(cc, [190, 160, 255], .3), dk = mixC(cc, [0, 0, 0], .4);
      for (let i = 0; i < 3; i++) { const px = 100 + i * 420 + R() * 60; each3(px - 50, 130, bx0 => { const bx = bx0 + 50; poly(x, [[bx - 34, 800], [bx - 8, 120], [bx + 8, 120], [bx + 34, 800]], S(cc)); x.strokeStyle = S(dk); x.lineWidth = 3; for (let y = 190; y < 800; y += 100) { line(x, bx - 28 + (y - 190) / 40, y, bx + 28 - (y - 190) / 40, y + 70); line(x, bx + 28 - (y - 190) / 40, y, bx - 28 + (y - 190) / 40, y + 70); }
          for (let k = 0; k < 3; k++) { x.fillStyle = S(cc); x.fillRect(bx - 48 + k * 4, 128 + k * 36, 96 - k * 8, 7); x.fillStyle = S(vio, .7); circ(x, bx - 44 + k * 4, 140 + k * 36, 4); circ(x, bx + 44 - k * 4, 140 + k * 36, 4); } }); }
      x.strokeStyle = S(dk); x.lineWidth = 2; for (let i = 0; i < 4; i++) { const y0 = 130 + i * 36; for (let k = 0; k < 3; k++) { const xa = 100 + k * 420, xb = xa + 420; x.beginPath(); x.moveTo(xa, y0); x.quadraticCurveTo((xa + xb) / 2, y0 + 60, xb, y0); x.stroke(); } } }
  };

  // ---------------------------------------------------------------- ch7 · the great reactor: blast furnaces, ladle cranes, slag
  ART.furnace = {
    seed: 7703, ambient: 'ember', gears: true,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, hot = mixC(cc, [255, 120, 40], .35); this.stacks = [];
      for (let k = 0; k < 3; k++) { const px = 120 + k * 430 + R() * 80, h = 260 + R() * 120; this.stacks.push({ x: px, y: yb - h }); each3(px - 80, 160, bx0 => { const bx = bx0 + 80;
          poly(x, [[bx - 70, yb], [bx - 36, yb - h], [bx + 36, yb - h], [bx + 70, yb]], S(cc)); x.fillStyle = S(mixC(cc, [0, 0, 0], .25)); x.fillRect(bx - 44, yb - h - 20, 88, 22); x.fillStyle = S(cc); x.fillRect(bx - 28, yb - h - 56, 56, 38);
          x.fillStyle = S(hot, .9); x.beginPath(); x.ellipse(bx, yb - h - 20, 30, 6, 0, 0, 7); x.fill(); x.fillStyle = S(hot, .55); x.fillRect(bx - 12, yb - 70, 24, 40); x.fillStyle = S(hot, .8); x.fillRect(bx - 8, yb - 62, 16, 24);
          x.strokeStyle = S(mixC(cc, [0, 0, 0], .5)); x.lineWidth = 3; for (let y = yb - h + 40; y < yb - 20; y += 44) line(x, bx - 60 + (y - yb + h) / 8, y, bx + 60 - (y - yb + h) / 8, y); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, hot = mixC(cc, [255, 110, 30], .4); let px = 0;
      x.fillStyle = S(cc); x.fillRect(0, yb - 160, SW, 6); for (let i = 0; i < SW; i += 160) { x.fillRect(i, yb - 160, 12, 300); }
      while (px < SW) { const w = 60 + R() * 90, h = 40 + R() * 90; each3(px, w, bx => { poly(x, [[bx - 14, yb], [bx + 8, yb - h], [bx + w - 8, yb - h], [bx + w + 14, yb]], S(cc)); if (R() < .5) { x.fillStyle = S(hot, .7); x.fillRect(bx + w * .3, yb - h + 4, w * .3, 4); } }); px += w + R() * 34; }
      for (let k = 0; k < 3; k++) { const cx0 = 60 + k * 420 + R() * 100; each3(cx0, 260, bx => { x.strokeStyle = S(cc); x.lineWidth = 5; line(x, bx, yb - 300, bx + 200, yb - 300); line(x, bx + 40, yb - 300, bx + 40, yb - 160); line(x, bx + 160, yb - 300, bx + 160, yb - 160); x.fillStyle = S(cc); x.beginPath(); x.moveTo(bx + 90, yb - 300); x.lineTo(bx + 90, yb - 262); x.stroke(); poly(x, [[bx + 70, yb - 262], [bx + 110, yb - 262], [bx + 102, yb - 226], [bx + 78, yb - 226]], S(cc)); x.fillStyle = S(hot, .8); x.fillRect(bx + 78, yb - 232, 24, 5); }); } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), lc = lit(3), hot = mixC(cc, [255, 120, 40], .4), dk = mixC(cc, [0, 0, 0], .4);
      for (let i = 0; i < 3; i++) { const px = 60 + i * 420 + R() * 80; each3(px, 50, bx => { x.fillStyle = S(cc); x.fillRect(bx, 0, 36, 800); x.fillStyle = S(dk); x.fillRect(bx + 28, 0, 8, 800); for (let y = 90; y < 800; y += 150) { x.fillStyle = S(mixC(cc, [0, 0, 0], .5)); x.fillRect(bx - 4, y, 44, 22); x.fillStyle = S(hot, .85); x.fillRect(bx + 2, y + 4, 32, 6); } }); }
      for (let i = 0; i < 3; i++) { const y0 = 100 + i * 200 + R() * 50; x.fillStyle = S(cc); x.fillRect(0, y0, SW, 12); x.fillStyle = S(dk); for (let k = 0; k < SW; k += 36) x.fillRect(k, y0 + 12, 4, 34); } }
  };

  // ---------------------------------------------------------------- ch8 · the heart: ribs, valves, veins
  ART.heart = {
    seed: 8809, ambient: 'spore', gears: false,
    l2(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 1), cc = col(1), lc = lit(1), yb = 520, red = mixC(cc, [210, 50, 40], .3);
      for (let k = 0; k < 4; k++) { const px = 40 + k * 330 + R() * 40; each3(px - 60, 300, bx0 => { const bx = bx0 + 60; x.strokeStyle = S(cc); x.lineWidth = 18; x.beginPath(); x.moveTo(bx, yb + 20); x.bezierCurveTo(bx + 30, yb - 220, bx + 120, yb - 330, bx + 240, yb - 340); x.stroke(); x.strokeStyle = S(red, .5); x.lineWidth = 4; x.beginPath(); x.moveTo(bx + 4, yb + 20); x.bezierCurveTo(bx + 34, yb - 220, bx + 124, yb - 330, bx + 244, yb - 340); x.stroke(); }); }
      for (let k = 0; k < 3; k++) { const px = 150 + k * 430 + R() * 60; each3(px - 70, 140, bx0 => { const bx = bx0 + 70; x.fillStyle = S(mixC(cc, [0, 0, 0], .2)); x.beginPath(); x.ellipse(bx, yb - 120, 60, 90, 0, 0, 7); x.fill(); x.fillStyle = S(red, .55); x.beginPath(); x.ellipse(bx, yb - 120, 46, 76, 0, 0, 7); x.fill(); x.fillStyle = S(mixC(cc, [0, 0, 0], .55)); x.beginPath(); x.ellipse(bx, yb - 120, 20, 56, 0, 0, 7); x.fill(); }); }
      x.fillStyle = S(cc); x.fillRect(0, yb, SW, bg.SH - yb); },
    l3(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 2), cc = col(2), lc = lit(2), yb = 540, red = mixC(cc, [230, 60, 50], .4);
      for (let i = 0; i < 9; i++) { const vx = R() * SW; each3(vx - 80, 160, bx0 => { const bx = bx0 + 80; x.strokeStyle = S(cc); x.lineWidth = 22; x.beginPath(); x.moveTo(bx, yb + 20); x.bezierCurveTo(bx - 50, yb - 120, bx + 60, yb - 180 - R() * 100, bx + 20, yb - 340); x.stroke(); x.strokeStyle = S(red, .55); x.lineWidth = 5; x.stroke(); }); } },
    l4(e, bg) { const { R, SW, col, lit, each3 } = e, x = clearL(bg, 3), cc = col(3), red = mixC(cc, [230, 60, 50], .45), dk = mixC(cc, [0, 0, 0], .4);
      for (let i = 0; i < 3; i++) { const px = 90 + i * 420 + R() * 70; each3(px - 40, 100, bx0 => { const bx = bx0 + 40; x.strokeStyle = S(cc); x.lineWidth = 34; x.beginPath(); x.moveTo(bx, 0); x.bezierCurveTo(bx + 40, 250, bx - 50, 500, bx + 6, 800); x.stroke(); x.strokeStyle = S(red, .6); x.lineWidth = 7; x.stroke(); x.strokeStyle = S(dk); x.lineWidth = 3; for (let y = 60; y < 800; y += 90) { x.beginPath(); x.moveTo(bx - 30, y); x.lineTo(bx + 30, y + 14); x.stroke(); } }); } }
  };

  // ---------------------------------------------------------------- live landmarks (drawn between the static layers)
  const LIVE = {
    blue(bg, ctx, g, cx, cyo, t) { const x = (this._warm || 400) - cx * .2, SW = bg.SW, a = .75 + .25 * Math.sin(t * .7) * Math.sin(t * 2.3); const sx = ((x % SW) + SW) % SW; ctx.fillStyle = `rgba(255,190,100,${a * .5})`; ctx.fillRect(sx, 390 - Math.min(bg.SH - H, cyo * .07), 8, 10); glow(ctx, sx + 4, 395 - Math.min(bg.SH - H, cyo * .07), 22, '255,180,90', .18 * a); },
    pipes(bg, ctx, g, cx, cyo, t) { /* steam is handled by the shared event system */ },
    brass(bg, ctx, g, cx, cyo, t) { const SW = bg.SW, f = .2, sx = (((560 - cx * f) % SW) + SW) % SW, dy = -Math.min(bg.SH - H, cyo * .07), len = 330, a = Math.sin(t * .9) * .42;
      for (const o of [0, -SW]) { const bx = sx + o; if (bx < -200 || bx > W + 200) continue; ctx.save(); ctx.translate(bx, 80 + dy); ctx.rotate(a); ctx.strokeStyle = 'rgba(40,34,22,.8)'; ctx.lineWidth = 4; line(ctx, 0, 0, 0, len); ctx.fillStyle = 'rgba(70,56,30,.9)'; ctx.beginPath(); ctx.arc(0, len, 34, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(150,120,60,.55)'; ctx.beginPath(); ctx.arc(0, len, 25, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(30,24,14,.8)'; ctx.beginPath(); ctx.arc(0, len, 9, 0, 7); ctx.fill(); ctx.restore(); } },
    cam(bg, ctx, g, cx, cyo, t) { const SW = bg.SW, f = .2, dy = -Math.min(bg.SH - H, cyo * .07);
      for (let k = 0; k < 3; k++) { const y0 = 540 - 120 - k * 90 + dy, sp = 24 + k * 8; for (let i = 0; i < 9; i++) { const base = (((i * 150 + t * sp * (k % 2 ? -1 : 1)) - cx * f) % SW + SW) % SW; if (base > W + 40) continue; ctx.fillStyle = 'rgba(40,34,28,.9)'; ctx.fillRect(base, y0 - 18, 22 + (i % 3) * 6, 18); ctx.fillStyle = 'rgba(255,150,60,.25)'; ctx.fillRect(base, y0 - 18, 22 + (i % 3) * 6, 3); } }
      const blink = (Math.floor(t * 1.4) % 2) ? 1 : .15; for (let i = 0; i < 4; i++) { const sx = (((i * 330 + 60) - cx * .36) % SW + SW) % SW; if (sx > W) continue; const sy = 120 + dy * 2; ctx.fillStyle = `rgba(255,150,40,${.2 + .6 * blink})`; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); glow(ctx, sx, sy, 24, '255,150,40', .22 * blink); } },
    fly(bg, ctx, g, cx, cyo, t) { const SW = bg.SW, f = .11, sx0 = (((700 - cx * f) % SW) + SW) % SW, dy = -Math.min(bg.SH - H, cyo * .04), R_ = 300;
      for (const o of [0, -SW]) { const bx = sx0 + o, by = 520 + dy; if (bx < -R_ || bx > W + R_) continue; ctx.save(); ctx.translate(bx, by); const a = t * .28; ctx.rotate(a);
        ctx.strokeStyle = 'rgba(14,34,34,.92)'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(0, 0, R_, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(60,150,150,.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, R_ - 8, 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(14,34,34,.9)'; ctx.lineWidth = 16; for (let i = 0; i < 8; i++) { const an = i * .785; line(ctx, 0, 0, Math.cos(an) * R_, Math.sin(an) * R_); } ctx.fillStyle = 'rgba(20,48,48,.95)'; ctx.beginPath(); ctx.arc(0, 0, 54, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(80,200,190,.35)'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
        for (let i = 0; i < 8; i++) { const an = i * .785 + .39; ctx.fillStyle = 'rgba(100,230,220,.4)'; ctx.fillRect(Math.cos(an) * (R_ - 4) - 4, Math.sin(an) * (R_ - 4) - 4, 8, 8); } ctx.restore(); } },
    arc(bg, ctx, g, cx, cyo, t) { const SW = bg.SW, f = .11, dy = -Math.min(bg.SH - H, cyo * .04), C0 = this.coils; if (!C0 || !C0.length) return;
      const ph = Math.floor(t * 1.3), fire = (t * 1.3 % 1) < .18 && hash(ph, 3) < .75; if (!fire) return; const k = Math.floor(hash(ph, 9) * (C0.length - 1)), A = C0[k], B = C0[k + 1]; const ax = (((A.x - cx * f) % SW) + SW) % SW, bx = (((B.x - cx * f) % SW) + SW) % SW; if (Math.abs(ax - bx) > 600) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; for (let pass = 0; pass < 2; pass++) { ctx.strokeStyle = pass ? 'rgba(235,225,255,.9)' : 'rgba(150,110,255,.45)'; ctx.lineWidth = pass ? 1.5 : 5; ctx.beginPath(); let px = ax, py = A.y + dy; ctx.moveTo(px, py); for (let i = 1; i <= 9; i++) { const kk = i / 9; px = ax + (bx - ax) * kk + (i < 9 ? (hash(ph * 7 + i, pass) - .5) * 40 : 0); py = A.y + dy + (B.y - A.y) * kk + (i < 9 ? (hash(ph * 5 + i, 4) - .5) * 40 : 0); ctx.lineTo(px, py); } ctx.stroke(); } glow(ctx, ax, A.y + dy, 60, '170,140,255', .35); glow(ctx, bx, B.y + dy, 60, '170,140,255', .35); ctx.restore(); },
    furnace(bg, ctx, g, cx, cyo, t) { const SW = bg.SW, f = .11, dy = -Math.min(bg.SH - H, cyo * .04), S0 = this.stacks; if (!S0) return;
      for (const s of S0) { const sx = (((s.x - cx * f) % SW) + SW) % SW; if (sx > W + 60 && sx - SW < -60) continue; for (const o of [0, -SW]) { const bx = sx + o; if (bx < -80 || bx > W + 80) continue; const fl = .6 + .4 * Math.sin(t * 7 + s.x); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const h = 40 + 26 * fl; const gr = ctx.createLinearGradient(0, s.y + dy - 70 - h, 0, s.y + dy - 56); gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(.6, `rgba(255,140,40,${.45 * fl})`); gr.addColorStop(1, `rgba(255,220,120,${.7 * fl})`); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(bx - 20, s.y + dy - 56); ctx.quadraticCurveTo(bx - 14, s.y + dy - 56 - h * .7, bx + Math.sin(t * 3) * 6, s.y + dy - 56 - h); ctx.quadraticCurveTo(bx + 14, s.y + dy - 56 - h * .7, bx + 20, s.y + dy - 56); ctx.fill(); glow(ctx, bx, s.y + dy - 60, 70, '255,130,40', .3 * fl); ctx.restore(); } } },
    heart(bg, ctx, g, cx, cyo, t) { const k = Math.pow(Math.max(0, Math.sin(t * 2.2)), 6), k2 = Math.pow(Math.max(0, Math.sin(t * 2.2 - .5)), 6); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(200,30,30,${.05 + .12 * Math.max(k, k2)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  };

  // ---------------------------------------------------------------- the air of each chapter (screen-space motes drawn over everything)
  const AIR = {
    ash:    { n: 46, col: '216,222,226', a: .32, s: [1, 2.4], vx: -6,  vy: 18,  sway: 10 },
    drip:   { n: 34, col: '150,205,225', a: .45, s: [1, 1.8], vx: 0,   vy: 220, sway: 0, streak: 9 },
    lint:   { n: 40, col: '240,212,140', a: .35, s: [1, 2],   vx: 8,   vy: -10, sway: 18 },
    oil:    { n: 30, col: '30,28,26',    a: .6,  s: [1.4, 2.4], vx: 0, vy: 170, sway: 0, streak: 7 },
    wind:   { n: 38, col: '170,240,235', a: .3,  s: [1, 1.6], vx: -300, vy: 6, sway: 0, streak: 24 },
    static: { n: 40, col: '200,170,255', a: .55, s: [1, 2],   vx: 0,   vy: 0,   sway: 22, blink: 1 },
    ember:  { n: 50, col: '255,150,60',  a: .75, s: [1, 2.4], vx: 12,  vy: -60, sway: 14 },
    spore:  { n: 36, col: '255,120,110', a: .4,  s: [1.2, 2.6], vx: 0, vy: -16, sway: 12 }
  };
  const _bld = Background.prototype.build;
  Background.prototype.build = function (theme) {
    _bld.call(this, theme);
    const A = ART[theme]; this._art = A || null; this._air = null; this.live = null; this.coils = null; this.stacks = null;
    if (!A || !this.layers || this.layers.length < 5) return;
    const e = env(theme, this, A.seed), self = this;
    try { A.l2.call(this, e, this); A.l3.call(this, e, this); A.l4.call(this, e, this); } catch (err) { console.error('bg art', theme, err); }
    if (!A.gears) this.gears = [];
    const air = AIR[A.ambient]; if (air) { const R = rng32(A.seed + 5); this._air = { cfg: air, p: Array.from({ length: air.n }, () => ({ x: R() * W, y: R() * H, s: air.s[0] + R() * (air.s[1] - air.s[0]), ph: R() * 6.28, z: .5 + R() })) }; }
    this.live = LIVE[theme] ? LIVE[theme] : null;
  };
  const _drw = Background.prototype.draw;
  Background.prototype.draw = function (ctx, g, theme, cx, cy) {
    if (this.theme !== theme) this.build(theme);
    if (!this._art || !this.live) return _drw.call(this, ctx, g, theme, cx, cy);
    // same order as the original, with the live landmark slipped in behind the near layers
    const th = THEMES[theme], t = g.time, dt = Math.min(.1, Math.max(0, t - this.lt)); this.lt = t; const q = GFX.q;
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.base, 0, 0); ctx.globalCompositeOperation = 'source-over';
    this.updateEvents(dt, cx);
    const L = this.layers, SW = this.SW, SH = this.SH, cyo = Math.max(0, cy - 272);
    const blit = l => { const ix = Math.floor(((cx * l.f % SW) + SW) % SW), sy = Math.round(Math.min(SH - H, cyo * l.fy)), w1 = Math.min(W, SW - ix); ctx.drawImage(l.c, ix, sy, w1, H, 0, 0, w1, H); if (w1 < W) ctx.drawImage(l.c, 0, sy, W - w1, H, w1, 0, W - w1, H); };
    blit(L[0]);
    if (theme === 'fly' || theme === 'arc' || theme === 'furnace') { try { this.live(this, ctx, g, cx, cyo, t); } catch (e) { /* decoration only */ } }
    blit(L[1]); if (this.gears.length) this.drawGears(ctx, cx, cyo); this.drawEvents(ctx, 1, cx, cyo);
    if (q >= 1) this.fog(ctx, t, cx, H * .52, .5, .18, 7, .08);
    blit(L[2]); this.drawEvents(ctx, 2, cx, cyo);
    if (theme === 'blue' || theme === 'brass' || theme === 'cam') { try { this.live(this, ctx, g, cx, cyo, t); } catch (e) { /* decoration only */ } }
    if (q >= 1) this.fog(ctx, t, cx, H * .7, .5, .2, 12, .2);
    blit(L[3]);
    if (q >= 2) this.fog(ctx, t, cx, H * .84, .55, .18, 18, .34);
    blit(L[4]);
    if (theme === 'heart') { try { this.live(this, ctx, g, cx, cyo, t); } catch (e) { /* decoration only */ } }
  };
  const _mote = Background.prototype.drawMotes;
  Background.prototype.drawMotes = function (ctx, g, cx, cy) {
    _mote.call(this, ctx, g, cx, cy);
    const A = this._air; if (!A || GFX.q < 1) return;
    const c = A.cfg, t = g.time, dtm = Math.min(.05, Math.max(0, t - (this._airT || t))); this._airT = t;
    const n = GFX.q >= 2 ? A.p.length : Math.ceil(A.p.length * .5);
    ctx.save();
    for (let i = 0; i < n; i++) { const m = A.p[i]; m.x += (c.vx * m.z + Math.sin(t * .8 + m.ph) * c.sway * .3) * dtm; m.y += (c.vy * m.z) * dtm;
      if (m.x < -20) m.x += W + 40; if (m.x > W + 20) m.x -= W + 40; if (m.y < -20) m.y += H + 40; if (m.y > H + 20) m.y -= H + 40;
      let a = c.a * m.z; if (c.blink) a *= (.2 + .8 * Math.max(0, Math.sin(t * 11 + m.ph * 5)));
      ctx.fillStyle = `rgba(${c.col},${a})`; ctx.strokeStyle = `rgba(${c.col},${a * .8})`;
      if (c.streak) { ctx.lineWidth = m.s * .9; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - c.vx * .02 * m.z, m.y - c.streak * (c.vy > 100 ? 1 : 0) * m.z); ctx.stroke(); if (c.vx < -100) { ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + c.streak * 1.4, m.y); ctx.stroke(); } }
      else ctx.fillRect(m.x, m.y, m.s, m.s); }
    ctx.restore();
  };
  window.GH_BG_V4 = { ART, LIVE, AIR };
})();
