import ChequeTemplateManager from './chequeTemplateManager/ChequeTemplateManager';
import type { ChequeRecordInput } from './chequeTemplateManager/chequeRuntimeData';
import type { GulfA4Profile } from '../modules/chequePrint';
import './chequeStudioOverlay.css';

/**
 * Cheque Studio overlay — the professional cheque calibration studio.
 *
 * The system prints ONE approved cheque template, «قالب شيك الخليج», so the
 * studio hosts exactly that: the Cheque Template Designer with its toolbar,
 * live preview and test print, opened on the Gulf A4 profile.
 *
 * ── What this shell used to be, and what changed ───────────────────────────
 * It was a two-tab shell — «المعايرة» (the per-bank Classic calibrator) and
 * «قالب الشيك» (this studio) — because the app supported several cheque print
 * templates. Those alternatives (Classic, the 178×89 mm template, the generic
 * A4 template and the database Designer templates) were removed from the cheque
 * workflow, so a tab strip with one tab is noise: the shell now renders the
 * studio directly.
 *
 * Nothing about the studio itself changed. The Designer, its engines, the
 * Runtime Engine, ChequeRenderSurface / ChequeA4Sheet, the print page and the
 * print IPC are all the same components, used the same way.
 */

interface Props {
  onClose: () => void;
  /** The cheque being worked on, for a realistic preview and for test printing. */
  chequeRecord?: ChequeRecordInput | null;
  /** The calibrated profile currently in force, read from `/settings` by the host page. */
  gulfProfile: GulfA4Profile;
  /** Persisted successfully, so the host can apply it to preview and printing at once. */
  onGulfProfileSaved?: (profile: GulfA4Profile) => void;
}

export default function ChequeStudioOverlay({
  onClose,
  chequeRecord,
  gulfProfile,
  onGulfProfileSaved,
}: Props) {
  return (
    <div className="chq-studio-overlay" dir="rtl">
      <div className="chq-studio-tabs">
        <span className="chq-studio-title">
          <span className="material-symbols-outlined" aria-hidden="true">tune</span>
          معايرة قالب الشيك
        </span>
        <div className="chq-studio-tabs-spacer" />
        <button type="button" className="chq-studio-close" onClick={onClose} aria-label="إغلاق">
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
          إغلاق
        </button>
      </div>

      <div className="chq-studio-body">
        <div className="chq-studio-designer-host">
          <ChequeTemplateManager
            chequeRecord={chequeRecord}
            gulfProfile={gulfProfile}
            onGulfProfileSaved={onGulfProfileSaved}
          />
        </div>
      </div>
    </div>
  );
}
