/**
 * Cheque printing — the BANK CHEQUE PROFILE contract.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Gulf Bank A4 template proved the whole pipeline: a measured cheque, placed
 * as an area on an A4 landscape sheet, with four printable values, calibrated in
 * the professional studio. Adding a second bank must not mean copying that
 * pipeline — it must mean adding a PROFILE.
 *
 * This file is the smallest extraction that makes that true: the shape of a bank
 * cheque profile, the one mm → percent conversion its fields need, and the
 * printability guard. It holds no bank's numbers and no rendering, and it creates
 * no engine: every profile still flows through the SAME machinery.
 *
 *   Bank profile → Runtime Engine → ChequeRenderSurface / ChequeA4Sheet
 *                → Professional Calibration Studio
 *                → ChequeTemplatePrintPage → existing Print IPC
 *
 * WHAT A PROFILE MAY NOT INHERIT
 * ──────────────────────────────
 * Nothing physical. A bank's cheque size, its place on the sheet, its field
 * coordinates and its preview image are properties OF THAT CHEQUE, measured off
 * the physical specimen. A profile without them is `NEEDS_PHYSICAL_SPECIMEN` and
 * is refused for printing — it never borrows another bank's geometry as a
 * fallback, because ink landing in the wrong place on a real cheque is worse
 * than not printing at all.
 */
import type { DesignerField, DesignerTextAlign } from '../chequeTemplateDesigner';

/**
 * One printable field, authored in CHEQUE-LOCAL millimetres (origin = the
 * cheque's top-left corner). This is the unit a specimen is measured in; the
 * percentages the renderer speaks are derived, never authored.
 */
export interface ChequeLocalField {
  id: string;
  binding: string;
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizePx: number;
  fontWeight: number;
  textAlign: DesignerTextAlign;
  zIndex: number;
  /** Tafqeet — may wrap onto a second line inside its own box. */
  multiline?: boolean;
  /**
   * DATE BLOCK only — the internal cells drawn inside this ONE field's box, in
   * millimetres relative to the block's own left edge.
   *
   * Every bank's date is ONE field with internal slots, never three fields: the
   * slots share the block's box and typography, so the digits sit on one
   * baseline by construction and move together with no group logic.
   */
  slotsMm?: readonly { key: string; xMm: number; widthMm: number }[];
}

/**
 * The four values the app prints on any bank's cheque. Everything the bank
 * pre-prints — logo, bank and company name, currency marks, cheque number,
 * sort code, MICR, rules, security background — is never printed by the app.
 */
export const CHEQUE_PRINTABLE_BINDINGS = ['beneficiary', 'chequeDate', 'amount', 'amountInWords'] as const;

/**
 * Convert an authored millimetre field table into the `DesignerField[]` the
 * Runtime Engine consumes.
 *
 * The ONLY transformation is mm → percent OF THE CHEQUE SURFACE, which is the
 * unit the shared renderer already speaks. The A4 page never enters it: a
 * field's percentages describe where it sits INSIDE the cheque, so moving the
 * cheque area (calibration) cannot disturb them. Slot offsets are percentages of
 * their own field's box, so they travel with it.
 *
 * Shared by every bank profile — this is what makes a new bank a table of
 * measurements rather than a copy of the print path.
 */
