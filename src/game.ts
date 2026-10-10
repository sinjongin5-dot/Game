import * as THREE from 'three';
import { AudioDirector } from './audio/director';
import { AudioEngine } from './audio/audioEngine';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { Input } from './input/input';
import { loadAssets, type LoadedAssets } from './render/assets';
import { GameScene, type SceneStats } from './render/gameScene';
import { RapierPhysics } from './physics/rapierPhysics';
import { GameSim } from './simulation/sim';
import { emptyInput } from './simulation/state';
import { UI } from './ui/ui';

export type GameState = 'boot' | 'loading' | 'title' | 'intro' | 'fight' | 'paused' | 'dead' | 'victory' | 'error';

const AUDIO_UNIT = 30000;

/** 게임 전체 흐름: 로딩 → 타이틀 → 입장 → 결투 → 사망/승리 → 재도전 */
export class Game {
  settings: Settings = loadSettings();
  state: GameState = 'boot';
  prevState: GameState = 'title';
  ui!: UI;
  input!: Input;
  audio = new AudioEngine();
  director = new AudioDirector(this.audio);
  scene!: GameScene;
  sim!: GameSim;
  assets!: LoadedAssets;
  private canvas: HTMLCanvasElement;
  private last = 0;
  private debugOn = false;
  private lastStats: SceneStats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geometries: 0, textures: 0 };
  private rafId = 0;
  private hints = { move: false, lock: false, windup: false, attack: false, stamina: false, heal: false, dodge: false };
  private hintQueue: string[] = [];
  private fightClock = 0;
  private resultShown = false;
  private initDone = false;
  private diagTimer = 0;
  private lastPhase2 = false;
  /** 진단/테스트용 */
  timeScale = 1;
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
    const audioTotal = 40;
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
      this.scene.resize(window.innerWidth, window.innerHeight);
      this.sim = new GameSim(physics, { skipIntro: false });
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
    this.sim.reset({ skipIntro: false });
    this.director.reset();
    this.scene.resetForNewAttempt(this.sim);
    this.scene.setMode('game');
    this.ui.resetHud();
    this.ui.showTitle(false);
    this.ui.closeAllPanels();
    this.ui.showHud(false);
    this.ui.showIntroHint(true);
    this.input.setEnabled(true);
    this.input.requestLock();
    this.state = 'intro';
    this.fightClock = 0;
    this.resultShown = false;
    this.lastPhase2 = false;
    this.hintQueue = [];
    this.audio.setMusic('music_calm', 0.8, 1.5);
    this.audio.startLoop('crowd_loop', 'crowd', 1, 1);
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
    this.scene.resetForNewAttempt(this.sim);
    this.scene.cam.reset(this.sim);
    this.scene.setMode('game');
    this.ui.resetHud();
    this.ui.showHud(true);
    this.ui.showIntroHint(false);
    this.ui.showClickCatch(false);
    this.input.setEnabled(true);
    this.input.requestLock();
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
    this.sim.reset({ skipIntro: false });
    this.director.reset();
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
    this.ui.openPanel('pause');
    void this.audio.ctx?.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.closeAllPanels();
    this.state = this.prevState;
    this.input.setEnabled(true);
    this.input.requestLock();
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
    const dt = rawDt * this.timeScale;
    if (this.state === 'error' || this.state === 'loading' || this.state === 'boot') return;
    const sim = this.sim;
    const sc = this.scene;

    if (sc.contextLost) {
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
      const f = this.input.enabled ? this.input.frame(sc.cam.yaw) : { ...emptyInput(), cameraYaw: sc.cam.yaw };
      if (this.state === 'intro' && (f.pressed.dodge || f.pressed.light || f.pressed.heal)) this.skipIntro();
      sim.update(dt, f);
    }
    const events = sim.drainEvents();
    if (events.length) {
      this.director.handle(events, sim);
      sc.handleEvents(events, sim);
      this.handleFlowEvents(events);
    }
    this.director.tick(dt);
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

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.audio.dispose();
    this.scene.dispose();
    this.sim.dispose();
  }
}
void THREE;
