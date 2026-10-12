import type { Settings } from '../core/settings';
import type { Quality } from '../render/gameScene';
import type { GameSim } from '../simulation/sim';
import type { CalloutKind, GrappleState, PlayerState, QteButton, QteMode } from '../simulation/state';
import type { InputDevice } from '../input/input';

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
    title: $('title'), hud: $('hud'), vignette: $('vignette'), screenFlash: $('screenflash'), fade: $('fade'), hint: $('hint'), reticle: $('reticle'), fps: $('fps'),
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
    const rr = $<HTMLInputElement>('rng-rumble');
    rr.addEventListener('input', () => { s.rumble = parseFloat(rr.value); $('out-rumble').textContent = s.rumble <= 0 ? '끔' : `${Math.round(s.rumble * 100)}%`; this.cb.onSettings(s); });
    $('seg-qte').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      s.qte = (b as HTMLElement).dataset.v as QteMode;
      this.syncSettings();
      this.cb.onSettings(s);
      this.cb.onClickSound();
    }));
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
    $<HTMLInputElement>('rng-rumble').value = String(s.rumble);
    $('out-rumble').textContent = s.rumble <= 0 ? '끔' : `${Math.round(s.rumble * 100)}%`;
    $('seg-qte').querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === s.qte));
    $<HTMLInputElement>('chk-invert').checked = s.invertY;
    $<HTMLInputElement>('chk-fps').checked = s.showFps;
  }

  // ── 결과 ──
  showDeath(sub: string) {
    this.hideHint();
    $('death-sub').textContent = sub;
    this.openPanel('death');
  }
  showVictory(stats: { time: number; damageTaken: number; dodges: number; blocks: number; hitsLanded: number; heals: number; attempts: number; qteSuccess?: number; maxCombo?: number; perfectDodges?: number }) {
    this.hideHint();
    const dl = $('victory-stats');
    const rows: [string, string][] = [
      ['전투 시간', fmtTime(stats.time)], ['받은 피해', `${Math.round(stats.damageTaken)}`], ['회피 성공', `${stats.dodges}`],
      ['방어 성공', `${stats.blocks}`], ['적중 횟수', `${stats.hitsLanded}`], ['회복 사용', `${stats.heals}`], ['물어뜯기 막기', `${stats.qteSuccess ?? 0}`], ['최대 연타', `${stats.maxCombo ?? 0}`], ['완벽 회피', `${stats.perfectDodges ?? 0}`], ['도전 횟수', `${stats.attempts}`],
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
  /** 전체 화면 색 번쩍임 (패링/처치/포효). color 는 'r,g,b' */
  screenFlash(color: string, strength: number) {
    const el = this.el.screenFlash;
    el.style.transition = 'none';
    el.style.background = `radial-gradient(ellipse at center, rgba(${color},${(strength * 0.35).toFixed(3)}) 0%, rgba(${color},${strength.toFixed(3)}) 100%)`;
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.38s ease-out';
    el.style.opacity = '0';
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

  // ── 기세 / 콜아웃 / 연속 타격 ──
  private static CALLOUT: Record<CalloutKind, string> = {
    parry: '패링!', dodge: '완벽한 회피!', clash: '받아치기!', bash: '방패 밀치기!', combo: '', fury: '기세 폭발!', execute: '처형!', counter: '반격!', riposte: '반격 적중',
  };
  private lastCombo = 0;
  private lastMoKey = '';

  callout(kind: CalloutKind, n?: number) {
    const box = $('callouts');
    while (box.children.length >= 3) box.firstElementChild?.remove();
    const el = document.createElement('div');
    el.className = `callout ${kind}`;
    el.textContent = kind === 'combo' ? `${n} 연타!` : UI.CALLOUT[kind];
    box.append(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** 기세 게이지, 폭발 안내, 연속 타격 수, 완벽 회피 비네트를 갱신 (매 프레임) */
  updateCombat(p: PlayerState, witch: boolean) {
    const mo = $('bar-mo');
    const fill = mo.querySelector('.fill') as HTMLElement;
    const frac = Math.max(0, Math.min(1, p.momentum / 100));
    const fury = p.furyT > 0, ready = !fury && frac >= 1;
    const key = `${frac.toFixed(3)}|${fury}|${ready}|${this.device}`;
    if (key !== this.lastMoKey) {
      this.lastMoKey = key;
      fill.style.transform = `scaleX(${frac})`;
      mo.classList.toggle('fury', fury);
      mo.classList.toggle('ready', ready);
      const hint = $('mo-hint');
      hint.classList.toggle('hidden', !ready);
      if (ready) hint.textContent = this.device === 'pad' ? '기세 폭발 — 방향키 ↑' : '기세 폭발 — R';
    }
    const c = $('combo');
    if (p.combo !== this.lastCombo) {
      this.lastCombo = p.combo;
      c.classList.toggle('hidden', p.combo < 2);
      if (p.combo >= 2) {
        $('combo-n').textContent = String(p.combo);
        c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
      }
    }
    $('witch-vig').classList.toggle('on', witch);
  }

  // ── 입력 장치 / 상호작용(QTE) ──
  private device: InputDevice = 'kbm';
  private toastTimer = 0;
  private qteLastKey = '';
  private qteTitleT = 0;

  setDevice(d: InputDevice) {
    this.device = d;
    document.body.classList.toggle('dev-pad', d === 'pad');
    this.qteLastKey = '';
  }
  get deviceNow() { return this.device; }

  /** 컨트롤러 연결/해제 알림 */
  padToast(text: string, ms = 2600) {
    const t = $('pad-toast');
    t.textContent = text;
    t.classList.remove('hidden');
    this.toastTimer = ms / 1000;
  }

  private static KEYS: Record<QteButton, string> = { A: 'SPACE', B: 'Q', X: 'E', Y: 'F' };

  /** 포획 상호작용 오버레이 갱신 (매 프레임, 시뮬레이션 상태를 읽기만 한다) */
  updateQte(g: GrappleState | null, dt: number) {
    const root = $('qte');
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) $('pad-toast').classList.add('hidden'); }
    if (this.qteTitleT > 0) { this.qteTitleT -= dt; if (this.qteTitleT <= 0 && g) $('qte-title').textContent = ''; }
    if (!g) { if (!root.classList.contains('hidden')) root.classList.add('hidden'); return; }
    root.classList.remove('hidden');
    const btn = $('qte-btn'), ring = $('qte-ring'), glyph = $('qte-glyph'), label = $('qte-label');
    const pips = $('qte-pips').children;
    for (let i = 0; i < pips.length; i++) (pips[i] as HTMLElement).className = g.results[i] && g.results[i] !== 'pending' ? g.results[i] : '';
    if (g.phase === 'intro') {
      btn.style.visibility = 'hidden'; label.textContent = '';
      if (this.qteTitleT <= 0) this.qteTitle('물렸다!', '');
      return;
    }
    btn.style.visibility = 'visible';
    const b: QteButton = g.phase === 'counter' ? g.counterBtn : g.prompts[g.idx];
    const key = `${b}|${this.device}`;
    if (key !== this.qteLastKey) {
      this.qteLastKey = key;
      glyph.className = `qte-glyph ${b}${this.device === 'kbm' ? ' key' : ''}`;
      glyph.textContent = this.device === 'kbm' ? UI.KEYS[b] : b;
    }
    if (g.phase === 'bite') {
      const inWin = g.t >= g.winStart && g.t <= g.winEnd && !g.resolved;
      const span = Math.max(0.05, g.winEnd - 0.05);
      const u = Math.min(1, Math.max(0, (g.winEnd - g.t) / span));
      ring.style.transform = `scale(${(1 + 1.5 * u).toFixed(3)})`;
      ring.style.opacity = g.resolved ? '0' : '0.95';
      btn.classList.toggle('go', inWin);
      label.textContent = g.resolved ? '' : `${g.idx + 1} / ${g.prompts.length}`;
      if (!g.resolved && this.qteTitleT <= 0) this.qteTitle('막아라!', '');
    } else {
      const pulse = 1 + 0.35 * (0.5 + 0.5 * Math.sin(g.t * 14));
      ring.style.transform = `scale(${pulse.toFixed(3)})`;
      ring.style.opacity = '0.95';
      btn.classList.add('go');
      label.textContent = '';
      this.qteTitle('반격!', 'perfect', 0.5);
    }
  }

  private qteTitle(text: string, cls: string, hold = 0.4) {
    const t = $('qte-title');
    t.textContent = text;
    t.className = `qte-title ${cls}`;
    this.qteTitleT = hold;
  }

  /** 한 번의 물기 결과 표시 */
  qteResult(ok: boolean, perfect: boolean) {
    this.qteTitle(ok ? (perfect ? '완벽!' : '막았다!') : '물렸다', ok ? (perfect ? 'perfect' : 'ok') : 'miss', 0.7);
  }

  resetHud() {
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.lastHpFrac = this.lastStFrac = this.lastBossFrac = -1;
    this.lastFlasks = -1;
    this.hideHint();
    this.el.vignette.classList.remove('flash', 'low');
    this.el.vignette.style.opacity = '0';
    $('qte').classList.add('hidden');
    $('callouts').innerHTML = '';
    this.lastCombo = 0; this.lastMoKey = '';
    $('combo').classList.add('hidden');
    $('witch-vig').classList.remove('on');
  }
}
