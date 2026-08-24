/**
 * قالب شيك الخليج — Gulf Bank Cheque, A4 Landscape Print Profile v1.
 *
 * WHAT THIS IS — AND WHAT IT DELIBERATELY IS NOT
 * ──────────────────────────────────────────────
 * This file is a PRINT PROFILE: a table of measured physical coordinates plus
 * the pure functions that place them. It is not a print engine, not a renderer,
 * not a calibration system and not a storage layer. Everything downstream is the
 * existing machinery, unchanged:
 *
 *   this profile → Runtime Engine (`resolveChequeTemplateForPrint`)
 *                → ChequeRenderSurface / ChequeA4Sheet (the shared renderer)
 *                → ChequeTemplatePrintPage (the existing print route)
 *                → `printOptionsFor(A4_LANDSCAPE_PAGE)` → the existing print IPC
 *
 * Tafqeet (`amountToWordsKWD`), the cheque money format (`fmtChequeAmount`) and
 * the date format all come from `buildChequeRuntimeData` — the same single
 * source every other cheque print surface already uses.
 *
 * THE PHYSICAL PROBLEM IT SOLVES
 * ──────────────────────────────
 * The measured Gulf Bank cheque is 180 × 90 mm, but the printer cannot feed that
 * paper size. So the job is always issued on a real A4 LANDSCAPE page
 * (297 × 210 mm) and the cheque is treated as a virtual area inside it:
 *
 *   ChequeAreaX = 297 − 180 = 117 mm   (cheque right edge flush with A4 right edge)
 *   ChequeAreaY = (210 − 90) / 2 = 60 mm   (vertically centred)
 *
 * "Far right" is stated GEOMETRICALLY, never through CSS direction: the cheque's
 * right edge is at x = 297 mm because its left edge is at x = 117 mm. RTL has no
 * bearing on it.
 *
 * TWO COORDINATE LEVELS, AND ONLY TWO
 * ───────────────────────────────────
 *   A. A4 coordinates  — where the cheque AREA sits on the sheet (above).
 *   B. Cheque-local    — where each field sits inside the 180 × 90 mm cheque,
 *                        origin at the cheque's top-left corner, +x right,
 *                        +y down, unit mm. THIS is the authored source of truth.
 *
 * No field ever stores an A4 coordinate. The final position is always DERIVED:
 *
 *   finalX = chequeAreaX + fieldLocalX + calibrationOffsetX
 *   finalY = chequeAreaY + fieldLocalY + calibrationOffsetY
 *
 * CALIBRATION
 * ───────────
 * The coordinates below are FACTORY GEOMETRY measured off the physical cheque —
 * the profile's starting point, not its final state. Calibration is performed in
 * the EXISTING professional calibration studio (Cheque Template Designer +
 * Template Manager), which edits `{ surface, fields }` — precisely the document
 * this profile is. Nothing here is a calibration UI, an editor or an engine:
 * `gulfFactoryProfile()` hands the studio a document, `parseGulfProfile()` /
 * `serializeGulfProfile()` read and write it through the existing settings
 * storage, and `gulfChequeAreaMm()` tells the existing A4 sheet component where
 * on the page the cheque area sits.
 *
 * Two calibration levels, both operated by the same studio:
 *   • per-field — position, size, rotation, font, alignment, colour, visibility
 *     and z-order, exactly as for any other template;
 *   • whole-cheque — the two global A4 placement offsets, which move the cheque
 *     AREA on the sheet and never touch a field coordinate.
 */
import type { DesignerField, DesignerSurfaceSpec, DesignerTextAlign } from '../chequeTemplateDesigner';
import { A4_LANDSCAPE_MM, MM_PER_CM, type ChequeA4Placement } from './physicalPage';

/** The name this profile is registered and displayed under. */
export const GULF_A4_TEMPLATE_NAME = 'قالب شيك الخليج';

/** Stable identity of this profile inside the calibration studio. */
export const GULF_A4_PROFILE_ID = 'gulf-a4';

/**
 * The DATE BLOCK's internal cells, in cheque-local millimetres relative to the
 * block's own left edge.
 *
 * The cheque's date box carries pre-printed `/` separators, so the three digit
 * groups must land in three fixed cells. They are NOT three fields: the date is
 * one object with one position, and these are sub-cells inside it. Moving the
 * block moves them, because their offsets are properties of the block.
 *
 *   day 135 mm = blockX + 0   month 144 mm = blockX + 9   year 153 mm = blockX + 18
 */
