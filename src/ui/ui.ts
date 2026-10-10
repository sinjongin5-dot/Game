import type { Settings } from '../core/settings';
import type { Quality } from '../render/gameScene';
import type { GameSim } from '../simulation/sim';

export type PanelName = 'settings' | 'controls' | 'credits' | 'pause' | 'death' | 'victory' | 'error';

export interface UICallbacks {
  onStart(): void;
  onResume(): void;
  onRetry(): void;
  onToTitle(): void;
  onSettings(s: Settings): void;
  onRetryLoad(): void;
  onClickSound(): void;
  onHoverSound(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`UI 요소 누락: #${id}`);
  return e as T;
};

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

export class UI {
  private panelStack: PanelName[] = [];
  private hintTimer = 0;
  private hpGhost = 1;
  private bossGhost = 1;
  private lastFlasks = -1;
  private flashTimer = 0;
  private lastHpFrac = -1;
  private lastStFrac = -1;
  private lastBossFrac = -1;
  private el = {
    loading: $('loading'), loadfill: $('loadfill'), loadtext: $('loadtext'), loaderr: $('loaderr'), loaderrMsg: $('loaderr-msg'),
    title: $('title'), hud: $('hud'), vignette: $('vignette'), fade: $('fade'), hint: $('hint'), reticle: $('reticle'), fps: $('fps'),
    hpFill: document.querySelector('#bar-hp .fill') as HTMLElement, hpGhost: document.querySelector('#bar-hp .ghost') as HTMLElement,
    hpNum: $('num-hp'), stBar: $('bar-st'), stFill: document.querySelector('#bar-st .fill') as HTMLElement, flasks: $('flasks'),
    boss: $('boss'), bossBar: document.querySelector('#boss .boss-bar') as HTMLElement,
    bossFill: document.querySelector('#boss .fill') as HTMLElement, bossGhost: document.querySelector('#boss .ghost') as HTMLElement,
    introHint: $('intro-hint'), clickcatch: $('clickcatch'), diag: $('diag'),
  };

