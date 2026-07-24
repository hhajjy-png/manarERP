import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../ConfirmModal';
import {
  ChequeTemplateDesigner,
  PHYSICAL_CHEQUE_SURFACE_CM,
} from '../../modules/chequeTemplateDesigner';
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
} from '../../modules/chequeTemplateRuntime';
import chequeBg from '../../assets/cheakv1.png';
import DataSourceControl from './DataSourceControl';
import ChequePreview from './ChequePreview';
import { buildChequeRuntimeData } from './chequeRuntimeData';
import type { ChequeRecordInput } from './chequeRuntimeData';
import {
  listTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  saveTemplate,
  renameTemplate,
  deleteTemplate,
  setDefaultTemplate,
  type StoredChequeTemplate,
} from './chequeDesignerStore';
import './chequeTemplateManager.css';

/**
 * Cheque Template Manager — Cheque Template Manager v1.
 *
 * Wraps the reused generic ChequeTemplateDesigner with a compact toolbar and
 * real template management: New, Open, Save, Save As, Rename, Delete, and
 * marking a Default template. Persistence is an INDEPENDENT localStorage
 * namespace (see chequeDesignerStore.ts) — it never touches Classic
 * Calibration storage, the Settings API, the database, or the Professional
 * module. No printing, print-mode switching, or runtime data binding.
 */

/** Standard starter fields for a new template. Bound to semantic sources by default (no live data). */
const STARTER_FIELDS: DesignerField[] = [
  { id: 'beneficiary', binding: 'beneficiary', label: 'اسم المستفيد', value: 'اسم المستفيد', x: 22, y: 31, width: 45, height: 6, rotation: 0, fontSize: 14, fontWeight: 400, textAlign: 'right', color: '#000000', zIndex: 3, visible: true },
  { id: 'date', binding: 'chequeDate', label: 'التاريخ', value: '24 / 07 / 2026', x: 70, y: 12, width: 22, height: 6, rotation: 0, fontSize: 13, fontWeight: 400, textAlign: 'center', color: '#000000', zIndex: 1, visible: true },
  { id: 'amount', binding: 'amount', label: 'المبلغ رقمًا', value: '#1,250.000#', x: 78, y: 44, width: 16, height: 6, rotation: 0, fontSize: 14, fontWeight: 700, textAlign: 'center', color: '#000000', zIndex: 4, visible: true },
  { id: 'amountInWords', binding: 'amountInWords', label: 'المبلغ كتابةً', value: 'ألف ومئتان وخمسون ديناراً فقط', x: 14, y: 44, width: 58, height: 6, rotation: 0, fontSize: 12, fontWeight: 400, textAlign: 'right', color: '#000000', zIndex: 5, visible: true },
];

// ── Runtime Engine integration ────────────────────────────────────────────────
// The engine is the SINGLE source of truth for binding + text resolution. The
// designer preview, the live preview, and the print pipeline all derive from it
// — no binding logic is duplicated. Text resolves against the real cheque data
// when a cheque is present, else the centralized mock (see the component body).
function designerIsFieldBound(field: DesignerField): boolean {
  return defaultBindingResolver(field) !== null;
}

interface ChequeTemplateManagerProps {
  /** The current official cheque record to print. Null = design mode (mock preview, print disabled). */
  chequeRecord?: ChequeRecordInput | null;
}

const AR_PANEL_LABELS: Partial<PropertiesPanelLabels> = {
  title: 'الخصائص', empty: 'اختر حقلاً لتعديل خصائصه.',
  fieldId: 'المعرّف', label: 'التسمية', value: 'القيمة الحالية', visible: 'ظاهر', visibleYes: 'نعم', visibleNo: 'لا',
  x: 'س (%)', y: 'ص (%)', width: 'العرض (%)', height: 'الارتفاع (%)', rotation: 'الدوران (°)',
  fontSize: 'حجم الخط', fontWeight: 'وزن الخط', weightNormal: 'عادي', weightSemibold: 'شبه عريض', weightBold: 'عريض',
  textAlign: 'المحاذاة', alignLeft: 'يسار', alignCenter: 'وسط', alignRight: 'يمين', color: 'اللون',
  duplicate: 'تكرار', delete: 'حذف', bringForward: 'تقديم', sendBackward: 'تأخير', bringToFront: 'إلى الأمام', sendToBack: 'إلى الخلف',
};

interface Current {
  id: string | null;
  name: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  isDefault: boolean;
}

