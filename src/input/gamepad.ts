/**
 * Xbox(표준 매핑) 컨트롤러 입력. 브라우저 Gamepad API 를 매 프레임 읽어 전투 입력/메뉴 탐색 입력으로 바꾼다.
 *
 * 전투: 왼쪽 스틱 이동 · 오른쪽 스틱 시점 · RB 약공격 · RT/Y 강공격(처형) · LB/LT 방패(유지) · B 회피 · X 회복 · A 달리기(유지) · R3 락온 · Start 일시정지
 * 방패 밀치기: LB 를 누른 채 RB · 기세 폭발: D-패드 위 (게이지가 가득 찼을 때)
 * 상호작용(물어뜯기 막기): 화면에 표시되는 A/B/X/Y 버튼을 정확한 타이밍에 누른다
 * 메뉴: D-패드/왼쪽 스틱 이동 · A 확인 · B 뒤로 · Start 계속하기
 */

export interface PadSnapshot {
  connected: boolean;
  id: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadFrame {
  active: boolean;
  moveX: number;
  moveY: number;
  /** 이번 프레임의 시점 변화량(마우스 이동 픽셀과 같은 단위) */
  lookDx: number;
  lookDy: number;
  run: boolean;
  guard: boolean;
  pressed: { light: boolean; heavy: boolean; dodge: boolean; heal: boolean; lock: boolean; a: boolean; b: boolean; x: boolean; y: boolean; fury: boolean };
  menu: { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean; start: boolean };
  /** 어떤 입력이든 이번 프레임에 있었는가 (장치 전환 감지) */
  anyInput: boolean;
}

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export const PAD_DEFAULTS = {
  deadzone: 0.2,
  /** 오른쪽 스틱 최대 회전 속도에 해당하는 초당 픽셀(마우스 이동 단위) */
  lookSpeed: 1350,
  triggerThreshold: 0.45,
  /** 메뉴 스틱 입력 임계값/반복 */
  menuThreshold: 0.6,
  repeatDelay: 0.38,
  repeatRate: 0.13,
};

/** 반경 데드존 + 재스케일: 데드존 안은 0, 바깥은 0..1 로 펴 준다 */
export function applyDeadzone(x: number, y: number, dz = PAD_DEFAULTS.deadzone): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= dz) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

const btn = (s: PadSnapshot, i: number) => !!s.buttons[i]?.pressed || (s.buttons[i]?.value ?? 0) > 0.5;
const trig = (s: PadSnapshot, i: number) => (s.buttons[i]?.value ?? (s.buttons[i]?.pressed ? 1 : 0)) > PAD_DEFAULTS.triggerThreshold || !!s.buttons[i]?.pressed;

export const emptyPadFrame = (): PadFrame => ({
  active: false, moveX: 0, moveY: 0, lookDx: 0, lookDy: 0, run: false, guard: false,
  pressed: { light: false, heavy: false, dodge: false, heal: false, lock: false, a: false, b: false, x: false, y: false, fury: false },
  menu: { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false },
  anyInput: false,
});

/** 메뉴 방향 입력의 반복(눌린 채 유지하면 일정 간격으로 계속) 상태 */
export class RepeatGate {
  private held = false;
  private t = 0;
  step(on: boolean, dt: number): boolean {
    if (!on) { this.held = false; this.t = 0; return false; }
    if (!this.held) { this.held = true; this.t = PAD_DEFAULTS.repeatDelay; return true; }
    this.t -= dt;
    if (this.t <= 0) { this.t += PAD_DEFAULTS.repeatRate; return true; }
    return false;
  }
}

/**
 * 순수 함수: 직전/현재 스냅샷으로 프레임 입력을 만든다 (눌림 에지 = 이전엔 안 눌림 && 지금 눌림).
 * 시점은 dt 와 감도로 환산한다.
 */
