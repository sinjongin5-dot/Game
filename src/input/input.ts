import type { InputFrame } from '../simulation/state';

export interface PressedFlags { light: boolean; heavy: boolean; dodge: boolean; heal: boolean; lock: boolean }

/**
 * 키보드/마우스 입력. 포인터 잠금, 포커스 상실, 우클릭 메뉴/스크롤 방지, 눌림 에지 소비를 담당한다.
 * enabled=false (메뉴/일시정지) 이면 모든 입력 상태를 비운다.
 */
export class Input {
  private keys = new Set<string>();
  private buttons = new Set<number>();
  private pressed: PressedFlags = { light: false, heavy: false, dodge: false, heal: false, lock: false };
  private lookDx = 0;
  private lookDy = 0;
  private _enabled = false;
  private _locked = false;
  pointerLockFailed = false;
  private lockFailCount = 0;
  private listeners: (() => void)[] = [];
  onEscape: (() => void) | null = null;
  onLockLost: (() => void) | null = null;
  onBlur: (() => void) | null = null;
  onSkip: (() => void) | null = null;
  onAnyKeyDown: (() => void) | null = null;
  debugToggle: (() => void) | null = null;

  constructor(private canvas: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(t: Window | Document | HTMLElement, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.listeners.push(() => t.removeEventListener(type, fn, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => this.keyDown(e));
    on(window, 'keyup', (e: KeyboardEvent) => this.keyUp(e));
    on(window, 'blur', () => this.releaseAll(true));
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(true); });
    on(canvas, 'mousedown', (e: MouseEvent) => this.mouseDown(e));
    on(window, 'mouseup', (e: MouseEvent) => this.buttons.delete(e.button));
    on(window, 'mousemove', (e: MouseEvent) => this.mouseMove(e));
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'contextmenu', (e: Event) => { if (this._enabled) e.preventDefault(); });
    on(canvas, 'wheel', (e: Event) => e.preventDefault(), { passive: false });
    on(canvas, 'auxclick', (e: Event) => e.preventDefault());
    on(document, 'pointerlockchange', () => this.lockChanged());
    on(document, 'pointerlockerror', () => { this.pointerLockFailed = ++this.lockFailCount >= 2; });
  }

  get enabled() { return this._enabled; }
  get locked() { return this._locked; }

  /** 전투 입력 활성/비활성. 비활성화하면 포인터 잠금을 풀고 모든 상태를 비운다. */
  setEnabled(v: boolean) {
    if (v === this._enabled) return;
    this._enabled = v;
    if (!v) {
      this.releaseAll(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  requestLock() {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const r = (this.canvas as HTMLCanvasElement).requestPointerLock() as unknown as Promise<void> | void;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => { this.pointerLockFailed = ++this.lockFailCount >= 2; });
    } catch {
      this.pointerLockFailed = true;
    }
  }

  private lockChanged() {
    const was = this._locked;
    this._locked = document.pointerLockElement === this.canvas;
    if (was && !this._locked) {
      this.releaseAll(false);
      if (this._enabled) this.onLockLost?.();
    }
  }

  private releaseAll(blur: boolean) {
    this.keys.clear();
    this.buttons.clear();
    this.pressed = { light: false, heavy: false, dodge: false, heal: false, lock: false };
    this.lookDx = this.lookDy = 0;
    if (blur) this.onBlur?.();
  }

  private keyDown(e: KeyboardEvent) {
    // 브라우저 기본 동작 차단 (스페이스 스크롤, 탭 이동 등)
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && (this._enabled || e.target === document.body)) e.preventDefault();
    if (e.code === 'F3') { e.preventDefault(); this.debugToggle?.(); return; }
    this.onAnyKeyDown?.();
    if (e.code === 'Escape') { if (!e.repeat) this.onEscape?.(); return; }
    if (e.code === 'Enter' && !e.repeat) this.onSkip?.();
    if (!this._enabled || e.repeat) { if (this._enabled) this.keys.add(e.code); return; }
    this.keys.add(e.code);
    switch (e.code) {
      case 'KeyQ': this.pressed.heavy = true; break;
      case 'Space': this.pressed.dodge = true; break;
      case 'KeyE': this.pressed.heal = true; break;
      case 'KeyF': this.pressed.lock = true; break;
      default: break;
    }
  }
  private keyUp(e: KeyboardEvent) { this.keys.delete(e.code); }

  private mouseDown(e: MouseEvent) {
    if (!this._enabled) return;
    if (e.button === 1) e.preventDefault();
    // 포인터 잠금이 없으면 이 클릭은 잠금 요청으로만 쓴다 (공격으로 처리하지 않음)
    if (!this._locked && !this.pointerLockFailed) { this.requestLock(); return; }
    this.buttons.add(e.button);
    if (e.button === 0) this.pressed.light = true;
    if (e.button === 1) this.pressed.lock = true;
  }

  private mouseMove(e: MouseEvent) {
    if (!this._enabled) return;
    if (this._locked || this.pointerLockFailed) {
      this.lookDx += e.movementX;
      this.lookDy += e.movementY;
    }
  }

  /** 시뮬레이션에 넘길 프레임 입력을 만들고 눌림 에지를 소비한다 */
  frame(cameraYaw: number): InputFrame {
    const k = this.keys;
    const f: InputFrame = {
      moveX: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      moveY: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      run: k.has('ShiftLeft') || k.has('ShiftRight'),
      guard: this.buttons.has(2),
      cameraYaw,
      pressed: { ...this.pressed },
    };
    this.pressed = { light: false, heavy: false, dodge: false, heal: false, lock: false };
    return f;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = this.lookDy = 0;
    return r;
  }

  heldKeys() { return [...this.keys]; }
  heldButtons() { return [...this.buttons]; }

  dispose() {
    for (const f of this.listeners) f();
    this.listeners = [];
  }
}
