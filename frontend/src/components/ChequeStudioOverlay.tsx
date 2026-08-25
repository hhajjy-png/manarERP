import { useState } from 'react';
import ChequeTemplateManager from './chequeTemplateManager/ChequeTemplateManager';
import ChequeProfileSetupPanel from './chequeTemplateManager/ChequeProfileSetupPanel';
import type { ChequeRecordInput } from './chequeTemplateManager/chequeRuntimeData';
import {
  BANK_CHEQUE_PROFILES,
  CALIBRATION_PROFILES,
  CALIBRATION_PROFILE_LABELS,
  DEFAULT_CALIBRATION_PROFILE,
  GULF_BANK_CODE,
  PROFILE_STATUS_HINTS,
  PROFILE_STATUS_LABELS,
  bankChequeProfileByCode,
  calibrationSettingKey,
  isProfileCalibratable,
  isProfilePrintable,
  profileDocumentFromSettings,
} from '../modules/chequePrint';
import type { CalibrationProfileId, GulfA4Profile } from '../modules/chequePrint';
import './chequeStudioOverlay.css';

/**
 * Cheque Studio overlay — the professional cheque calibration studio.
 *
 * ── Template selector ──────────────────────────────────────────────────────
 * The studio calibrates a TEMPLATE, and the system registers one per bank
 * (`BANK_CHEQUE_PROFILES` — the single source; this shell keeps no list of its
 * own). The selector opens any registered template directly, without needing a
 * real cheque on that bank's account first, which is what makes a bank's
 * template preparable before its first cheque exists.
 *
 * It changes nothing about PRINTING. Production printing still resolves the
 * template from the cheque's own bank; this selector only decides which template
 * the studio is currently looking at.
 *
 *   «قالب شيك الخليج»              — معتمد          → full studio, printable
 *   «قالب شيك بيت التمويل الكويتي» — إعداد افتراضي  → full studio, not printable
 *   «قالب شيك بنك الكويت الوطني»   — إعداد افتراضي  → full studio, not printable
 *
 * A PROVISIONAL template opens in the SAME full studio — every tool, its own
 * document, its own settings key — because that is how its seeded numbers become
 * measured ones. What it does not get is a claim: production printing stays
 * refused by the profile guard until it is calibrated against a real cheque and
 * approved, and the toolbar says so while it is open.
 *
 * A template with no geometry at all has nothing to calibrate and opens as a
 * setup state instead — never as a designer over borrowed numbers.
 *
 * ── Calibration profile ────────────────────────────────────────────────────
 * The same template prints differently on different printers, so alongside the
 * template selector there is a second one — المكتب / البيت / أخرى. The pair
 * `bank template + calibration profile` is the identity: it decides which saved
 * document loads, which settings row a save writes, and what "restore default"
 * returns to. Nine independent rows for three banks.
 *
 * Switching either selector remounts the editor on the new pair, so an unsaved
 * edit in one never carries into another.
 *
 * WHICH profile the studio opens on is the host's saved default — the same one
 * the cheques page prints with. The host owns that state and persists it, so
 * choosing a profile here and printing from there can never disagree, and the
 * choice survives navigation, a new session and a restart.
 *
 * Nothing about the studio itself changed. The Designer, its engines, the
 * Runtime Engine, ChequeRenderSurface / ChequeA4Sheet, the print page and the
 * print IPC are all the same components, used the same way.
 */

interface Props {
  onClose: () => void;
  /** The cheque being worked on, for a realistic preview and for test printing. */
  chequeRecord?: ChequeRecordInput | null;
  /**
   * The raw `/settings` rows the host page already holds. Each template reads its
   * OWN calibration row out of these by its own key — the studio never mixes one
   * bank's saved document into another's.
   */
  settings?: { key: string; value: string }[];
  /**
   * The calibration profile to open on — the host's saved default. Supplied
   * together with `onCalibrationProfileChange`, the studio is CONTROLLED: one
   * choice shared with the cheques page rather than a second one of its own.
   * Omitted (standalone use), it keeps its own state starting at `office`.
   */
  calibrationProfile?: CalibrationProfileId;
  /** The operator picked a different profile here; the host applies and saves it. */
  onCalibrationProfileChange?: (calibrationProfile: CalibrationProfileId) => void;
  /** Persisted successfully, so the host can apply it to preview and printing at once. */
  onProfileSaved?: (bankCode: string, calibrationProfile: CalibrationProfileId, profile: GulfA4Profile) => void;
}

