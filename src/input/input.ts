import type { InputFrame } from '../simulation/state';
import { emptyPadFrame, GamepadInput, type PadFrame } from './gamepad';

export interface PressedFlags { light: boolean; heavy: boolean; dodge: boolean; heal: boolean; lock: boolean; a: boolean; b: boolean; x: boolean; y: boolean }
const noPressed = (): PressedFlags => ({ light: false, heavy: false, dodge: false, heal: false, lock: false, a: false, b: false, x: false, y: false });

export type InputDevice = 'kbm' | 'pad';

/**
 * 키보드/마우스 입력. 포인터 잠금, 포커스 상실, 우클릭 메뉴/스크롤 방지, 눌림 에지 소비를 담당한다.
 * enabled=false (메뉴/일시정지) 이면 모든 입력 상태를 비운다.
 */
export class Input {
  private keys = new Set<string>();
  private buttons = new Set<number>();
  private pressed: PressedFlags = noPressed();
  readonly pad = new GamepadInput();
  /** 마지막으로 입력이 들어온 장치 (UI 글리프/커서 표시/포인터 잠금 판단용) */
  lastDevice: InputDevice = 'kbm';
  private padFrame: PadFrame = emptyPadFrame();
  onDeviceChange: ((d: InputDevice) => void) | null = null;
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
    this.pressed = noPressed();
    this.lookDx = this.lookDy = 0;
    if (blur) this.onBlur?.();
  }

  private keyDown(e: KeyboardEvent) {
    // 브라우저 기본 동작 차단 (스페이스 스크롤, 탭 이동 등)
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && (this._enabled || e.target === document.body)) e.preventDefault();
    if (e.code === 'F3') { e.preventDefault(); this.debugToggle?.(); return; }
    this.setDevice('kbm');
    this.onAnyKeyDown?.();
    if (e.code === 'Escape') { if (!e.repeat) this.onEscape?.(); return; }
    if (e.code === 'Enter' && !e.repeat) this.onSkip?.();
    if (!this._enabled || e.repeat) { if (this._enabled) this.keys.add(e.code); return; }
    this.keys.add(e.code);
    switch (e.code) {
      // 상호작용(물어뜯기 막기) 버튼: Space=A, Q=B, E=X, F=Y — 평소 기능과 같은 키라 따로 외울 것이 없다
      case 'KeyQ': this.pressed.heavy = true; this.pressed.b = true; break;
      case 'Space': this.pressed.dodge = true; this.pressed.a = true; break;
      case 'KeyE': this.pressed.heal = true; this.pressed.x = true; break;
      case 'KeyF': this.pressed.lock = true; this.pressed.y = true; break;
      default: break;
    }
  }
  private keyUp(e: KeyboardEvent) { this.keys.delete(e.code); }

  private mouseDown(e: MouseEvent) {
    this.setDevice('kbm');
    if (!this._enabled) return;
    if (e.button === 1) e.preventDefault();
    // 포인터 잠금이 없으면 이 클릭은 잠금 요청으로만 쓴다 (공격으로 처리하지 않음)
    if (!this._locked && !this.pointerLockFailed) { this.requestLock(); return; }
    this.buttons.add(e.button);
    if (e.button === 0) this.pressed.light = true;
    if (e.button === 1) this.pressed.lock = true;
  }

  private mouseMove(e: MouseEvent) {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.setDevice('kbm');
    if (!this._enabled) return;
    if (this._locked || this.pointerLockFailed) {
      this.lookDx += e.movementX;
      this.lookDy += e.movementY;
    }
  }

  /** 시뮬레이션에 넘길 프레임 입력을 만들고 눌림 에지를 소비한다 */
  frame(cameraYaw: number): InputFrame {
    const k = this.keys;
    const pf = this._enabled ? this.padFrame : emptyPadFrame();
    const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), ky = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    // 키보드와 스틱이 함께 들어오면 더 크게 기울인 쪽을 쓴다
    const mx = Math.abs(pf.moveX) > Math.abs(kx) ? pf.moveX : kx;
    const my = Math.abs(pf.moveY) > Math.abs(ky) ? pf.moveY : ky;
    const pp = pf.pressed;
    const f: InputFrame = {
      moveX: mx,
      moveY: my,
      run: k.has('ShiftLeft') || k.has('ShiftRight') || pf.run,
      guard: this.buttons.has(2) || pf.guard,
      cameraYaw,
      pressed: {
        light: this.pressed.light || pp.light, heavy: this.pressed.heavy || pp.heavy, dodge: this.pressed.dodge || pp.dodge, heal: this.pressed.heal || pp.heal, lock: this.pressed.lock || pp.lock,
        a: this.pressed.a || pp.a, b: this.pressed.b || pp.b, x: this.pressed.x || pp.x, y: this.pressed.y || pp.y,
      },
    };
    this.pressed = noPressed();
    // 컨트롤러 눌림 에지는 한 번 소비하면 비운다 (같은 프레임이 두 번 읽혀도 중복되지 않게)
    this.padFrame = { ...pf, pressed: { ...noPressed() }, menu: { ...pf.menu } };
    return f;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDx + (this._enabled ? this.padFrame.lookDx : 0), dy: this.lookDy + (this._enabled ? this.padFrame.lookDy : 0) };
    this.lookDx = this.lookDy = 0;
    this.padFrame.lookDx = this.padFrame.lookDy = 0;
    return r;
  }

  private setDevice(d: InputDevice) {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    this.onDeviceChange?.(d);
  }

  /**
   * 매 프레임 한 번 호출: 컨트롤러를 읽는다. 전투 입력이 꺼져 있어도(메뉴) 읽어서 반환하며, 메뉴 탐색은 반환값의 menu 를 쓴다.
   * 전투 입력은 enabled 일 때만 frame()/consumeLook() 이 사용한다.
   */
  pollPad(dt: number, sens: number, invertY: boolean): PadFrame {
    const pf = this.pad.poll(dt, sens, invertY);
    if (pf.anyInput) this.setDevice('pad');
    if (this._enabled) {
      // 이전 프레임에 소비되지 않은 눌림은 유지(OR)하고 이동/시점/유지 입력은 최신 값으로 갱신
      const old = this.padFrame;
      const merged = { ...pf, pressed: { ...pf.pressed }, lookDx: pf.lookDx + old.lookDx, lookDy: pf.lookDy + old.lookDy };
      for (const k of Object.keys(old.pressed) as (keyof PressedFlags)[]) merged.pressed[k] = merged.pressed[k] || old.pressed[k];
      this.padFrame = merged;
    } else this.padFrame = emptyPadFrame();
    return pf;
  }

  heldKeys() { return [...this.keys]; }
  heldButtons() { return [...this.buttons]; }

  dispose() {
    for (const f of this.listeners) f();
    this.listeners = [];
  }
}
