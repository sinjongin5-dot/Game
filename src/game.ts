import * as THREE from 'three';
import { AudioDirector } from './audio/director';
import { AudioEngine } from './audio/audioEngine';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { Input } from './input/input';
import { Haptics, HapticsDirector, PATTERNS, type ActuatorLike } from './input/haptics';
import { MenuNav } from './ui/menuNav';
import { loadAssets, type LoadedAssets } from './render/assets';
import { GameScene, type SceneStats } from './render/gameScene';
import { RapierPhysics } from './physics/rapierPhysics';
import { GameSim } from './simulation/sim';
import { emptyInput } from './simulation/state';
import { UI } from './ui/ui';

export type GameState = 'boot' | 'loading' | 'title' | 'intro' | 'fight' | 'paused' | 'dead' | 'victory' | 'error';

const AUDIO_UNIT = 30000;

/** 게임 전체 흐름: 로딩 → 타이틀 → 입장 → 결투 → 사망/승리 → 재도전 */
/** 새 패턴이 처음 나올 때 한 번만 보여 주는 짧은 대처 힌트 */
const PATTERN_HINTS: Record<string, string> = {
  flurry: '연타 할퀴기 — 방패로 막거나 크게 물러나세요',
  dashBite: '돌진 물기 — 달려드는 순간 옆으로 구르세요',
  backHop: '사자가 물러났다가 덮칩니다 — 도약 직전에 회피하세요',
  quake: '충격파 — 링이 몸에 닿는 순간 회피하거나 방패로 막으세요',
  whirl: '회전 꼬리치기 — 가까이 있다면 멀리 구르세요',
};

