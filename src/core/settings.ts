import type { Quality } from '../render/gameScene';
import type { QteMode } from '../simulation/state';

export interface Settings {
  quality: Quality;
  sensitivity: number;
  shake: number; // 0..1 (카메라 흔들림 강도)
  invertY: boolean;
  master: number;
  sfx: number;
  music: number;
  tutorialSeen: boolean;
  showFps: boolean;
  /** 컨트롤러 진동 세기 0..1 (0 = 끔) */
  rumble: number;
  /** 물어뜯기 막기 상호작용: 끔 / 여유(입력 창 확대) / 보통 */
  qte: QteMode;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high', sensitivity: 1, shake: 0.7, invertY: false, master: 0.8, sfx: 0.9, music: 0.6, tutorialSeen: false, showFps: false, rumble: 1, qte: 'normal',
};

const KEY = 'arena.sand-and-fangs.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...p };
    }
  } catch { /* 저장소 접근 불가 → 기본값 */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ }
}
