/**
 * Cheque printing — the BANK PROFILE REGISTRY.
 *
 * One entry per bank whose cheques the system may print. Adding a bank is adding
 * a record here plus its measured numbers — never a print path, a renderer, a
 * calibration surface or a storage mechanism, all of which are shared.
 *
 * ── Current registry ────────────────────────────────────────────────────────
 *   GULF_BANK  APPROVED     — measured off its own cheque, calibrated, approved
 *   KFH        PROVISIONAL  — seeded working geometry, awaiting its own cheque
 *   NBK        PROVISIONAL  — seeded working geometry, awaiting its own cheque
 *
 * ── Why KFH and NBK are PROVISIONAL, not APPROVED ───────────────────────────
 * They carry a COMPLETE working geometry, so they open and calibrate in the full
 * professional studio today. But those numbers were seeded from a shared
 * baseline — they were not measured off a KFH or an NBK cheque, and nobody has
 * printed one to check. `PROVISIONAL` says exactly that, and the printability
 * guard refuses production printing for it. "I can calibrate this" and "its
 * measurements are confirmed" are different claims; only the first is true yet.
 *
 * ── Why the baseline is COPIED, never referenced ────────────────────────────
 * `PROVISIONAL_BASE_*` below is standalone literal data. It was seeded from the
 * Gulf measurements — the only real cheque measured so far — but it is NOT the
 * Gulf profile and does not read from it. It is deep-cloned per profile, so the
 * three profiles share no object: editing one bank's definition, or mutating one
 * profile's field array at runtime, cannot reach another.
 *
 * ── What arrives with each bank's specimen ──────────────────────────────────
 * Replace, inside that bank's entry only:
 *   • `chequeGeometry` — the measured width × height in mm;
 *   • `placement`      — where that area sits on the A4 landscape sheet;
 *   • `previewBackground` — that bank's own cheque photo (preview only);
 *   • `fields`         — the measured mm table;
 *   • `status: 'APPROVED'` once a real printed cheque is approved.
 * No engine change, no new code path — the studio and the print pipeline are
 * already the shared ones.
 */
import gulfChequeBackground from '../../assets/cheakv1.png';
import { A4_LANDSCAPE_MM } from './physicalPage';
import {
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_A4_TEMPLATE_NAME,
  GULF_BANK_CODE,
  GULF_BANK_NAME_AR,
  GULF_CHEQUE_BASE_X_MM,
  GULF_CHEQUE_BASE_Y_MM,
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_WIDTH_MM,
  GULF_LOCAL_FIELDS,
} from './gulfBankA4Profile';
import { localFieldsToDesignerFields, profilePrintability } from './chequeProfileDefinition';
import { parseProfileDocument } from './gulfBankA4Profile';
import type { GulfA4Profile } from './gulfBankA4Profile';
import {
  DEFAULT_CALIBRATION_PROFILE,
  LEGACY_ADOPTING_CALIBRATION_PROFILE,
  calibrationSettingKey,
  legacyCalibrationSettingKey,
} from './calibrationProfiles';
import type { CalibrationProfileId } from './calibrationProfiles';
import type {
  BankChequeProfileDefinition,
  ChequeLocalField,
  ChequePagePlacement,
  ChequePhysicalGeometry,
  ProfilePrintability,
} from './chequeProfileDefinition';
import type { DesignerField, DesignerSurfaceSpec } from '../chequeTemplateDesigner';
import type { ChequeA4Placement } from './physicalPage';

/** Bank identities, matching `Bank.code` in the existing registry — never a name string. */
export const KFH_BANK_CODE = 'KFH';
export const NBK_BANK_CODE = 'NBK';

/** Calibration storage keys — one settings row per bank, independent by construction. */
export const KFH_CALIBRATION_SETTING_KEY = 'cheque.calibration.kfh-a4.v1';
export const NBK_CALIBRATION_SETTING_KEY = 'cheque.calibration.nbk-a4.v1';

