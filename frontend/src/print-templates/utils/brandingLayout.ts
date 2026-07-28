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

/** CSS px per physical mm — CSS px is defined as 1/96in, so this is a fixed physical ratio. */
const PX_PER_MM = 96 / 25.4;
const mmToPx = (millimetres: number): number => Math.round(millimetres * PX_PER_MM);

/**
 * Blank A4 Free Print — the ONE documented exception to the single central envelope.
 *
 * WHY AN EXCEPTION IS CORRECT HERE, and why it is not the start of a per-document table:
 * the central envelope exists for documents whose signature/stamp live in a shared
 * APPROVAL FOOTER SLOT — a small, fixed region near the bottom of a laid-out form. ±150px
 * of travel around that slot is the whole meaningful range; more would only let an element
 * wander into the form's own content. Blank A4 has no such slot and no content: the
 * element's placement region IS the entire sheet, because the document's whole purpose is
 * stamping an arbitrary spot on an externally pre-printed page. Forcing it into the
 * footer-slot envelope would not be consistency, it would be a different document's
 * constraint applied to a document that does not have that geometry.
 *
 * THE RANGE IS DERIVED, NOT PICKED. Anchors are the element CENTRES, in mm from the
 * sheet's top-left corner (see `BlankA4Print`): signature (68, 210), stamp (142, 210).
 * For either centre to reach any point of a 210 × 297 mm sheet:
 *   x — signature needs [0−68, 210−68] = [−68, +142] mm; stamp needs [−142, +68] mm.
 *       Union (one envelope serves both elements): ±142 mm.
 *   y — both anchored at 210 mm, so [0−210, 297−210] = [−210, +87] mm.
 * Scale is deliberately UNCHANGED at 0.2–4: nothing about a blank sheet argues for a
 * different size range, and keeping it identical means one less thing that can diverge.
 */
export const BLANK_A4_LAYOUT_BOUNDS: Readonly<BrandingLayoutBounds> = {
  minX: -mmToPx(142), maxX: mmToPx(142),
  minY: -mmToPx(210), maxY: mmToPx(87),
  minScale: 0.2, maxScale: 4,
};

/**
 * Per-document overrides. Deliberately a closed, near-empty map rather than an open
 * extension point: a document appears here only when its geometry genuinely differs in
 * kind from the shared approval slot, which so far is true of exactly one document.
 */
const BOUNDS_BY_DOC: Partial<Record<BrandingDocKey, Readonly<BrandingLayoutBounds>>> = {
  'blank-a4-print': BLANK_A4_LAYOUT_BOUNDS,
};

/**
 * The envelope a document's signature/stamp are clamped to — the central one unless the
 * document is a documented exception. An unknown or absent key yields the central
 * envelope, so a caller can never accidentally widen a document's limits.
 */
export function getBrandingLayoutBounds(
  docType?: BrandingDocKey,
): Readonly<BrandingLayoutBounds> {
  return (docType && BOUNDS_BY_DOC[docType]) || BRANDING_LAYOUT_BOUNDS;
}

/**
 * `bounds` defaults to the central envelope, so every pre-existing caller — and every
 * document that is not a documented exception — clamps exactly as it did before.
 *
 * Spreads `el` first so fields this function does not itself clamp — today just
 * `inkMode` (Ink Color System v2) — pass through untouched instead of being silently
 * dropped by the explicit field list below.
 */
export function clampBrandingElementLayout(
  el: BrandingElementLayout,
  bounds: Readonly<BrandingLayoutBounds> = BRANDING_LAYOUT_BOUNDS,
): BrandingElementLayout {
  const b = bounds;
  return {
    ...el,
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
    typeof o.zIndex === 'number' &&
    // Ink Color System v2 — optional and additive: absent on every pre-v2 saved
    // layout, which is exactly what "never customized" (→ legacy fallback) means.
    (o.inkMode === undefined || typeof o.inkMode === 'string')
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
export function brandingElementTransform(
  el: BrandingElementLayout,
  bounds?: Readonly<BrandingLayoutBounds>,
): string {
  const c = clampBrandingElementLayout(el, bounds);
  return `translate(${c.x}px, ${c.y}px) scale(${c.scale})`;
}

export function applyBrandingElementStyle(
  el: BrandingElementLayout,
  bounds?: Readonly<BrandingLayoutBounds>,
): CSSProperties {
  const clamped = clampBrandingElementLayout(el, bounds);
  return {
    position: 'relative',
    transform: `translate(${clamped.x}px, ${clamped.y}px) scale(${clamped.scale})`,
    transformOrigin: 'center',
    opacity: clamped.opacity,
    zIndex: clamped.zIndex,
  };
}