export function localFieldsToDesignerFields(
  fields: readonly ChequeLocalField[],
  chequeWidthMm: number,
  chequeHeightMm: number,
): DesignerField[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    // Deliberately empty: a bound field with no real runtime value must raise a
    // blocking error, never fall back to sample text on a live cheque.
    value: '',
    x: (f.xMm / chequeWidthMm) * 100,
    y: (f.yMm / chequeHeightMm) * 100,
    width: (f.widthMm / chequeWidthMm) * 100,
    height: (f.heightMm / chequeHeightMm) * 100,
    rotation: 0,
    fontSize: f.fontSizePx,
    fontWeight: f.fontWeight,
    textAlign: f.textAlign,
    color: '#000000',
    zIndex: f.zIndex,
    binding: f.binding,
    visible: true,
    ...(f.multiline ? { multiline: true } : {}),
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

// ── Profile status ───────────────────────────────────────────────────────────

/**
 * `APPROVED` — the physical specimen was measured, the geometry and field
 * coordinates are entered, and the Product Owner approved the printed result.
 * Only an approved profile may reach production paper.
 *
 * `PROVISIONAL` — the profile carries a complete WORKING geometry so it can be
 * opened and calibrated in the studio today, but those numbers were seeded from
 * a baseline rather than measured off THIS bank's cheque. It is fully editable
 * and fully saveable; it is NOT production-printable, because "I can calibrate
 * it" and "its measurements are confirmed" are different claims and the second
 * one has not been earned.
 *
 * `NEEDS_PHYSICAL_SPECIMEN` — the profile has no geometry at all. It cannot be
 * calibrated (there is nothing to calibrate) and cannot print. Kept as the
 * defined state for a bank registered without any starting numbers.
 */
export type BankChequeProfileStatus = 'APPROVED' | 'PROVISIONAL' | 'NEEDS_PHYSICAL_SPECIMEN';

/** The cheque's own physical size, measured off the specimen. */
export interface ChequePhysicalGeometry {
  widthMm: number;
  heightMm: number;
}

/** Where the cheque area's top-left corner sits on the A4 landscape sheet. */
export interface ChequePagePlacement {
  xMm: number;
  yMm: number;
}

/**
 * A bank's cheque print profile.
 *
 * Everything a new bank needs is DATA in this record — size, page placement,
 * preview image, field table. Nothing about the print path, the renderer, the
 * calibration studio or the storage mechanism is per-bank.
 */
export interface BankChequeProfileDefinition {
  /** The bank's stable identity in the existing registry (`Bank.code`). */
  bankCode: string;
  /**
   * The bank's stored Arabic name. Used ONLY to resolve legacy cheques that were
   * never linked to a bank account; live cheques resolve by `bankCode`.
   */
  bankNameAr: string;
  /** What the operator sees, e.g. «قالب شيك الخليج». */
  displayName: string;
  status: BankChequeProfileStatus;
  /**
   * The settings row this profile's calibration is saved in. One key per bank,
   * so Gulf, KFH and NBK calibrations can never read or overwrite each other.
   */
  settingKey: string;
  /** The measured cheque. `null` until the physical specimen arrives. */
  chequeGeometry: ChequePhysicalGeometry | null;
  /**
   * Where the cheque area sits on the sheet. `null` until measured.
   * The PAGE itself is not per-bank: every cheque prints on the shared A4
   * landscape page contract (see `physicalPage.ts`).
   */
  placement: ChequePagePlacement | null;
  /**
   * Preview-only cheque photo. `null` until the bank's own image is added — a
   * bank NEVER shows another bank's cheque. It is preview-only in every case and
   * is structurally absent from the printed subtree.
   */
  previewBackground: string | null;
  /** The authored millimetre field table. Empty until the specimen is measured. */
  fields: readonly ChequeLocalField[];
}

// ── Printability guard ───────────────────────────────────────────────────────

/** Shown when a bank's cheque template has no geometry at all. */
export const PROFILE_NOT_CALIBRATED_MESSAGE =
  'قالب هذا البنك غير معاير بعد. يلزم إعداد الشيك الأصلي واعتماد مواضع الطباعة.';

/**
 * Shown when a template CAN be calibrated but its measurements are still the
 * seeded baseline rather than this bank's own cheque. Production printing is
 * refused; calibration and test printing are not.
 */
export const PROFILE_PROVISIONAL_MESSAGE =
  'قالب هذا البنك إعداد افتراضي ولم يُطابَق بعد مع الشيك الأصلي. عاير القالب على شيك البنك ثم اعتمده قبل الطباعة الإنتاجية.';

/** The short status wording the UI shows beside a template. */
export const PROFILE_STATUS_LABELS: Record<BankChequeProfileStatus, string> = {
  APPROVED: 'معتمد',
  PROVISIONAL: 'إعداد افتراضي',
  NEEDS_PHYSICAL_SPECIMEN: 'غير معاير',
};

/** The one-line explanation shown under a non-approved template. */
export const PROFILE_STATUS_HINTS: Record<BankChequeProfileStatus, string> = {
  APPROVED: 'معتمد على الشيك الأصلي',
  PROVISIONAL: 'يحتاج مطابقة مع الشيك الأصلي',
  NEEDS_PHYSICAL_SPECIMEN: 'يلزم شيك أصلي',
};

export type ProfilePrintability =
  | { ok: true }
  | { ok: false; message: string };

/**
 * May this profile reach physical paper?
 *
 * The check is structural, not a flag anyone can set by hand: an approved status
 * is necessary but not sufficient — the cheque geometry, the page placement and
 * a field for every printable value must all be present. A profile missing any
 * of them is refused, and NOTHING is substituted from another bank.
 */
export function profilePrintability(profile: BankChequeProfileDefinition): ProfilePrintability {
  // A complete geometry is necessary but never sufficient: a PROVISIONAL profile
  // has one and is still refused, because its numbers were seeded, not measured
  // off this bank's cheque. The status is what carries that distinction, and it
  // is checked FIRST so no amount of geometry can talk its way past it.
  if (!isProfileCalibratable(profile)) return { ok: false, message: PROFILE_NOT_CALIBRATED_MESSAGE };
  if (profile.status === 'PROVISIONAL') return { ok: false, message: PROFILE_PROVISIONAL_MESSAGE };
  if (profile.status !== 'APPROVED') return { ok: false, message: PROFILE_NOT_CALIBRATED_MESSAGE };
  return { ok: true };
}

export function isProfilePrintable(profile: BankChequeProfileDefinition): boolean {
  return profilePrintability(profile).ok;
}

/**
 * May this profile be OPENED and edited in the calibration studio?
 *
 * A different question from printability, and deliberately a weaker one: the
 * studio needs a surface, a placement and a field for every printable value —
 * it does not need those numbers to be confirmed. That is precisely how a
 * seeded PROVISIONAL template becomes a measured APPROVED one: you open it and
 * calibrate it.
 */
export function isProfileCalibratable(profile: BankChequeProfileDefinition): boolean {
  if (!profile.chequeGeometry || !profile.placement) return false;
  const bindings = new Set(profile.fields.map((f) => f.binding));
  return CHEQUE_PRINTABLE_BINDINGS.every((b) => bindings.has(b));
}