export function mapPad(prev: PadSnapshot | null, cur: PadSnapshot, dt: number, sens = 1, invertY = false): PadFrame {
  const f = emptyPadFrame();
  if (!cur.connected) return f;
  f.active = true;
  const edge = (i: number) => btn(cur, i) && !(prev && btn(prev, i));
  const tedge = (i: number) => trig(cur, i) && !(prev && trig(prev, i));
  const l = applyDeadzone(cur.axes[0] ?? 0, cur.axes[1] ?? 0);
  const r = applyDeadzone(cur.axes[2] ?? 0, cur.axes[3] ?? 0);
  f.moveX = l.x;
  f.moveY = -l.y;
  // 시점: 응답 곡선(작은 입력은 정밀하게, 끝까지 밀면 빠르게)
  const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
  f.lookDx = curve(r.x) * PAD_DEFAULTS.lookSpeed * dt * sens;
  f.lookDy = curve(r.y) * PAD_DEFAULTS.lookSpeed * dt * sens * (invertY ? 1 : 1);
  f.run = btn(cur, PAD.A) || btn(cur, PAD.L3);
  f.guard = btn(cur, PAD.LB) || trig(cur, PAD.LT);
  f.pressed.light = edge(PAD.RB);
  f.pressed.heavy = tedge(PAD.RT) || edge(PAD.Y);
  f.pressed.dodge = edge(PAD.B);
  f.pressed.heal = edge(PAD.X);
  f.pressed.lock = edge(PAD.R3);
  f.pressed.a = edge(PAD.A);
  f.pressed.b = edge(PAD.B);
  f.pressed.x = edge(PAD.X);
  f.pressed.y = edge(PAD.Y);
  f.pressed.fury = edge(PAD.UP); // 기세 폭발: D-패드 위
  f.menu.confirm = edge(PAD.A);
  f.menu.back = edge(PAD.B);
  f.menu.start = edge(PAD.START);
  const anyBtn = cur.buttons.some((b, i) => (b.pressed || b.value > 0.5) && !(prev && prev.buttons[i] && (prev.buttons[i].pressed || prev.buttons[i].value > 0.5)));
  f.anyInput = anyBtn || Math.hypot(l.x, l.y) > 0.01 || Math.hypot(r.x, r.y) > 0.01;
  return f;
}

/** 브라우저의 Gamepad 를 읽어 PadSnapshot/PadFrame 으로 바꾸는 폴러 */
export class GamepadInput {
  private prev: PadSnapshot | null = null;
  private index = -1;
  private gates = { up: new RepeatGate(), down: new RepeatGate(), left: new RepeatGate(), right: new RepeatGate() };
  connected = false;
  padId = '';
  onConnect: ((id: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  /** 시점/위치 읽기를 바꿔 끼울 수 있다(테스트) */
  getPads: () => readonly (Gamepad | null)[] = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e) => { this.index = (e as GamepadEvent).gamepad.index; });
      window.addEventListener('gamepaddisconnected', (e) => { if ((e as GamepadEvent).gamepad.index === this.index) this.index = -1; });
    }
  }

  /** 현재 사용 중인 Gamepad 객체 (진동에 필요) */
  current(): Gamepad | null {
    const pads = this.getPads();
    const g = this.index >= 0 ? pads[this.index] : null;
    return g && g.connected ? g : null;
  }

  private pick(): Gamepad | null {
    const pads = this.getPads();
    const cur = this.index >= 0 ? pads[this.index] : null;
    if (cur && cur.connected) return cur;
    for (let i = 0; i < pads.length; i++) {
      const g = pads[i];
      if (g && g.connected) { this.index = i; return g; }
    }
    return null;
  }

  poll(dt: number, sens = 1, invertY = false): PadFrame {
    const g = this.pick();
    if (!g) {
      if (this.connected) { this.connected = false; this.onDisconnect?.(); }
      this.prev = null;
      return emptyPadFrame();
    }
    if (!this.connected) { this.connected = true; this.padId = g.id; this.onConnect?.(g.id); }
    const snap: PadSnapshot = { connected: true, id: g.id, axes: g.axes, buttons: g.buttons.map((b) => ({ pressed: b.pressed, value: b.value })) };
    const f = mapPad(this.prev, snap, dt, sens, invertY);
    // 메뉴 방향: D-패드 + 왼쪽 스틱 (눌러 유지하면 반복)
    const lx = snap.axes[0] ?? 0, ly = snap.axes[1] ?? 0, T = PAD_DEFAULTS.menuThreshold;
    f.menu.up = this.gates.up.step(btn(snap, PAD.UP) || ly < -T, dt);
    f.menu.down = this.gates.down.step(btn(snap, PAD.DOWN) || ly > T, dt);
    f.menu.left = this.gates.left.step(btn(snap, PAD.LEFT) || lx < -T, dt);
    f.menu.right = this.gates.right.step(btn(snap, PAD.RIGHT) || lx > T, dt);
    if (f.menu.up || f.menu.down || f.menu.left || f.menu.right) f.anyInput = true;
    this.prev = snap;
    return f;
  }
}