export const GULF_DATE_SLOTS_MM = [
  { key: 'chequeDay', xMm: 0.0, widthMm: 6.0 },
  { key: 'chequeMonth', xMm: 9.0, widthMm: 6.0 },
  { key: 'chequeYear', xMm: 18.0, widthMm: 10.0 },
] as const;

/** Bank identity this profile is bound to, via the existing bank registry. */
export const GULF_BANK_CODE = 'GULF_BANK';
export const GULF_BANK_NAME_AR = 'بنك الخليج';

/** The measured physical cheque. */
export const GULF_CHEQUE_WIDTH_MM = 180;
export const GULF_CHEQUE_HEIGHT_MM = 90;

/** The same cheque as a designer surface spec — the unit the Runtime Engine takes. */
export const GULF_CHEQUE_SURFACE_CM: DesignerSurfaceSpec = {
  widthCm: GULF_CHEQUE_WIDTH_MM / MM_PER_CM,
  heightCm: GULF_CHEQUE_HEIGHT_MM / MM_PER_CM,
};

// ── Calibration (printer offsets — the ONLY numbers a real print test changes) ──

/**
 * FACTORY DEFAULT horizontal offset for the whole cheque area, in millimetres.
 * Positive moves the cheque right. This is the value "Restore default" returns
 * to; the value actually used comes from the saved calibration below.
 */
export const GULF_A4_OFFSET_X_MM = 0;

/**
 * FACTORY DEFAULT vertical offset for the whole cheque area, in millimetres.
 * Positive moves the cheque down. See the note above.
 */
export const GULF_A4_OFFSET_Y_MM = 0;

export interface GulfCalibration {
  offsetXMm: number;
  offsetYMm: number;
}

/** The factory default — 0 / 0. Not the active value; see `gulfCalibrationFromSettings`. */
export const GULF_A4_CALIBRATION: GulfCalibration = {
  offsetXMm: GULF_A4_OFFSET_X_MM,
  offsetYMm: GULF_A4_OFFSET_Y_MM,
};

/**
 * Where the operator's saved CALIBRATED PROFILE lives.
 *
 * The SAME storage every other cheque calibration already uses: a row in the
 * `settings` table, written through the existing `PUT /settings` endpoint and
 * read from the `/settings` payload the cheques page already loads. No new
 * table, no migration, no new endpoint, and it travels with the database in
 * backup, restore and Drive sync exactly like Classic's `cheque.template.<bank>`
 * rows and the `cheques.defaultPrintProvider` row.
 *
 * The key is the PROFILE's identity, not a bank's. That is what keeps this
 * calibration independent: Classic Gulf Bank writes `cheque.template.بنك الخليج`,
 * the Designer's user templates live in `cheque_designer_templates`, this profile
 * writes its own settings row, and none of the three can read or overwrite
 * another.
 *
 * The stored value is the WHOLE calibrated document — surface, every field
 * exactly as the studio left it, and the A4 placement offsets — so the studio's
 * full capability set is what gets persisted, not a reduced pair of numbers.
 */
export const GULF_A4_CALIBRATION_SETTING_KEY = 'cheque.calibration.gulf-a4.v1';

/** Settings group, matching the group the cheques page already writes with. */
export const GULF_A4_CALIBRATION_SETTING_GROUP = 'cheques';

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse a stored calibration value. Never throws and never yields a partial or
 * non-finite offset: anything unreadable degrades to the factory default, which
 * is the base geometry — the safe outcome, not a silently shifted cheque.
 */
export function parseGulfCalibration(raw: string | null | undefined): GulfCalibration {
  if (!raw) return { ...GULF_A4_CALIBRATION };
  try {
    const parsed = JSON.parse(raw) as Partial<GulfCalibration> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...GULF_A4_CALIBRATION };
    return {
      offsetXMm: finiteOr(parsed.offsetXMm, GULF_A4_OFFSET_X_MM),
      offsetYMm: finiteOr(parsed.offsetYMm, GULF_A4_OFFSET_Y_MM),
    };
  } catch {
    return { ...GULF_A4_CALIBRATION };
  }
}

