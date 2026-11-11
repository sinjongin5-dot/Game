// 절차적 픽셀 아트 — 외부 이미지 없이 모든 그래픽을 코드로 생성한다.
(function (root) {
  const X = root.XG;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const OUT = [26, 22, 38];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (h, f) => { const [r, g, b] = hex(h); const k = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))); return `rgb(${k(r)},${k(g)},${k(b)})`; };

  // ── 생물 스프라이트 (32x32) ──
  function creature(look) {
    const cv = mk(48, 48), g = cv.getContext('2d');
    const [c1, c2, c3] = look.c, sz = (look.size || 0.8) * 1.5, shape = look.shape;
    g.translate(24, 45.5); g.scale(sz, sz);
    const ell = (x, y, rx, ry, col, rot) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 7); g.fill(); };
    const tri = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    const dark = shade(c1, 0.72);
    // 머리 위치 (형태별)
    const H = { quad: [-6, -17, 6.5], biped: [0, -20, 6.2], bird: [-3, -20, 5.2], fish: [-5, -12, 6], serpent: [-5, -21, 5.6], blob: [0, -10, 9], golem: [0, -21, 5] }[shape];
    const [hx, hy, hr] = H;
    const tail = (x, y) => {
      const t = look.tail;
      if (t === 'flame') { ell(x + 3, y - 4, 3.2, 4.6, '#f0672e'); ell(x + 3, y - 3, 1.8, 2.8, '#ffcf3a'); line([x - 1, y + 1, x + 2, y - 1], c1, 2); }
      else if (t === 'leaf') { ell(x + 3, y - 3, 2.6, 4.6, '#4fb84a', 0.6); line([x - 1, y + 1, x + 2, y - 1], c1, 1.6); }
      else if (t === 'bolt') tri([x - 1, y, x + 3, y - 3, x + 2, y - 1, x + 6, y - 5, x + 4, y - 7, x + 5, y - 9, x, y - 4, x + 1, y - 2], '#f2c318');
      else if (t === 'fin') tri([x - 1, y, x + 6, y - 6, x + 4, y, x + 6, y + 5], shade(c1, 0.8));
      else if (t === 'thin') line([x - 1, y, x + 4, y - 2, x + 5, y - 7], c1, 1.8);
    };
    const wings = (x, y, s) => { for (const d of [-1, 1]) { tri([x + d * 3, y, x + d * 15 * s, y - 13 * s, x + d * 13 * s, y - 3 * s, x + d * 9 * s, y + 3], look.shape === 'bird' ? dark : c3); tri([x + d * 4, y, x + d * 11 * s, y - 7 * s, x + d * 8 * s, y + 1], look.shape === 'bird' ? c1 : shade(c3, 0.8)); } };

    if (look.wings && shape !== 'bird') wings(shape === 'quad' ? 2 : 0, shape === 'quad' ? -14 : shape === 'blob' ? -10 : -15, shape === 'blob' ? 0.7 : 1);
    if (shape === 'quad') {
      tail(9, -11);
      for (const x of [-8, -4, 3, 7]) rect(x, -5, 3, 5, dark);
      ell(1, -9, 9.5, 6.6, c1); ell(1, -7, 6.5, 3.6, c2);
      if (look.mane) ell(-4, -14, 5.5, 6, c3);
      ell(hx, hy, hr, hr * 0.92, c1); ell(hx - 2.5, hy + 2, 3.6, 2.6, c2);
    } else if (shape === 'biped') {
      tail(5, -6);
      if (look.robe) tri([-4, -15, 4, -15, 9, 0, -9, 0], c1); else { rect(-5, -4, 4, 4, dark); rect(1, -4, 4, 4, dark); ell(0, -9, 6, 7.6, c1); ell(0, -8, 3.8, 5, c2); }
      if (look.robe) rect(-1, -14, 2, 14, c3);
      ell(-7, -11, 2.4, 3.6, c1, 0.3); ell(7, -11, 2.4, 3.6, c1, -0.3);
      if (look.mane) ell(0, -17, 7.5, 4.5, c3);
      ell(hx, hy, hr, hr, look.armor || look.robe ? c2 : c1);
      if (!look.armor && !look.robe) ell(hx - 0.5, hy + 2, 3.8, 2.8, c2);
    } else if (shape === 'bird') {
      tri([4, -6, 11, -1, 8, -8], dark);
      wings(0, -13, 1);
      ell(0, -10, 6.6, 7.6, c1); ell(-1, -8, 4.2, 5, c2);
      rect(-4, -2, 2, 2, c3); rect(2, -2, 2, 2, c3);
      ell(hx, hy, hr, hr, c1);
      tri([hx - hr + 1, hy - 1.2, hx - hr - 4, hy + 0.8, hx - hr + 1, hy + 2.2], c3);
    } else if (shape === 'fish') {
      tri([9, -11, 16, -18, 14, -11, 16, -4], dark);
      tri([-3, -17, 3, -23, 6, -16], dark);
      ell(0, -11, 11, 7, c1); ell(-1, -8.5, 8.5, 3.6, c2);
      tri([0, -8, 5, -3, 6, -9], dark);
      line([-2, -15, -2, -8], shade(c1, 0.8), 1);
    } else if (shape === 'serpent') {
      if (look.tail === 'fin') tri([11, -4, 16, -9, 15, -3, 16, 1], dark);
      line([12, -3, 6, -1, -2, -3, 4, -9, 6, -14, -2, -18], c1, 7.5);
      line([10, -2.5, 5, -0.5, -2, -2], c2, 3);
      ell(hx, hy, hr, hr * 0.9, c1); ell(hx - 2.6, hy + 1.6, 3.2, 2.2, c2);
    } else if (shape === 'blob') {
      tail(8, -6);
      rect(-6, -2, 4, 2, dark); rect(2, -2, 4, 2, dark);
      ell(0, -9, 10, 8.4, c1); ell(0, -4.5, 6.5, 3.2, c2);
      ell(-3, -15, 4, 3, shade(c1, 1.25));
    } else if (shape === 'golem') {
      tail(8, -8);
      rect(-7, -5, 5, 5, dark); rect(2, -5, 5, 5, dark);
      rect(-13, -16, 5, 11, c1); rect(8, -16, 5, 11, c1);
      rect(-8.5, -17, 17, 13, c1); rect(-5.5, -14, 11, 7, c2);
      rect(-5, -25, 10, 8.5, c1);
      rect(-13, -7, 5, 2.5, c3); rect(8, -7, 5, 2.5, c3); rect(-3, -12, 2.5, 2.5, c3); rect(2, -9, 2, 2, c3);
    }
    // 귀/뿔/더듬이
    const e = look.ears;
    if (e === 'point') { tri([hx - hr * 0.9, hy - hr * 0.3, hx - hr * 0.75, hy - hr * 1.75, hx - hr * 0.05, hy - hr * 0.8], c1); tri([hx + hr * 0.9, hy - hr * 0.3, hx + hr * 0.75, hy - hr * 1.75, hx + hr * 0.05, hy - hr * 0.8], c1); }
    else if (e === 'round') { ell(hx - hr * 0.75, hy - hr * 0.85, hr * 0.42, hr * 0.42, c1); ell(hx + hr * 0.75, hy - hr * 0.85, hr * 0.42, hr * 0.42, c1); }
    else if (e === 'leaf') { ell(hx + 1.5, hy - hr - 2.5, 2.2, 4.2, '#4fb84a', 0.5); ell(hx - 1.5, hy - hr - 1.5, 1.8, 3.2, '#7ad060', -0.6); }
    else if (e === 'fin') { tri([hx - hr * 0.6, hy - hr * 0.6, hx - hr * 1.6, hy - hr * 1.3, hx - hr * 0.95, hy + 1], c3); tri([hx + hr * 0.6, hy - hr * 0.6, hx + hr * 1.6, hy - hr * 1.3, hx + hr * 0.95, hy + 1], c3); }
    else if (e === 'antenna') { line([hx - 2, hy - hr + 1, hx - 4, hy - hr - 5], dark, 1); line([hx + 2, hy - hr + 1, hx + 4, hy - hr - 5], dark, 1); ell(hx - 4, hy - hr - 5, 1.3, 1.3, c3); ell(hx + 4, hy - hr - 5, 1.3, 1.3, c3); }
    const hc = shape === 'golem' ? c3 : '#f4f0e0';
    const top = shape === 'blob' ? hy - 7.5 : hy - hr * 0.8;
    if (look.horn === 1) tri([hx - 1.6, top, hx, top - 6, hx + 1.6, top], hc);
    else if (look.horn === 2) { tri([hx - hr * 0.75, top + 1, hx - hr * 0.95, top - 5.5, hx - hr * 0.2, top], hc); tri([hx + hr * 0.75, top + 1, hx + hr * 0.95, top - 5.5, hx + hr * 0.2, top], hc); }
    if (look.armor) { g.fillStyle = '#9aa4b8'; g.beginPath(); g.ellipse(hx, hy - 1, hr + 0.6, hr + 0.4, 0, Math.PI, 0); g.fill(); rect(hx - hr - 0.6, hy - 1.4, hr * 2 + 1.2, 1.6, '#7a8498'); tri([hx - 1, hy - hr - 1, hx + 5, hy - hr - 5, hx + 1, hy - hr], c1); }
    if (look.robe) { tri([hx - hr - 1, hy - 1, hx, hy - hr - 6, hx + hr + 1, hy - 1], c1); }
    // 장비 (카드 몬스터)
    const gr = look.gear;
    if (gr === 'sword') { line([8, -9, 12, -24], '#e4e8f0', 1.8); line([6.5, -12, 10.5, -11], '#c8a040', 1.6); }
    else if (gr === 'dual') { line([8, -9, 13, -21], '#e4e8f0', 1.6); line([-8, -9, -13, -21], '#e4e8f0', 1.6); }
    else if (gr === 'spear') { line([8, -2, 10, -27], '#8a6a48', 1.3); tri([8.4, -27, 10.2, -32, 11.8, -27], '#e4e8f0'); }
    else if (gr === 'staff') { line([8.5, -1, 8.5, -24], '#8a6a48', 1.4); ell(8.5, -26, 2.4, 2.4, c3); }
    else if (gr === 'bow') { g.strokeStyle = '#8a6a48'; g.lineWidth = 1.4; g.beginPath(); g.arc(-6, -12, 8, Math.PI * 0.6, Math.PI * 1.4); g.stroke(); line([-8.4, -19.6, -8.4, -4.4], '#e8e8e8', 0.6); }
    else if (gr === 'shield') { ell(-9, -10, 5, 6, '#607088'); ell(-9, -10, 2.4, 3, '#c8d0e0'); }
    else if (gr === 'club') { line([8, -9, 12, -20], '#8a6a48', 2.6); }
    // 눈
    const eye = (x, y) => { rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2.4, '#1a1626'); rect(Math.round(x) - 1, Math.round(y) - 1, 1, 1, '#ffffff'); };
    if (shape === 'quad' || shape === 'serpent' || shape === 'bird') { eye(hx - hr * 0.45, hy - hr * 0.15); if (shape !== 'bird') eye(hx + hr * 0.35, hy - hr * 0.15); }
    else if (shape === 'fish') eye(-7, -12.5);
    else if (shape === 'golem') { rect(-3.5, -22, 2.2, 2, '#ffe060'); rect(1.3, -22, 2.2, 2, '#ffe060'); }
    else { const ey = shape === 'blob' ? -11 : hy - 0.2, ex = shape === 'blob' ? 3.4 : 2.5; eye(hx - ex, ey); eye(hx + ex, ey); }
    return pixelize(cv);
  }

  // 안티에일리어싱 제거 + 외곽선 + 간단한 명암으로 픽셀 아트화
  function pixelize(cv) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const im = g.getImageData(0, 0, w, h), d = im.data, on = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (on[y * w + x]) {
        d[i + 3] = 255;
        const f = !at(x + 1, y + 1) || !at(x, y + 1) ? 0.78 : !at(x - 1, y - 1) && !at(x, y - 1) ? 1.12 : 1;
        if (f !== 1) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, d[i + k] * f);
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) { d[i] = OUT[0]; d[i + 1] = OUT[1]; d[i + 2] = OUT[2]; d[i + 3] = 255; }
      else d[i + 3] = 0;
    }
    g.putImageData(im, 0, 0);
    return cv;
  }

  // ── 마법/함정 아이콘 (32x32) ──
  function icon(name) {
    const cv = mk(32, 32), g = cv.getContext('2d');
    const P = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
    const E = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    const Lw = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    const D = {
      fire: () => { P([16, 3, 24, 15, 23, 23, 16, 28, 9, 23, 8, 15, 12, 17], '#f0672e'); P([16, 12, 20, 20, 16, 26, 12, 20], '#ffcf3a'); },
      meteor: () => { Lw([26, 4, 14, 16], '#f0a030', 5); Lw([28, 9, 18, 19], '#f0d040', 2); E(11, 20, 7, 7, '#c8502a'); E(9, 18, 2.5, 2.5, '#f08a4a'); },
      heal: () => { E(16, 18, 10, 9, '#58b0e8'); P([16, 3, 22, 14, 10, 14], '#58b0e8'); g.fillStyle = '#fff'; g.fillRect(14, 12, 4, 12); g.fillRect(10, 16, 12, 4); },
      book: () => { g.fillStyle = '#8a5a3a'; g.fillRect(5, 7, 22, 19); g.fillStyle = '#f4ecd8'; g.fillRect(7, 9, 8, 15); g.fillRect(17, 9, 8, 15); Lw([9, 13, 13, 13], '#8a8a8a', 1); Lw([9, 17, 13, 17], '#8a8a8a', 1); Lw([19, 13, 23, 13], '#8a8a8a', 1); Lw([19, 17, 23, 17], '#8a8a8a', 1); },
      bolt: () => P([19, 2, 7, 17, 14, 17, 11, 30, 25, 12, 17, 12], '#f2c318'),
      wind: () => { Lw([4, 10, 20, 10, 24, 6], '#8fe0d8', 3); Lw([6, 17, 26, 17], '#6fd0c8', 3); Lw([4, 24, 18, 24, 22, 28], '#8fe0d8', 3); },
      revive: () => { E(16, 16, 11, 11, '#f5e79a'); E(16, 16, 7, 7, '#fff8d8'); g.fillStyle = '#e0a020'; g.fillRect(14.5, 8, 3, 16); g.fillRect(10, 12, 12, 3); },
      sword: () => { Lw([8, 25, 23, 6], '#e4e8f0', 4); Lw([7, 18, 15, 26], '#c8a040', 3); Lw([6, 27, 9, 24], '#8a5a3a', 3); },
      shield: () => { P([16, 4, 26, 8, 25, 19, 16, 28, 7, 19, 6, 8], '#607088'); P([16, 8, 22, 11, 21, 18, 16, 23, 11, 18, 10, 11], '#c8d0e0'); },
      poison: () => { E(16, 18, 9, 9, '#8a50b8'); g.fillStyle = '#8a50b8'; g.fillRect(13, 4, 6, 8); E(13, 17, 2, 2, '#d8a8f0'); E(19, 21, 1.5, 1.5, '#d8a8f0'); g.fillStyle = '#6a4a3a'; g.fillRect(12, 3, 8, 3); },
      sleep: () => { g.fillStyle = '#b8c8f0'; g.font = 'bold 16px sans-serif'; g.fillText('Z', 5, 26); g.font = 'bold 12px sans-serif'; g.fillText('Z', 15, 17); g.font = 'bold 9px sans-serif'; g.fillText('Z', 22, 10); },
      banner: () => { Lw([8, 4, 8, 28], '#8a6a48', 2.5); P([9, 5, 26, 8, 20, 12, 26, 17, 9, 18], '#e03a3a'); },
      curse: () => { E(16, 14, 10, 10, '#5a4a78'); g.fillStyle = '#5a4a78'; g.fillRect(11, 20, 10, 7); E(12, 13, 2.6, 3, '#1a1626'); E(20, 13, 2.6, 3, '#1a1626'); g.fillStyle = '#1a1626'; g.fillRect(13, 23, 1.5, 4); g.fillRect(16, 23, 1.5, 4); g.fillRect(19, 23, 1.5, 4); },
      recall: () => { g.strokeStyle = '#6fd0c8'; g.lineWidth = 3.5; g.beginPath(); g.arc(16, 16, 9, 0.6, Math.PI * 1.75); g.stroke(); P([20, 3, 28, 9, 19, 13], '#6fd0c8'); },
      cry: () => { P([6, 12, 14, 12, 22, 5, 22, 27, 14, 20, 6, 20], '#f0a030'); Lw([25, 11, 28, 9], '#f0d040', 2); Lw([25, 16, 29, 16], '#f0d040', 2); Lw([25, 21, 28, 23], '#f0d040', 2); },
      mirror: () => { E(16, 15, 10, 12, '#c8a040'); E(16, 15, 7.5, 9.5, '#a8e0f0'); Lw([12, 11, 17, 8], '#ffffff', 1.6); Lw([14, 28, 18, 28], '#c8a040', 3); },
      barrier: () => { g.strokeStyle = '#f5e79a'; g.lineWidth = 3; g.beginPath(); g.arc(16, 22, 13, Math.PI, 0); g.stroke(); g.strokeStyle = '#fff8d8'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, 22, 8, Math.PI, 0); g.stroke(); E(16, 21, 3, 3, '#f5e79a'); },
      pit: () => { E(16, 20, 13, 7, '#6a4a2a'); E(16, 21, 9, 4.5, '#1a1626'); Lw([5, 12, 8, 15], '#b0844a', 2); Lw([27, 12, 24, 15], '#b0844a', 2); },
      thorn: () => { E(16, 16, 7, 7, '#607088'); for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s = Math.sin(a * Math.PI / 4); P([16 + c * 13, 16 + s * 13, 16 + c * 6 - s * 2.5, 16 + s * 6 + c * 2.5, 16 + c * 6 + s * 2.5, 16 + s * 6 - c * 2.5], '#c8d0e0'); } },
      snare: () => { g.strokeStyle = '#f2c318'; g.lineWidth = 2.5; g.beginPath(); g.arc(16, 18, 9, 0, 7); g.stroke(); P([17, 6, 11, 17, 15, 17, 13, 27, 21, 14, 17, 14], '#fff8c8'); },
      backfire: () => { P([16, 28, 8, 16, 9, 8, 16, 3, 23, 8, 24, 16], '#c8381a'); P([16, 24, 12, 16, 16, 9, 20, 16], '#ffcf3a'); Lw([4, 24, 9, 27], '#f0672e', 2); Lw([28, 24, 23, 27], '#f0672e', 2); },
    };
    D.fusion = () => { E(11, 16, 8, 8, '#e8501e'); E(21, 16, 8, 8, '#3c8df0'); E(16, 16, 4.5, 7, '#f5e79a'); Lw([16, 4, 16, 9], '#fff', 2); Lw([16, 23, 16, 28], '#fff', 2); };
    D.sun = () => { for (let a = 0; a < 8; a++) Lw([16 + Math.cos(a * 0.785) * 9, 16 + Math.sin(a * 0.785) * 9, 16 + Math.cos(a * 0.785) * 14, 16 + Math.sin(a * 0.785) * 14], '#f2a03a', 2.5); E(16, 16, 7.5, 7.5, '#ffcf3a'); E(14, 14, 2.5, 2.5, '#fff3c0'); };
    D.rain = () => { E(12, 12, 7, 5, '#b8c8e0'); E(20, 11, 8, 6, '#d0dcf0'); E(16, 15, 10, 4, '#a8b8d0'); Lw([9, 21, 7, 27], '#3c8df0', 2); Lw([16, 21, 14, 28], '#3c8df0', 2); Lw([23, 21, 21, 27], '#3c8df0', 2); };
    D.sand = () => { Lw([4, 9, 22, 9, 26, 6], '#d8b878', 3); Lw([6, 16, 28, 16], '#b0844a', 3); Lw([4, 23, 20, 23, 24, 26], '#d8b878', 3); E(24, 12, 1.5, 1.5, '#b0844a'); E(8, 20, 1.5, 1.5, '#d8b878'); };
    D.seal = () => { E(16, 16, 11, 11, '#b0478a'); E(16, 16, 8, 8, '#f8f0f8'); Lw([9, 9, 23, 23], '#b0478a', 3.5); g.fillStyle = '#5a3a78'; g.fillRect(13, 12, 6, 8); };
    (D[name] || D.book)();
    return pixelize(cv);
  }

  // ── 타일 (16x16) ──
  const TILE = 16;
  const tileCache = {};
  function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) & 0xffff) / 0x10000; }
  function drawTile(ch, frame) {
    const key = ch + frame;
    if (tileCache[key]) return tileCache[key];
    const cv = mk(TILE, TILE), g = cv.getContext('2d'), r = rnd(ch.charCodeAt(0) * 131 + 7);
    const fill = (c) => { g.fillStyle = c; g.fillRect(0, 0, 16, 16); };
    const dots = (c, n, w = 1, h = 1) => { g.fillStyle = c; for (let i = 0; i < n; i++) g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), w, h); };
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const grass = () => { fill('#62bf5c'); dots('#52aa50', 9); dots('#7fd070', 5); };
    const roof = (c) => { fill(c); for (let y = 3; y < 16; y += 4) R(0, y, 16, 1, shade(c, 0.78)); for (let y = 0; y < 16; y += 4) for (let x = (y % 8) ? 0 : 4; x < 16; x += 8) R(x, y, 1, 3, shade(c, 0.78)); R(0, 0, 16, 1, shade(c, 1.25)); };
    const floor = () => { fill('#d0a468'); for (let y = 0; y < 16; y += 4) R(0, y + 3, 16, 1, '#b88a50'); R(5, 0, 1, 3, '#b88a50'); R(11, 4, 1, 3, '#b88a50'); R(3, 8, 1, 3, '#b88a50'); R(13, 12, 1, 3, '#b88a50'); };
    switch (ch) {
      case '.': grass(); break;
      case ',': grass(); R(3, 4, 2, 2, '#f8f0f0'); R(4, 5, 1, 1, '#f2c318'); R(10, 9, 2, 2, '#f090b0'); R(11, 10, 1, 1, '#f2c318'); R(6, 12, 2, 2, '#f8f0a0'); break;
      case ':': fill('#3f9a48'); for (let x = 0; x < 16; x += 4) for (let y = (x % 8 ? 2 : 0) + (frame ? 1 : 0); y < 16; y += 6) { R(x + 1, y, 1, 4, '#2c7a38'); R(x, y + 1, 1, 3, '#58b85a'); R(x + 2, y + 1, 1, 3, '#58b85a'); } break;
      case '=': fill('#e6cf98'); dots('#d4b97c', 8); dots('#f2e2b8', 5); break;
      case 's': fill('#f2e2a8'); dots('#e2cc88', 8); dots('#fff4c8', 4); break;
      case '~': fill('#3f8ee8'); { const o = frame ? 4 : 0; g.fillStyle = '#7ab8f8'; for (const [x, y] of [[1, 3], [9, 7], [4, 12], [12, 14]]) g.fillRect((x + o) % 16, y, 4, 1); g.fillStyle = '#2a70c8'; for (const [x, y] of [[6, 2], [13, 10], [2, 8]]) g.fillRect((x + o) % 16, y, 3, 1); } break;
      case 'b': fill('#3f8ee8'); R(0, 2, 16, 12, '#b88a50'); for (let x = 0; x < 16; x += 4) R(x, 2, 1, 12, '#8a6038'); R(0, 2, 16, 1, '#6a4828'); R(0, 13, 16, 1, '#6a4828'); break;
      case 'T': grass(); R(7, 10, 3, 6, '#7a5030'); g.fillStyle = '#2f8a3c'; g.beginPath(); g.arc(8, 7, 7, 0, 7); g.fill(); g.fillStyle = '#48a850'; g.beginPath(); g.arc(6, 5, 4, 0, 7); g.fill(); R(4, 3, 2, 1, '#70c868'); R(10, 9, 3, 2, '#1f6a2c'); break;
      case '^': fill('#8a8478'); R(0, 0, 16, 2, '#a8a294'); g.fillStyle = '#6a6458'; g.beginPath(); g.moveTo(0, 16); g.lineTo(5, 5); g.lineTo(9, 16); g.fill(); g.beginPath(); g.moveTo(7, 16); g.lineTo(12, 3); g.lineTo(16, 16); g.fill(); R(5, 6, 1, 3, '#b8b2a4'); R(12, 4, 1, 4, '#b8b2a4'); break;
      case '#': fill('#3a3040'); R(0, 0, 16, 3, '#5a4c5c'); dots('#2a2230', 8, 2, 2); dots('#6a5a6c', 4); R(0, 15, 16, 1, '#1a1622'); break;
      case '_': fill('#8a7868'); dots('#7a6858', 9); dots('#9c8a78', 5); break;
      case ';': fill('#7a6858'); dots('#5a4a40', 10, 2, 1); dots('#9c8a78', 6); R(3, 4, 3, 2, '#5a4a40'); R(10, 10, 3, 2, '#5a4a40'); break;
      case 'f': grass(); R(0, 5, 16, 2, '#c8a070'); R(0, 10, 16, 2, '#c8a070'); R(2, 3, 2, 11, '#a07848'); R(11, 3, 2, 11, '#a07848'); break;
      case 'S': grass(); R(7, 9, 2, 6, '#7a5030'); R(2, 3, 12, 7, '#c8a070'); R(2, 3, 12, 1, '#e0c090'); R(4, 5, 8, 1, '#7a5030'); R(4, 7, 6, 1, '#7a5030'); break;
      case 'R': roof('#d8553a'); break;
      case 'B': roof('#3f78d0'); break;
      case 'P': roof('#8a58c0'); break;
      case 'G': roof('#3f9a58'); break;
      case 'Y': roof('#e0a830'); break;
      case 'H': roof('#e86a8a'); break;
      case 'W': fill('#f0e4c8'); R(0, 13, 16, 3, '#b8a888'); R(0, 0, 16, 1, '#c8b898'); break;
      case 'w': fill('#f0e4c8'); R(0, 13, 16, 3, '#b8a888'); R(0, 0, 16, 1, '#c8b898'); R(4, 3, 8, 7, '#5a7ab8'); R(4, 3, 8, 1, '#3a4a78'); R(7.5, 3, 1, 7, '#f0e4c8'); R(5, 4, 2, 2, '#a8d0f8'); break;
      case 'D': fill('#f0e4c8'); R(3, 1, 10, 15, '#7a5030'); R(4, 2, 8, 14, '#a06a40'); R(10, 9, 1, 2, '#f2c318'); R(3, 1, 10, 1, '#5a3820'); break;
      case 'C': fill('#6a6458'); g.fillStyle = '#1a1622'; g.beginPath(); g.arc(8, 16, 7, Math.PI, 0); g.fill(); R(1, 9, 14, 7, '#1a1622'); g.fillStyle = '#6a6458'; R(0, 9, 1, 7, '#6a6458'); R(15, 9, 1, 7, '#6a6458'); g.fillStyle = '#1a1622'; g.beginPath(); g.arc(8, 9, 7, Math.PI, 0); g.fill(); break;
      case 'o': floor(); break;
      case 'a': fill('#e8e0d0'); R(0, 0, 16, 1, '#c8c0b0'); R(0, 0, 1, 16, '#c8c0b0'); R(8, 0, 1, 16, '#d8d0c0'); R(0, 8, 16, 1, '#d8d0c0'); break;
      case 'x': fill('#6a5a80'); R(0, 12, 16, 4, '#4a3c60'); R(0, 0, 16, 2, '#8474a0'); for (let x = 3; x < 16; x += 6) R(x, 3, 1, 8, '#5a4a70'); break;
      case 'c': floor(); R(0, 2, 16, 12, '#8a5a3a'); R(0, 2, 16, 4, '#c89868'); R(0, 2, 16, 1, '#e0b888'); break;
      case 'm': floor(); R(1, 3, 14, 13, '#c83a3a'); R(3, 5, 10, 11, '#e06060'); break;
      case 't': floor(); R(1, 3, 14, 9, '#a87848'); R(1, 3, 14, 2, '#c89868'); R(2, 12, 2, 3, '#7a5030'); R(12, 12, 2, 3, '#7a5030'); break;
      case 'h': floor(); R(1, 1, 14, 13, '#e8e8f0'); R(1, 1, 14, 2, '#f8f8ff'); R(3, 5, 10, 6, '#f090a8'); R(7, 6, 2, 4, '#fff'); R(6, 7, 4, 2, '#fff'); R(1, 13, 14, 1, '#a8a8b8'); break;
      case 'k': fill('#7a5030'); R(1, 1, 14, 14, '#5a3820'); for (let y = 2; y < 14; y += 4) { R(2, y, 12, 3, '#2a1a10'); let x = 2; for (const c of ['#c84040', '#4070c8', '#48a850', '#e0b030', '#8a50b8', '#e8e8e8']) { R(x, y, 2, 3, c); x += 2; } } break;
      case 'p': floor(); R(5, 10, 6, 5, '#b86a48'); g.fillStyle = '#3f9a48'; g.beginPath(); g.arc(8, 6, 5, 0, 7); g.fill(); R(6, 3, 2, 2, '#62bf5c'); break;
      case 'z': fill('#e8e0d0'); R(4, 11, 8, 4, '#a8a294'); R(6, 3, 4, 8, '#c8c2b4'); R(5, 1, 6, 4, '#d8d2c4'); R(4, 11, 8, 1, '#c8c2b4'); break;
      case 'e': fill('#2a2438'); R(0, 0, 16, 1, '#f5e79a'); R(0, 15, 16, 1, '#f5e79a'); R(7, 0, 2, 16, '#3a3450'); break; // 듀얼 필드 바닥
      case '1': fill('#8f897c'); dots('#7d776b', 9, 2, 1); dots('#a59f92', 5); break; // 바위 지대 바닥
      case '2': fill('#2a2230'); dots('#221a28', 8, 2, 2); break; // 동굴 벽 밑
      case '3': fill('#5a5248'); break; // 건물 기초
      case '4': fill('#cfc6b4'); R(0, 0, 16, 1, '#b5ac9a'); R(7, 0, 1, 16, '#bdb4a2'); R(0, 8, 16, 1, '#bdb4a2'); break; // 현관 포장
      case '5': fill('#cfc6b4'); R(2, 2, 12, 12, '#b0473a'); R(4, 4, 8, 8, '#d06a5a'); break; // 현관 매트
      case '6': fill('#2c2440'); break; // 실내 벽 밑
      default: fill('#ff00ff');
    }
    return (tileCache[key] = cv);
  }

  // ── 캐릭터 (16x16, 4방향 x 2프레임) ──
  const LOOKS = {
    hero: { hair: '#5a3a28', top: '#e04848', bot: '#3a4a78', hat: '#e04848' },
    mom: { hair: '#8a5a3a', top: '#f0a0b0', bot: '#f0e0d0' },
    prof: { hair: '#c8c8d0', top: '#f4f4f4', bot: '#6a5a48' },
    leon: { hair: '#f0c040', top: '#3f78d0', bot: '#2a2a3a' },
    mira: { hair: '#8a58c0', top: '#2a2438', bot: '#2a2438', coat: '#c8a040' },
    tamer_m: { hair: '#3a2a20', top: '#48a850', bot: '#5a4a38', hat: '#f0f0f0' },
    tamer_f: { hair: '#c86a3a', top: '#f0a030', bot: '#3a6a8a' },
    duelist_m: { hair: '#2a2a3a', top: '#3a3450', bot: '#2a2438', coat: '#3f78d0' },
    duelist_f: { hair: '#e8e0f0', top: '#5a3a78', bot: '#2a2438', coat: '#e86a8a' },
    kid: { hair: '#5a3a28', top: '#f2c318', bot: '#3f78d0' },
    elder: { hair: '#e8e8e8', top: '#7a6a58', bot: '#5a4a38' },
    nurse: { hair: '#f090a8', top: '#fff0f4', bot: '#fff0f4', hat: '#fff0f4' },
    clerk: { hair: '#3a2a20', top: '#3f9a58', bot: '#f0f0f0' },
    fisher: { hair: '#5a5a6a', top: '#58b0e8', bot: '#8a7a58', hat: '#e8d8a0' },
    grunt: { hair: '#2a2a2a', top: '#4a4a58', bot: '#2a2a2a', hat: '#8a2a3a' },
    admin: { hair: '#8a2a3a', top: '#2a2a2a', bot: '#2a2a2a', coat: '#8a2a3a' },
    zero: { hair: '#f0f0f8', top: '#1a1626', bot: '#1a1626', coat: '#f0f0f8' },
    gaon: { hair: '#3f9a48', top: '#e8f7c0', bot: '#5a4a38' },
    sera: { hair: '#58b0e8', top: '#f4f4ff', bot: '#3f78d0', coat: '#3f78d0' },
    mujin: { hair: '#c8381a', top: '#3a3030', bot: '#5a3020' },
    noah: { hair: '#1a1626', top: '#5a3a78', bot: '#1a1626', coat: '#3a2a58' },
    aria: { hair: '#f5e79a', top: '#f8f8ff', bot: '#c8a040', coat: '#e03a3a' },
  };
  // 캐릭터: 24x32, 4방향 x 4프레임 걷기 (0·2 서기, 1·3 발 내딛기)
  const charCache = {};
  function drawChar(lookName, dir, frame) {
    frame = frame || 0;
    const key = lookName + dir + frame;
    if (charCache[key]) return charCache[key];
    const L = LOOKS[lookName] || LOOKS.kid, cv = mk(24, 32), g = cv.getContext('2d');
    const skin = '#f8d0a8', skinD = '#e0a880', body = L.coat || L.top, bodyD = shade(body, 0.78), hairL = shade(L.hair, 1.28), shoe = '#2a2230';
    const step = frame === 1 ? 1 : frame === 3 ? -1 : 0, bob = step ? -1 : 0;
    const side = dir === 'left' || dir === 'right';
    if (dir === 'right') { g.translate(24, 0); g.scale(-1, 1); }
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y + bob, w, h); };
    const F = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); }; // 발은 들썩이지 않는다
    if (side) {
      // 다리 (앞뒤로 교차)
      F(9 - step * 2, 24, 3, 6 - (step > 0 ? 1 : 0), L.bot); F(9 - step * 2 - 1, 29 - (step > 0 ? 1 : 0), 4, 2, shoe);
      F(12 + step * 2, 24, 3, 6 - (step < 0 ? 1 : 0), shade(L.bot, 0.85)); F(12 + step * 2 - 1, 29 - (step < 0 ? 1 : 0), 4, 2, shoe);
      R(8, 15, 8, 9, body); R(8, 22, 8, 2, bodyD); if (L.coat) R(8, 15, 2, 9, L.top);
      R(11 + step, 16, 3, 6, bodyD); R(11 + step, 22, 3, 2, skin);
      R(5, 6, 14, 9, skin); R(5, 13, 9, 2, skinD);
      R(5, 2, 14, 5, L.hair); R(11, 7, 8, 7, L.hair); R(12, 14, 6, 1, shade(L.hair, 0.8)); R(5, 7, 3, 2, L.hair); R(7, 3, 6, 1, hairL);
      R(7, 10, 2, 3, '#1a1626'); R(7, 10, 1, 1, '#fff'); R(6, 13, 2, 1, '#c07860');
      if (L.hat) { R(4, 1, 16, 4, L.hat); R(2, 5, 9, 1, shade(L.hat, 0.72)); R(7, 1, 8, 1, shade(L.hat, 1.25)); }
    } else {
      F(8, 24, 3, 6 - (step > 0 ? 2 : 0), L.bot); F(8, 29 - (step > 0 ? 2 : 0), 3, 2, shoe);
      F(13, 24, 3, 6 - (step < 0 ? 2 : 0), L.bot); F(13, 29 - (step < 0 ? 2 : 0), 3, 2, shoe);
      R(7, 15, 10, 9, body); R(7, 22, 10, 2, bodyD);
      R(5, 16 + step, 2, 6, body); R(5, 22 + step, 2, 2, skin); R(17, 16 - step, 2, 6, body); R(17, 22 - step, 2, 2, skin);
      R(5, 6, 14, 9, skin);
      if (dir === 'down') {
        if (L.coat) { R(11, 15, 2, 9, L.top); R(9, 15, 6, 1, shade(body, 1.2)); } else R(10, 15, 4, 1, skinD);
        R(5, 13, 14, 2, skinD); R(6, 13, 12, 1, skin);
        R(5, 2, 14, 5, L.hair); R(4, 4, 1, 8, L.hair); R(19, 4, 1, 8, L.hair); R(5, 7, 4, 2, L.hair); R(15, 7, 4, 2, L.hair); R(9, 7, 6, 1, L.hair); R(8, 3, 6, 1, hairL);
        R(8, 10, 2, 3, '#1a1626'); R(14, 10, 2, 3, '#1a1626'); R(8, 10, 1, 1, '#fff'); R(14, 10, 1, 1, '#fff'); R(11, 13, 2, 1, '#c07860'); R(6, 12, 2, 1, '#f0a8a0'); R(16, 12, 2, 1, '#f0a8a0');
        if (L.hat) { R(4, 1, 16, 4, L.hat); R(4, 5, 16, 1, shade(L.hat, 0.72)); R(7, 1, 8, 1, shade(L.hat, 1.25)); }
      } else {
        R(4, 2, 16, 12, L.hair); R(5, 14, 14, 1, shade(L.hair, 0.8)); R(8, 3, 6, 1, hairL); R(6, 9, 12, 1, shade(L.hair, 0.88));
        if (L.hat) { R(4, 1, 16, 4, L.hat); R(4, 5, 16, 1, shade(L.hat, 0.72)); }
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const im = g.getImageData(0, 0, 24, 32), d = im.data, on = [];
    for (let i = 0; i < 768; i++) on[i] = d[i * 4 + 3] > 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) {
      if (on[y * 24 + x]) continue;
      if ((x > 0 && on[y * 24 + x - 1]) || (x < 23 && on[y * 24 + x + 1]) || (y > 0 && on[(y - 1) * 24 + x]) || (y < 31 && on[(y + 1) * 24 + x])) { const i = (y * 24 + x) * 4; d[i] = OUT[0]; d[i + 1] = OUT[1]; d[i + 2] = OUT[2]; d[i + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    return (charCache[key] = cv);
  }

  // ── 2.5D 소품: 지면 위에 세워지는 스프라이트 (폭 16px, 높이 가변) ──
  const PROP_H = { T: 30, '^': 24, '#': 26, f: 12, S: 16, C: 24, ':': 7, xb: 30, xs: 8, k: 26, p: 22, t: 11, c: 13, h: 22, z: 26 };
  const propCache = {};
  function prop(key) {
    if (propCache[key]) return propCache[key];
    const h = PROP_H[key], cv = mk(16, h), g = cv.getContext('2d');
    const R = (x, y, w, hh, c) => { g.fillStyle = c; g.fillRect(x, y, w, hh); };
    const Cc = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    switch (key) {
      case 'T': R(6, 21, 4, 9, '#6a4428'); R(6, 21, 1, 9, '#8a5c38'); Cc(8, 12, 8, '#256e30'); Cc(8, 10, 7.5, '#2f8a3c'); Cc(6, 7, 4.5, '#48a850'); Cc(11, 13, 3.5, '#1f5f2a'); R(4, 5, 2, 1, '#7ad070'); R(6, 4, 2, 1, '#7ad070'); break;
      case '^': R(0, 5, 16, 19, '#827c70'); g.fillStyle = '#9a9488'; g.beginPath(); g.moveTo(0, 8); g.lineTo(4, 1); g.lineTo(8, 6); g.lineTo(12, 0); g.lineTo(16, 7); g.lineTo(16, 12); g.lineTo(0, 12); g.fill(); R(3, 3, 1, 6, '#b8b2a4'); R(11, 2, 1, 7, '#b8b2a4'); R(0, 20, 16, 4, '#69645a'); R(6, 12, 1, 7, '#69645a'); R(13, 14, 1, 6, '#69645a'); break;
      case '#': R(0, 0, 16, 26, '#3f3446'); R(0, 0, 16, 3, '#66566a'); R(0, 3, 16, 1, '#2a2230'); R(4, 7, 1, 9, '#2a2230'); R(11, 12, 1, 10, '#2a2230'); R(7, 16, 3, 1, '#2a2230'); R(0, 22, 16, 4, '#2a2230'); R(1, 9, 2, 1, '#5a4c5c'); R(12, 6, 2, 1, '#5a4c5c'); break;
      case 'f': R(0, 3, 16, 2, '#d0a878'); R(0, 7, 16, 2, '#b89060'); R(2, 0, 3, 12, '#a07848'); R(11, 0, 3, 12, '#a07848'); R(2, 0, 3, 1, '#d0a878'); R(11, 0, 3, 1, '#d0a878'); break;
      case 'S': R(7, 8, 2, 8, '#6a4428'); R(1, 1, 14, 8, '#c8a070'); R(1, 1, 14, 1, '#e8c898'); R(1, 8, 14, 1, '#8a6038'); R(3, 3, 10, 1, '#6a4428'); R(3, 5, 7, 1, '#6a4428'); break;
      case 'C': R(0, 0, 16, 24, '#827c70'); R(0, 0, 16, 3, '#9a9488'); Cc(8, 13, 7, '#141018'); R(1, 13, 14, 11, '#141018'); R(3, 20, 10, 4, '#2a2230'); break;
      case ':': g.fillStyle = '#2c7a38'; for (let x = 0; x < 16; x += 2) g.fillRect(x, (x * 7) % 3, 1, 7); g.fillStyle = '#58b85a'; for (let x = 1; x < 16; x += 4) g.fillRect(x, 1 + (x % 3), 1, 6); break;
      case 'xb': R(0, 0, 16, 30, '#75658e'); R(0, 0, 16, 3, '#9484ae'); R(0, 24, 16, 6, '#4c3e64'); R(0, 23, 16, 1, '#3a2e50'); R(7, 4, 1, 18, '#685880'); R(15, 4, 1, 18, '#685880'); break;
      case 'xs': R(0, 0, 16, 8, '#4c3e64'); R(0, 0, 16, 2, '#75658e'); break;
      case 'k': R(0, 0, 16, 26, '#5a3820'); R(0, 0, 16, 2, '#8a6038'); for (let y = 3; y < 24; y += 7) { R(1, y, 14, 6, '#24160c'); let x = 1; for (const c of ['#c84040', '#4070c8', '#48a850', '#e0b030', '#8a50b8', '#e8e8e8', '#d07030']) { R(x, y + (x % 3 ? 0 : 1), 2, 6 - (x % 3 ? 0 : 1), c); x += 2; } } break;
      case 'p': R(4, 14, 8, 8, '#b86a48'); R(4, 14, 8, 2, '#d08a68'); Cc(8, 8, 6.5, '#2f8a3c'); Cc(6, 6, 3.5, '#58b85a'); Cc(11, 10, 3, '#256e30'); break;
      case 't': R(0, 0, 16, 5, '#c89868'); R(0, 0, 16, 1, '#e8b888'); R(0, 5, 16, 2, '#8a5c38'); R(1, 7, 2, 4, '#6a4428'); R(13, 7, 2, 4, '#6a4428'); break;
      case 'c': R(0, 0, 16, 4, '#d8a878'); R(0, 0, 16, 1, '#f0c898'); R(0, 4, 16, 9, '#8a5a3a'); R(0, 4, 16, 1, '#6a4428'); R(7, 6, 1, 6, '#74482c'); break;
      case 'h': R(1, 2, 14, 20, '#dcdce8'); R(1, 2, 14, 2, '#f8f8ff'); R(3, 6, 10, 7, '#28324a'); R(4, 7, 8, 5, '#58d0c0'); R(7, 8, 2, 3, '#fff'); R(6, 9, 4, 1, '#fff'); R(3, 15, 3, 2, '#f090a8'); R(8, 15, 5, 2, '#a8a8b8'); R(1, 20, 14, 2, '#a8a8b8'); break;
      case 'z': R(3, 20, 10, 6, '#a8a294'); R(3, 20, 10, 1, '#c8c2b4'); R(5, 8, 6, 12, '#c8c2b4'); Cc(8, 5, 3.5, '#d8d2c4'); R(3, 9, 2, 7, '#b8b2a4'); R(11, 9, 2, 7, '#b8b2a4'); R(5, 8, 1, 12, '#e0dacc'); break;
    }
    return (propCache[key] = { url: cv.toDataURL(), h });
  }
  // 건물 정면 벽 텍스처: 창문/문/간판을 한 장에 그린다 (칸당 16x24)
  function wallTex(chars, kinds) {
    const n = chars.length, cv = mk(n * 16, 24), g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    R(0, 0, n * 16, 24, '#f2e6cc'); R(0, 0, n * 16, 2, '#c8b898'); R(0, 20, n * 16, 4, '#b8a888'); R(0, 0, 1, 24, '#d8c8a8'); R(n * 16 - 1, 0, 1, 24, '#d8c8a8');
    for (let i = 0; i < n; i++) {
      const x = i * 16, c = chars[i];
      if (c === 'w') { R(x + 3, 6, 10, 10, '#3a4a78'); R(x + 4, 7, 8, 8, '#6a9ad8'); R(x + 7.5, 7, 1, 8, '#3a4a78'); R(x + 4, 10.5, 8, 1, '#3a4a78'); R(x + 5, 8, 2, 2, '#c8e4ff'); R(x + 2, 16, 12, 1, '#c8b898'); }
      else if (c === 'D') {
        R(x + 3, 9, 10, 15, '#5a3820'); R(x + 4, 10, 8, 14, '#a06a40'); R(x + 4, 10, 8, 1, '#c08a58'); R(x + 10, 17, 1, 2, '#f2c318');
        const k = kinds[i]; if (!k) continue;
        const P = (a, b, w, h, col) => R(x + 2 + a, -1 + b, w, h, col);
        P(-1, 0, 14, 10, '#1a1626'); P(0, 1, 12, 8, '#f8f4e8');
        if (k === 'heal') { P(5, 2, 2, 6, '#e03a5a'); P(3, 4, 6, 2, '#e03a5a'); }
        else if (k === 'mart') { P(3, 2, 6, 6, '#e0a820'); P(5, 3, 2, 4, '#fff3c0'); }
        else if (k === 'cards') { P(2, 2, 5, 6, '#8a58c0'); P(5, 3, 5, 5, '#2f9a8a'); P(7, 4, 1, 3, '#fff'); }
        else if (k === 'gym') { P(2, 5, 8, 3, '#3f9a48'); P(2, 2, 2, 2, '#3f9a48'); P(5, 2, 2, 2, '#3f9a48'); P(8, 2, 2, 2, '#3f9a48'); }
        else if (k === 'hall') { P(3, 2, 6, 6, '#3a2a58'); P(5, 3, 2, 4, '#f2c94c'); P(4, 4, 4, 2, '#f2c94c'); }
        else if (k === 'arena') { P(2, 2, 8, 3, '#e0a820'); P(4, 5, 4, 2, '#e0a820'); P(3, 7, 6, 1, '#8a6a20'); }
        else { P(5, 2, 2, 2, '#58b0e8'); P(3, 4, 6, 4, '#58b0e8'); P(4, 5, 2, 2, '#d6f0ff'); }
      }
    }
    return cv.toDataURL();
  }

  const artCache = {}, urlCache = {};
  X.Art = {
    TILE, drawTile, drawChar, LOOKS, prop, wallTex,
    tileUrl(ch) { return urlCache['t' + ch] || (urlCache['t' + ch] = drawTile(ch, 0).toDataURL()); },
    charFrame(look, dir, f) { const k = 'f' + look + dir + f; return urlCache[k] || (urlCache[k] = drawChar(look, dir, f).toDataURL()); },
    beast(id) { return artCache['b' + id] || (artCache['b' + id] = creature(X.BEASTS[id].look)); },
    card(id) { const c = X.CARDS[id]; return artCache['c' + id] || (artCache['c' + id] = c.kind === 'mon' ? creature(c.look) : icon(c.icon)); },
    beastUrl(id) { return urlCache['b' + id] || (urlCache['b' + id] = this.beast(id).toDataURL()); },
    cardUrl(id) { return urlCache['c' + id] || (urlCache['c' + id] = this.card(id).toDataURL()); },
    // 얼굴 위주로 자른 정사각 아이콘 / 대화용 상반신 초상
    charUrl(look, dir = 'down') { const k = 'h' + look + dir; if (!urlCache[k]) { const c = mk(24, 24); c.getContext('2d').drawImage(drawChar(look, dir, 0), 0, 0); urlCache[k] = c.toDataURL(); } return urlCache[k]; },
    portrait(look) { const k = 'p' + look; if (!urlCache[k]) { const c = mk(22, 24); c.getContext('2d').drawImage(drawChar(look, 'down', 0), -1, 0); urlCache[k] = c.toDataURL(); } return urlCache[k]; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