export default function ChequeStudioOverlay({
  onClose,
  chequeRecord,
  settings = [],
  calibrationProfile: controlledProfile,
  onCalibrationProfileChange,
  onProfileSaved,
}: Props) {
  // The studio opens on the approved template; the operator switches from there.
  const [selectedBankCode, setSelectedBankCode] = useState<string>(GULF_BANK_CODE);
  // Uncontrolled fallback, used only when the host supplies no profile.
  const [ownProfile, setOwnProfile] = useState<CalibrationProfileId>(DEFAULT_CALIBRATION_PROFILE);
  const calibrationProfile = controlledProfile ?? ownProfile;

  function pickProfile(next: CalibrationProfileId) {
    setOwnProfile(next);
    onCalibrationProfileChange?.(next);
  }
  /**
   * Documents saved during this session, keyed by `bank:profile`, so a save shows
   * at once without re-reading `/settings`. Keyed by the PAIR precisely so one
   * pair's save can never appear under another.
   */
  const [savedDocuments, setSavedDocuments] = useState<Record<string, GulfA4Profile>>({});

  const selected = bankChequeProfileByCode(selectedBankCode) ?? bankChequeProfileByCode(GULF_BANK_CODE)!;
  const selectedPrintable = isProfilePrintable(selected);
  const selectedCalibratable = isProfileCalibratable(selected);

  // The identity of what is open: bank template + calibration profile.
  const pairKey = `${selected.bankCode}:${calibrationProfile}`;
  const settingKey = calibrationSettingKey(selected, calibrationProfile);
  // This pair's own document: its own saved row merged over its own factory.
  const document = savedDocuments[pairKey] ?? profileDocumentFromSettings(selected, settings, calibrationProfile);

  function handleSaved(profile: GulfA4Profile) {
    setSavedDocuments((prev) => ({ ...prev, [pairKey]: profile }));
    onProfileSaved?.(selected.bankCode, calibrationProfile, profile);
  }

  return (
    <div className="chq-studio-overlay" dir="rtl">
      <div className="chq-studio-tabs">
        <span className="chq-studio-title">
          <span className="material-symbols-outlined" aria-hidden="true">tune</span>
          معايرة قالب الشيك
        </span>

        <label className="chq-studio-picker">
          <span className="chq-studio-picker-label">القالب:</span>
          <select
            className="chq-studio-picker-select"
            aria-label="القالب"
            value={selected.bankCode}
            onChange={(e) => setSelectedBankCode(e.target.value)}
          >
            {BANK_CHEQUE_PROFILES.map((profile) => (
              <option key={profile.bankCode} value={profile.bankCode}>
                {`${profile.displayName} — ${PROFILE_STATUS_LABELS[profile.status]}`}
              </option>
            ))}
          </select>
        </label>

        <label className="chq-studio-picker">
          <span className="chq-studio-picker-label">البروفايل:</span>
          <select
            className="chq-studio-picker-select chq-studio-picker-select--narrow"
            aria-label="البروفايل"
            value={calibrationProfile}
            onChange={(e) => pickProfile(e.target.value as CalibrationProfileId)}
          >
            {CALIBRATION_PROFILES.map((id) => (
              <option key={id} value={id}>{CALIBRATION_PROFILE_LABELS[id]}</option>
            ))}
          </select>
        </label>

        {/* Says plainly what the open template's status means. A provisional one
            is fully editable here and still not production-printable. */}
        {!selectedPrintable && (
          <span className="chq-studio-picker-state" data-testid="chq-studio-status">
            {`${PROFILE_STATUS_LABELS[selected.status]} — ${PROFILE_STATUS_HINTS[selected.status]}`}
          </span>
        )}

        <div className="chq-studio-tabs-spacer" />
        <button type="button" className="chq-studio-close" onClick={onClose} aria-label="إغلاق">
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
          إغلاق
        </button>
      </div>

      <div className="chq-studio-body">
        <div className="chq-studio-designer-host">
          {selectedCalibratable && document ? (
            // The full studio — the same one for every template. Each opens with
            // its OWN document, its OWN calibration key and its OWN preview photo.
            // Remounting on the bank code keeps one template's edits from leaking
            // into another.
            <ChequeTemplateManager
              key={pairKey}
              chequeRecord={chequeRecord}
              gulfProfile={document}
              profile={selected}
              settingKey={settingKey}
              onGulfProfileSaved={handleSaved}
            />
          ) : (
            // No geometry at all ⇒ nothing to calibrate. Never a designer over
            // borrowed numbers.
            <ChequeProfileSetupPanel profile={selected} />
          )}
        </div>
      </div>
    </div>
  );
}
