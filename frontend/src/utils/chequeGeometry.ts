/**
 * Cheque Calibration Studio — pure geometry & measurement helpers.
 *
 * These are additive and side-effect free. They translate between the production
 * template's PERCENTAGE coordinates and physical MILLIMETRES for the calibration
 * test sheet and the Measurement Assistant. They do NOT touch the print engine or
 * any saved template — callers decide what to persist (always via the versioning
 * endpoint, always confirm-gated).
 *
 * Print pipeline geometry (see pages/Cheques.tsx):
 *   `.cheque-print-only` fills the printable page; inside it a `translate(offset)`
 *   wrapper holds ChequePrintOutput at width:100%, aspect-ratio 700/272. So the
 *   overlay is stretched to the page width, and:
 *     - `left%` is a percentage of the PAGE WIDTH
 *     - `top%`  is a percentage of the OVERLAY HEIGHT = pageWidth × 272/700
 *   → X and Y therefore have DIFFERENT mm-per-percent factors.
 */
import { FIELD_KEYS, type ChequeTemplate, type FieldConfig, type FieldKey } from './chequeTemplate';

/** Physical page/cheque dimensions + print offsets. Mirrors the backend
 *  `CalibrationGeometryInput` (cheques.schema.ts). */
export interface CalibrationGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  chequeWidthMm: number;
  chequeHeightMm: number;
  offsetXMm: number;
  offsetYMm: number;
}

/** Defaults mirrored from the backend service. A4 landscape; offsetYMm matches the
 *  production print offset (CHEQUE_PAGE_OFFSET_Y_MM = 40). Refined per printer. */
export const DEFAULT_GEOMETRY: CalibrationGeometry = {
  pageWidthMm: 297,
  pageHeightMm: 210,
  chequeWidthMm: 175,
  chequeHeightMm: 80,
  offsetXMm: 0,
  offsetYMm: 40,
};

/** The template's ChequePrintOutput aspect ratio (width : height). */
export const CHEQUE_ASPECT_W = 700;
export const CHEQUE_ASPECT_H = 272;

/**
 * Distance (mm) from the RIGHT paper edge to the cheque's right edge.
 *
 * The cheque is fed into the printer from the right paper edge, so the sheet of
 * cheque stock sits flush against that edge. Zero is therefore the physical truth
 * today. It is a named constant rather than a magic 0 so that, if a printer is ever
 * found to inset the stock, this becomes a persisted geometry field in one edit —
 * and so the formula below reads as the physical statement it is.
 */
export const CHEQUE_FEED_RIGHT_OFFSET_MM = 0;

/**
 * The x position (mm) of the cheque's LEFT edge on the paper, for the calibration
 * test sheet.
 *
 * Do NOT use `offsetXMm` for this. `offsetXMm` is the print engine's horizontal
 * TRANSLATE offset — it mirrors `CHEQUE_PAGE_OFFSET_X_MM` in pages/Cheques.tsx and
 * is consumed by `fieldMm()` below to say where a field's ink lands. It is not, and
 * never was, the position of the physical cheque on the paper. Conflating the two is
 * what made the test sheet draw the cheque against the LEFT paper edge while the
 * operator feeds it from the RIGHT.
 *
 * The cheque-local coordinate system is untouched: nothing is mirrored, no axis is
 * negated, no field coordinate is reversed. Only the paper anchor moves.
 */
export function chequePaperLeftMm(
  g: CalibrationGeometry,
  rightOffsetMm: number = CHEQUE_FEED_RIGHT_OFFSET_MM,
): number {
  return g.pageWidthMm - g.chequeWidthMm - rightOffsetMm;
}

/** Exact physical centre of the paper (mm). Derived from the active geometry — the
 *  A4 values (148.5, 105) are a consequence, never a hardcoded constant. */
export function pageCentreMm(g: CalibrationGeometry): { xMm: number; yMm: number } {
  return { xMm: g.pageWidthMm / 2, yMm: g.pageHeightMm / 2 };
}

