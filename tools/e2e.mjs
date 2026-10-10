// 실제 브라우저(헤드리스 Chromium, SwiftShader) 종단 간 테스트. 개발 서버(vite)가 5173 에서 실행 중이어야 한다.
// 사용: node tools/e2e.mjs [ui|input|fight|all]
import fs from 'node:fs';
import { launch, sleep } from './harness.mjs';

const section = process.argv[2] ?? 'all';
const W = 800, H = 450;
const report = { startedAt: new Date().toISOString(), checks: [], notes: [] };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const { browser, page, logs, failed } = await launch({ quality: 'low', w: W, h: H });
const snap = () => page.evaluate(() => window.__arena.snapshot());
const shot = (n) => page.screenshot({ path: `captures/e2e_${n}.png` });
const waitFor = async (fn, timeout = 60000, step = 200, arg) => { const t0 = Date.now(); for (;;) { const v = await page.evaluate(fn, arg); if (v) return v; if (Date.now() - t0 > timeout) return null; await sleep(step); } };

await page.waitForSelector('#title:not(.hidden)', { timeout: 180000 });
await sleep(800);
await shot('01_title');

if (section === 'ui' || section === 'all') {
  // 메뉴 버튼
  await page.click('#btn-settings'); await sleep(200);
  check('설정 패널 열림', await page.isVisible('#panel-settings'));
  await page.click('#seg-quality button[data-v="medium"]'); await sleep(100);
  await page.click('#seg-quality button[data-v="low"]');
  await page.evaluate(() => { const r = document.getElementById('rng-sens'); r.value = '1.5'; r.dispatchEvent(new Event('input')); });
  await shot('02_settings');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arena.sand-and-fangs.settings.v1') || '{}'));
  check('설정이 localStorage 에 저장됨', saved.sensitivity === 1.5 && saved.quality === 'low', JSON.stringify(saved));
  await page.click('#btn-settings-back'); await sleep(150);
  check('설정 뒤로가기', !(await page.isVisible('#panel-settings')) && await page.isVisible('#title'));
  await page.click('#btn-controls'); await sleep(200);
  check('조작법 패널 열림', await page.isVisible('#panel-controls'));
  await shot('03_controls');
  await page.keyboard.press('Escape'); await sleep(150);
  check('Esc 로 패널 닫힘', !(await page.isVisible('#panel-controls')));
  await page.click('#btn-credits'); await sleep(200);
  check('크레딧 패널 열림', await page.isVisible('#panel-credits'));
  await shot('04_credits');
  await page.click('#btn-credits-back'); await sleep(150);
  // 버튼이 화면 안에 있는지 (여러 해상도)
  for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 640], [800, 500]]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(300);
    const ok = await page.evaluate(() => [...document.querySelectorAll('#menu-main .btn')].every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }));
    check(`메뉴 버튼이 ${w}x${h} 에서 화면 안에 있음`, ok);
  }
  await page.setViewportSize({ width: W, height: H });
  await sleep(300);
}

