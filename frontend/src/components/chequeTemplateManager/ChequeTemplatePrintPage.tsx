import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveChequeTemplate } from '../../modules/chequeTemplateRuntime';
import type { RuntimeData } from '../../modules/chequeTemplateRuntime';
import type { DesignerField, DesignerSurfaceSpec } from '../../modules/chequeTemplateDesigner';
import { printCurrentViewWithResult } from '../../utils/print';
import type { PrintOutcome } from '../../utils/print';
import { markChequePrinted, reprintCheque, printOutcomeMessage } from '../../utils/chequePrintTracking';
import type { ChequeTrackingInfo } from '../../utils/chequePrintTracking';
import { REPRINT_REASONS, REPRINT_REASON_LABELS } from '../../utils/chequeTemplate';
import type { ReprintReason } from '../../utils/chequeTemplate';
import { t as translate } from '../../lib/i18n';
import ConfirmModal from '../ConfirmModal';
import Modal from '../Modal';
import chequeBg from '../../assets/cheakv1.png';
import ChequeRenderSurface from './ChequeRenderSurface';
import ChequeA4Sheet from './ChequeA4Sheet';
import type { ChequePaperMode } from './ChequeA4Sheet';
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
 *      Electron flow (`printCurrentViewWithResult` → `window.manar.printPage`).
 *
 * It performs no binding resolution and no layout math — the engine did that.
 *
 * ── Provider Parity & Print Result Correctness (additive) ──────────────────
 * Two things were added on top of the original page, neither touching the
 * Runtime/Render architecture, templates, dimensions, or print settings above:
 *   - `tracking`: when present (a real saved cheque, not an unsaved form draft),
 *     printing that reaches a real 'success' result offers the SAME mark-printed
 *     confirm (DRAFT) / reprint-reason (PRINTED) tracking Classic printing uses —
 *     via the shared `chequePrintTracking.ts` helpers, not a duplicate of them.
 *
 * ── Batch Preview Navigator (replaces an earlier same-route auto-advance) ───
 * An earlier version advanced the batch by calling `navigate()` back to this
 * SAME route path per item and relied on the page picking up the new `state`.
 * That did not reliably show the next cheque in real manual testing, so this
 * page now stays on ONE mount for the whole batch: `ctppBatchItems` (the full,
 * pre-built list) is read ONCE, and the user browses it via a plain in-page
 * `activeIndex` — Previous/Next only ever change which array element is
 * rendered. No route navigation, no remount, nothing to go stale. A single
 * (non-batch) print is simply the `items.length === 1` case of the same code
 * path — the Previous/Next bar just doesn't render for it.
 */

interface BatchItem {
  runtimeData: RuntimeData;
  tracking: ChequeTrackingInfo;
}

interface PrintState {
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  /** Single-print path (no batch): the one cheque's data. */
  runtimeData?: RuntimeData;
  /** Outer paper surface: real cheque (178×89mm) or A4 landscape. Default: real cheque. */
  paperMode?: ChequePaperMode;
  /** Single-print path: absent for an unsaved form draft — no tracking is
   *  attempted then, exactly as before this pack. */
  tracking?: ChequeTrackingInfo;
  /** Additive: the FULL batch list, built once by Cheques.tsx. When present
   *  (length > 0) the page shows the Previous/Next navigator over it instead
   *  of the single top-level `runtimeData`/`tracking`. */
  ctppBatchItems?: BatchItem[];
}

function isPrintState(value: unknown): value is PrintState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return !!v.surface && typeof v.surface === 'object' && Array.isArray(v.fields);
}

type PrintResultState = { outcome: PrintOutcome; failureReason?: string } | null;

/** Per-item print/tracking record — persists as the user browses away and
 *  back, so a previously printed item still shows its status. */
interface ItemState {
  printResult: PrintResultState;
  trackingDone: boolean;
}

function freshItemState(): ItemState {
  return { printResult: null, trackingDone: false };
}

/** Compact status label per the four states requested — independent of
 *  whether a tracking step is still pending (the modal itself surfaces that). */
function itemStatusLabel(s: ItemState): string {
  if (!s.printResult) return 'غير مطبوع';
  if (s.printResult.outcome === 'success') return 'تمت الطباعة';
  if (s.printResult.outcome === 'cancelled') return 'ألغيت';
  return 'فشل';
}