export interface CentreAxis {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The two full-page centre axes, edge to edge, intersecting at the exact centre. */
export function buildCentreAxes(g: CalibrationGeometry): { vertical: CentreAxis; horizontal: CentreAxis } {
  const { xMm, yMm } = pageCentreMm(g);
  return {
    vertical: { x1: xMm, y1: 0, x2: xMm, y2: g.pageHeightMm },
    horizontal: { x1: 0, y1: yMm, x2: g.pageWidthMm, y2: yMm },
  };
}

/** Position clamp bounds — must match the calibrator's drag/nudge bounds so the
 *  Assistant can never propose a coordinate the editor would reject. */
export const LEFT_MIN = 0;
export const LEFT_MAX = 90;
export const TOP_MIN = 0;
export const TOP_MAX = 85;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Height (mm) of the stretched cheque overlay = pageWidth × 272/700. */
export function overlayHeightMm(g: CalibrationGeometry): number {
  return (g.pageWidthMm * CHEQUE_ASPECT_H) / CHEQUE_ASPECT_W;
}

/** Millimetres moved per 1% of `left` (scales with page width). */
export function mmPerLeftPct(g: CalibrationGeometry): number {
  return g.pageWidthMm / 100;
}

/** Millimetres moved per 1% of `top` (scales with the derived overlay height). */
export function mmPerTopPct(g: CalibrationGeometry): number {
  return overlayHeightMm(g) / 100;
}

/** Absolute mm position of a field's anchor on the page (for display). */
export function fieldMm(cfg: FieldConfig, g: CalibrationGeometry): { xMm: number; yMm: number } {
  return {
    xMm: g.offsetXMm + (cfg.left / 100) * g.pageWidthMm,
    yMm: g.offsetYMm + (cfg.top / 100) * overlayHeightMm(g),
  };
}

// ── Calibration consistency check (calibration sheet only) ────────────────────
//
// DEFAULT_TEMPLATE's `left`/`top` are percentages of the PAGE (the print engine
// renders ChequePrintOutput at width:100% of the page). DEFAULT_GEOMETRY separately
// describes a 175 mm cheque fed from the right edge. Those two statements are not
// reconcilable: the four default fields span ~228 mm of page, which no 175 mm box can
// contain at ANY anchor. The right-edge anchor did not create that contradiction — it
// only made it visible. This check reports it; it never repairs it.
//
// Nothing here clamps a coordinate, moves a marker, resizes the outline, or edits a
// default. It is a read-only assertion about values the operator owns.

/** The cheque's physical bounds on the paper (mm), as the calibration sheet draws it. */
export interface ChequePaperBounds {
  leftMm: number;
  rightMm: number;
  topMm: number;
  bottomMm: number;
}

export function chequePaperBoundsMm(
  g: CalibrationGeometry,
  rightOffsetMm: number = CHEQUE_FEED_RIGHT_OFFSET_MM,
): ChequePaperBounds {
  const leftMm = chequePaperLeftMm(g, rightOffsetMm);
  return {
    leftMm,
    rightMm: leftMm + g.chequeWidthMm,
    topMm: g.offsetYMm,
    bottomMm: g.offsetYMm + g.chequeHeightMm,
  };
}

/** A field's anchor plus the extent of its drawn box (mm). Single source of truth for
 *  both the test sheet's marker box and the consistency check below. */
export interface FieldBoxMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export function fieldBoxMm(cfg: FieldConfig, g: CalibrationGeometry): FieldBoxMm {
  const { xMm, yMm } = fieldMm(cfg, g);
  return {
    xMm,
    yMm,
    widthMm: (cfg.width / 100) * g.pageWidthMm,
    heightMm: Math.max(4, cfg.fontSize * 0.3528 * 1.6),
  };
}

/**
 * The fields whose ANCHOR POINT lands outside the cheque's paper bounds.
 *
 * The anchor — the crosshair origin — is the point being calibrated, so it is the
 * point the check judges. A field whose box merely overflows the cheque's edge is a
 * softer, separate concern (text can be narrower than its declared width box) and is
 * deliberately not flagged here: doing so would flag all four defaults and drown the
 * real signal.
 *
 * Deterministic and order-stable: results follow FIELD_KEYS order.
 */
export function fieldsOutsideCheque(
  template: ChequeTemplate,
  g: CalibrationGeometry,
  rightOffsetMm: number = CHEQUE_FEED_RIGHT_OFFSET_MM,
): FieldKey[] {
  const b = chequePaperBoundsMm(g, rightOffsetMm);
  return FIELD_KEYS.filter((fk) => {
    const { xMm, yMm } = fieldMm(template[fk], g);
    return xMm < b.leftMm || xMm > b.rightMm || yMm < b.topMm || yMm > b.bottomMm;
  });
}

export interface CorrectionResult {
  dLeftPct: number;
  dTopPct: number;
  rawLeft: number;
  rawTop: number;
  newLeft: number;
  newTop: number;
  clamped: boolean;
}

/**
 * Convert an observed on-paper displacement into a coordinate correction.
 * Sign convention: +right / +down mean the text printed too far right / too low,
 * so the correction moves it back (negative deltas). Result is clamped to the
 * editor's valid range; `clamped` flags when clamping altered the raw value.
 */
export function mmToPercentCorrection(
  cfg: FieldConfig,
  observedRightMm: number,
  observedDownMm: number,
  g: CalibrationGeometry,
): CorrectionResult {
  const dLeftPct = -(observedRightMm / g.pageWidthMm) * 100;
  const dTopPct = -(observedDownMm / overlayHeightMm(g)) * 100;
  const rawLeft = cfg.left + dLeftPct;
  const rawTop = cfg.top + dTopPct;
  const newLeft = clamp(rawLeft, LEFT_MIN, LEFT_MAX);
  const newTop = clamp(rawTop, TOP_MIN, TOP_MAX);
  return {
    dLeftPct,
    dTopPct,
    rawLeft,
    rawTop,
    newLeft,
    newTop,
    clamped: newLeft !== rawLeft || newTop !== rawTop,
  };
}

/** Apply a correction to one field of a template, returning a new template object
 *  (does not mutate the input). Only `left`/`top` change. */
export function applyCorrection(
  template: ChequeTemplate,
  field: FieldKey,
  result: CorrectionResult,
): ChequeTemplate {
  return {
    ...template,
    [field]: { ...template[field], left: result.newLeft, top: result.newTop },
  };
}

// ── Calibration confidence ─────────────────────────────────────────────────────

export type ConfidenceLevel = 'excellent' | 'good' | 'adjust';

export interface ConfidenceInput {
  /** Operator entered a displacement, so the before/after preview is on screen. */
  previewed: boolean;
  /** Largest absolute observed displacement (mm) the operator measured. */
  maxRemainingMm: number;
  /** The proposed correction hit the editor's coordinate bounds and was cut. */
  clamped: boolean;
  /** The last correction was successfully stored as a new template version. */
  savedAsVersion: boolean;
}

export interface ConfidenceState {
  level: ConfidenceLevel;
  label: string;
  tone: 'green' | 'blue' | 'orange';
  hint: string;
}

/**
 * Derive a confidence state from inputs the app can actually observe: whether a
 * measurement was entered and previewed, how large it is, whether the resulting
 * correction stayed inside the safe coordinate bounds, and whether it was saved.
 *
 * It deliberately makes no claim about the printer's physical scale — the app has
 * no validated measurement source for that, so nothing here asserts it.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceState {
  const saved = input.savedAsVersion ? ' تم حفظ آخر تصحيح كنسخة جديدة.' : '';
  if (!input.previewed) {
    return {
      level: 'adjust',
      label: 'يحتاج ضبط',
      tone: 'orange',
      hint: 'أدخل الإزاحة المقيسة (مم) لعرض معاينة «قبل/بعد» وتقييم المحاذاة.' + saved,
    };
  }
  if (input.clamped) {
    return {
      level: 'adjust',
      label: 'يحتاج ضبط',
      tone: 'orange',
      hint: 'التصحيح المقترح تجاوز الحدود الآمنة وتم قصّه — راجع القياس قبل الحفظ.' + saved,
    };
  }
  const m = Math.abs(input.maxRemainingMm);
  if (m <= 0.5) {
    return { level: 'excellent', label: 'ممتاز', tone: 'green', hint: 'الإزاحة المقيسة ≤ نصف مليمتر ضمن الحدود الآمنة.' + saved };
  }
  if (m <= 2) {
    return { level: 'good', label: 'جيد', tone: 'blue', hint: 'إزاحة بسيطة (≤ 2 مم) ضمن الحدود الآمنة — يمكن تطبيق التصحيح المقترح.' + saved };
  }
  return { level: 'adjust', label: 'يحتاج ضبط', tone: 'orange', hint: 'إزاحة ملحوظة (> 2 مم). طبّق التصحيح المقترح ثم أعد اختبار المحاذاة.' + saved };
}
