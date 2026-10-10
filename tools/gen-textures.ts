/** 절차적 텍스처 생성 (PNG). 실행: npx tsx tools/gen-textures.ts [shield|sand|stone|...] */
import { Img, fbm, hash2, mix, mul, hex, vnoise, type RGB } from './lib/img';

const which = process.argv[2] ?? 'all';
const OUT = 'public/assets/textures';

function shield() {
  const W = 512, H = 768;
  const im = new Img(W, H);
  const red = hex(0x7e1d17), redDark = hex(0x4c100d), bronze = hex(0xa4783a), gold = hex(0xd1a74e), wood = hex(0x5b3a22);
  const border = 0.07; // 비율
  im.fill((x, y) => {
    const u = x / W, v = y / H;
    const n = fbm(u * 8, v * 12, 8, 5, 3);
    const streak = vnoise(u * 90, v * 4, 90, 7);
    let c = mix(red, redDark, Math.min(1, n * 1.1 + (streak - 0.5) * 0.35));
    const e = Math.min(u, 1 - u, (v) * (H / W) * 0 + Math.min(v, 1 - v) * (H / W)); // 가장자리까지 가로 기준 거리
    if (e < border) c = mix(bronze, mul(bronze, 0.62), fbm(u * 30, v * 40, 30, 4, 5));
    else if (e < border + 0.012) c = mix(c, gold, 0.9);
    return c;
  });
  // 중앙 날개 달린 번개 문양
  const cx = W / 2, cy = H * 0.5;
  const S = W * 0.5;
  const g = mix(gold, [0.9, 0.7, 0.3], 0.2);
  // 번개 (세로 지그재그)
  im.poly([[cx - 18, cy - 190], [cx + 24, cy - 190], [cx + 6, cy - 40], [cx + 44, cy - 40], [cx - 10, cy + 200], [cx - 2, cy + 40], [cx - 40, cy + 40]], g);
  // 날개 (좌우 대칭): 부채꼴 깃털
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const a0 = -0.15 + k * 0.17;
      const len = S * (0.55 - k * 0.035);
      const bx = cx + side * 34, by = cy - 70 + k * 6;
      const tx = bx + side * Math.cos(a0) * len, ty = by - Math.sin(a0 + 0.35) * len * 0.9 + k * 6;
      const wdt = 20 - k * 1.2;
      im.poly([[bx, by - wdt * 0.4], [tx, ty - wdt * 0.6], [tx + side * 4, ty], [bx, by + wdt * 0.6]], mix(g, redDark, 0.12 * k / 6));
    }
  }
  // 하단/상단 별
  for (const [sx, sy] of [[W * 0.25, H * 0.2], [W * 0.75, H * 0.2], [W * 0.25, H * 0.8], [W * 0.75, H * 0.8]]) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r]); }
    im.poly(pts, gold, 0.95);
  }
  // 마모: 도장 박리(나무 노출), 흠집, 먼지
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const chip = fbm(u * 14, v * 20, 14, 5, 21);
    const edgeW = Math.min(u, 1 - u, Math.min(v, 1 - v) * H / W);
    const wearMask = (0.5 - Math.abs(chip - 0.5)) ;
    if (chip > 0.67 + edgeW * 1.3 && hash2(x >> 1, y >> 1, 9) > 0.1) im.set(x, y, mix(wood, mul(wood, 0.7), hash2(x, y, 4)), 0.85);
    const dirt = Math.pow(v, 3) * fbm(u * 10, v * 10, 10, 4, 33);
    im.set(x, y, hex(0x2a1d12), dirt * 0.55);
    void wearMask;
  }
  for (let i = 0; i < 160; i++) {
    const x = hash2(i, 1, 77) * W, y = hash2(i, 2, 77) * H, a = hash2(i, 3, 77) * Math.PI;
    const l = 14 + hash2(i, 4, 77) * 60;
    im.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.1, hex(hash2(i, 5, 77) > 0.4 ? 0xcdb88a : 0x241008), 0.45);
  }
  im.save(`${OUT}/shield_face.png`);
  console.log('shield_face.png');
}

if (which === 'all' || which === 'shield') shield();
