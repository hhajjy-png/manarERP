import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChequeTemplateDesigner } from '../../modules/chequeTemplateDesigner';
import type {
  DesignerField,
  DesignerSurfaceSpec,
  PropertiesPanelLabels,
} from '../../modules/chequeTemplateDesigner';
import {
  resolveChequeTemplate,
  resolveRuntimeValues,
  resolveFieldText,
  defaultBindingResolver,
  isSemanticKey,
} from '../../modules/chequeTemplateRuntime';
import DataSourceControl from './DataSourceControl';
import ChequePreview from './ChequePreview';
import {
  buildChequePrintJob,
  GULF_A4_CALIBRATION_SETTING_GROUP,
  bankChequeProfileByCode,
  GULF_BANK_CODE,
  profileFactoryDocument,
  profilePlacementMm,
  serializeGulfProfile,
} from '../../modules/chequePrint';
import type {
  BankChequeProfileDefinition,
  GulfA4Profile,
  GulfCalibration,
} from '../../modules/chequePrint';
import { api } from '../../api/client';
import { buildChequeRuntimeData } from './chequeRuntimeData';
import type { ChequeRecordInput } from './chequeRuntimeData';
import './chequeTemplateManager.css';

/**
 * Cheque Template studio — the professional calibration surface for the ONE
 * approved cheque template, «قالب شيك الخليج».
 *
 * ── What this used to be ───────────────────────────────────────────────────
 * A manager over MANY cheque templates: New / Open / Save As / Rename / Delete /
 * Set-default over database-stored Designer templates, plus a paper-surface
 * toggle, because several templates could be printed. The system now prints one
 * approved template, so choosing, creating, renaming and deleting alternative
 * templates has no meaning and was removed together with those templates.
 *
 * ── What is unchanged ──────────────────────────────────────────────────────
 * Everything that actually calibrates: the reused generic ChequeTemplateDesigner
 * and all its engines (drag, resize, rotate, keyboard nudge, alignment guides,
 * undo/redo, the properties panel, data-source binding), the Runtime Engine, the
 * shared render surface, the live preview, and the test print — which still goes
 * through `buildChequePrintJob` and the existing print page and print IPC.
 *
 * Calibration has two levels, both edited here:
 *   • per field — position, size, rotation, font, alignment, colour, visibility,
 *     z-order (the designer + properties panel);
 *   • whole cheque — the A4 placement offsets, which move the cheque AREA on the
 *     sheet and never rewrite a field coordinate.
 *
 * The calibrated document is saved to the profile's own `settings` row through
 * the existing `PUT /settings` endpoint. No template row is created or touched.
 */

// ── Runtime Engine integration ────────────────────────────────────────────────
// The engine is the SINGLE source of truth for binding + text resolution. The
// designer preview, the live preview, and the print pipeline all derive from it
// — no binding logic is duplicated. Text resolves against the real cheque data
// when a cheque is present, else the centralized mock (see the component body).
function designerIsFieldBound(field: DesignerField): boolean {
  return defaultBindingResolver(field) !== null;
}

interface ChequeTemplateManagerProps {
  /** The current official cheque record. Null = design mode (mock preview, test print disabled). */
  chequeRecord?: ChequeRecordInput | null;
  /** The calibrated document currently in force for this template. */
  gulfProfile: GulfA4Profile;
  /**
   * WHICH bank template is open. Everything per-bank is read from here — the A4
   * placement, the preview photo, the calibration settings key and the factory
   * document "restore default" returns to — so no bank's value can leak into
   * another's studio session. Defaults to the Gulf profile, which is what the
   * single-template studio used.
   */
  profile?: BankChequeProfileDefinition;
  /**
   * The bank's OWN preview cheque photo, or `null` when that bank's image has not
   * been added yet. Never defaulted to another bank's image: a studio with no
   * photo shows a bare surface, which is the honest state.
   */
  previewBackgroundSrc?: string | null;
  /**
   * The settings row this template's calibration is saved in. Every bank profile
   * carries its own key (`BankChequeProfileDefinition.settingKey`), so switching
   * templates in the studio can never write one bank's calibration over another's.
   */
  settingKey?: string;
  /** Persisted successfully, so the host can apply it to preview and printing at once. */
  onGulfProfileSaved?: (profile: GulfA4Profile) => void;
}

