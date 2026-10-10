import { PNG } from 'pngjs';
import fs from 'node:fs';

export type RGB = [number, number, number];

export class Img {
  data: Float32Array; // RGBA 0..1 (sRGB 공간으로 취급)
  constructor(public w: number, public h: number) {
    this.data = new Float32Array(w * h * 4);
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 1;
  }
  idx(x: number, y: number) { return (y * this.w + x) * 4; }
  get(x: number, y: number): RGB { const i = this.idx(x, y); return [this.data[i], this.data[i + 1], this.data[i + 2]]; }
  set(x: number, y: number, c: RGB, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    this.data[i] = this.data[i] * (1 - a) + c[0] * a;
    this.data[i + 1] = this.data[i + 1] * (1 - a) + c[1] * a;
    this.data[i + 2] = this.data[i + 2] * (1 - a) + c[2] * a;
  }
  fill(f: (x: number, y: number) => RGB) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, f(x, y));
  }
  /** 다각형 채우기 (스캔라인, 짝수-홀수 규칙) */
  poly(pts: [number, number][], c: RGB, a = 1) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if ((p[1] <= y + 0.5 && q[1] > y + 0.5) || (q[1] <= y + 0.5 && p[1] > y + 0.5)) {
          xs.push(p[0] + ((y + 0.5 - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
      }
      xs.sort((a2, b2) => a2 - b2);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k]); x < xs[k + 1]; x++) this.set(x, y, c, a);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, wd: number, c: RGB, a = 1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const r = wd / 2;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= r) this.set(Math.round(x + dx), Math.round(y + dy), c, a * Math.min(1, r - d + 0.6));
      }
    }
  }
  save(path: string) {
    const png = new PNG({ width: this.w, height: this.h });
    for (let i = 0; i < this.w * this.h * 4; i++) png.data[i] = Math.max(0, Math.min(255, Math.round(this.data[i] * 255)));
    fs.mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
    fs.writeFileSync(path, PNG.sync.write(png));
  }
}

export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 주기 period 의 타일 가능 value noise */
export function vnoise(x: number, y: number, period: number, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash2(w(x0), w(y0), seed), b = hash2(w(x0 + 1), w(y0), seed), c = hash2(w(x0), w(y0 + 1), seed), d = hash2(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x: number, y: number, period: number, oct = 5, seed = 0): number {
  let s = 0, a = 0.5, p = period, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, p, seed + i * 13); a *= 0.5; f *= 2; p *= 2; }
  return s;
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, s: number): RGB => [a[0] * s, a[1] * s, a[2] * s];
export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
