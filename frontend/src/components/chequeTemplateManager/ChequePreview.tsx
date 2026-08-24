import type { RenderIssue, ResolvedRenderModel } from '../../modules/chequeTemplateRuntime';
import ChequeRenderSurface from './ChequeRenderSurface';
import ChequeA4Sheet from './ChequeA4Sheet';
import type { ChequePaperMode } from './ChequeA4Sheet';
import type { ChequeA4Placement } from '../../modules/chequePrint';
import './chequePreview.css';

/**
 * Cheque Live Preview — Cheque Template Live Preview v1.
 *
 * A pure, stateless, UI-only preview. It renders ONLY the ResolvedRenderModel
 * produced by the Runtime Engine, via the SHARED ChequeRenderSurface (the same
 * component the Print page uses) — so the preview and the print are guaranteed
 * to match, with no duplicated rendering logic. It never reads template fields
 * directly and never computes layout.
 *
 * Errors/warnings from the model are shown professionally and never stop the
 * valid fields from rendering.
 */

type Props = {
  /** The already-resolved render model (the ONLY rendering source). */
  model: ResolvedRenderModel;
  /** Optional cheque background image for WYSIWYG fidelity (the medium, not field data). */
  backgroundSrc?: string;
  /** Which outer paper surface to present the (identical) cheque on. Default: real cheque. */
  paperMode?: ChequePaperMode;
  /**
   * A4 mode only. Where the cheque area sits on the sheet, in true millimetres,
   * as decided by the open print profile. Absent ⇒ the A4 sheet's historical
   * default placement, so every existing caller is unchanged. This is the SAME
   * value the print job carries, so preview and print never disagree.
   */
  placement?: ChequeA4Placement;
};

function issueIcon(severity: RenderIssue['severity']): string {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

export function PreviewIssues({ issues }: { issues: RenderIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="chp-issues chp-issues--ok">
        <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
        لا توجد مشكلات في المعاينة.
      </div>
    );
  }
  return (
    <div className="chp-issues">
      <div className="chp-issues-title">ملاحظات المعاينة ({issues.length})</div>
      <ul className="chp-issues-list">
        {issues.map((iss, i) => (
          <li key={`${iss.code}-${iss.fieldId ?? 'x'}-${i}`} className={`chp-issue chp-issue--${iss.severity}`}>
            <span className="material-symbols-outlined" aria-hidden="true">{issueIcon(iss.severity)}</span>
            <span>{iss.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChequePreview({ model, backgroundSrc, paperMode = 'real-cheque', placement }: Props) {
  return (
    <div className="chp-root">
      <div className="chp-header">
        <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
        <span>معاينة مباشرة</span>
      </div>

      <div className="chp-frame">
        {paperMode === 'a4' ? (
          <ChequeA4Sheet model={model} backgroundSrc={backgroundSrc} placement={placement} />
        ) : (
          <ChequeRenderSurface model={model} backgroundSrc={backgroundSrc} />
        )}
      </div>

      <PreviewIssues issues={model.issues} />
    </div>
  );
}
