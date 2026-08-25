/**
 * Cheque printing — CALIBRATION PROFILES.
 *
 * The same bank template prints differently on different printers: the office
 * printer feeds the sheet a millimetre off from the one at home. Rather than
 * recalibrating the template every time the operator moves between them, each
 * bank template keeps one saved calibration PER PROFILE.
 *
 * Deliberately three fixed profiles and nothing more — no creating, deleting or
 * naming profiles, no printer detection, no automatic mapping, no history. The
 * operator picks one by hand, in the studio and again before printing.
 *
 * A profile changes only WHICH saved calibration document is loaded. It adds no
 * property to that document, no engine, no storage mechanism and no status: a
 * `PROVISIONAL` template stays provisional under every profile.
 */
import type { BankChequeProfileDefinition } from './chequeProfileDefinition';

/** The three fixed profiles. Stable ids — never display text. */
export const CALIBRATION_PROFILES = ['office', 'home', 'other'] as const;

export type CalibrationProfileId = (typeof CALIBRATION_PROFILES)[number];

/** What the operator sees. Display only; persistence uses the ids above. */
export const CALIBRATION_PROFILE_LABELS: Record<CalibrationProfileId, string> = {
  office: 'المكتب',
  home: 'البيت',
  other: 'أخرى',
};

/** The profile the studio and the print page start on. */
export const DEFAULT_CALIBRATION_PROFILE: CalibrationProfileId = 'office';

/**
 * The profile that INHERITS a calibration saved before profiles existed.
 *
 * The operator calibrated that document on the home printer, so `home` is where
 * it belongs — it is the setup they were actually printing with, and it must
 * survive this feature intact. `office` therefore starts from the template's own
 * factory geometry until it is calibrated in its own right, and `other` likewise.
 *
 * Inheritance is a FALLBACK, never an override: a profile that has its own saved
 * row always reads that row. See `profileDocumentFromSettings`.
 */
export const LEGACY_ADOPTING_CALIBRATION_PROFILE: CalibrationProfileId = 'home';

export function isCalibrationProfileId(value: unknown): value is CalibrationProfileId {
  return typeof value === 'string' && (CALIBRATION_PROFILES as readonly string[]).includes(value);
}

/**
 * The settings key holding WHICH profile is the operator's default.
 *
 * One key for the whole app — not one per bank. It remembers a single fact: the
 * profile last chosen. It carries no geometry, so changing it can never move a
 * field, an offset or a calibration document; those stay in their own nine rows,
 * untouched and independent.
 */
export const DEFAULT_PROFILE_SETTING_KEY = 'cheques.defaultCalibrationProfile';

/**
 * The profile to start on, from the saved settings.
 *
 * `office` is the FIRST-RUN value only — used when nothing has been saved yet.
 * Once the operator has chosen, their choice is what comes back, across page
 * navigation, a new session and a restart of the app.
 *
 * A row that is missing, empty or holds anything outside the three ids falls
 * back to `office` rather than throwing or leaving the picker blank: a corrupted
 * preference must not be able to break cheque printing.
 */
export function readDefaultCalibrationProfile(
  settings: { key: string; value: string }[],
): CalibrationProfileId {
  const rows = Array.isArray(settings) ? settings : [];
  const stored = rows.find((s) => s && s.key === DEFAULT_PROFILE_SETTING_KEY)?.value;
  return isCalibrationProfileId(stored) ? stored : DEFAULT_CALIBRATION_PROFILE;
}

/**
 * The settings key one bank template's calibration is saved under FOR ONE
 * PROFILE.
 *
 * Composed from the template's own base key by inserting the profile id before
 * the version suffix, so the identity is `bank template + calibration profile`:
 *
 *   cheque.calibration.gulf-a4.v1  →  cheque.calibration.gulf-a4.office.v1
 *                                     cheque.calibration.gulf-a4.home.v1
 *                                     cheque.calibration.gulf-a4.other.v1
 *
 * Nine independent rows for three banks — every pair reads and writes its own,
 * so calibrating Gulf at the office cannot move Gulf at home, and neither can
 * touch KFH or NBK.
 */
export function calibrationSettingKey(
  profile: BankChequeProfileDefinition,
  calibrationProfile: CalibrationProfileId,
): string {
  return profile.settingKey.replace(/\.v(\d+)$/, `.${calibrationProfile}.v$1`);
}

/**
 * The key this template's calibration was saved under BEFORE profiles existed.
 *
 * Read-only compatibility: a document found here is inherited by
 * `LEGACY_ADOPTING_CALIBRATION_PROFILE` — `home` — so the Gulf calibration
 * already in production keeps printing exactly as it did. Nothing ever writes to
 * this key again: the first save under `home` writes the profile key, which from
 * then on takes precedence, and the legacy row is simply left in place. It is
 * never deleted and no migration touches it.
 */
export function legacyCalibrationSettingKey(profile: BankChequeProfileDefinition): string {
  return profile.settingKey;
}
