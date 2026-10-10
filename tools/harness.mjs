import { chromium } from 'playwright-core';

export async function launch({ w = 1280, h = 720, quality = 'low', url = 'http://localhost:5173/', settings = {}, headless = true } = {}) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless,
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  const failed = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript((s) => {
    try { localStorage.setItem('arena.sand-and-fangs.settings.v1', JSON.stringify(s)); } catch {}
  }, { quality, ...settings });
  await page.goto(url);
  return { browser, ctx, page, logs, failed };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
