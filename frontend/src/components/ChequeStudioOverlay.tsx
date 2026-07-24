import { useState } from 'react';
import ChequeCalibrator from './ChequeCalibrator';
import type { CalibratorPreviewData } from './ChequeCalibrator';
import type { ChequeTemplate } from '../utils/chequeTemplate';
import ChequeTemplateManager from './chequeTemplateManager/ChequeTemplateManager';
import type { ChequeRecordInput } from './chequeTemplateManager/chequeRuntimeData';
import './chequeStudioOverlay.css';

/**
 * Cheque Studio overlay — Official Cheque Template Integration.
 *
 * A thin tabbed shell hosting the two independent cheque-printing modes inside
 * Official Cheque Management:
 *   • المعايرة   (Classic Calibration) — the DEFAULT tab, renders the existing
 *                 ChequeCalibrator UNCHANGED, with the exact same props.
 *   • قالب الشيك (Cheque Template) — hosts the Cheque Template Manager (the
 *                 reused generic ChequeTemplateDesigner plus template
 *                 management). No printing, print-mode switching, or runtime
 *                 data binding.
 *
 * Only the active tab is mounted, so the calibration tab is byte-for-byte the
 * previous experience. ChequeCalibrator is `position: fixed; inset: 0`; to sit
 * it below the tab bar without editing it, its host establishes a SCREEN-ONLY
 * CSS containing block (a `transform` in chequeStudioOverlay.css). In print
 * there is no transform, so the calibrator's test-sheet print path is
 * unchanged.
 */

// Props mirror ChequeCalibrator's exactly — this shell passes them straight
// through to the (unchanged) calibrator on the calibration tab.
interface Props {
  banks: readonly string[];
  initialBank: string;
  loadedTemplates: Record<string, ChequeTemplate>;
  previewData: CalibratorPreviewData;
  onSaved: (bank: string, template: ChequeTemplate) => void;
  onClose: () => void;
  isSystemAdmin?: boolean;
  /** Current official cheque to print via the Cheque Template tab (design mode when null). */
  chequeRecord?: ChequeRecordInput | null;
}

type StudioTab = 'calibration' | 'template';

export default function ChequeStudioOverlay({
  banks,
  initialBank,
  loadedTemplates,
  previewData,
  onSaved,
  onClose,
  isSystemAdmin,
  chequeRecord,
}: Props) {
  const [activeTab, setActiveTab] = useState<StudioTab>('calibration');

  return (
    <div className="chq-studio-overlay" dir="rtl">
      <div className="chq-studio-tabs" role="tablist" aria-label="أوضاع طباعة الشيكات">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'calibration'}
          className={`chq-studio-tab${activeTab === 'calibration' ? ' active' : ''}`}
          onClick={() => setActiveTab('calibration')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">tune</span>
          المعايرة
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'template'}
          className={`chq-studio-tab${activeTab === 'template' ? ' active' : ''}`}
          onClick={() => setActiveTab('template')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">dashboard_customize</span>
          قالب الشيك
        </button>
        <div className="chq-studio-tabs-spacer" />
        <button type="button" className="chq-studio-close" onClick={onClose} aria-label="إغلاق">
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
          إغلاق
        </button>
      </div>

      <div className="chq-studio-body">
        {activeTab === 'calibration' ? (
          // Calibration tab — the existing calibrator, UNCHANGED. Hosted in a
          // screen-only containing block so its fixed overlay sits below the
          // tab bar; print is unaffected (see chequeStudioOverlay.css).
          <div className="chq-studio-calib-host">
            <ChequeCalibrator
              banks={banks}
              initialBank={initialBank}
              loadedTemplates={loadedTemplates}
              previewData={previewData}
              onSaved={onSaved}
              onClose={onClose}
              isSystemAdmin={isSystemAdmin}
            />
          </div>
        ) : (
          <div className="chq-studio-designer-host">
            <ChequeTemplateManager chequeRecord={chequeRecord} />
          </div>
        )}
      </div>
    </div>
  );
}