export function serializeGulfCalibration(calibration: GulfCalibration): string {
  return JSON.stringify({
    offsetXMm: finiteOr(calibration.offsetXMm, GULF_A4_OFFSET_X_MM),
    offsetYMm: finiteOr(calibration.offsetYMm, GULF_A4_OFFSET_Y_MM),
  });
}

/** Read the active calibration out of the `/settings` rows the page already holds. */
export function gulfCalibrationFromSettings(settings: { key: string; value: string }[]): GulfCalibration {
  const row = Array.isArray(settings)
    ? settings.find((s) => s && s.key === GULF_A4_CALIBRATION_SETTING_KEY)
    : undefined;
  return parseGulfCalibration(row?.value);
}

// ── A4 placement of the cheque area ──────────────────────────────────────────

/** The cheque area's UNCALIBRATED left edge on A4 (mm) — right edge flush with the sheet. */
export const GULF_CHEQUE_BASE_X_MM = A4_LANDSCAPE_MM.widthMm - GULF_CHEQUE_WIDTH_MM;

/** The cheque area's UNCALIBRATED top edge on A4 (mm) — vertically centred. */
export const GULF_CHEQUE_BASE_Y_MM = (A4_LANDSCAPE_MM.heightMm - GULF_CHEQUE_HEIGHT_MM) / 2;

/**
 * Where the cheque area sits on the A4 sheet, after calibration.
 * Pure: same inputs → same rectangle, every time, for preview and for print.
 */
export function gulfChequeAreaMm(calibration: GulfCalibration = GULF_A4_CALIBRATION): ChequeA4Placement {
  return {
    xMm: GULF_CHEQUE_BASE_X_MM + calibration.offsetXMm,
    yMm: GULF_CHEQUE_BASE_Y_MM + calibration.offsetYMm,
    widthMm: GULF_CHEQUE_WIDTH_MM,
    heightMm: GULF_CHEQUE_HEIGHT_MM,
  };
}

// ── Cheque-local field table (the authored source of truth) ───────────────────

/**
 * One printable field, in CHEQUE-LOCAL millimetres.
 *
 * `binding` is a stable SemanticKey the Runtime Engine resolves against the real
 * cheque record. Nothing pre-printed by the bank appears here: no logo, no bank
 * or company name, no KD / د.ك marks, no rules, no signature, no cheque number,
 * no sort code, no account number, no MICR, no security background.
 */
export interface GulfLocalField {
  id: string;
  binding: string;
  label: string;
  /** Cheque-local coordinates, millimetres, origin = cheque top-left. */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizePx: number;
  fontWeight: number;
  textAlign: DesignerTextAlign;
  zIndex: number;
  /** Tafqeet only — may wrap onto a second line inside its own box. */
  multiline?: boolean;
  /**
   * Date block only — the internal cells drawn inside this ONE field's box, in
   * millimetres relative to the block's own left edge. See `GULF_DATE_SLOTS_MM`.
   */
  slotsMm?: readonly { key: string; xMm: number; widthMm: number }[];
}

/**
 * BASE CALIBRATION COORDINATES — measured off the physical Gulf Bank cheque.
 *
 * The cheque already carries printed `/` separators between the date parts, so
 * the date is printed as three separate digit groups rather than one string.
 * The amount box and the currency marks are pre-printed too, so only the number
 * itself is placed inside the box.
 */
export const GULF_LOCAL_FIELDS: readonly GulfLocalField[] = [
  {
    id: 'beneficiary', binding: 'beneficiary', label: 'المستفيد',
    xMm: 8.0, yMm: 23.5, widthMm: 108.0, heightMm: 7.0,
    fontSizePx: 14, fontWeight: 600, textAlign: 'right', zIndex: 1,
  },
  {
    // ONE date object: 135 to 163 mm, the full span of the cheque's date box.
    // Its day / month / year cells are internal slots, not fields — see
    // `GULF_DATE_SLOTS_MM`. The three cells therefore share this box's y, height
    // and typography and can never drift vertically from one another.
    id: 'chequeDate', binding: 'chequeDate', label: 'التاريخ',
    xMm: 135.0, yMm: 23.0, widthMm: 28.0, heightMm: 7.0,
    fontSizePx: 14, fontWeight: 700, textAlign: 'center', zIndex: 2,
    slotsMm: GULF_DATE_SLOTS_MM,
  },
  {
    id: 'amountInWords', binding: 'amountInWords', label: 'التفقيط',
    xMm: 10.0, yMm: 33.0, widthMm: 105.0, heightMm: 16.0,
    fontSizePx: 12, fontWeight: 600, textAlign: 'right', zIndex: 5, multiline: true,
  },
  {
    id: 'amount', binding: 'amount', label: 'المبلغ بالأرقام',
    xMm: 132.0, yMm: 40.0, widthMm: 38.5, heightMm: 8.5,
    fontSizePx: 15, fontWeight: 700, textAlign: 'right', zIndex: 6,
  },
] as const;

