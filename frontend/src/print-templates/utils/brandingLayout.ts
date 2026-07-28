import type { CSSProperties } from 'react';
import type {
  BrandingDocKey,
  BrandingElementLayout,
  BrandingLayout,
  FormBrandingDocKey,
  PrintBrandingLayoutSettings,
} from '../engine/types';
import { FORM_BRANDING_DOC_KEYS } from '../engine/types';

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_ELEMENT_LAYOUT: Readonly<BrandingElementLayout> = {
  x: 0,
  y: 0,
  scale: 1,
  opacity: 1,
  zIndex: 1,
};

const DEFAULT_ELEMENT_PAIR: Readonly<BrandingLayout> = {
  signature: { ...DEFAULT_ELEMENT_LAYOUT },
  stamp: { ...DEFAULT_ELEMENT_LAYOUT },
};

export const DEFAULT_BRANDING_LAYOUT: Readonly<PrintBrandingLayoutSettings> = {
  invoice: { ...DEFAULT_ELEMENT_PAIR },
  quotation: { ...DEFAULT_ELEMENT_PAIR },
};

// ─── Clamp ───────────────────────────────────────────────────────────────────

/** Travel and size limits, in CSS px of the unscaled document. */
export interface BrandingLayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minScale: number;
  maxScale: number;
}

/**
 * The design envelope for every signature/stamp, on every document — invoices,
 * quotations and all administrative forms alike.
 *
 * ONE set of limits, applied in `clampBrandingElementLayout`, which every write path and
 * the render-time read both go through: dragging, the resize handles, the panel sliders,
 * the Settings calibration dialog, alignment, undo/redo and parsing a stored value. There
 * is deliberately no per-document table — a second source of limits is exactly how an
 * editor and a printout drift apart.
 *
 * Adopted from the Salary Certificate trial: wide enough to place a signature freely
 * anywhere around the approval block, and up to 4× for a large stamp. Note the trade this
 * range accepts — it is intentionally permissive enough that an element CAN be pushed past
 * the printable area and be clipped. Freedom of placement was chosen over that guarantee.
 *
 * Every previously saved layout fits inside this range (the old limits were narrower on
 * every axis), so adopting it changes no existing document and needs no migration.
 */
export const BRANDING_LAYOUT_BOUNDS: Readonly<BrandingLayoutBounds> = {
  minX: -150, maxX: 150,
  minY: -150, maxY: 150,
  minScale: 0.2, maxScale: 4,
};

export function clampBrandingElementLayout(el: BrandingElementLayout): BrandingElementLayout {
  const b = BRANDING_LAYOUT_BOUNDS;
  return {
    x: Math.max(b.minX, Math.min(b.maxX, el.x)),
    y: Math.max(b.minY, Math.min(b.maxY, el.y)),
    scale: Math.max(b.minScale, Math.min(b.maxScale, el.scale)),
    opacity: Math.max(0.2, Math.min(1, el.opacity)),
    zIndex: el.zIndex >= 2 ? 2 : 1,
  };
}

/** Whether a form key is one the branding layout system knows how to store. */
export function isFormBrandingDocKey(key: string | undefined): key is FormBrandingDocKey {
  return !!key && (FORM_BRANDING_DOC_KEYS as readonly string[]).includes(key);
}

// ─── Parse / Serialize ───────────────────────────────────────────────────────

function isElementLayout(v: unknown): v is BrandingElementLayout {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.scale === 'number' &&
    typeof o.opacity === 'number' &&
    typeof o.zIndex === 'number'
  );
}

function isDocLayout(v: unknown): v is BrandingLayout {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isElementLayout(o.signature) && isElementLayout(o.stamp);
}

export function parseBrandingLayout(
  value: string | null | undefined,
): PrintBrandingLayoutSettings {
  if (!value) return { ...DEFAULT_BRANDING_LAYOUT };
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_BRANDING_LAYOUT };
    const p = parsed as Record<string, unknown>;
    const result: PrintBrandingLayoutSettings = {
      invoice: isDocLayout(p.invoice) ? p.invoice : DEFAULT_ELEMENT_PAIR,
      quotation: isDocLayout(p.quotation) ? p.quotation : DEFAULT_ELEMENT_PAIR,
    };
    // Form entries are optional: a form that was never designed simply has none, and
    // resolves to the identity layout. A malformed entry is dropped, not defaulted into
    // existence, so it cannot mask the template's own placement.
    for (const key of FORM_BRANDING_DOC_KEYS) {
      const entry = p[key];
      if (isDocLayout(entry)) result[key] = entry;
    }
    return result;
  } catch {
    return { ...DEFAULT_BRANDING_LAYOUT };
  }
}

export function serializeBrandingLayout(layout: PrintBrandingLayoutSettings): string {
  return JSON.stringify(layout);
}

// ─── Merge ───────────────────────────────────────────────────────────────────

export function mergeBrandingLayout(
  defaults: PrintBrandingLayoutSettings,
  overrides: Partial<PrintBrandingLayoutSettings>,
): PrintBrandingLayoutSettings {
  return {
    invoice: overrides.invoice ?? defaults.invoice,
    quotation: overrides.quotation ?? defaults.quotation,
  };
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

/**
 * A document's layout, or the identity layout when it has none (never designed, or no
 * registered key at all) — so a caller never has to branch on absence.
 */
export function getBrandingLayoutForDocument(
  layout: PrintBrandingLayoutSettings | undefined,
  docType: BrandingDocKey | undefined,
): BrandingLayout {
  if (!docType) return DEFAULT_ELEMENT_PAIR;
  return layout?.[docType] ?? DEFAULT_ELEMENT_PAIR;
}

// ─── CSS helper ──────────────────────────────────────────────────────────────

/**
 * The layout's contribution to `transform`, on its own.
 *
 * `applyBrandingElementStyle` below is for elements the template positions in flow — it
 * owns `position` and `transform` outright. The approval slot's images are already
 * placed with `position: absolute` and their own centring translate, so they compose
 * this string onto what they have instead of being overwritten by it.
 *
 * An identity layout yields `translate(0px, 0px) scale(1)` — a no-op, which is why an
 * undesigned form prints byte-identically to before.
 */
export function brandingElementTransform(el: BrandingElementLayout): string {
  const c = clampBrandingElementLayout(el);
  return `translate(${c.x}px, ${c.y}px) scale(${c.scale})`;
}

export function applyBrandingElementStyle(el: BrandingElementLayout): CSSProperties {
  const clamped = clampBrandingElementLayout(el);
  return {
    position: 'relative',
    transform: `translate(${clamped.x}px, ${clamped.y}px) scale(${clamped.scale})`,
    transformOrigin: 'center',
    opacity: clamped.opacity,
    zIndex: clamped.zIndex,
  };
}