export class Game {
  settings: Settings = loadSettings();
  state: GameState = 'boot';
  prevState: GameState = 'title';
  ui!: UI;
  input!: Input;
  audio = new AudioEngine();
  director = new AudioDirector(this.audio);
  haptics = new Haptics(() => this.rumbleActuator());
  hapticDirector = new HapticsDirector(this.haptics);
  menuNav!: MenuNav;
  scene!: GameScene;
  sim!: GameSim;
  assets!: LoadedAssets;
  private canvas: HTMLCanvasElement;
  private last = 0;
  private hintGrapple = false;
  private debugOn = false;
  private lastStats: SceneStats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geometries: 0, textures: 0 };
  private rafId = 0;
  private hints = { move: false, lock: false, windup: false, attack: false, stamina: false, heal: false, dodge: false, parry: false, exec: 0 };
  private hintQueue: string[] = [];
  private seenPatterns = new Set<string>();
  private fightClock = 0;
  private resultShown = false;
  private initDone = false;
  private diagTimer = 0;
  private lastPhase2 = false;
  private ctxErrorShown = false;
  /** 진단/테스트용 */
  timeScale = 1;
  private slowT = 0;
  private slowScale = 1;
  /** 자동화 테스트 전용: 값이 있으면 키보드/마우스 대신 이 입력을 사용 */
  inputOverride: (() => import('./simulation/state').InputFrame) | null = null;
  frames = 0;

  constructor() {
    this.canvas = document.getElementById('view') as HTMLCanvasElement;
  }

  async boot() {
    this.ui = new UI(this.settings, {
      onStart: () => this.startGame(),
      onResume: () => this.resume(),
      onRetry: () => this.retry(),
      onToTitle: () => this.toTitle(),
      onSettings: (s) => this.applySettings(s),
      onRetryLoad: () => { this.ui.hideLoadError(); void this.load(); },
      onClickSound: () => { void this.audio.resume(); this.audio.play('ui_click', { volume: 0.7, reverb: 0 }); },
      onHoverSound: () => this.audio.play('ui_hover', { volume: 0.5, reverb: 0 }),
    });
    this.input = new Input(this.canvas);
    this.input.onEscape = () => this.onEscape();
    this.input.onLockLost = () => this.onLockLost();
    this.input.onBlur = () => this.autoPause();
    this.input.onSkip = () => { if (this.state === 'intro') this.skipIntro(); };
    this.input.debugToggle = () => this.toggleDebug();
    this.input.onAnyKeyDown = () => { void this.audio.resume(); };
    // 컨트롤러: 장치 전환 표시, 메뉴 탐색, 연결 알림
    this.menuNav = new MenuNav({
      onMove: () => { this.audio.play('ui_hover', { volume: 0.5, reverb: 0 }); this.haptics.play(PATTERNS.menuTick); },
      onConfirm: () => { void this.audio.resume(); this.haptics.play(PATTERNS.menuConfirm); },
    });
    this.input.onDeviceChange = (d) => { this.ui.setDevice(d); if (d === 'kbm') this.menuNav.deactivate(); };
    this.input.pad.onConnect = (id) => { this.ui.padToast(`컨트롤러 연결됨 — ${id.replace(/\(.*\)/, '').trim().slice(0, 40) || 'Gamepad'}`); this.haptics.play(PATTERNS.menuConfirm); };
    this.input.pad.onDisconnect = () => { this.ui.padToast('컨트롤러 연결이 끊어졌습니다'); if (this.state === 'fight' || this.state === 'intro') this.pause(); };
    this.haptics.intensity = this.settings.rumble;
    window.addEventListener('pointerdown', () => { void this.audio.resume(); }, { capture: true });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
    window.addEventListener('error', (e) => this.fatal('처리되지 않은 오류', String(e.error?.message ?? e.message)));
    window.addEventListener('unhandledrejection', (e) => this.fatal('처리되지 않은 비동기 오류', String((e.reason as Error)?.message ?? e.reason)));
    if (new URLSearchParams(location.search).has('debug')) this.setDebug(true);

    // WebGL2 지원 확인
    const test = document.createElement('canvas');
    if (!test.getContext('webgl2')) {
      this.fatal('그래픽을 초기화할 수 없습니다', '이 브라우저에서 WebGL2 를 사용할 수 없습니다. 최신 Chrome / Edge / Firefox 에서 하드웨어 가속을 켜고 다시 시도해 주세요.');
      return;
    }
    this.state = 'loading';
    await this.load();
  }

  private async load() {
    this.ui.showLoading(true);
    this.ui.setProgress(0, '에셋을 불러오는 중…');
    let glFrac = { loaded: 0, total: 1 };
    let audioDone = 0;
    const audioTotal = 55;
    let rapierDone = 0;
    const update = (label: string) => {
      const total = glFrac.total + audioTotal * AUDIO_UNIT + 100000;
      const loaded = glFrac.loaded + audioDone * AUDIO_UNIT + rapierDone * 100000;
      this.ui.setProgress(Math.min(1, loaded / total), label);
    };
    try {
      const rapier = RapierPhysics.create().then((p) => { rapierDone = 1; update('물리 엔진 준비'); return p; });
      const audioP = this.audio.loadAll((d) => { audioDone = d; update('사운드 디코딩'); });
      const glP = loadAssets((p) => { glFrac = { loaded: p.loaded, total: Math.max(p.total, 1) }; update(p.current ? `${p.current} 불러오는 중…` : '모델·텍스처 불러오는 중…'); });
      const [physics, , res] = await Promise.all([rapier, audioP, glP]);
      if (res.progress.failed.length) {
        const msg = res.progress.failed.map((f) => `${f.label}: ${f.reason}`).join('\n');
        physics.dispose();
        throw new Error(`필수 에셋을 불러오지 못했습니다.\n${msg}\n네트워크 연결과 서버 상태를 확인한 뒤 다시 시도하세요.`);
      }
      this.assets = res.assets;
      this.ui.setProgress(0.98, '장면을 구성하는 중…');
      await new Promise((r) => setTimeout(r, 30));
      this.scene = new GameScene(this.canvas, this.assets, { sensitivity: this.settings.sensitivity, shake: this.settings.shake, invertY: this.settings.invertY }, this.settings.quality);
      this.scene.hooks.onDamageFlash = (s) => this.ui.flashDamage(s);
      // 연출 효과(슬로모/전체 화면 번쩍임)는 '카메라 흔들림' 설정이 0 이면 끈다 (접근성)
      this.scene.hooks.onScreenFlash = (c, s) => { if (this.settings.shake > 0) this.ui.screenFlash(c, s); };
      this.scene.hooks.onSlowmo = (scale, dur) => {
        if (this.settings.shake <= 0) return;
        this.slowScale = this.slowT > 0 ? Math.min(this.slowScale, scale) : scale;
        this.slowT = Math.max(this.slowT, dur);
      };
      this.scene.resize(window.innerWidth, window.innerHeight);
      this.sim = new GameSim(physics, { skipIntro: false, qte: this.settings.qte });
      this.scene.resetForNewAttempt(this.sim);
      this.scene.setMode('title');
      this.scene.setDebug(this.debugOn);
      this.audio.setVolumes({ master: this.settings.master, sfx: this.settings.sfx, music: this.settings.music });
      // 셰이더를 미리 컴파일해 첫 전투 프레임의 끊김을 줄인다
      try { await this.scene.renderer.compileAsync(this.scene.scene, this.scene.cam.camera); } catch { /* 컴파일 선행은 선택 사항 */ }
      this.ui.setProgress(1, '준비 완료');
      this.ui.showLoading(false);
      this.showTitle();
      if (!this.initDone) {
        this.initDone = true;
        this.last = performance.now();
        this.rafId = requestAnimationFrame((t) => this.frame(t));
      }
    } catch (e) {
      this.ui.showLoadError(e instanceof Error ? e.message : String(e));
      this.ui.setProgress(0, '불러오기에 실패했습니다');
    }
  }

  private showTitle() {
    this.state = 'title';
    this.scene.setMode('title');
    this.ui.showTitle(true);
    this.ui.showHud(false);
    this.ui.showIntroHint(false);
    this.ui.showClickCatch(false);
    this.ui.closeAllPanels();
    this.input.setEnabled(false);
    this.audio.setMusic('music_calm', 0.7, 2);
    this.audio.startLoop('crowd_loop', 'crowd', 1, 2);
    this.ui.fade(false);
  }

  // ── 흐름 ────────────────────────────────────────────────────────────────
  startGame() {
    if (this.state !== 'title') return;
    void this.audio.resume();
    this.sim.reset({ skipIntro: false, attempts: 1 });
    this.director.reset();
    this.hapticDirector.reset();
    this.slowT = 0;
    this.scene.resetForNewAttempt(this.sim);
    this.scene.setMode('game');
    this.ui.resetHud();
    this.ui.showTitle(false);
    this.ui.closeAllPanels();
    this.ui.showHud(false);
    this.ui.showIntroHint(true);
    this.input.setEnabled(true);
    this.lockIfMouse();
    this.state = 'intro';
    this.fightClock = 0;
    this.resultShown = false;
    this.lastPhase2 = false;
    this.hintQueue = [];
    this.audio.setMusic('music_calm', 0.8, 1.5);
    this.audio.startLoop('crowd_loop', 'crowd', 1, 1);
  }

  /** 마우스 시점이 필요할 때만 포인터를 잠근다 (컨트롤러로 하는 중에는 커서 잠금이 필요 없다) */
  private lockIfMouse() { if (this.input.lastDevice !== 'pad') this.input.requestLock(); }

  private rumbleActuator(): ActuatorLike | null {
    const g = this.input?.pad.current() as (Gamepad & { vibrationActuator?: ActuatorLike }) | null;
    return g?.vibrationActuator ?? null;
  }

  skipIntro() {
    if (this.state !== 'intro') return;
    this.sim.skipIntro();
    this.scene.cam.reset(this.sim);
    this.ui.flashFade();
    this.state = 'fight';
    this.ui.showHud(true);
    this.ui.showIntroHint(false);
    this.scene.arena.snapGate('player', false);
    this.scene.arena.snapGate('lion', false);
    this.audio.stopAllOneShots();
  }

  retry() {
    if (this.state !== 'dead' && this.state !== 'victory' && this.state !== 'paused') return;
    this.ui.closeAllPanels();
    this.sim.reset({ skipIntro: true });
    this.director.reset();
    this.hapticDirector.reset();
    this.slowT = 0;
    this.scene.resetForNewAttempt(this.sim);
    this.scene.cam.reset(this.sim);
    this.scene.setMode('game');
    this.ui.resetHud();
    this.ui.showHud(true);
    this.ui.showIntroHint(false);
    this.ui.showClickCatch(false);
    this.input.setEnabled(true);
    this.lockIfMouse();
    this.state = 'fight';
    this.fightClock = 0;
    this.resultShown = false;
    this.lastPhase2 = false;
    this.hintQueue = [];
    void this.audio.resume();
    this.audio.setMusic('music_battle', 1, 1.0);
  }

  toTitle() {
    this.ui.closeAllPanels();
    this.sim.reset({ skipIntro: false, attempts: 1 });
    this.director.reset();
    this.hapticDirector.reset();
    this.slowT = 0;
    this.scene.resetForNewAttempt(this.sim);
    this.scene.setMode('title');
    this.ui.resetHud();
    void this.audio.resume();
    this.showTitle();
  }

  private autoPause() {
    if (this.state === 'intro' || this.state === 'fight') this.pause();
  }

  private onEscape() {
    if (this.state === 'intro' || this.state === 'fight') this.pause();
    else if (this.state === 'paused') {
      if (this.ui.panelOpen && this.ui.topPanel !== 'pause') this.ui.closePanel();
      else this.resume();
    } else if (this.state === 'title' && this.ui.panelOpen) this.ui.closePanel();
  }

  private onLockLost() {
    // 사용자가 Esc 로 포인터 잠금을 해제함 → 일시정지
    if (this.state === 'intro' || this.state === 'fight') this.pause();
  }

  pause() {
    if (this.state !== 'intro' && this.state !== 'fight') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.haptics.stop();
    this.ui.openPanel('pause');
    void this.audio.ctx?.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.closeAllPanels();
    this.state = this.prevState;
    this.input.setEnabled(true);
    this.lockIfMouse();
    void this.audio.ctx?.resume();
    this.last = performance.now();
  }

  private applySettings(s: Settings) {
    saveSettings(s);
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music });
    if (this.scene) {
      if (this.scene.qualityName !== s.quality) this.scene.setQuality(s.quality);
      this.scene.cam.settings.sensitivity = s.sensitivity;
      this.scene.cam.settings.shake = s.shake;
      this.scene.cam.settings.invertY = s.invertY;
    }
    this.haptics.intensity = s.rumble;
    if (s.rumble > 0) this.haptics.play(PATTERNS.menuConfirm);
    if (this.sim) this.sim.setQte(s.qte);
    this.ui.setFps(s.showFps ? '' : null);
  }

  private onResize() {
    if (this.scene) this.scene.resize(window.innerWidth, window.innerHeight);
  }

  private toggleDebug() { this.setDebug(!this.debugOn); }
  private setDebug(on: boolean) {
    this.debugOn = on;
    this.scene?.setDebug(on);
    if (!on) this.ui?.setDiag(null);
  }

  private fatal(title: string, msg: string) {
    if (this.state === 'error') return;
    this.state = 'error';
    try { this.input?.setEnabled(false); } catch { /* ignore */ }
    this.ui?.showLoading(false);
    if (this.ui) this.ui.showError(title, msg);
    else document.body.append(Object.assign(document.createElement('pre'), { textContent: `${title}\n${msg}`, style: 'color:#fff;padding:20px' }));
    console.error(title, msg);
  }

  // ── 매 프레임 ─────────────────────────────────────────────────────────────
  private frame(now: number) {
    this.rafId = requestAnimationFrame((t) => this.frame(t));
    try {
      this.step(now);
    } catch (e) {
      this.fatal('렌더링 오류', e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));
    }
  }

  private step(now: number) {
    const rawDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.frames++;
    // 순간 슬로모션: 지속 시간은 실제 시간 기준으로 줄어든다
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - rawDt);
    const dt = rawDt * this.timeScale * (this.slowT > 0 ? this.slowScale : 1);
    if (this.state === 'error' || this.state === 'loading' || this.state === 'boot') return;
    const sim = this.sim;
    // 컨트롤러 폴링 (메뉴 중에도): 전투 입력은 input.frame()/consumeLook() 이 가져가고, 메뉴 입력은 여기서 처리한다
    const pf = this.input.pollPad(rawDt, this.settings.sensitivity, this.settings.invertY);
    const stateBefore = this.state;
    if (this.input.lastDevice === 'pad' && !this.input.enabled) this.menuNav.update(pf);
    // Start: 전투 중이면 일시정지 (같은 눌림이 방금 메뉴에서 '계속하기'로 쓰였다면 다시 멈추지 않는다)
    if (pf.menu.start && (stateBefore === 'fight' || stateBefore === 'intro')) this.pause();
    this.haptics.tick(rawDt);
    const sc = this.scene;

    if (!sc.contextLost && this.ctxErrorShown) {
      this.ctxErrorShown = false;
      this.ui.closeAllPanels();
      if (this.state === 'fight' || this.state === 'intro') this.pause();
    }
    if (sc.contextLost) {
      this.ctxErrorShown = true;
      this.ui.showError('그래픽 컨텍스트가 손실되었습니다', '브라우저가 GPU 연결을 잃었습니다. 잠시 기다리면 자동으로 복구될 수 있습니다. 복구되지 않으면 페이지를 새로고침하세요.');
      return;
    }

    if (this.state === 'paused') {
      sc.render(rawDt * 1000);
      return;
    }

    const live = this.state === 'intro' || this.state === 'fight' || this.state === 'dead' || this.state === 'victory';
    const look = this.input.enabled ? this.input.consumeLook() : { dx: 0, dy: 0 };
    if (live) {
      if (this.inputOverride) {
        sim.update(dt, this.inputOverride);
      } else {
        const f = this.input.enabled ? this.input.frame(sc.cam.yaw) : { ...emptyInput(), cameraYaw: sc.cam.yaw };
        if (this.state === 'intro' && (f.pressed.dodge || f.pressed.light || f.pressed.heal || f.pressed.a)) this.skipIntro();
        sim.update(dt, f);
      }
    }
    const events = sim.drainEvents();
    if (events.length) {
      this.director.handle(events, sim);
      this.hapticDirector.handle(events, sim);
      sc.handleEvents(events, sim);
      this.handleFlowEvents(events);
    }
    this.director.tick(dt);
    if (live) { this.hapticDirector.update(rawDt, sim); this.ui.updateQte(sim.ctx.grapple, rawDt); this.ui.updateCombat(sim.player, sim.ctx.witchT > 0); }
    sc.update(sim, dt, live ? sim.alpha : 0, look, this.state === 'fight');
    this.director.footsteps(sc.footFx, sim);
    this.director.ambience(sim, sc.cam.camera, sim.phase);

    // 상태 전이
    if (this.state === 'intro' && sim.phase === 'fight') {
      this.state = 'fight';
      if (sim.stats.time < 0.5) sc.cam.startBlendFromCurrent();
      this.ui.showHud(true);
      this.ui.showIntroHint(false);
    }
    if (this.state === 'fight' || this.state === 'dead' || this.state === 'victory') {
      this.fightClock += dt;
      if (this.state === 'fight') this.updateHints();
      this.ui.updateHud(sim, dt);
      this.updateReticle();
      if (sim.phase === 'playerDead' && sim.deathT > 3.4 && !this.resultShown) {
        this.resultShown = true;
        this.state = 'dead';
        this.input.setEnabled(false);
        this.ui.showHud(true);
        this.ui.showDeath(`${sim.stats.attempts}번째 도전 · 전투 시간 ${sim.stats.time.toFixed(1)}초 · 사자의 남은 체력 ${Math.ceil((sim.lion.hp / sim.lion.hpMax) * 100)}%`);
      }
      if (sim.phase === 'victory' && sim.victoryT > 5.5 && !this.resultShown) {
        this.resultShown = true;
        this.state = 'victory';
        this.input.setEnabled(false);
        this.settings.tutorialSeen = true;
        saveSettings(this.settings);
        this.ui.showVictory(sim.stats);
      }
    }
    const stats = sc.render(rawDt * 1000);
    this.lastStats = stats;
    this.updateDiag(rawDt, stats);
  }

  private handleFlowEvents(events: import('./simulation/state').SimEvent[]) {
    for (const e of events) {
      if (e.type === 'staminaDenied') this.ui.flashStamina();
      if (e.type === 'lionWindup' && !this.hints.windup && !this.settings.tutorialSeen) {
        this.hints.windup = true;
        this.ui.hint('사자의 준비 동작을 읽으세요 — Space 로 회피하거나, 우클릭을 유지해 방패로 막습니다.', 5200);
      }
      if (e.type === 'phase2') this.ui.hint('사자가 더욱 사나워졌다', 3200);
      if (e.type === 'qteResult') this.ui.qteResult(e.ok, e.perfect);
      if (e.type === 'callout') this.ui.callout(e.kind, e.n);
      if (e.type === 'grappleStart' && !this.hintGrapple && !this.settings.tutorialSeen) { this.hintGrapple = true; this.ui.hint('물렸다! 화면의 버튼을 고리가 모이는 순간에 누르세요 — 세 번 다 막으면 반격!', 4200); }
      if (e.type === 'playerBlocked' && e.parry && !this.hints.parry) {
        this.hints.parry = true;
        this.ui.hint('패링 성공 — 사자가 휘청거립니다. 지금 반격하세요!', 3600);
      }
      if (e.type === 'lionStagger' && this.hints.exec < 3) {
        this.hints.exec++;
        this.ui.hint('사자가 무너졌다 — 가까이서 강공격(Q)으로 처형!', 3000);
      }
      if (e.type === 'lionWindup' && PATTERN_HINTS[e.attack] && !this.seenPatterns.has(e.attack) && !this.ui.hintVisible) {
        this.seenPatterns.add(e.attack);
        this.ui.hint(PATTERN_HINTS[e.attack], 3600);
      }
      if (e.type === 'fightStart') { this.ui.showHud(true); this.ui.showIntroHint(false); }
    }
  }

  private updateHints() {
    if (this.settings.tutorialSeen) return;
    const sim = this.sim;
    const t = this.fightClock;
    const ui = this.ui;
    if (ui.hintVisible) return;
    if (!this.hints.move && t > 0.8) {
      this.hints.move = true;
      ui.hint('WASD 이동 · Shift 달리기 · 마우스로 시점 회전', 5000);
    } else if (!this.hints.lock && this.hints.move && t > 7) {
      this.hints.lock = true;
      if (!sim.player.lockOn) ui.hint('F 또는 마우스 휠 클릭: 사자에게 락온 — 카메라가 사자를 계속 바라봅니다.', 5000);
    } else if (!this.hints.attack && t > 16 && sim.stats.hitsLanded === 0) {
      this.hints.attack = true;
      ui.hint('좌클릭 약공격(3연계) · Q 강공격 — 사자의 공격이 끝난 직후가 기회입니다.', 5200);
    } else if (!this.hints.heal && sim.player.hp < 50 && sim.player.heals > 0 && sim.player.mode === 'free') {
      this.hints.heal = true;
      ui.hint('E: 회복 — 시간이 걸리고, 맞으면 끊깁니다. 안전할 때 마시세요.', 5000);
    } else if (!this.hints.stamina && sim.player.stamina < 10) {
      this.hints.stamina = true;
      ui.hint('스태미나가 바닥나면 행동할 수 없습니다. 잠시 공격을 멈추고 회복하세요.', 4500);
    }
  }

  private updateReticle() {
    const sim = this.sim;
    const show = sim.player.lockOn && sim.phase === 'fight' && sim.lion.mode !== 'dying' && sim.lion.mode !== 'dead' && this.state === 'fight';
    if (!show) { this.ui.setReticle(false, 0, 0); return; }
    const h = this.scene.lion.headWorld.clone();
    h.y += 0.35;
    const v = h.project(this.scene.cam.camera);
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight;
    this.ui.setReticle(v.z < 1, (v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * hh);
  }

  private updateDiag(dt: number, stats: SceneStats) {
    if (this.settings.showFps) this.ui.setFps(`${stats.fps.toFixed(0)} fps · ${stats.frameMs.toFixed(1)} ms`);
    this.diagTimer += dt;
    if (!this.debugOn || this.diagTimer < 0.2) return;
    this.diagTimer = 0;
    const s = this.sim, p = s.player, l = s.lion;
    const lines = [
      `FPS ${stats.fps.toFixed(1)}  frame ${stats.frameMs.toFixed(1)}ms  calls ${stats.calls}  tris ${(stats.tris / 1000).toFixed(0)}k  geo ${stats.geometries}  tex ${stats.textures}`,
      `state ${this.state}  phase ${s.phase}  tick ${s.tick}  physics ${s.physics.name}  quality ${this.scene.qualityName}`,
      `player ${p.mode} t=${p.modeT.toFixed(2)} atk=${p.attackId ?? '-'} hp=${p.hp.toFixed(0)} st=${p.stamina.toFixed(0)} heals=${p.heals} guard=${p.guardHeld} lock=${p.lockOn} inv=${p.invulnT.toFixed(2)}`,
      `lion ${l.mode} t=${l.modeT.toFixed(2)} atk=${l.attack?.id ?? '-'}@${(l.attack?.t ?? 0).toFixed(2)} hp=${l.hp.toFixed(0)} poise=${l.poise.toFixed(0)} ph=${l.phase} spd=${l.speed.toFixed(1)}`,
      `lion cooldowns ${JSON.stringify(Object.fromEntries(Object.entries(l.cooldown).map(([k, v]) => [k, +v.toFixed(1)])))}  hist=${l.history.join(',')}`,
      `audio ctx=${this.audio.ctx?.state} active=${this.audio.activeCount()} music=${this.audio.currentMusic}  stats dodges=${s.stats.dodges} blocks=${s.stats.blocks} hits=${s.stats.hitsLanded}`,
      `cam yaw=${this.scene.cam.yaw.toFixed(2)} clipped=${this.scene.cam.clipped}  keys=${this.input.heldKeys().join('+')} btn=${this.input.heldButtons().join('+')} locked=${this.input.locked}`,
    ];
    this.ui.setDiag(lines.join('\n'));
  }

  /** 자동화 테스트용: 렌더 없이 시뮬레이션만 앞으로 진행 */
  simAdvance(seconds: number, inp?: (t: number) => import('./simulation/state').InputFrame) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      this.sim.step(inp ? inp(i / 60) : emptyInput());
    }
    const ev = this.sim.drainEvents();
    this.director.handle(ev, this.sim);
    this.scene.handleEvents(ev, this.sim);
    this.handleFlowEvents(ev);
  }

  /** 테스트/진단용 상태 스냅샷 */
  snapshot() {
    const s = this.sim, p = s.player, l = s.lion;
    return {
      state: this.state, phase: s.phase, time: s.ctx.time,
      player: { x: p.pos.x, z: p.pos.z, yaw: p.yaw, hp: p.hp, stamina: p.stamina, heals: p.heals, mode: p.mode, lock: p.lockOn, guard: p.guardHeld },
      lion: { x: l.pos.x, z: l.pos.z, hp: l.hp, mode: l.mode, atk: l.attack?.id ?? null, atkT: l.attack?.t ?? 0, phase: l.phase, y: l.y },
      stats: { ...s.stats }, fps: this.lastStats.fps, calls: this.lastStats.calls, tris: this.lastStats.tris,
      objects: this.scene.scene.children.length, geometries: this.lastStats.geometries, textures: this.lastStats.textures,
      audioActive: this.audio.activeCount(), locked: this.input.locked, cam: this.scene.cam.camera.position.toArray(),
    };
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.audio.dispose();
    this.scene.dispose();
    this.sim.dispose();
  }
}
void THREE;