// ── Derivations ──────────────────────────────────────────────────────────────

/**
 * A field's FINAL position on the A4 sheet (mm) — the documented formula, in code:
 *
 *   finalX = chequeAreaX + fieldLocalX + calibrationOffsetX
 *   finalY = chequeAreaY + fieldLocalY + calibrationOffsetY
 *
 * (the calibration term is already inside `gulfChequeAreaMm`, which is the whole
 * point: calibration moves the AREA, never a field.)
 *
 * Nothing in the render path calls this — the renderer places fields relative to
 * the cheque surface, exactly as it does for every other template. It exists so
 * the derivation is stated once, testable, and never re-invented.
 */
export function gulfFieldFinalMm(
  field: Pick<GulfLocalField, 'xMm' | 'yMm'>,
  calibration: GulfCalibration = GULF_A4_CALIBRATION,
): { xMm: number; yMm: number } {
  const area = gulfChequeAreaMm(calibration);
  return { xMm: area.xMm + field.xMm, yMm: area.yMm + field.yMm };
}

/**
 * The profile as the `DesignerField[]` the Runtime Engine consumes.
 *
 * The ONLY transformation is mm → percent OF THE CHEQUE SURFACE, which is the
 * unit the shared renderer already speaks. The A4 page never enters this
 * conversion: a field's percentages describe where it sits inside the cheque, so
 * moving the cheque area (calibration) cannot disturb them.
 */
export function gulfChequeFields(): DesignerField[] {
  return GULF_LOCAL_FIELDS.map((f) => ({
    id: f.id,
    label: f.label,
    // Deliberately empty: a bound field with no real runtime value must raise a
    // blocking error, never fall back to sample text on a live cheque.
    value: '',
    x: (f.xMm / GULF_CHEQUE_WIDTH_MM) * 100,
    y: (f.yMm / GULF_CHEQUE_HEIGHT_MM) * 100,
    width: (f.widthMm / GULF_CHEQUE_WIDTH_MM) * 100,
    height: (f.heightMm / GULF_CHEQUE_HEIGHT_MM) * 100,
    rotation: 0,
    fontSize: f.fontSizePx,
    fontWeight: f.fontWeight,
    textAlign: f.textAlign,
    color: '#000000',
    zIndex: f.zIndex,
    binding: f.binding,
    visible: true,
    ...(f.multiline ? { multiline: true } : {}),
    // Slot offsets are percentages of the FIELD's own box, so they scale and
    // travel with it: moving the date block moves every cell by construction.
    ...(f.slotsMm
      ? {
        slots: f.slotsMm.map((slot) => ({
          key: slot.key,
          xPercent: (slot.xMm / f.widthMm) * 100,
          widthPercent: (slot.widthMm / f.widthMm) * 100,
        })),
      }
      : {}),
  }));
}

// ── The calibratable PROFILE DOCUMENT ────────────────────────────────────────

/**
 * «قالب شيك الخليج» as the professional calibration studio sees it.
 *
 * This is the whole point of the profile being a profile rather than a special
 * case: `surface` + `fields` is exactly the document the Cheque Template
 * Designer already edits for every other template, so the studio's full
 * capability set — drag, resize, rotate, keyboard nudge, alignment guides, the
 * properties panel (x / y / width / height / rotation / font size / weight /
 * alignment / colour / visibility / z-order), data-source binding, undo-redo,
 * live preview and test print — applies to it unchanged, with no editor,
 * renderer or calibration engine written for it.
 *
 * `placement` is the one thing a 180 × 90 mm cheque printed on a 297 × 210 mm
 * sheet needs and a plain designer template does not: WHERE on the page the
 * cheque area sits. It is carried here so the EXISTING A4 sheet component can
 * be told, rather than a second renderer being built for it.
 */