const AR_PANEL_LABELS: Partial<PropertiesPanelLabels> = {
  title: 'الخصائص', empty: 'اختر حقلاً لتعديل خصائصه.',
  fieldId: 'المعرّف', label: 'التسمية', value: 'القيمة الحالية', visible: 'ظاهر', visibleYes: 'نعم', visibleNo: 'لا',
  x: 'س (%)', y: 'ص (%)', width: 'العرض (%)', height: 'الارتفاع (%)', rotation: 'الدوران (°)',
  fontSize: 'حجم الخط', fontWeight: 'وزن الخط', weightNormal: 'عادي', weightSemibold: 'شبه عريض', weightBold: 'عريض',
  textAlign: 'المحاذاة', alignLeft: 'يسار', alignCenter: 'وسط', alignRight: 'يمين', color: 'اللون',
  duplicate: 'تكرار', delete: 'حذف', bringForward: 'تقديم', sendBackward: 'تأخير', bringToFront: 'إلى الأمام', sendToBack: 'إلى الخلف',
};

/** The document being calibrated — the profile, as the studio holds it. */
interface Current {
  name: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  calibration: GulfCalibration;
}

function profileToCurrent(profile: GulfA4Profile): Current {
  return {
    name: profile.name,
    surface: { ...profile.surface },
    fields: profile.fields.map((f) => ({ ...f })),
    calibration: { ...profile.calibration },
  };
}

