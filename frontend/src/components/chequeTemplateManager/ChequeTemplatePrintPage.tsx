import { useLocation, useNavigate } from 'react-router-dom';
import { resolveChequeTemplate } from '../../modules/chequeTemplateRuntime';
import type { RuntimeData } from '../../modules/chequeTemplateRuntime';
import type { DesignerField, DesignerSurfaceSpec } from '../../modules/chequeTemplateDesigner';
import { printCurrentView } from '../../utils/print';
import chequeBg from '../../assets/cheakv1.png';
import ChequeRenderSurface from './ChequeRenderSurface';
import { PreviewIssues } from './ChequePreview';
import './chequeTemplatePrintPage.css';

/**
 * Cheque Template Print page — Cheque Template Printing v1.
 *
 * A dedicated print route (the same proven pattern the app's other print
 * surfaces use), so it is completely isolated from the studio overlay and the
 * classic cheque page's print CSS. It:
 *   1. reads the template layout + real cheque runtime data from router state,
 *   2. resolves the render model via the Runtime Engine (single authority),
 *   3. blocks printing and shows a professional message if the model has errors,
 *   4. otherwise draws the model via the SHARED ChequeRenderSurface (so the
 *      print matches the Live Preview exactly) and prints through the existing
 *      Electron flow (`printCurrentView` → `window.manar.printPage`).
 *
 * It performs no binding resolution and no layout math — the engine did that.
 */

interface PrintState {
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  runtimeData?: RuntimeData;
}

function isPrintState(value: unknown): value is PrintState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return !!v.surface && typeof v.surface === 'object' && Array.isArray(v.fields);
}

export default function ChequeTemplatePrintPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state;

  if (!isPrintState(state)) {
    return (
      <div className="ctpp-message" dir="rtl">
        <span className="material-symbols-outlined" aria-hidden="true">report</span>
        <p>تعذّر تحميل بيانات الطباعة. ارجع إلى قالب الشيك وحاول الطباعة من جديد.</p>
        <button type="button" className="btn" onClick={() => navigate(-1)}>رجوع</button>
      </div>
    );
  }

  const model = resolveChequeTemplate({ surface: state.surface, fields: state.fields }, state.runtimeData);
  const blocked = model.meta.hasErrors;

  return (
    <div className="ctpp-root" dir="rtl">
      <div className="ctpp-chrome">
        <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>رجوع
        </button>
        <button type="button" className="btn" disabled={blocked} onClick={() => printCurrentView({ landscape: true })}>
          <span className="material-symbols-outlined" aria-hidden="true">print</span>طباعة
        </button>
        {blocked && (
          <span className="ctpp-blocked">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            لا يمكن الطباعة — يوجد أخطاء في القالب.
          </span>
        )}
      </div>

      {blocked ? (
        <div className="ctpp-issues">
          <PreviewIssues issues={model.issues} />
        </div>
      ) : (
        <div className="ctpp-print-area">
          {/* Real printing: NEVER print the cheque background — ink lands on
              pre-printed cheque paper. Only the resolved fields are printed. */}
          <ChequeRenderSurface model={model} backgroundSrc={chequeBg} showBackground={false} />
        </div>
      )}

      <style>{`
        @page { size: ${model.surface.widthCm}cm ${model.surface.heightCm}cm landscape; margin: 0; }
        @media print {
          .ctpp-chrome { display: none !important; }
          body > * { visibility: hidden !important; }
          .ctpp-print-area, .ctpp-print-area * { visibility: visible !important; }
          .ctpp-print-area { position: fixed; inset: 0; }
        }
      `}</style>
    </div>
  );
}