export interface GulfA4Profile {
  /** Stable profile identity — never a database row id. */
  id: typeof GULF_A4_PROFILE_ID;
  name: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  /** Global A4 placement offsets for the whole cheque area. */
  calibration: GulfCalibration;
}

/** The measured, uncalibrated profile — what "restore default" returns to. */
export function gulfFactoryProfile(): GulfA4Profile {
  return {
    id: GULF_A4_PROFILE_ID,
    name: GULF_A4_TEMPLATE_NAME,
    surface: { ...GULF_CHEQUE_SURFACE_CM },
    fields: gulfChequeFields(),
    calibration: { ...GULF_A4_CALIBRATION },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Is this a usable calibrated field?
 *
 * Deliberately a SHAPE check only, never a repair: the Runtime Engine already
 * normalises and reports every out-of-range coordinate, so anything that passes
 * here reaches the same validation every other template goes through. A stored
 * document that fails it is discarded WHOLE, back to the factory geometry —
 * a cheque must never print from a half-read layout.
 */
function isCalibratedField(value: unknown): value is DesignerField {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || !value.id) return false;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key] as number)) return false;
  }
  return true;
}

/**
 * Read a stored profile, merged over the factory document.
 *
 * Merge rules, and why:
 *   • a field the operator calibrated replaces the factory field OF THE SAME ID,
 *     so a future factory field the stored document predates still appears;
 *   • field ORDER follows the factory table, so the profile's identity cannot be
 *     reshuffled by storage;
 *   • anything missing or malformed falls back to factory — the measured
 *     geometry — rather than to a partial layout.
 */
export function parseGulfProfile(raw: string | null | undefined): GulfA4Profile {
  const factory = gulfFactoryProfile();
  if (!raw) return factory;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return factory;
  }
  if (!isPlainObject(parsed)) return factory;

  const surface = isPlainObject(parsed.surface)
    && typeof parsed.surface.widthCm === 'number' && Number.isFinite(parsed.surface.widthCm) && parsed.surface.widthCm > 0
    && typeof parsed.surface.heightCm === 'number' && Number.isFinite(parsed.surface.heightCm) && parsed.surface.heightCm > 0
    ? { widthCm: parsed.surface.widthCm, heightCm: parsed.surface.heightCm }
    : factory.surface;

  const storedFields = Array.isArray(parsed.fields) ? parsed.fields.filter(isCalibratedField) : [];
  const byId = new Map(storedFields.map((f) => [f.id, f]));
  const fields = factory.fields.map((f) => {
    const stored = byId.get(f.id);
    return stored ? { ...f, ...stored } : f;
  });

  return {
    id: GULF_A4_PROFILE_ID,
    name: factory.name,
    surface,
    fields,
    // The offsets keep their own parser, so a document written by the earlier
    // offsets-only shape still reads correctly and simply carries factory fields.
    calibration: isPlainObject(parsed.calibration)
      ? parseGulfCalibration(JSON.stringify(parsed.calibration))
      : parseGulfCalibration(raw),
  };
}

export function serializeGulfProfile(profile: GulfA4Profile): string {
  return JSON.stringify({
    id: GULF_A4_PROFILE_ID,
    surface: profile.surface,
    fields: profile.fields,
    calibration: {
      offsetXMm: finiteOr(profile.calibration.offsetXMm, GULF_A4_OFFSET_X_MM),
      offsetYMm: finiteOr(profile.calibration.offsetYMm, GULF_A4_OFFSET_Y_MM),
    },
  });
}

/** Read the active calibrated profile out of the `/settings` rows the page already holds. */
export function gulfProfileFromSettings(settings: { key: string; value: string }[]): GulfA4Profile {
  const row = Array.isArray(settings)
    ? settings.find((s) => s && s.key === GULF_A4_CALIBRATION_SETTING_KEY)
    : undefined;
  return parseGulfProfile(row?.value);
}

/** The A4 placement a calibrated profile prints and previews at. */
export function gulfProfilePlacement(profile: GulfA4Profile): ChequeA4Placement {
  return gulfChequeAreaMm(profile.calibration);
}