export default function ChequeTemplatePrintPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = isPrintState(location.state) ? location.state : null;

  // Unify single-print and batch under one array: a single print is simply a
  // batch of one item, so exactly one code path renders/prints/tracks both —
  // the Previous/Next bar only appears when there is more than one.
  const items: BatchItem[] = state
    ? (state.ctppBatchItems && state.ctppBatchItems.length > 0
      ? state.ctppBatchItems
      : [{ runtimeData: state.runtimeData ?? {}, tracking: state.tracking as ChequeTrackingInfo }])
    : [];
  const isBatch = items.length > 1;

  const [activeIndex, setActiveIndex] = useState(0);
  const [itemStates, setItemStates] = useState<ItemState[]>(() => items.map(freshItemState));

  // Hooks must run unconditionally (before the "invalid state" early return
  // below) — they live here, before any conditional return.
  const [printBusy, setPrintBusy] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintReason, setReprintReason] = useState<ReprintReason | ''>('');
  const [reprintNote, setReprintNote] = useState('');

  // Transient, action-in-progress UI state resets when the ACTIVE ITEM changes
  // (a plain in-page state change — no navigation, no remount, no timing
  // dependency). The historical `printResult`/`trackingDone` per item is NOT
  // reset here — it lives in `itemStates` and persists across browsing.
  useEffect(() => {
    setPrintBusy(false);
    setTrackingBusy(false);
    setTrackingError('');
    setShowReprintModal(false);
    setReprintReason('');
    setReprintNote('');
  }, [activeIndex]);

  if (!state || items.length === 0) {
    return (
      <div className="ctpp-message" dir="rtl">
        <span className="material-symbols-outlined" aria-hidden="true">report</span>
        <p>تعذّر تحميل بيانات الطباعة. ارجع إلى قالب الشيك وحاول الطباعة من جديد.</p>
        <button type="button" className="btn" onClick={() => navigate(-1)}>رجوع</button>
      </div>
    );
  }

  const { surface, fields } = state;
  const paperMode: ChequePaperMode = state.paperMode === 'a4' ? 'a4' : 'real-cheque';
  const current = items[activeIndex];
  const currentState = itemStates[activeIndex] ?? freshItemState();
  const tracking = current.tracking;
  const model = resolveChequeTemplate({ surface, fields }, current.runtimeData);
  const blocked = model.meta.hasErrors;

  function updateCurrentItemState(patch: Partial<ItemState>) {
    setItemStates((prev) => prev.map((s, i) => (i === activeIndex ? { ...s, ...patch } : s)));
  }

  // ── Navigation — pure browsing, never prints, never tracks ─────────────────
  function goPrevious() {
    setActiveIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setActiveIndex((i) => Math.min(items.length - 1, i + 1));
  }

  // ── Printing (current item only) ────────────────────────────────────────────
  async function handlePrint() {
    if (printBusy) return;
    setPrintBusy(true);
    setTrackingError('');
    try {
      const result = await printCurrentViewWithResult({ landscape: true });
      updateCurrentItemState({ printResult: result, trackingDone: false });
      // Not successful, or nothing to track (unsaved form draft, or a status
      // other than DRAFT/PRINTED) — nothing more to do here.
      if (result.outcome !== 'success' || !tracking || (tracking.status !== 'DRAFT' && tracking.status !== 'PRINTED')) return;
      if (tracking.status === 'PRINTED') {
        setReprintReason('');
        setReprintNote('');
        setShowReprintModal(true);
      }
      // DRAFT: the ConfirmModal below (rendered from `currentState.printResult`)
      // handles the mark-printed step.
    } finally {
      setPrintBusy(false);
    }
  }

  async function handleMarkPrinted() {
    if (!tracking) return;
    setTrackingBusy(true);
    setTrackingError('');
    try {
      await markChequePrinted(tracking.id);
      updateCurrentItemState({ trackingDone: true });
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : 'تعذّر تسجيل حالة الطباعة');
    } finally {
      setTrackingBusy(false);
    }
  }

  function skipMarkPrinted() {
    // The user says printing did NOT actually succeed on paper despite the
    // reported result — never mark printed on a mere skip/cancel here.
    updateCurrentItemState({ printResult: { outcome: 'cancelled' }, trackingDone: false });
  }

  async function handleConfirmReprint() {
    if (!tracking || !reprintReason) return;
    setTrackingBusy(true);
    setTrackingError('');
    try {
      await reprintCheque(tracking.id, reprintReason, reprintNote.trim() || null);
      setShowReprintModal(false);
      updateCurrentItemState({ trackingDone: true });
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : 'تعذّر تسجيل إعادة الطباعة');
    } finally {
      setTrackingBusy(false);
    }
  }

  function cancelReprintModal() {
    setShowReprintModal(false);
    updateCurrentItemState({ printResult: { outcome: 'cancelled' } });
  }

  return (
    <div className="ctpp-root" dir="rtl">
      <div className="ctpp-chrome">
        <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>رجوع
        </button>
        <button type="button" className="btn" disabled={blocked || printBusy} onClick={handlePrint}>
          <span className="material-symbols-outlined" aria-hidden="true">print</span>{printBusy ? 'جارٍ الطباعة…' : 'طباعة'}
        </button>
        {blocked && (
          <span className="ctpp-blocked">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            لا يمكن الطباعة — يوجد أخطاء في القالب.
          </span>
        )}
        {currentState.printResult && currentState.printResult.outcome !== 'success' && (
          <span className="ctpp-blocked">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            {printOutcomeMessage(currentState.printResult, (key, vars) => translate(key, 'ar', vars))}
          </span>
        )}
        {trackingError && (
          <span className="ctpp-blocked">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            {trackingError}
          </span>
        )}
        {isBatch && (
          <div className="ctpp-batch-bar">
            <button type="button" className="btn secondary" disabled={activeIndex === 0} onClick={goPrevious}>السابق</button>
            <span>الشيك {activeIndex + 1} من {items.length}</span>
            <span className="ctpp-item-status">{itemStatusLabel(currentState)}</span>
            <button type="button" className="btn secondary" disabled={activeIndex === items.length - 1} onClick={goNext}>التالي</button>
          </div>
        )}
      </div>

      {blocked ? (
        <div className="ctpp-issues">
          <PreviewIssues issues={model.issues} />
        </div>
      ) : (
        <div className="ctpp-print-area">
          {/* NEVER print the cheque background — ink lands on pre-printed stock;
              only the resolved fields print. A4 mode wraps the SAME cheque
              surface on an A4 page at the fixed position — the cheque itself,
              its model, coordinates, typography and bindings are identical. */}
          {paperMode === 'a4' ? (
            <ChequeA4Sheet model={model} backgroundSrc={chequeBg} showBackground={false} />
          ) : (
            <ChequeRenderSurface model={model} backgroundSrc={chequeBg} showBackground={false} />
          )}
        </div>
      )}

      {currentState.printResult?.outcome === 'success' && tracking?.status === 'DRAFT' && !currentState.trackingDone && (
        <ConfirmModal
          title="تأكيد الطباعة"
          message="هل تم طباعة الشيك بنجاح؟ سيتم تسجيله كـ«مطبوع»."
          confirmLabel="تأكيد الطباعة"
          variant="warning"
          onConfirm={handleMarkPrinted}
          onCancel={skipMarkPrinted}
        />
      )}

      {showReprintModal && tracking && (
        <Modal
          title="سبب إعادة الطباعة"
          onClose={cancelReprintModal}
          size="sm"
          footer={
            <>
              <button type="button" className="btn" disabled={!reprintReason || trackingBusy} onClick={handleConfirmReprint}>
                تسجيل وإعادة الطباعة
              </button>
              <button type="button" className="btn secondary" onClick={cancelReprintModal}>إلغاء</button>
            </>
          }
        >
          <p style={{ lineHeight: 1.8 }}>هذا الشيك مطبوع مسبقًا. إعادة الطباعة مسموحة لكنها تُسجَّل في سجل الطباعة. اختر السبب:</p>
          <select
            className="ctpp-reprint-select"
            value={reprintReason}
            onChange={(e) => setReprintReason(e.target.value as ReprintReason)}
            aria-label="سبب إعادة الطباعة"
          >
            <option value="">اختر السبب</option>
            {REPRINT_REASONS.map((r) => <option key={r} value={r}>{REPRINT_REASON_LABELS[r]}</option>)}
          </select>
          <input
            className="ctpp-reprint-note"
            value={reprintNote}
            onChange={(e) => setReprintNote(e.target.value)}
            placeholder="ملاحظة إضافية (اختياري)"
            maxLength={300}
          />
        </Modal>
      )}

      <style>{`
        @page { size: ${paperMode === 'a4' ? 'A4 landscape' : `${model.surface.widthCm}cm ${model.surface.heightCm}cm`}; margin: 0; }
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
