import type { PadFrame } from '../input/gamepad';

/**
 * 컨트롤러로 DOM 메뉴를 탐색한다 (타이틀, 설정, 조작법, 크레딧, 일시정지, 사망/승리, 오류).
 * 화면에 보이는 가장 위 패널의 버튼·슬라이더·체크박스·구간 선택(seg)을 순서대로 돌며 선택하고,
 * A 로 누르고 B 로 뒤로 간다. 슬라이더는 좌우로 값을 바꾼다. 마우스/키보드 동작은 건드리지 않는다.
 */
const ROOTS = ['#panel-error', '#panel-settings', '#panel-controls', '#panel-credits', '#panel-pause', '#panel-death', '#panel-victory', '#title', '#loaderr'];
const FOCUSABLE = 'button:not([disabled]), input[type=range], input[type=checkbox]';

export interface NavCallbacks {
  /** 이동/확인 때 소리·진동 */
  onMove(): void;
  onConfirm(): void;
}

const visible = (el: HTMLElement) => {
  let n: HTMLElement | null = el;
  while (n) {
    if (n.classList.contains('hidden')) return false;
    n = n.parentElement;
  }
  return true;
};

export class MenuNav {
  private idx = 0;
  private lastRoot: HTMLElement | null = null;
  private cur: HTMLElement | null = null;

  constructor(private cb: NavCallbacks) {}

  /** 지금 입력을 받아야 하는 최상위 패널 */
  activeRoot(): HTMLElement | null {
    for (const sel of ROOTS) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && visible(el)) return el;
    }
    return null;
  }

  items(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => visible(e));
  }

  clear() {
    this.cur?.classList.remove('gp-focus');
    this.cur?.closest('.row')?.classList.remove('gp-row');
    this.cur = null;
  }

  private select(items: HTMLElement[], i: number) {
    if (!items.length) return;
    this.idx = (i + items.length) % items.length;
    this.clear();
    const el = items[this.idx];
    this.cur = el;
    el.classList.add('gp-focus');
    el.closest('.row')?.classList.add('gp-row');
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest' });
  }

  /** 마우스가 다시 쓰이면 컨트롤러 선택 표시를 지운다 */
  deactivate() { this.clear(); this.lastRoot = null; }

  /** 매 프레임: 컨트롤러 메뉴 입력 처리. 처리한 입력이 있으면 true */
  update(pf: PadFrame): boolean {
    const root = this.activeRoot();
    if (!root) { this.clear(); this.lastRoot = null; return false; }
    const items = this.items(root);
    if (!items.length) return false;
    // 패널이 바뀌었거나 선택이 사라졌으면 첫 항목(또는 기본 강조)부터
    if (root !== this.lastRoot || !this.cur || !items.includes(this.cur)) {
      this.lastRoot = root;
      const primary = items.findIndex((e) => e.classList.contains('primary'));
      this.select(items, primary >= 0 ? primary : 0);
      if (!pf.anyInput) return false;
    }
    const m = pf.menu;
    const el = this.cur!;
    const isRange = el instanceof HTMLInputElement && el.type === 'range';
    const inSeg = !!el.closest('.seg');
    let handled = false;
    if (m.up) { this.step(items, -1, root); handled = true; }
    else if (m.down) { this.step(items, 1, root); handled = true; }
    else if (m.left || m.right) {
      const dir = m.left ? -1 : 1;
      if (isRange) {
        const r = el as HTMLInputElement;
        const stp = parseFloat(r.step) || 0.05, mn = parseFloat(r.min), mx = parseFloat(r.max);
        const v = Math.min(mx, Math.max(mn, parseFloat(r.value) + dir * stp));
        if (v !== parseFloat(r.value)) { r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }
        this.cb.onMove();
      } else if (inSeg) {
        const sib = [...el.closest('.seg')!.querySelectorAll<HTMLElement>('button')];
        const i = sib.indexOf(el);
        const ni = Math.min(sib.length - 1, Math.max(0, i + dir));
        if (ni !== i) { this.select(items, items.indexOf(sib[ni])); this.cb.onMove(); }
      }
      handled = true;
    } else if (m.confirm) {
      this.cb.onConfirm();
      (el as HTMLElement).click();
      handled = true;
    } else if (m.back || (m.start && root.id === 'panel-pause')) {
      this.back(root);
      handled = true;
    }
    return handled;
  }

  private step(items: HTMLElement[], d: number, root: HTMLElement) {
    // seg(구간 선택) 안의 버튼들은 한 줄로 취급: 위/아래는 다음 행으로 건너뛴다
    let i = this.idx;
    const curSeg = this.cur?.closest('.seg') ?? null;
    do { i = (i + d + items.length) % items.length; } while (curSeg && items[i].closest('.seg') === curSeg && items.length > 1 && i !== this.idx);
    this.select(items, i);
    this.cb.onMove();
    void root;
  }

  /** B: 뒤로. 패널의 '뒤로/계속하기' 버튼을 누른다 */
  private back(root: HTMLElement) {
    const back = root.querySelector<HTMLElement>('[id$="-back"]') ?? (root.id === 'panel-pause' ? root.querySelector<HTMLElement>('#btn-resume') : null);
    if (back) { this.cb.onConfirm(); back.click(); }
  }
}