  constructor(private settings: Settings, private cb: UICallbacks) {
    const click = (id: string, fn: () => void) => {
      const b = $(id);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onClickSound(); fn(); });
      b.addEventListener('mouseenter', () => this.cb.onHoverSound());
    };
    click('btn-start', () => cb.onStart());
    click('btn-settings', () => this.openPanel('settings'));
    click('btn-controls', () => this.openPanel('controls'));
    click('btn-credits', () => this.openPanel('credits'));
    click('btn-settings-back', () => this.closePanel());
    click('btn-controls-back', () => this.closePanel());
    click('btn-credits-back', () => this.closePanel());
    click('btn-resume', () => cb.onResume());
    click('btn-pause-settings', () => this.openPanel('settings'));
    click('btn-pause-controls', () => this.openPanel('controls'));
    click('btn-pause-title', () => cb.onToTitle());
    click('btn-retry', () => cb.onRetry());
    click('btn-death-title', () => cb.onToTitle());
    click('btn-again', () => cb.onRetry());
    click('btn-victory-title', () => cb.onToTitle());
    click('btn-retry-load', () => cb.onRetryLoad());
    click('btn-err-reload', () => location.reload());
    this.el.clickcatch.addEventListener('click', () => cb.onResume());
    this.bindSettings();
    this.renderFlasks(2);
  }

  // ── 로딩 ──
  showLoading(on: boolean) { this.el.loading.classList.toggle('hidden', !on); }
  setProgress(frac: number, text: string) {
    this.el.loadfill.style.width = `${Math.round(frac * 100)}%`;
    this.el.loadtext.textContent = text;
  }
  showLoadError(msg: string) {
    this.el.loaderr.classList.remove('hidden');
    this.el.loaderrMsg.textContent = msg;
  }
  hideLoadError() { this.el.loaderr.classList.add('hidden'); }

  // ── 타이틀/HUD ──
  showTitle(on: boolean) { this.el.title.classList.toggle('hidden', !on); if (on) this.focusFirst(this.el.title); }
  showHud(on: boolean) { this.el.hud.classList.toggle('hidden', !on); }
  showIntroHint(on: boolean) { this.el.introHint.classList.toggle('hidden', !on); }
  showClickCatch(on: boolean) { this.el.clickcatch.classList.toggle('hidden', !on); }
  flashFade() { this.el.fade.classList.add('on'); setTimeout(() => this.el.fade.classList.remove('on'), 140); }
  fade(on: boolean) { this.el.fade.classList.toggle('on', on); }

  private focusFirst(root: HTMLElement) {
    const b = root.querySelector('button') as HTMLButtonElement | null;
    b?.focus({ preventScroll: true });
  }

  // ── 패널 ──
  get panelOpen() { return this.panelStack.length > 0; }
  get topPanel(): PanelName | null { return this.panelStack[this.panelStack.length - 1] ?? null; }

  private panelEl(n: PanelName) { return $(`panel-${n}`); }

  openPanel(n: PanelName) {
    const top = this.topPanel;
    if (top && top !== n && (n === 'settings' || n === 'controls' || n === 'credits')) this.panelEl(top).classList.add('hidden');
    else if (top && top !== n) this.panelEl(top).classList.add('hidden');
    if (this.panelStack[this.panelStack.length - 1] !== n) this.panelStack.push(n);
    if (n === 'settings') this.syncSettings();
    const el = this.panelEl(n);
    el.classList.remove('hidden');
    this.focusFirst(el);
  }

  closePanel() {
    const n = this.panelStack.pop();
    if (!n) return;
    this.panelEl(n).classList.add('hidden');
    const prev = this.topPanel;
    if (prev) { this.panelEl(prev).classList.remove('hidden'); this.focusFirst(this.panelEl(prev)); }
    else if (!this.el.title.classList.contains('hidden')) this.focusFirst(this.el.title);
  }

  closeAllPanels() {
    for (const n of this.panelStack) this.panelEl(n).classList.add('hidden');
    this.panelStack = [];
  }

  // ── 설정 ──
  private bindSettings() {
    const s = this.settings;
    const seg = $('seg-quality');
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      s.quality = (b as HTMLElement).dataset.v as Quality;
      this.syncSettings();
      this.cb.onSettings(s);
      this.cb.onClickSound();
    }));
    const slider = (id: string, key: 'sensitivity' | 'shake' | 'master' | 'sfx' | 'music', fmt: (v: number) => string) => {
      const r = $<HTMLInputElement>(`rng-${id}`);
      const o = $(`out-${id}`);
      r.addEventListener('input', () => {
        s[key] = parseFloat(r.value);
        o.textContent = fmt(s[key]);
        this.cb.onSettings(s);
      });
    };
    slider('sens', 'sensitivity', (v) => `${Math.round(v * 100)}%`);
    slider('shake', 'shake', (v) => (v <= 0 ? '끔' : `${Math.round(v * 100)}%`));
    slider('master', 'master', (v) => `${Math.round(v * 100)}`);
    slider('sfx', 'sfx', (v) => `${Math.round(v * 100)}`);
    slider('music', 'music', (v) => `${Math.round(v * 100)}`);
    $<HTMLInputElement>('chk-invert').addEventListener('change', (e) => { s.invertY = (e.target as HTMLInputElement).checked; this.cb.onSettings(s); });
    $<HTMLInputElement>('chk-fps').addEventListener('change', (e) => { s.showFps = (e.target as HTMLInputElement).checked; this.cb.onSettings(s); });
    this.syncSettings();
  }

  syncSettings() {
    const s = this.settings;
    $('seg-quality').querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === s.quality));
    const set = (id: string, v: number, fmt: (v: number) => string) => {
      $<HTMLInputElement>(`rng-${id}`).value = String(v);
      $(`out-${id}`).textContent = fmt(v);
    };
    set('sens', s.sensitivity, (v) => `${Math.round(v * 100)}%`);
    set('shake', s.shake, (v) => (v <= 0 ? '끔' : `${Math.round(v * 100)}%`));
    set('master', s.master, (v) => `${Math.round(v * 100)}`);
    set('sfx', s.sfx, (v) => `${Math.round(v * 100)}`);
    set('music', s.music, (v) => `${Math.round(v * 100)}`);
    $<HTMLInputElement>('chk-invert').checked = s.invertY;
    $<HTMLInputElement>('chk-fps').checked = s.showFps;
  }

  // ── 결과 ──
  showDeath(sub: string) {
    $('death-sub').textContent = sub;
    this.openPanel('death');
  }
  showVictory(stats: { time: number; damageTaken: number; dodges: number; blocks: number; hitsLanded: number; heals: number; attempts: number }) {
    const dl = $('victory-stats');
    const rows: [string, string][] = [
      ['전투 시간', fmtTime(stats.time)], ['받은 피해', `${Math.round(stats.damageTaken)}`], ['회피 성공', `${stats.dodges}`],
      ['방어 성공', `${stats.blocks}`], ['적중 횟수', `${stats.hitsLanded}`], ['회복 사용', `${stats.heals}`], ['도전 횟수', `${stats.attempts}`],
    ];
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      d.append(dt, dd);
      dl.append(d);
    }
    this.openPanel('victory');
  }
  showError(title: string, msg: string) {
    $('err-title').textContent = title;
    $('err-msg').textContent = msg;
    this.openPanel('error');
  }

  // ── 전투 HUD ──
  hint(text: string, ms = 4200) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('on');
    this.hintTimer = ms / 1000;
  }
  hideHint() { this.el.hint.classList.remove('on'); this.hintTimer = 0; }
  get hintVisible() { return this.hintTimer > 0; }

  flashDamage(strength: number) {
    this.el.vignette.classList.remove('flash');
    void this.el.vignette.offsetWidth;
    this.el.vignette.style.opacity = '';
    this.el.vignette.classList.add('flash');
    this.flashTimer = 0.09 + strength * 0.08;
  }
  flashStamina() {
    this.el.stBar.classList.remove('flash');
    void this.el.stBar.offsetWidth;
    this.el.stBar.classList.add('flash');
  }

  private renderFlasks(n: number) {
    if (n === this.lastFlasks) return;
    this.lastFlasks = n;
    this.el.flasks.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const f = document.createElement('div');
      f.className = `flask${i < n ? '' : ' empty'}`;
      this.el.flasks.append(f);
    }
  }

  setReticle(visible: boolean, x: number, y: number) {
    const r = this.el.reticle;
    r.classList.toggle('on', visible);
    if (visible) r.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(45deg)`;
  }

  setFps(text: string | null) {
    this.el.fps.textContent = text ?? '';
  }
  setDiag(text: string | null) {
    this.el.diag.classList.toggle('hidden', text === null);
    if (text !== null) this.el.diag.textContent = text;
  }

  updateHud(sim: GameSim, dt: number) {
    const p = sim.player, l = sim.lion;
    const hpFrac = p.hp / p.hpMax;
    this.hpGhost = Math.max(hpFrac, this.hpGhost - dt * 0.35);
    if (hpFrac !== this.lastHpFrac) {
      this.el.hpFill.style.transform = `scaleX(${hpFrac})`;
      this.el.hpNum.textContent = `${Math.ceil(p.hp)}`;
      this.lastHpFrac = hpFrac;
    }
    this.el.hpGhost.style.transform = `scaleX(${this.hpGhost})`;
    const stFrac = p.stamina / p.staminaMax;
    if (stFrac !== this.lastStFrac) {
      this.el.stFill.style.transform = `scaleX(${stFrac})`;
      this.lastStFrac = stFrac;
    }
    this.el.stBar.classList.toggle('low', p.stamina < 18 || p.exhausted);
    this.renderFlasks(p.heals);
    const bf = Math.max(0, l.hp / l.hpMax);
    this.bossGhost = Math.max(bf, this.bossGhost - dt * 0.25);
    if (bf !== this.lastBossFrac) {
      this.el.bossFill.style.transform = `scaleX(${bf})`;
      this.lastBossFrac = bf;
      this.el.bossBar.classList.toggle('phase2', l.phase === 2);
    }
    this.el.bossGhost.style.transform = `scaleX(${this.bossGhost})`;
    this.el.vignette.classList.toggle('low', hpFrac < 0.3 && p.mode !== 'dead' && sim.phase === 'fight');
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) { this.el.vignette.classList.remove('flash'); this.el.vignette.style.opacity = '0'; }
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('on');
    }
  }

  resetHud() {
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.lastHpFrac = this.lastStFrac = this.lastBossFrac = -1;
    this.lastFlasks = -1;
    this.hideHint();
    this.el.vignette.classList.remove('flash', 'low');
    this.el.vignette.style.opacity = '0';
  }
}
