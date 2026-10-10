// ================= TILES · PATCH v4 : every chapter is built out of its own material =================
// The base renderer paints one riveted-steel wall for every chapter and only tints it. This adds per-theme surface detail on top
// (frost drifts, moss and flanged pipes, embossed brass plate, machined panels, porthole rings, ceramic ribs, firebrick, muscle) and a theme-coloured top lip.
(() => {
  'use strict';
  const LIP = { blue: ['#8a9aa6', '#d8e4ea'], pipes: ['#3d5a4c', '#7fb596'], brass: null, furnace: ['#3a2a22', '#8a4a2a'], cam: ['#6a4a1a', '#ffb050'], fly: ['#24464a', '#7fe8e0'], arc: ['#3a2f66', '#b9a0ff'], heart: ['#5a1814', '#d8483c'] };
  const _dts = drawTileStatic;
  drawTileStatic = function (ctx, tm, c, tx, ty) {
    _dts(ctx, tm, c, tx, ty);
    if (c !== '#') return;
    const th = tm.theme, x = tx * TS, y = ty * TS, h = hash(tx, ty), h2 = hash(tx + 17, ty * 3 + 5), h3 = hash(tx * 5 + 3, ty + 29), h4 = hash(ty * 7 + 1, tx * 11 + 2);
    const S = (a, b) => { const q = tm.get(a, b); return SOLID.has(q) && q !== 'D' && q !== 'R' && q !== 'F' && q !== 'W'; };
    const up = !S(tx, ty - 1), dn = !S(tx, ty + 1), lf = !S(tx - 1, ty), rt = !S(tx + 1, ty), edge = up || dn || lf || rt;
    const lip = LIP[th]; if (up && lip) { ctx.fillStyle = lip[0]; ctx.fillRect(x, y, TS, 4); ctx.fillStyle = lip[1]; ctx.fillRect(x, y, TS, 1); }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, TS); ctx.clip();
    switch (th) {
      case 'blue':   // frost-dusted, long-dead city
        if (up) { ctx.fillStyle = 'rgba(226,236,242,.62)'; ctx.fillRect(x, y, TS, 2 + ((h2 * 3) | 0)); for (let i = 0; i < 3; i++) { if (hash(tx + i * 7, ty) < .6) { ctx.fillStyle = 'rgba(226,236,242,.5)'; ctx.fillRect(x + 2 + i * 10, y + 2, 6 + ((h3 * 5) | 0), 3); } } }
        if (h4 < .2 && !up) { ctx.strokeStyle = 'rgba(190,215,230,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 6 + h * 12, y + 3); ctx.lineTo(x + 12 + h2 * 8, y + 14); ctx.lineTo(x + 8 + h3 * 10, y + 26); ctx.stroke(); }
        if (h3 > .86 && !edge) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 4, y + 6, TS - 8, 3); ctx.fillStyle = 'rgba(210,225,235,.12)'; ctx.fillRect(x + 4, y + 9, TS - 8, 1); }
        break;
      case 'pipes':  // damp, mossy, full of flanged lines
        if (!edge && h2 > .74) { const py = y + 7 + ((h3 * 12) | 0); ctx.fillStyle = '#0f1a16'; ctx.fillRect(x, py, TS, 11); ctx.fillStyle = '#2c4a3d'; ctx.fillRect(x, py + 1, TS, 8); ctx.fillStyle = 'rgba(160,230,190,.22)'; ctx.fillRect(x, py + 2, TS, 2); ctx.fillStyle = '#0f1a16'; ctx.fillRect(x + 10, py - 2, 5, 15); ctx.fillStyle = '#3c6552'; ctx.fillRect(x + 10, py - 2, 5, 2); }
        if (up && h < .6) { ctx.fillStyle = 'rgba(96,160,92,.55)'; for (let i = 0; i < 4; i++) { const mx = x + i * 8 + ((hash(tx + i, ty) * 4) | 0); ctx.beginPath(); ctx.arc(mx + 3, y + 3, 3 + hash(i, tx) * 3, Math.PI, 0); ctx.fill(); } }
        if (edge && h4 > .45) { const g = ctx.createLinearGradient(0, y, 0, y + TS); g.addColorStop(0, 'rgba(40,110,90,.38)'); g.addColorStop(1, 'rgba(40,110,90,0)'); ctx.fillStyle = g; ctx.fillRect(x + 3 + ((h2 * 20) | 0), y, 3, TS * .9); }
        break;
      case 'brass':  // embossed brass plating, big bolts, gear emboss
        ctx.strokeStyle = 'rgba(214,170,80,.34)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 3.5, y + 3.5, TS - 7, TS - 7); ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.strokeRect(x + 4.5, y + 4.5, TS - 7, TS - 7);
        for (const [bx, by] of [[7, 7], [TS - 7, 7], [7, TS - 7], [TS - 7, TS - 7]]) { ctx.fillStyle = '#7a5a22'; circ(ctx, x + bx, y + by, 2.4); ctx.fillStyle = '#e0bd70'; circ(ctx, x + bx - .6, y + by - .6, 1.2); }
        if (h3 < .2 && !edge) { ctx.strokeStyle = 'rgba(224,189,112,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 16, y + 16, 8, 0, 7); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i * .785; line(ctx, x + 16 + Math.cos(a) * 8, y + 16 + Math.sin(a) * 8, x + 16 + Math.cos(a) * 11, y + 16 + Math.sin(a) * 11); } }
        break;
      case 'cam':    // machined bays with hazard striping
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 4, y + 4, TS - 8, TS - 8); ctx.strokeStyle = 'rgba(255,160,70,.16)'; ctx.lineWidth = 1; ctx.strokeRect(x + 4.5, y + 4.5, TS - 9, TS - 9);
        if (dn || (h3 < .18 && !edge)) { ctx.save(); ctx.beginPath(); ctx.rect(x, y + TS - 6, TS, 5); ctx.clip(); ctx.fillStyle = '#c98a2a'; ctx.fillRect(x, y + TS - 6, TS, 5); ctx.fillStyle = '#15120a'; for (let i = -8; i < TS + 8; i += 10) { ctx.beginPath(); ctx.moveTo(x + i, y + TS); ctx.lineTo(x + i + 5, y + TS); ctx.lineTo(x + i + 10, y + TS - 6); ctx.lineTo(x + i + 5, y + TS - 6); ctx.fill(); } ctx.restore(); }
        if (!edge && h2 > .5) { ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) circ(ctx, x + 9 + i * 7, y + 9 + j * 7, 1); }
        break;
      case 'fly':    // smooth steel, port rings and long grooves
        ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) line(ctx, x + 2, y + 8 + i * 9, x + TS - 2, y + 8 + i * 9);
        ctx.strokeStyle = 'rgba(120,235,225,.12)'; for (let i = 0; i < 3; i++) line(ctx, x + 2, y + 9 + i * 9, x + TS - 2, y + 9 + i * 9);
        if (!edge && h3 < .3) { ctx.strokeStyle = 'rgba(0,0,0,.42)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x + 16, y + 16, 9, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(120,235,225,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 16, y + 16, 9, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(30,70,70,.8)'; circ(ctx, x + 16, y + 16, 5); }
        break;
      case 'arc':    // ceramic ribs + copper veins
        ctx.fillStyle = 'rgba(190,170,255,.08)'; for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * 6, y + 3, 2, TS - 6);
        if (h2 > .78 && !edge) { ctx.strokeStyle = 'rgba(190,150,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y + 8 + h * 12); ctx.lineTo(x + 10, y + 10 + h3 * 10); ctx.lineTo(x + 16, y + 20 + h4 * 6); ctx.lineTo(x + TS, y + 14 + h * 10); ctx.stroke(); }
        if (up) { ctx.fillStyle = 'rgba(190,160,255,.5)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 3 + i * 8, y + 4, 4, 2); }
        break;
      case 'furnace': // firebrick
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; for (let r = 0; r < 4; r++) { const by = y + r * 8; line(ctx, x, by + .5, x + TS, by + .5); const off = (r + tx) % 2 ? 0 : 8; for (let k = off; k < TS; k += 16) line(ctx, x + k + .5, by, x + k + .5, by + 8); }
        ctx.fillStyle = 'rgba(255,100,30,.05)'; ctx.fillRect(x, y, TS, TS); if (h3 < .12 && !edge) { ctx.fillStyle = 'rgba(255,120,40,.35)'; ctx.fillRect(x + 4, y + 10 + h * 8, TS - 8, 2); }
        break;
      case 'heart':  // ribbed muscle
        ctx.strokeStyle = 'rgba(20,0,0,.4)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y + 6 + i * 10); ctx.quadraticCurveTo(x + 16, y + 12 + i * 10 + (h - .5) * 8, x + TS, y + 6 + i * 10); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(210,60,50,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y + 7 + i * 10); ctx.quadraticCurveTo(x + 16, y + 13 + i * 10 + (h - .5) * 8, x + TS, y + 7 + i * 10); ctx.stroke(); }
        break;
    }
    ctx.restore();
  };
})();
