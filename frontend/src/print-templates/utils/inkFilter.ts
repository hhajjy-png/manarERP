import type { CSSProperties } from 'react';

/**
 * Ink Color System v2.
 *
 * `original`/`black`/`blue-ink` render with the EXACT CSS `filter` strings v1 always
 * used — byte-identical, so no previously-saved design's appearance changes silently.
 * `blue-ink` is kept ONLY for backward compatibility (resolving an old
 * `localStorage['manar.inkMode']` value or an old per-document setting that predates
 * per-element colors) — it is deliberately not offered as a fresh pick in the v2 panel,
 * superseded by the four realistic ballpoint blues below.
 *
 * The four new colors use an SVG `feColorMatrix` filter — the same technique already
 * shipped and print-verified in this codebase for `FormHeader.tsx`'s logo recolor
 * (Payment Voucher / Ready Paper, manually approved in production). A constant-matrix
 * recolor targets every non-transparent pixel to the exact ink RGB while leaving the
 * ALPHA channel completely untouched — so antialiased edges, stroke-width variation,
 * and any density encoded via partial transparency (the normal encoding for a
 * transparent-background signature/stamp PNG) all survive exactly as before. The
 * source file is never touched; only the rendered `<img>`'s CSS `filter` changes.
 */
export type InkMode =
  | 'original'
  | 'black'
  | 'blue-ink' // legacy — resolution only, not offered in the v2 picker
  | NewInkColorId;

/**
 * Every color offered in the Design Mode picker, IN PICKER ORDER.
 *
 * Professional Ink Set v1 APPENDS twenty shades to the original four. Appending — never
 * inserting, never reordering, never removing — is what keeps this list safe to extend:
 * the ids are what `BrandingElementLayout.inkMode` stores, so a saved design keeps
 * resolving to the same color, and an operator's muscle memory for where a swatch sits
 * is not disturbed.
 *
 * The twenty run light → dark as one continuous ballpoint-blue ramp, which is why they
 * are ordered by value rather than alphabetically: the picker reads as a gradient.
 */
export const NEW_INK_COLOR_IDS = [
  'ballpoint-dark-blue',
  'ballpoint-medium-blue',
  'royal-blue',
  'blue-violet-ink',
  'ink-sky',
  'ink-light-blue',
  'ink-classic',
  'ink-bic',
  'ink-standard',
  'ink-executive',
  'ink-official',
  'ink-regal',
  'ink-marine',
  'ink-dark',
  'ink-professional',
  'ink-velvet',
  'ink-navy',
  'ink-vintage',
  'ink-archival',
  'ink-documentary',
  'ink-night',
  'ink-deep',
  'ink-imperial',
  'ink-blue-black',
] as const;
export type NewInkColorId = typeof NEW_INK_COLOR_IDS[number];

function isNewInkColorId(mode: InkMode | undefined): mode is NewInkColorId {
  return !!mode && (NEW_INK_COLOR_IDS as readonly string[]).includes(mode);
}

/** Hex source values — provisional per the release brief; not styled as final until visual review. */
export const INK_COLOR_HEX: Record<NewInkColorId, string> = {
  'ballpoint-dark-blue': '#12276B',
  'ballpoint-medium-blue': '#1F3F94',
  'royal-blue': '#2A52BE',
  'blue-violet-ink': '#3D3B8E',
  // ── Professional Ink Set v1 ────────────────────────────────────────────────
  'ink-sky': '#0062D2',
  'ink-light-blue': '#005DC8',
  'ink-classic': '#0058BE',
  'ink-bic': '#0054B5',
  'ink-standard': '#0050AC',
  'ink-executive': '#004CA3',
  'ink-official': '#00489B',
  'ink-regal': '#004493',
  'ink-marine': '#00418C',
  'ink-dark': '#003E85',
  'ink-professional': '#003B7E',
  'ink-velvet': '#003878',
  'ink-navy': '#003572',
  'ink-vintage': '#00326C',
  'ink-archival': '#003067',
  'ink-documentary': '#002E62',
  'ink-night': '#002C5D',
  'ink-deep': '#002A58',
  'ink-imperial': '#002854',
  'ink-blue-black': '#002650',
};

/** One stable SVG `<filter>` id per color — identical id/content wherever it is rendered, so
 *  duplicate defs across multiple images (or after a DOM clone for PDF/preview) are harmless. */