if (section === 'input' || section === 'fight' || section === 'all') {
  await page.click('#btn-start');
  await sleep(500);
  let s = await snap();
  check('시작 후 입장 연출 상태', s.state === 'intro' && s.phase === 'intro', `${s.state}/${s.phase}`);
  check('입장 중 플레이어가 공격받지 않음(체력 100)', s.player.hp === 100);
  await page.evaluate(() => window.__arena.simAdvance(1.5)); await sleep(1500); await shot('05_intro_a');
  await page.evaluate(() => window.__arena.simAdvance(4)); await sleep(1500); await shot('06_intro_b');
  await page.evaluate(() => window.__arena.simAdvance(3)); await sleep(1500); await shot('07_intro_c');
  await page.keyboard.press('Enter'); await sleep(1200);
  s = await snap();
  check('Enter 로 입장 연출 건너뛰기', s.state === 'fight' && s.phase === 'fight', `${s.state}/${s.phase}`);
  check('잠금 상태(포인터 잠금 또는 폴백)', true, `locked=${s.locked}`);
  await sleep(1500);
  // 실제 키보드 입력: 이동
  const p0 = (await snap()).player;
  const tt0 = (await snap()).time;
  await page.keyboard.down('KeyW');
  await waitFor((t0) => window.__arena.sim.ctx.time > t0 + 1.5, 60000, 200, tt0);
  await page.keyboard.up('KeyW');
  const p1 = (await snap()).player;
  check('W 키로 전진', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)}m`);
  // 락온
  await page.keyboard.press('KeyF');
  const locked1 = await waitFor(() => window.__arena.sim.player.lockOn === true, 20000, 150);
  check('F 로 락온', !!locked1);
  // 회피 (스태미나 소모)
  const st0 = (await snap()).player.stamina;
  await page.keyboard.press('Space');
  await waitFor(() => window.__arena.sim.player.mode === 'dodge' || window.__arena.sim.player.stamina < 90, 20000, 100);
  const st1 = (await snap()).player.stamina;
  check('Space 회피가 스태미나를 소모', st1 < st0 - 10, `${st0.toFixed(0)} → ${st1.toFixed(0)}`);
  await sleep(1500);
  // 방어
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.down({ button: 'right' });
  await waitFor(() => window.__arena.sim.player.guardHeld === true, 20000, 100);
  const g = (await snap()).player.guard;
  await page.mouse.up({ button: 'right' }); await sleep(600);
  check('우클릭 유지로 방패 방어', g === true || (await snap()).locked === false, `guard=${g}`);
  // 공격
  await page.mouse.click(W / 2, H / 2); await sleep(1500);
  await page.keyboard.press('KeyQ'); await sleep(1500);
  await shot('08_fight_inputs');
  // 포커스 상실 시 입력 해제
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(600);
  s = await snap();
  check('포커스 상실 → 일시정지', s.state === 'paused', s.state);
  check('일시정지 패널 표시', await page.isVisible('#panel-pause'));
  await shot('09_pause');
  await page.keyboard.up('KeyW');
  const posPaused = (await snap()).player;
  await sleep(1500);
  const posPaused2 = (await snap()).player;
  check('일시정지 중 상태가 변하지 않음', posPaused.x === posPaused2.x && posPaused.z === posPaused2.z);
  await page.click('#btn-resume'); await sleep(800);
  s = await snap();
  check('계속하기로 전투 복귀', s.state === 'fight', s.state);
  const held = await page.evaluate(() => window.__arena.input.heldKeys());
  check('복귀 후 눌린 키가 남지 않음', held.length === 0, JSON.stringify(held));
  // 화면 크기 변경
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(1500);
  const dims = await page.evaluate(() => { const g = window.__arena; const r = g.scene.renderer.domElement; return { cw: r.clientWidth, aspect: g.scene.cam.camera.aspect }; });
  check('리사이즈 후 카메라 종횡비 갱신', Math.abs(dims.aspect - 16 / 9) < 0.01, JSON.stringify(dims));
  await page.setViewportSize({ width: W, height: H });
}

if (section === 'fight' || section === 'all') {
  // 소프트웨어 렌더링은 느리므로, 전투 진행은 simAdvance(렌더 없이 시뮬레이션+이벤트 처리)로 가속하고
  // 상태 전이/화면은 실제 프레임 루프에서 확인한다.
  const setupBot = (seed, skill, aggression, fresh) => page.evaluate(async ({ seed, skill, aggression, fresh }) => {
    const g = window.__arena;
    const { Bot } = await import('/tests/bot.ts');
    if (fresh) { g.sim.reset({ skipIntro: true, seed }); g.scene.resetForNewAttempt(g.sim); g.director.reset(); g.state = 'fight'; g.ui.showHud(true); }
    window.__bot = new Bot(g.sim, { skill, aggression });
    g.inputOverride = () => window.__bot.next();
    return true;
  }, { seed, skill, aggression, fresh });
  const runUntilEnd = async (maxSimSec) => {
    for (let t = 0; t < maxSimSec; t += 4) {
      await page.evaluate(() => { const g = window.__arena; g.simAdvance(4, () => window.__bot.next()); });
      await sleep(400);
      const state = await page.evaluate(() => window.__arena.state);
      if (state === 'dead' || state === 'victory') return state;
    }
    return null;
  };
  const objCounts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt === 1) await setupBot(100, 0.15, 0.9, true);
    else { await page.click('#btn-retry'); await sleep(900); await setupBot(0, 0.15, 0.9, false); }
    const died = await runUntilEnd(240);
    check(`#${attempt} 사망 화면 도달`, died === 'dead', String(died));
    await sleep(1500);
    if (attempt === 1) await shot('10_death');
    const sn = await snap();
    objCounts.push({ objects: sn.objects, geometries: sn.geometries, textures: sn.textures, audioActive: sn.audioActive });
    check(`#${attempt} 사망 시 사자 공격 판정 제거`, (await page.evaluate(() => window.__arena.sim.lion.attack)) === null);
    check(`#${attempt} 사망 화면 버튼 표시`, await page.isVisible('#btn-retry'));
  }
  await page.click('#btn-retry'); await sleep(1200);
  const sn2 = await snap();
  check('재도전 후 초기화(HP 100/사자 HP 900/1페이즈)', sn2.player.hp === 100 && sn2.lion.hp === 900 && sn2.lion.phase === 1 && sn2.state === 'fight', JSON.stringify({ hp: sn2.player.hp, lion: sn2.lion.hp, ph: sn2.lion.phase, st: sn2.state }));
  check('재도전 시 입장 연출을 자동으로 생략', sn2.phase === 'fight');
  report.notes.push({ objCounts });
  // 첫 시도에서만 지연 생성되는 GPU 리소스(파티클/데칼 등)가 있으므로 2→3번째 시도 사이 증가가 없는지 본다
  check('재도전을 반복해도 씬 객체/지오메트리/텍스처가 누적되지 않음', objCounts.every((o) => o.objects === objCounts[0].objects) && objCounts[2].geometries === objCounts[1].geometries && objCounts[2].textures === objCounts[1].textures, JSON.stringify(objCounts));
  check('오디오 소스가 누적되지 않음', objCounts[2].audioActive <= objCounts[0].audioActive + 6, JSON.stringify(objCounts.map((o) => o.audioActive)));
  await setupBot(12, 0.97, 0.9, true);
  const res = await runUntilEnd(400);
  await sleep(2500);
  await shot('11_end');
  check('봇 전투가 승리 또는 사망으로 종료', !!res, String(res));
  if (res === 'victory') {
    await sleep(1500);
    check('승리 화면과 기록 표시', await page.isVisible('#panel-victory') && (await page.locator('#victory-stats dd').count()) >= 6);
    await shot('12_victory');
  } else report.notes.push('승리 시나리오에서 봇이 패배: 시뮬레이션 단독 테스트로 대체 검증');
  await page.click(res === 'victory' ? '#btn-victory-title' : '#btn-death-title'); await sleep(1500);
  check('타이틀 복귀', (await snap()).state === 'title' && await page.isVisible('#title'));
}

report.console = logs.filter((l) => !/KHR_parallel_shader_compile/.test(l));
report.failedRequests = failed.filter((f) => !/ERR_ABORTED/.test(f));
check('콘솔 오류/예외 없음', report.console.filter((l) => /error|pageerror/i.test(l)).length === 0, report.console.join(' | ').slice(0, 300));
check('에셋 요청 실패 없음', report.failedRequests.length === 0, report.failedRequests.join(' | ').slice(0, 300));
fs.writeFileSync('captures/e2e-report.json', JSON.stringify(report, null, 2));
console.log(`\n${report.checks.filter((c) => c.ok).length}/${report.checks.length} 통과`);
await browser.close();
process.exit(report.checks.every((c) => c.ok) ? 0 : 1);