// -- Provisional baseline ----------------------------------------------------
//
// Standalone starting numbers for a bank whose own cheque has not been measured
// yet. They were SEEDED from the Gulf measurements -- the only physical cheque
// measured so far -- and then written out here as their own data. Nothing below
// reads the Gulf profile, so changing Gulf's definition changes nothing here,
// and a bank calibrating from this baseline is calibrating its own copy.

/** Working cheque size a provisional profile starts from. */
export const PROVISIONAL_BASE_GEOMETRY: ChequePhysicalGeometry = { widthMm: 180, heightMm: 90 };

/** Working A4 placement a provisional profile starts from. */
export const PROVISIONAL_BASE_PLACEMENT: ChequePagePlacement = { xMm: 117, yMm: 60 };

/**
 * Working field table a provisional profile starts from -- cheque-local mm.
 *
 * The date is ONE field with internal day / month / year slots, exactly the
 * approved Date Block architecture: never three separate designer fields.
 */
const PROVISIONAL_BASE_FIELDS: readonly ChequeLocalField[] = [
  {
    id: 'beneficiary', binding: 'beneficiary', label: 'المستفيد',
    xMm: 8.0, yMm: 23.5, widthMm: 108.0, heightMm: 7.0,
    fontSizePx: 14, fontWeight: 600, textAlign: 'right', zIndex: 1,
  },
  {
    id: 'chequeDate', binding: 'chequeDate', label: 'التاريخ',
    xMm: 135.0, yMm: 23.0, widthMm: 28.0, heightMm: 7.0,
    fontSizePx: 14, fontWeight: 700, textAlign: 'center', zIndex: 2,
    slotsMm: [
      { key: 'chequeDay', xMm: 0.0, widthMm: 6.0 },
      { key: 'chequeMonth', xMm: 9.0, widthMm: 6.0 },
      { key: 'chequeYear', xMm: 18.0, widthMm: 10.0 },
    ],
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

/**
 * A DEEP COPY of the baseline field table.
 *
 * Every provisional profile gets its own objects and its own slot arrays, so no
 * two profiles -- and no profile and the baseline -- ever share a mutable value.
 * This is what makes "editing KFH cannot touch NBK" structural rather than a
 * convention someone has to remember.
 */
function provisionalBaseFields(): ChequeLocalField[] {
  return PROVISIONAL_BASE_FIELDS.map((f) => ({
    ...f,
    ...(f.slotsMm ? { slotsMm: f.slotsMm.map((slot) => ({ ...slot })) } : {}),
  }));
}

/** Build a provisional profile for a bank from the shared baseline. */
function provisionalProfile(
  bankCode: string,
  bankNameAr: string,
  displayName: string,
  settingKey: string,
): BankChequeProfileDefinition {
  return {
    bankCode,
    bankNameAr,
    displayName,
    status: 'PROVISIONAL',
    settingKey,
    chequeGeometry: { ...PROVISIONAL_BASE_GEOMETRY },
    placement: { ...PROVISIONAL_BASE_PLACEMENT },
    // No image until this bank's own cheque photo is supplied. Never another
    // bank's -- and preview-only whenever it does arrive.
    previewBackground: null,
    fields: provisionalBaseFields(),
  };
}

/**
 * «قالب شيك الخليج» — the approved, released profile.
 *
 * Every number here is READ from the existing Gulf module, never restated: this
 * entry is a registry view of that profile, so the registry cannot drift from
 * the template the Product Owner approved.
 */
const GULF_PROFILE: BankChequeProfileDefinition = {
  bankCode: GULF_BANK_CODE,
  bankNameAr: GULF_BANK_NAME_AR,
  displayName: GULF_A4_TEMPLATE_NAME,
  status: 'APPROVED',
  settingKey: GULF_A4_CALIBRATION_SETTING_KEY,
  chequeGeometry: { widthMm: GULF_CHEQUE_WIDTH_MM, heightMm: GULF_CHEQUE_HEIGHT_MM },
  placement: { xMm: GULF_CHEQUE_BASE_X_MM, yMm: GULF_CHEQUE_BASE_Y_MM },
  previewBackground: gulfChequeBackground,
  fields: GULF_LOCAL_FIELDS as readonly ChequeLocalField[],
};

/** «قالب شيك بيت التمويل الكويتي» -- provisional: calibratable now, unconfirmed. */
const KFH_PROFILE: BankChequeProfileDefinition = provisionalProfile(
  KFH_BANK_CODE,
  'بيت التمويل الكويتي',
  'قالب شيك بيت التمويل الكويتي',
  KFH_CALIBRATION_SETTING_KEY,
);

/** «قالب شيك بنك الكويت الوطني» -- provisional: calibratable now, unconfirmed. */
const NBK_PROFILE: BankChequeProfileDefinition = provisionalProfile(
  NBK_BANK_CODE,
  'بنك الكويت الوطني',
  'قالب شيك بنك الكويت الوطني',
  NBK_CALIBRATION_SETTING_KEY,
);

/** Every registered bank cheque profile, in display order. */
export const BANK_CHEQUE_PROFILES: readonly BankChequeProfileDefinition[] = [
  GULF_PROFILE,
  KFH_PROFILE,
  NBK_PROFILE,
] as const;

/** Look a profile up by the bank's stable code. */
export function bankChequeProfileByCode(bankCode: string | null | undefined): BankChequeProfileDefinition | null {
  if (!bankCode) return null;
  return BANK_CHEQUE_PROFILES.find((p) => p.bankCode === bankCode) ?? null;
}

/**
 * Resolve the profile for a cheque.
 *
 * Identity comes from the bank's CODE whenever the cheque is linked to a bank
 * account — the stable identity the Multi-Bank registry already provides. The
 * Arabic-name path exists only for legacy cheques that were never linked to an
 * account, which is the same fallback the cheques page already uses for them.
 *
 * An unknown bank resolves to `null`, never to another bank's profile.
 */
export function resolveBankChequeProfile(
  identity: { bankCode?: string | null; bankNameAr?: string | null },
): BankChequeProfileDefinition | null {
  const byCode = bankChequeProfileByCode(identity.bankCode);
  if (byCode) return byCode;
  const name = identity.bankNameAr?.trim();
  if (!name) return null;
  return BANK_CHEQUE_PROFILES.find((p) => p.bankNameAr === name) ?? null;
}

/**
 * May this cheque be printed?
 *
 * An unregistered bank is refused with the same message a registered but
 * unmeasured one gets: in both cases there is no approved physical profile, and
 * nothing is ever substituted.
 */
export function chequeProfilePrintability(
  profile: BankChequeProfileDefinition | null,
): ProfilePrintability {
  if (!profile) {
    return {
      ok: false,
      message: 'قالب هذا البنك غير معاير بعد. يلزم إعداد الشيك الأصلي واعتماد مواضع الطباعة.',
    };
  }
  return profilePrintability(profile);
}

// ── Derived geometry (only meaningful once a specimen has been measured) ──────

/** The profile's cheque as a designer surface spec, or `null` while unmeasured. */
export function profileSurfaceCm(profile: BankChequeProfileDefinition): DesignerSurfaceSpec | null {
  if (!profile.chequeGeometry) return null;
  return {
    widthCm: profile.chequeGeometry.widthMm / 10,
    heightCm: profile.chequeGeometry.heightMm / 10,
  };
}

/** The profile's field table as `DesignerField[]`, via the one shared converter. */
export function profileDesignerFields(profile: BankChequeProfileDefinition): DesignerField[] {
  if (!profile.chequeGeometry) return [];
  return localFieldsToDesignerFields(
    profile.fields,
    profile.chequeGeometry.widthMm,
    profile.chequeGeometry.heightMm,
  );
}

/**
 * The profile's cheque area on the A4 sheet, with the calibration offsets
 * applied. `null` while the specimen is unmeasured — a caller with no placement
 * has nothing to print, which is exactly the intended outcome.
 */
export function profilePlacementMm(
  profile: BankChequeProfileDefinition,
  calibration: { offsetXMm: number; offsetYMm: number } = { offsetXMm: 0, offsetYMm: 0 },
): ChequeA4Placement | null {
  if (!profile.chequeGeometry || !profile.placement) return null;
  return {
    xMm: profile.placement.xMm + calibration.offsetXMm,
    yMm: profile.placement.yMm + calibration.offsetYMm,
    widthMm: profile.chequeGeometry.widthMm,
    heightMm: profile.chequeGeometry.heightMm,
  };
}

/**
 * The FACTORY calibration document for a profile — its definition expressed in
 * the shape the studio and the runtime engine consume.
 *
 * `null` when the profile has no geometry, which is what makes an unmeasured
 * bank un-openable in the designer rather than openable over borrowed numbers.
 * Every call builds fresh objects, so two banks never share a field object.
 */
export function profileFactoryDocument(profile: BankChequeProfileDefinition): GulfA4Profile | null {
  const surface = profileSurfaceCm(profile);
  if (!surface) return null;
  return {
    id: 'gulf-a4',
    name: profile.displayName,
    surface,
    fields: profileDesignerFields(profile),
    calibration: { offsetXMm: 0, offsetYMm: 0 },
  };
}

/**
 * The SAVED calibration document for one bank template ON ONE CALIBRATION
 * PROFILE, merged over that template's factory document.
 *
 * The identity is `bank template + calibration profile`: it reads only that
 * pair's own settings row, so Gulf/office cannot be read as Gulf/home, and
 * neither can reach KFH or NBK. A pair never saved before starts from its own
 * bank's factory document — never from another profile's edits.
 *
 * COMPATIBILITY: a calibration saved before profiles existed lives under the
 * template's un-suffixed key. It is inherited by `home` — the printer that
 * calibration was actually made on — so the Gulf calibration already in
 * production keeps printing exactly as it did. `office` starts from the
 * template's own factory geometry until it is calibrated in its own right.
 *
 * Inheritance is strictly a FALLBACK: the pair's own row is looked up FIRST, so
 * once `home` has been saved its own row wins and the legacy value is never
 * consulted again. The legacy row is read, never written, never deleted.
 */
export function profileDocumentFromSettings(
  profile: BankChequeProfileDefinition,
  settings: { key: string; value: string }[],
  calibrationProfile: CalibrationProfileId = DEFAULT_CALIBRATION_PROFILE,
): GulfA4Profile | null {
  const factory = profileFactoryDocument(profile);
  if (!factory) return null;
  const rows = Array.isArray(settings) ? settings : [];
  const find = (key: string) => rows.find((s) => s && s.key === key)?.value;

  const stored = find(calibrationSettingKey(profile, calibrationProfile))
    ?? (calibrationProfile === LEGACY_ADOPTING_CALIBRATION_PROFILE
      ? find(legacyCalibrationSettingKey(profile))
      : undefined);

  return parseProfileDocument(stored, factory);
}

/**
 * A neutral placeholder surface for the SETUP view of an unmeasured profile.
 *
 * The studio needs some box to draw before a specimen exists. This is a blank
 * A4-proportioned area — deliberately NOT any bank's cheque size — and it is
 * never a print profile: `profilePrintability` still refuses the template, so a
 * placeholder can not become ink.
 */
export const SETUP_PLACEHOLDER_SURFACE_CM: DesignerSurfaceSpec = {
  widthCm: A4_LANDSCAPE_MM.widthMm / 20,
  heightCm: A4_LANDSCAPE_MM.heightMm / 20,
};
