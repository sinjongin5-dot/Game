/**
 * UI 에 실제로 쓰이는 글자만 포함하는 폰트 서브셋 선택기.
 * @fontsource 패키지(SIL OFL 1.1)의 슬라이스 중 사용 글자를 포함하는 것만 public/assets/fonts 로 복사한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const used = new Set<number>();
function scan(file: string) {
  const s = fs.readFileSync(file, 'utf8');
  for (const ch of s) used.add(ch.codePointAt(0)!);
}
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|html)$/.test(e.name)) scan(p);
  }
}
walk(path.join(ROOT, 'src'));
scan(path.join(ROOT, 'index.html'));
// 동적으로 만드는 숫자/기호 포함
for (const ch of '0123456789:.,%·—-/()[]!?…') used.add(ch.codePointAt(0)!);

function parseRanges(r: string): [number, number][] {
  return r.split(',').map((t) => {
    const m = t.trim().replace(/^U\+/i, '');
    const [a, b] = m.split('-');
    const lo = parseInt(a, 16);
    return [lo, b ? parseInt(b, 16) : lo] as [number, number];
  });
}
const outDir = path.join(ROOT, 'public/assets/fonts');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
let css = '/* 자동 생성: tools/build-fonts.ts — 사용 글자 슬라이스만 포함 (Noto Serif KR, Cinzel: SIL OFL 1.1) */\n';
let copied = 0, bytes = 0;

function handle(pkgDir: string, cssFile: string) {
  const text = fs.readFileSync(path.join(pkgDir, cssFile), 'utf8');
  const blocks = text.split('/* ').slice(1);
  for (const b of blocks) {
    const family = /font-family:\s*'([^']+)'/.exec(b)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(b)?.[1];
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(b)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1];
    if (!family || !file) continue;
    let ok = false;
    if (range) {
      for (const [lo, hi] of parseRanges(range)) {
        for (const c of used) if (c >= lo && c <= hi) { ok = true; break; }
        if (ok) break;
      }
    } else ok = true;
    if (!ok) continue;
    const src = path.join(pkgDir, 'files', file);
    fs.copyFileSync(src, path.join(outDir, file));
    copied++;
    bytes += fs.statSync(src).size;
    css += `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(/assets/fonts/${file}) format('woff2');${range ? `unicode-range:${range};` : ''}}\n`;
  }
}
const nk = path.join(ROOT, 'node_modules/@fontsource/noto-serif-kr');
handle(nk, '400.css');
handle(nk, '700.css');
const cz = path.join(ROOT, 'node_modules/@fontsource/cinzel');
for (const f of ['latin-400.css', 'latin-700.css']) handle(cz, f);
fs.writeFileSync(path.join(ROOT, 'src/ui/fonts.css'), css);
fs.copyFileSync(path.join(nk, 'LICENSE'), path.join(outDir, 'LICENSE-NotoSerifKR-OFL.txt'));
fs.copyFileSync(path.join(cz, 'LICENSE'), path.join(outDir, 'LICENSE-Cinzel-OFL.txt'));
console.log(`fonts: ${copied} 슬라이스, ${(bytes / 1024).toFixed(0)} KB, 사용 글자 ${used.size}`);
