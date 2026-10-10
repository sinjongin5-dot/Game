import type { Quality } from '../render/gameScene';

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
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high', sensitivity: 1, shake: 0.7, invertY: false, master: 0.8, sfx: 0.9, music: 0.6, tutorialSeen: false, showFps: false,
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
