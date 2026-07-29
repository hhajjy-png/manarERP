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

// ─── Rotation ────────────────────────────────────────────────────────────────

/**
 * The rotation slider's range. Deliberately NOT part of `BrandingLayoutBounds`: the
 * travel/scale envelope is per-document (an approval slot and a blank sheet allow
 * different journeys), but a full turn is a full turn on every document — putting the
 * angle in that record would invite a per-document limit that has no geometric meaning.
 */
export const ROTATION_MIN = -180;
export const ROTATION_MAX = 180;

/**
 * An angle brought into the half-open range `(-180, 180]`.
 *
 * WRAPPING, NOT CLAMPING, and the difference matters at the gesture level: a clamp at
 * ±180 would make the element STOP under a continuing circular drag, which reads as a
 * broken handle. Wrapping lets the pointer keep going round.
 *
 * `-180` deliberately maps to `+180` so the range is half-open and one angle has exactly
 * one representation; `-0` is folded to `0` for the same reason. Rounded to 0.1° — finer
 * than any signature placement needs, and it keeps the emitted transform string short
 * and deterministic instead of carrying `atan2`'s full float tail.
 */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const rounded = Math.round(deg * 10) / 10;
  const wrapped = rounded % 360;
  if (wrapped > 180) return wrapped - 360;
  if (wrapped <= -180) return wrapped + 360;
  return wrapped === 0 ? 0 : wrapped;
}

/**
 * The `rotate()` term of the transform — **an empty string when the element does not
 * rotate**, so an unrotated element emits no rotation term at all.
 *
 * That is the whole backward-compatibility guarantee in one function: a layout saved
 * before rotation existed produces `translate(0px, 0px) scale(1)`, character for
 * character what it produced before, rather than a visually-equivalent
 * `translate(0px, 0px) rotate(0deg) scale(1)`.
 */
function rotationTerm(rotation: number | undefined): string {
  const r = rotation === undefined ? 0 : normalizeRotation(rotation);
  return r === 0 ? '' : ` rotate(${r}deg)`;
}

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
 *
 * `rotation` is the one field that can leave: it is re-attached only when the normalized
 * angle is non-zero. So an element rotated back to 0° becomes key-for-key identical to
 * one that was never rotated — which is what makes "reset really restores the old state"
 * true in the SAVED RECORD, not merely on screen.
 */
export function clampBrandingElementLayout(
  el: BrandingElementLayout,
  bounds: Readonly<BrandingLayoutBounds> = BRANDING_LAYOUT_BOUNDS,
): BrandingElementLayout {
  const b = bounds;
  const { rotation, ...rest } = el;
  const normalizedRotation = rotation === undefined ? 0 : normalizeRotation(rotation);
  return {
    ...rest,
    ...(normalizedRotation === 0 ? {} : { rotation: normalizedRotation }),
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
    (o.inkMode === undefined || typeof o.inkMode === 'string') &&
    // Rotation v1 — same contract: absent on every pre-rotation saved layout, and an
    // absent angle is 0°. Accepting it here (rather than dropping the whole entry) is
    // what lets a rotated layout survive a round-trip through this parser.
    (o.rotation === undefined || typeof o.rotation === 'number')
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
 *
 * THE ORDER `translate → rotate → scale` IS LOAD-BEARING, not stylistic:
 *  · `translate` must come FIRST so the offset is interpreted in the PARENT's
 *    (unrotated) coordinate space. Put `rotate` ahead of it and every pointer delta
 *    would be applied in the element's own rotated frame — the element would slide off
 *    at an angle to the cursor, and drag would silently stop tracking. Keeping the order
 *    this way is precisely why `continueDrag` needs no rotation-awareness at all.
 *  · `rotate` and `scale` commute here because the scale is UNIFORM, so their relative
 *    order is free; `rotate` is placed before `scale` only to read in the same order as
 *    the properties are listed everywhere else.
 *  · Both spin about `transform-origin: center`, which leaves the element's centre
 *    fixed — that is what keeps a caller's `translateX(-50%)` centring exact under any
 *    angle, exactly as it already stays exact under any scale.
 */
export function brandingElementTransform(
  el: BrandingElementLayout,
  bounds?: Readonly<BrandingLayoutBounds>,
): string {
  const c = clampBrandingElementLayout(el, bounds);
  return `translate(${c.x}px, ${c.y}px)${rotationTerm(c.rotation)} scale(${c.scale})`;
}

export function applyBrandingElementStyle(
  el: BrandingElementLayout,
  bounds?: Readonly<BrandingLayoutBounds>,
): CSSProperties {
  const clamped = clampBrandingElementLayout(el, bounds);
  return {
    position: 'relative',
    // Same order, same reasoning as `brandingElementTransform` above — these two are the
    // ONLY places an angle becomes CSS, which is what makes screen, accurate preview,
    // print and the saved PDF agree without any of them knowing rotation exists.
    transform: `translate(${clamped.x}px, ${clamped.y}px)${rotationTerm(clamped.rotation)} scale(${clamped.scale})`,
    transformOrigin: 'center',
    opacity: clamped.opacity,
    zIndex: clamped.zIndex,
  };
}