export function inkFilterId(id: NewInkColorId): string {
  return `manar-ink-${id}`;
}

function hexToUnitRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The `feColorMatrix` `values` string for a color: constant target RGB, alpha row untouched. */
export function inkColorMatrix(id: NewInkColorId): string {
  const [r, g, b] = hexToUnitRgb(INK_COLOR_HEX[id]);
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`;
}

/** Returns CSS filter style for a given ink rendering mode. Applied to signature/stamp images. */
export function getInkFilterStyle(mode: InkMode | undefined): CSSProperties {
  if (isNewInkColorId(mode)) {
    return { filter: `url(#${inkFilterId(mode)})` };
  }
  switch (mode) {
    case 'blue-ink':
      return { filter: 'sepia(100%) saturate(200%) hue-rotate(190deg)' };
    case 'black':
      return { filter: 'grayscale(100%) brightness(0.85) contrast(1.1)' };
    default:
      return {};
  }
}

/**
 * The label shown on each swatch.
 *
 * EVERY LABEL HERE IS DISTINCT, and `inkColorSystem.test.tsx` fails the build if a future
 * addition breaks that. Distinctness is the requirement; a runtime de-duplicator would be
 * dead code, because a collision is caught before it can ship — and if one ever is added
 * deliberately, the fix is to number it here (`… (2)`) rather than to rename an existing
 * label, which would change what an operator sees for a color they already chose.
 *
 * Note the new set names the SHADE («الحبر الملكي») while the original four name the PEN
 * («أزرق ملكي») — near neighbours in meaning, distinct as strings, and neither is renamed.
 */
export const INK_MODE_LABELS: Record<InkMode, string> = {
  original: 'الأصلي',
  'blue-ink': 'حبر أزرق',
  black: 'أسود',
  'ballpoint-dark-blue': 'أزرق قلم داكن',
  'ballpoint-medium-blue': 'أزرق قلم متوسط',
  'royal-blue': 'أزرق ملكي',
  'blue-violet-ink': 'أزرق بنفسجي',
  // ── Professional Ink Set v1 ────────────────────────────────────────────────
  'ink-sky': 'الحبر السماوي',
  'ink-light-blue': 'الحبر الأزرق الفاتح',
  'ink-classic': 'الحبر الكلاسيكي',
  'ink-bic': 'حبر Bic',
  'ink-standard': 'الحبر القياسي',
  'ink-executive': 'الحبر التنفيذي',
  'ink-official': 'الحبر الرسمي',
  'ink-regal': 'الحبر الملكي',
  'ink-marine': 'الحبر البحري',
  'ink-dark': 'الحبر الداكن',
  'ink-professional': 'الحبر الاحترافي',
  'ink-velvet': 'الحبر المخملي',
  'ink-navy': 'الحبر الكحلي',
  'ink-vintage': 'الحبر العتيق',
  'ink-archival': 'الحبر الأرشيفي',
  'ink-documentary': 'الحبر الوثائقي',
  'ink-night': 'الحبر الليلي',
  'ink-deep': 'الحبر العميق',
  'ink-imperial': 'الحبر الإمبراطوري',
  'ink-blue-black': 'الحبر الأسود المزرق',
};

const STORAGE_KEY = 'manar.inkMode';

/**
 * The legacy GLOBAL default — v1's only source of truth, now demoted to a fallback:
 * read solely to resolve an element that has never been given its own per-element color
 * (`BrandingElementLayout.inkMode === undefined`), so pre-v2 documents keep rendering
 * exactly as they did before this system existed. Never written to by the v2 panel.
 */
export function readStoredInkMode(): InkMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'blue-ink' || v === 'black') return v;
  } catch {
    // ignore
  }
  return 'original';
}

/**
 * Resolves an element's effective ink color: its own saved color if it has one, otherwise
 * the legacy global default. This is the ONE place that decision is made — every render
 * site (forms, invoice, quotation, Blank A4) calls this instead of re-deriving it, so a
 * document that was never touched by Ink Color System v2 is guaranteed to look identical
 * to before.
 */
export function resolveInkMode(elementInkMode: InkMode | undefined): InkMode {
  return elementInkMode ?? readStoredInkMode();
}