function newCurrent(): Current {
  return {
    id: null,
    name: 'قالب جديد',
    surface: { ...PHYSICAL_CHEQUE_SURFACE_CM },
    fields: STARTER_FIELDS.map((f) => ({ ...f })),
    isDefault: false,
  };
}

function recordToCurrent(rec: StoredChequeTemplate): Current {
  return {
    id: rec.id,
    name: rec.name,
    surface: { ...rec.surface },
    fields: rec.fields.map((f) => ({ ...f })),
    isDefault: rec.isDefault,
  };
}

type NameMode = 'saveas' | 'rename';
type ModalState =
  | { kind: 'none' }
  | { kind: 'open' }
  | { kind: 'name'; mode: NameMode; value: string }
  | { kind: 'delete' };

export default function ChequeTemplateManager({ chequeRecord }: ChequeTemplateManagerProps) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Current>(() => {
    const initial = getDefaultTemplate() ?? listTemplates()[0] ?? null;
    return initial ? recordToCurrent(initial) : newCurrent();
  });
  const [dirty, setDirty] = useState(false);
  const [designerKey, setDesignerKey] = useState(0);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [rows, setRows] = useState<StoredChequeTemplate[]>([]);
  const [msg, setMsg] = useState('');

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

  // Live Preview render model — resolved by the Runtime Engine (the single
  // rendering authority) from the current layout + runtime data. Recomputes on
  // every edit, so the preview refreshes immediately with no manual refresh.
  const previewModel = useMemo(
    () => resolveChequeTemplate({ surface: current.surface, fields: current.fields }, runtimeData),
    [current.surface, current.fields, runtimeData],
  );

  function handlePrint() {
    if (!chequeRecord) return;
    navigate('/cheque-template/print', {
      state: { surface: current.surface, fields: current.fields, runtimeData },
    });
  }

  function flash(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 2500);
  }

  /** Load a different template into the editor (remounts the designer so it resets cleanly). */
  function load(next: Current) {
    setCurrent(next);
    setDirty(false);
    setDesignerKey((k) => k + 1);
  }

  function handleDesignerChange(fields: DesignerField[]) {
    setCurrent((c) => ({ ...c, fields }));
    setDirty(true);
  }

  // ── Toolbar actions ──────────────────────────────────────────────────────
  function handleNew() {
    load(newCurrent());
    flash('تم إنشاء قالب جديد (غير محفوظ).');
  }

  function handleOpen() {
    setRows(listTemplates());
    setModal({ kind: 'open' });
  }

  function openTemplate(id: string) {
    const rec = getTemplate(id);
    if (rec) {
      load(recordToCurrent(rec));
      flash(`تم فتح «${rec.name}».`);
    }
    setModal({ kind: 'none' });
  }

  function handleSave() {
    if (!current.id) {
      // Unsaved template — Save behaves as Save As (needs a name).
      setModal({ kind: 'name', mode: 'saveas', value: current.name });
      return;
    }
    saveTemplate(current.id, { name: current.name, surface: current.surface, fields: current.fields });
    setDirty(false);
    flash('تم الحفظ.');
  }

  function handleSaveAs() {
    setModal({ kind: 'name', mode: 'saveas', value: `${current.name} نسخة` });
  }

  function handleRename() {
    setModal({ kind: 'name', mode: 'rename', value: current.name });
  }

  function submitName(value: string) {
    const name = value.trim();
    if (!name) return;
    if (modal.kind !== 'name') return;
    if (modal.mode === 'saveas') {
      const rec = createTemplate({ name, surface: current.surface, fields: current.fields });
      setCurrent(recordToCurrent(rec));
      setDirty(false);
      flash(`تم الحفظ باسم «${name}».`);
    } else {
      if (current.id) renameTemplate(current.id, name);
      setCurrent((c) => ({ ...c, name }));
      flash('تمت إعادة التسمية.');
    }
    setModal({ kind: 'none' });
  }

  function confirmDelete() {
    if (current.id) {
      deleteTemplate(current.id);
      flash('تم حذف القالب.');
    }
    setModal({ kind: 'none' });
    const next = getDefaultTemplate() ?? listTemplates()[0] ?? null;
    load(next ? recordToCurrent(next) : newCurrent());
  }

  function handleDefault() {
    if (!current.id) return;
    setDefaultTemplate(current.id);
    setCurrent((c) => ({ ...c, isDefault: true }));
    flash('تم تعيين القالب كافتراضي.');
  }

  const canDelete = current.id !== null;
  const canDefault = current.id !== null && !current.isDefault;

  return (
    <div className="ctm-root">
      {/* ── Compact toolbar ── */}
      <div className="ctm-toolbar">
        <button type="button" className="btn sm" onClick={handleNew}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>جديد
        </button>
        <button type="button" className="btn secondary sm" onClick={handleOpen}>
          <span className="material-symbols-outlined" aria-hidden="true">folder_open</span>فتح
        </button>
        <button type="button" className="btn secondary sm" onClick={handleSave}>
          <span className="material-symbols-outlined" aria-hidden="true">save</span>حفظ
        </button>
        <button type="button" className="btn secondary sm" onClick={handleSaveAs}>
          <span className="material-symbols-outlined" aria-hidden="true">save_as</span>حفظ باسم
        </button>
        <button type="button" className="btn secondary sm" onClick={handleRename}>
          <span className="material-symbols-outlined" aria-hidden="true">edit</span>إعادة تسمية
        </button>
        <button type="button" className="btn secondary sm" onClick={() => setModal({ kind: 'delete' })} disabled={!canDelete}>
          <span className="material-symbols-outlined" aria-hidden="true">delete</span>حذف
        </button>
        <button type="button" className="btn secondary sm" onClick={handleDefault} disabled={!canDefault}>
          <span className="material-symbols-outlined" aria-hidden="true">star</span>تعيين افتراضي
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={handlePrint}
          disabled={!chequeRecord}
          title={chequeRecord ? 'طباعة الشيك بالقالب الحالي' : 'اختر شيكًا من صفحة الشيكات للطباعة'}
        >
          <span className="material-symbols-outlined" aria-hidden="true">print</span>طباعة
        </button>

        <div className="ctm-toolbar-spacer" />

        <div className="ctm-current">
          <span className="ctm-current-name">{current.name}</span>
          {current.isDefault && <span className="ctm-badge ctm-badge--default">افتراضي</span>}
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
            backgroundSrc={chequeBg}
            initialFields={current.fields}
            onChange={handleDesignerChange}
            labels={AR_PANEL_LABELS}
            resolveText={designerResolveText}
            isFieldBound={designerIsFieldBound}
            renderFieldExtras={(field, patch) => <DataSourceControl field={field} onChange={patch} />}
          />
        </div>
        <div className="ctm-preview-pane">
          <ChequePreview model={previewModel} backgroundSrc={chequeBg} />
        </div>
      </div>

      {/* ── Open picker ── */}
      {modal.kind === 'open' && (
        <div className="ctm-modal-scrim" onClick={(e) => e.target === e.currentTarget && setModal({ kind: 'none' })}>
          <div className="ctm-modal" role="dialog" aria-label="فتح قالب">
            <h3 className="ctm-modal-title">فتح قالب</h3>
            {rows.length === 0 ? (
              <p className="ctm-empty">لا توجد قوالب محفوظة بعد.</p>
            ) : (
              <div className="ctm-picker">
                {rows.map((r) => (
                  <button key={r.id} type="button" className="ctm-picker-row" onClick={() => openTemplate(r.id)}>
                    <span className="ctm-picker-name">
                      {r.name}
                      {r.isDefault && <span className="ctm-badge ctm-badge--default">افتراضي</span>}
                    </span>
                    <span className="ctm-picker-meta">{r.fields.length} حقل</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ctm-modal-foot">
              <button type="button" className="btn secondary" onClick={() => setModal({ kind: 'none' })}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Name input (Save As / Rename) ── */}
      {modal.kind === 'name' && (
        <NameModal
          title={modal.mode === 'saveas' ? 'حفظ باسم' : 'إعادة تسمية القالب'}
          initialValue={modal.value}
          onSubmit={submitName}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}

      {/* ── Delete confirm ── */}
      {modal.kind === 'delete' && (
        <ConfirmModal
          title="حذف القالب"
          message={`سيتم حذف القالب «${current.name}» نهائيًا. هل تريد المتابعة؟`}
          confirmLabel="حذف"
          variant="warning"
          onConfirm={confirmDelete}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
    </div>
  );
}

function NameModal({
  title,
  initialValue,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="ctm-modal-scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ctm-modal" role="dialog" aria-label={title}>
        <h3 className="ctm-modal-title">{title}</h3>
        <input
          className="ctm-input"
          value={value}
          autoFocus
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(value); }}
          placeholder="اسم القالب"
          aria-label="اسم القالب"
        />
        <div className="ctm-modal-foot">
          <button type="button" className="btn" onClick={() => onSubmit(value)} disabled={!value.trim()}>حفظ</button>
          <button type="button" className="btn secondary" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