export default function ChequeTemplateManager({
  chequeRecord,
  gulfProfile,
  profile = bankChequeProfileByCode(GULF_BANK_CODE)!,
  previewBackgroundSrc,
  settingKey = profile.settingKey,
  onGulfProfileSaved,
}: ChequeTemplateManagerProps) {
  const backgroundSrc = (previewBackgroundSrc ?? profile.previewBackground) ?? undefined;
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Current>(() => profileToCurrent(gulfProfile));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [designerKey, setDesignerKey] = useState(0);
  const [msg, setMsg] = useState('');
  const touchedRef = useRef(false);

  /**
   * The A4 placement of the open document. The SAME value feeds the live preview
   * and the test-print navigation, so there is exactly one set of calibrated
   * coordinates — never a preview copy and a print copy.
   */
  // THIS template's own base placement plus THIS template's own offsets. Never
  // another bank's base — that is what keeps the sheets independent.
  const placement = profilePlacementMm(profile, current.calibration)
    ?? { xMm: 0, yMm: 0, widthMm: current.surface.widthCm * 10, heightMm: current.surface.heightCm * 10 };

  // Runtime data: real cheque values when a cheque is present, else mock.
  const runtimeData = useMemo(
    () => (chequeRecord ? buildChequeRuntimeData(chequeRecord) : undefined),
    [chequeRecord],
  );
  const effectiveRuntime = useMemo(() => resolveRuntimeValues(runtimeData), [runtimeData]);
  const designerResolveText = useCallback(
    (field: DesignerField) => resolveFieldText(field, effectiveRuntime, defaultBindingResolver(field)),
    [effectiveRuntime],
  );
  /** An internal slot's text — the SAME runtime values the print path resolves. */
  const designerResolveSlotText = useCallback(
    (key: string) => (isSemanticKey(key) ? effectiveRuntime[key] ?? '' : ''),
    [effectiveRuntime],
  );

  // Live Preview render model — resolved by the Runtime Engine (the single
  // rendering authority) from the current layout + runtime data. Recomputes on
  // every edit, so the preview refreshes immediately with no manual refresh.
  const previewModel = useMemo(
    () => resolveChequeTemplate({ surface: current.surface, fields: current.fields }, runtimeData),
    [current.surface, current.fields, runtimeData],
  );

  function flash(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 2500);
  }

  /** Load a document into the editor (remounts the designer so it resets cleanly). */
  function load(next: Current) {
    setCurrent(next);
    setDesignerKey((k) => k + 1);
  }

  function handleDesignerChange(fields: DesignerField[]) {
    touchedRef.current = true;
    setCurrent((c) => ({ ...c, fields }));
    setDirty(true);
  }

  function patchCalibration(patch: Partial<GulfCalibration>) {
    touchedRef.current = true;
    setCurrent((c) => ({ ...c, calibration: { ...c.calibration, ...patch } }));
    setDirty(true);
  }

  /**
   * TEST PRINT — Deterministic Geometry & Unified Pipeline Pack v1.
   *
   * Prints the template CURRENTLY OPEN IN THE STUDIO, including unsaved edits,
   * because that is the only useful thing to print from a design surface. It is
   * an EXPLICIT test print: banner-flagged on the print page and structurally
   * unable to record production tracking (`buildChequePrintJob` strips tracking
   * from `purpose: 'test'` jobs). Physical geometry is the identical shared
   * contract production printing uses — including the same `placement` — so what
   * you measure here is what a production print will land.
   */
  function handleTestPrint() {
    if (!chequeRecord || !runtimeData) return;
    const job = buildChequePrintJob({
      purpose: 'test',
      template: { id: null, name: current.name, source: 'designer-open-template' },
      surface: current.surface,
      fields: current.fields,
      paperMode: 'a4',
      items: [{ runtimeData }],
    });
    navigate('/cheque-template/print', {
      state: {
        surface: job.surface,
        fields: job.fields,
        paperMode: job.paperMode,
        placement,
        showPreviewBackground: true,
        purpose: job.purpose,
        templateName: job.template.name,
        runtimeData: job.items[0].runtimeData,
      },
    });
  }

  /**
   * Persist the calibrated document.
   *
   * The whole document is written — surface, every field as the studio left it,
   * and the A4 placement offsets — into the profile's own settings row, through
   * the existing `PUT /settings` endpoint.
   */
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const document: GulfA4Profile = {
      ...gulfProfile,
      name: current.name,
      surface: current.surface,
      fields: current.fields,
      calibration: current.calibration,
    };
    try {
      await api.put('/settings', {
        settings: [{
          key: settingKey,
          value: serializeGulfProfile(document),
          group: GULF_A4_CALIBRATION_SETTING_GROUP,
        }],
      });
    } catch {
      flash('تعذّر الحفظ.');
      return;
    } finally {
      setSaving(false);
    }
    setDirty(false);
    onGulfProfileSaved?.(document);
    flash('تم الحفظ.');
  }

  /**
   * Back to THIS template's own factory geometry — unsaved until the user saves.
   * A provisional template restores to its own seeded baseline, never to the
   * approved template's numbers.
   */
  function handleRestoreFactory() {
    const factory = profileFactoryDocument(profile);
    if (!factory) return;
    touchedRef.current = true;
    load(profileToCurrent(factory));
    setDirty(true);
    flash('تمت استعادة الإحداثيات الأساسية (لم تُحفظ بعد).');
  }

  return (
    <div className="ctm-root">
      {/* ── Compact toolbar ── */}
      <div className="ctm-toolbar">
        <button type="button" className="btn sm" onClick={handleSave} disabled={saving}>
          <span className="material-symbols-outlined" aria-hidden="true">save</span>{saving ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" className="btn secondary sm" onClick={handleRestoreFactory}>
          <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>استعادة الافتراضي
        </button>
        <button
          type="button"
          className="btn secondary sm"
          onClick={handleTestPrint}
          disabled={!chequeRecord}
          title={chequeRecord
            ? 'طباعة تجريبية للقالب المفتوح حاليًا (بما فيه التعديلات غير المحفوظة). لا تُسجَّل كطباعة شيك ولا تُغيّر حالة الشيك.'
            : 'اختر شيكًا من صفحة الشيكات للطباعة التجريبية'}
        >
          <span className="material-symbols-outlined" aria-hidden="true">science</span>طباعة تجريبية
        </button>

        {/* Whole-cheque placement on the sheet — the profile-level half of
            calibration, alongside the per-field half the designer performs.
            Moves the cheque AREA only; no field coordinate is rewritten. */}
        <div className="ctm-offsets" title="إزاحة منطقة الشيك على ورقة A4 — لا تغيّر إحداثيات الحقول">
          <label>
            <span>إزاحة أفقية (مم)</span>
            <input
              type="number"
              step={0.5}
              aria-label="إزاحة أفقية (مم)"
              value={current.calibration.offsetXMm}
              onChange={(e) => patchCalibration({ offsetXMm: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label>
            <span>إزاحة رأسية (مم)</span>
            <input
              type="number"
              step={0.5}
              aria-label="إزاحة رأسية (مم)"
              value={current.calibration.offsetYMm}
              onChange={(e) => patchCalibration({ offsetYMm: parseFloat(e.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="ctm-toolbar-spacer" />

        <div className="ctm-current">
          <span className="ctm-current-name">{current.name}</span>
          {dirty && <span className="ctm-badge ctm-badge--dirty">غير محفوظ</span>}
          {msg && <span className="ctm-msg">{msg}</span>}
        </div>
      </div>

      {/* ── Designer + Live Preview ── */}
      <div className="ctm-workspace">
        <div className="ctm-designer-pane">
          <ChequeTemplateDesigner
            key={designerKey}
            surface={current.surface}
            backgroundSrc={backgroundSrc}
            initialFields={current.fields}
            onChange={handleDesignerChange}
            labels={AR_PANEL_LABELS}
            resolveText={designerResolveText}
            resolveSlotText={designerResolveSlotText}
            isFieldBound={designerIsFieldBound}
            renderFieldExtras={(field, patch) => <DataSourceControl field={field} onChange={patch} />}
          />
        </div>
        <div className="ctm-preview-pane">
          {/* A4 is the profile's paper by definition — the cheque area is placed
              on the sheet at `placement`, exactly as the print job places it. */}
          <ChequePreview model={previewModel} backgroundSrc={backgroundSrc} paperMode="a4" placement={placement} />
        </div>
      </div>
    </div>
  );
}
