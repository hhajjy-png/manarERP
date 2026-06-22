import type { CSSProperties } from 'react';

export type InkMode = 'original' | 'blue-ink' | 'black';

/** Returns CSS filter style for a given ink rendering mode. Applied to signature/stamp images. */
export function getInkFilterStyle(mode: InkMode | undefined): CSSProperties {
  switch (mode) {
    case 'blue-ink':
      return { filter: 'sepia(100%) saturate(200%) hue-rotate(190deg)' };
    case 'black':
      return { filter: 'grayscale(100%) brightness(0.85) contrast(1.1)' };
    default:
      return {};
  }
}

export const INK_MODE_LABELS: Record<InkMode, string> = {
  original: 'الأصلي',
  'blue-ink': 'حبر أزرق',
  black: 'أسود',
};

const STORAGE_KEY = 'manar.inkMode';

export function readStoredInkMode(): InkMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'blue-ink' || v === 'black') return v;
  } catch {
    // ignore
  }
  return 'original';
}

export function writeStoredInkMode(mode: InkMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
