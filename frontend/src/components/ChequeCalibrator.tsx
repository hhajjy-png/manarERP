import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { printCurrentView } from '../utils/print';
import chequeImg from '../assets/cheakv1.png';
import {
  DEFAULT_TEMPLATE,
  FIELD_KEYS,
  FIELD_LABELS,
  FONT_FAMILIES,
  FONT_SIZES,
} from '../utils/chequeTemplate';
import type {
  ChequeTemplate,
  ChequeTemplateVersionRow,
  FieldConfig,
  FieldKey,
} from '../utils/chequeTemplate';
import { DEFAULT_GEOMETRY, type CalibrationGeometry } from '../utils/chequeGeometry';
import CalibrationTestSheet from './calibrator/CalibrationTestSheet';
import MeasurementAssistant, { type CorrectionProposal } from './calibrator/MeasurementAssistant';
import CalibrationWizard from './calibrator/CalibrationWizard';
import './calibrator/calibrator-studio.css';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CalibratorPreviewData {
  beneficiaryName: string;
  chequeDate: string;
  tafqeetText: string;
  numericText: string;
}

interface Props {
  banks: readonly string[];
  initialBank: string;
  loadedTemplates: Record<string, ChequeTemplate>;
  previewData: CalibratorPreviewData;
  onSaved: (bank: string, template: ChequeTemplate) => void;
  onClose: () => void;
  /** SYSTEM_ADMIN unlocks the advanced geometry section. */
  isSystemAdmin?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200] as const;
const BASE_CHEQUE_WIDTH = 820;

const GEOMETRY_FIELDS: { key: keyof CalibrationGeometry; label: string }[] = [
  { key: 'pageWidthMm', label: 'عرض الصفحة (مم)' },
  { key: 'pageHeightMm', label: 'ارتفاع الصفحة (مم)' },
  { key: 'chequeWidthMm', label: 'عرض الشيك (مم)' },
  { key: 'chequeHeightMm', label: 'ارتفاع الشيك (مم)' },
  { key: 'offsetXMm', label: 'إزاحة أفقية (مم)' },
  { key: 'offsetYMm', label: 'إزاحة رأسية (مم)' },
];

// ── Validation helper for import ───────────────────────────────────────────────

function isValidTemplate(t: unknown): t is ChequeTemplate {
  if (!t || typeof t !== 'object') return false;
  const fkeys: FieldKey[] = ['beneficiary', 'date', 'tafqeet', 'numeric'];
  for (const fk of fkeys) {
    const cfg = (t as Record<string, unknown>)[fk];
    if (!cfg || typeof cfg !== 'object') return false;
    const obj = cfg as Record<string, unknown>;
    for (const nk of ['top', 'left', 'width', 'fontSize'] as const) {
      if (typeof obj[nk] !== 'number') return false;
    }
    for (const sk of ['fontFamily', 'fontWeight', 'fontStyle', 'color'] as const) {
      if (typeof obj[sk] !== 'string') return false;
    }
    if (!['left', 'center', 'right'].includes(obj.textAlign as string)) return false;
  }
  return true;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * هل الاستجابة هندسةُ معايرة فعلًا؟
 *
 * يفحص **الشكل** كما يعلنه `CalibrationGeometry`: كائن (لا مصفوفة، لا null) بحقوله
 * الستة أعدادًا **منتهية**، وأبعاده موجبة. لا يُصلح كائنًا ناقصًا ولا يحوّل نصًّا إلى
 * رقم — عقد الخادم عددي صراحةً؛ ما لا يطابقه يُرفَض كاملًا، فتبقى `DEFAULT_GEOMETRY`.
 */
const GEOMETRY_SIZES = ['pageWidthMm', 'pageHeightMm', 'chequeWidthMm', 'chequeHeightMm'] as const;
const GEOMETRY_OFFSETS = ['offsetXMm', 'offsetYMm'] as const;

function isCalibrationGeometry(value: unknown): value is CalibrationGeometry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const g = value as Record<string, unknown>;
  // الأبعاد: أعداد منتهية وموجبة (بُعد صفري أو سالب لا يصف ورقة).
  for (const key of GEOMETRY_SIZES) {
    if (typeof g[key] !== 'number' || !Number.isFinite(g[key]) || (g[key] as number) <= 0) return false;
  }
  // الإزاحات: أعداد منتهية (الصفر والسالب مشروعان — الإزاحة قد تكون في أي اتجاه).
  for (const key of GEOMETRY_OFFSETS) {
    if (typeof g[key] !== 'number' || !Number.isFinite(g[key])) return false;
  }
  return true;
}

export default function ChequeCalibrator({
  banks,
  initialBank,
  loadedTemplates,
  previewData,
  onSaved,
  onClose,
  isSystemAdmin = false,
}: Props) {
  const [currentBank, setCurrentBank] = useState(initialBank);
  const [workingTemplates, setWorkingTemplates] = useState<Record<string, ChequeTemplate>>(() => {
    const result: Record<string, ChequeTemplate> = {};
    for (const bank of banks) {
      result[bank] = loadedTemplates[bank] ?? deepCopy(DEFAULT_TEMPLATE);
    }
    return result;
  });
  const [selected, setSelected] = useState<FieldKey>('beneficiary');
  const [draggingField, setDraggingField] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [versions, setVersions] = useState<ChequeTemplateVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  // ── Calibration Studio state ──────────────────────────────────────────────────
  const [geometry, setGeometry] = useState<CalibrationGeometry>(DEFAULT_GEOMETRY);
  const [proposal, setProposal] = useState<CorrectionProposal | null>(null);
  const [pendingProposal, setPendingProposal] = useState<CorrectionProposal | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const [showGeom, setShowGeom] = useState(false);
  const [geomDraft, setGeomDraft] = useState<CalibrationGeometry>(DEFAULT_GEOMETRY);
  const [geomBusy, setGeomBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef<{
    fieldKey: FieldKey;
    bank: string;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const currentTemplate = workingTemplates[currentBank] ?? DEFAULT_TEMPLATE;
  const selectedCfg: FieldConfig = currentTemplate[selected];
  const chequeWidth = BASE_CHEQUE_WIDTH * (zoomLevel / 100);
  const otherBanks = banks.filter((b) => b !== currentBank);

  // ── Drag (document-level to survive cursor leaving container) ─────────────────

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const { fieldKey, bank, startClientX, startClientY, startLeft, startTop } = draggingRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const newLeft = clamp(startLeft + ((e.clientX - startClientX) / rect.width) * 100, 0, 90);
      const newTop = clamp(startTop + ((e.clientY - startClientY) / rect.height) * 100, 0, 85);
      setWorkingTemplates((prev) => ({
        ...prev,
        [bank]: { ...prev[bank], [fieldKey]: { ...prev[bank][fieldKey], left: newLeft, top: newTop } },
      }));
    }
    function onUp() {
      draggingRef.current = null;
      setDraggingField(null);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Arrow key movement — works only when calibrator is open and no modal ───────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (showCopyModal) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setWorkingTemplates((prev) => {
        const cfg = prev[currentBank]?.[selected];
        if (!cfg) return prev;
        let newLeft = cfg.left;
        let newTop = cfg.top;
        if (e.key === 'ArrowLeft') newLeft = clamp(cfg.left - step, 0, 90);
        else if (e.key === 'ArrowRight') newLeft = clamp(cfg.left + step, 0, 90);
        else if (e.key === 'ArrowUp') newTop = clamp(cfg.top - step, 0, 85);
        else if (e.key === 'ArrowDown') newTop = clamp(cfg.top + step, 0, 85);
        return {
          ...prev,
          [currentBank]: { ...prev[currentBank], [selected]: { ...cfg, left: newLeft, top: newTop } },
        };
      });
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentBank, selected, showCopyModal]);

  function handleFieldMouseDown(e: React.MouseEvent, fieldKey: FieldKey) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(fieldKey);
    setDraggingField(fieldKey);
    draggingRef.current = {
      fieldKey,
      bank: currentBank,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: currentTemplate[fieldKey].left,
      startTop: currentTemplate[fieldKey].top,
    };
  }

  // ── Property update ────────────────────────────────────────────────────────────

  function updateField(updates: Partial<FieldConfig>) {
    setWorkingTemplates((prev) => ({
      ...prev,
      [currentBank]: {
        ...prev[currentBank],
        [selected]: { ...prev[currentBank][selected], ...updates },
      },
    }));
  }

  // ── Version history ──────────────────────────────────────────────────────────
  // Saving/restoring goes through the cheque template-versions endpoint, which
  // updates the active template (Setting) AND appends an immutable snapshot so no
  // calibration is ever silently overwritten without recoverable history.

  const loadVersions = useCallback(async (bank: string) => {
    setVersionsLoading(true);
    try {
      const res = await api.get(`/cheques/template-versions/${encodeURIComponent(bank)}`);
      setVersions((res.data?.data ?? []) as ChequeTemplateVersionRow[]);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVersions(currentBank);
  }, [currentBank, loadVersions]);

  // ── Save ───────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.post('/cheques/template-versions', {
        bankName: currentBank,
        template: currentTemplate,
        note: saveNote.trim() || null,
      });
      onSaved(currentBank, currentTemplate);
      setSaveNote('');
      setSaveMsg({ type: 'ok', text: `تم حفظ نموذج ${currentBank} كنسخة جديدة` });
      setTimeout(() => setSaveMsg(null), 4000);
      loadVersions(currentBank);
    } catch {
      setSaveMsg({ type: 'error', text: 'حدث خطأ أثناء الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  // ── Restore a previous version ───────────────────────────────────────────────

  async function handleRestoreVersion(v: ChequeTemplateVersionRow) {
    setRestoringId(v.id);
    setSaveMsg(null);
    try {
      const res = await api.post(`/cheques/template-versions/${v.id}/restore`);
      const restoredJson: string = res.data?.data?.template ?? v.template;
      const parsed = JSON.parse(restoredJson) as unknown;
      if (!isValidTemplate(parsed)) {
        setSaveMsg({ type: 'error', text: 'النسخة المستعادة غير صالحة' });
        return;
      }
      setWorkingTemplates((prev) => ({ ...prev, [currentBank]: parsed }));
      onSaved(currentBank, parsed);
      setSaveMsg({ type: 'ok', text: `تم استعادة النسخة ${v.version} لبنك ${currentBank}` });
      setTimeout(() => setSaveMsg(null), 4000);
      loadVersions(currentBank);
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذّر استعادة النسخة' });
    } finally {
      setRestoringId(null);
    }
  }

  // ── Calibration test print ───────────────────────────────────────────────────
  // Prints alignment guides (registration marks + per-field crosshairs) at the
  // exact positions the real fields would occupy — NEVER a real cheque. It touches
  // no cheque record and no API: it only renders the hidden guide layer and calls
  // the shared print helper.

  function handleTestPrint() {
    if (printing) return; // guard against double-click duplicate prints
    setPrinting(true);
    // The test sheet is already mounted (hidden) and prints directly — no fetch,
    // save, or artificial timeout. The native dialog is fire-and-forget, so
    // re-enable as soon as the IPC resolves (right after webContents.print fires).
    void printCurrentView().finally(() => setPrinting(false));
  }

  // ── Calibration geometry (load; save is SYSTEM_ADMIN-only) ────────────────────

  useEffect(() => {
    api
      .get('/cheques/calibration-geometry')
      .then((res) => {
        const g: unknown = res.data?.data;
        // حارس **شكل**، لا حارس صدق. `if (g)` القديم كان يقبل أي قيمة صادقة — ومنها
        // `[]` — فتدخل الحالةَ هندسةٌ بلا حقول، وتقرأ معادلات chequeGeometry منها
        // `undefined` فتُنتج NaN يصل إلى إحداثيات SVG في ورقة المعايرة. الرفض هنا،
        // عند حدّ قبول الاستجابة — لا عند الرسم.
        if (!isCalibrationGeometry(g)) return; // استجابة مشوّهة ⇒ نُبقي الهندسة الآمنة
        setGeometry(g);
        setGeomDraft(g);
      })
      .catch(() => {
        /* keep DEFAULT_GEOMETRY */
      });
  }, []);

  async function handleSaveGeometry() {
    setGeomBusy(true);
    try {
      const res = await api.put('/cheques/calibration-geometry', geomDraft);
      const g = (res.data?.data as CalibrationGeometry) ?? geomDraft;
      setGeometry(g);
      setSaveMsg({ type: 'ok', text: 'تم حفظ إعدادات القياس' });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذّر حفظ إعدادات القياس' });
    } finally {
      setGeomBusy(false);
    }
  }

  // ── Measurement Assistant: apply a proposed correction as a NEW version ────────
  // Never auto-saves — routed through a confirmation and the versioning endpoint.

  async function performApplyCorrection(p: CorrectionProposal) {
    setApplyBusy(true);
    setSaveMsg(null);
    try {
      const scopeLabel = p.scope === 'all' ? 'كل الحقول' : FIELD_LABELS[selected];
      const note = `تصحيح قياس (${scopeLabel}): ${p.rightMm} مم أفقي، ${p.downMm} مم رأسي`;
      await api.post('/cheques/template-versions', {
        bankName: currentBank,
        template: p.proposedTemplate,
        note,
      });
      setWorkingTemplates((prev) => ({ ...prev, [currentBank]: p.proposedTemplate }));
      onSaved(currentBank, p.proposedTemplate);
      setProposal(null);
      setCorrectionSaved(true);
      setSaveMsg({ type: 'ok', text: `تم حفظ التصحيح لبنك ${currentBank} كنسخة جديدة` });
      setTimeout(() => setSaveMsg(null), 4000);
      loadVersions(currentBank);
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذّر حفظ التصحيح' });
    } finally {
      setApplyBusy(false);
      setPendingProposal(null);
    }
  }

  // ── Restore defaults ───────────────────────────────────────────────────────────

  function handleRestore() {
    setWorkingTemplates((prev) => ({ ...prev, [currentBank]: deepCopy(DEFAULT_TEMPLATE) }));
    setSaveMsg({ type: 'ok', text: 'تم استعادة الافتراضي (لم يُحفظ بعد)' });
    setTimeout(() => setSaveMsg(null), 4000);
  }

  // ── Export template ────────────────────────────────────────────────────────────

  function handleExport() {
    const data = {
      bankName: currentBank,
      template: currentTemplate,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cheque-template-${currentBank.replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Import template ────────────────────────────────────────────────────────────

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        if (!raw?.template || !isValidTemplate(raw.template)) {
          setSaveMsg({ type: 'error', text: 'الملف لا يحتوي على قالب صالح' });
          setTimeout(() => setSaveMsg(null), 5000);
          return;
        }
        setWorkingTemplates((prev) => ({ ...prev, [currentBank]: raw.template as ChequeTemplate }));
        setSaveMsg({ type: 'ok', text: 'تم الاستيراد — احفظ لتطبيقه' });
        setTimeout(() => setSaveMsg(null), 5000);
      } catch {
        setSaveMsg({ type: 'error', text: 'فشل قراءة الملف — تأكد أنه JSON صحيح' });
        setTimeout(() => setSaveMsg(null), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Copy template to other banks ───────────────────────────────────────────────

  async function handleConfirmCopy() {
    if (copyTargets.length === 0) return;
    setCopyBusy(true);
    try {
      // Route each target bank through the versioning endpoint so the copy is
      // recorded as a new version per bank (never a silent overwrite).
      for (const bank of copyTargets) {
        await api.post('/cheques/template-versions', {
          bankName: bank,
          template: currentTemplate,
          note: `نسخ من ${currentBank}`,
        });
      }
      const updates: Record<string, ChequeTemplate> = {};
      for (const bank of copyTargets) {
        updates[bank] = deepCopy(currentTemplate);
        onSaved(bank, deepCopy(currentTemplate));
      }
      setWorkingTemplates((prev) => ({ ...prev, ...updates }));
      setShowCopyModal(false);
      setCopyTargets([]);
      setSaveMsg({ type: 'ok', text: `تم نسخ النموذج إلى ${copyTargets.length} بنك` });
      setTimeout(() => setSaveMsg(null), 4000);
      loadVersions(currentBank);
    } catch {
      setSaveMsg({ type: 'error', text: 'حدث خطأ أثناء نسخ النموذج' });
    } finally {
      setCopyBusy(false);
    }
  }

  // ── Preview text per field ─────────────────────────────────────────────────────

  function fieldText(fieldKey: FieldKey): string {
    switch (fieldKey) {
      case 'beneficiary': return previewData.beneficiaryName || 'اسم المستفيد';
      case 'date':        return previewData.chequeDate || '18 / 06 / 2026';
      case 'tafqeet':     return previewData.tafqeetText || 'خمسة آلاف دينار كويتي لا غير';
      case 'numeric':     return previewData.numericText || '#5,000#';
    }
  }

  // ── Field overlay style ────────────────────────────────────────────────────────

  function fieldOverlayStyle(fieldKey: FieldKey, cfg: FieldConfig) {
    const isSelected = selected === fieldKey;
    return {
      position: 'absolute' as const,
      top: `${cfg.top}%`,
      left: `${cfg.left}%`,
      width: `${cfg.width}%`,
      fontSize: `${cfg.fontSize}pt`,
      fontFamily:
        cfg.fontFamily === 'monospace'
          ? 'monospace, monospace'
          : `'${cfg.fontFamily}', Arial, sans-serif`,
      fontWeight: cfg.fontWeight,
      fontStyle: cfg.fontStyle,
      textAlign: cfg.textAlign,
      color: cfg.color,
      direction: (fieldKey === 'tafqeet' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
      cursor: 'grab' as const,
      boxSizing: 'border-box' as const,
      padding: '1px 3px',
      lineHeight: 1.4,
      border: isSelected
        ? '2px solid rgba(37,99,235,0.9)'
        : '1px dashed rgba(100,116,139,0.5)',
      background: isSelected ? 'rgba(37,99,235,0.06)' : 'transparent',
      userSelect: 'none' as const,
      transition: 'border 0.1s',
    };
  }

  // ── Guideline: current dragging field's position ───────────────────────────────

  const draggingCfg = draggingField ? currentTemplate[draggingField] : null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="cheque-calibrator-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: '#eef2f7',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Grabbing cursor override during drag */}
      {draggingField && (
        <style>{`.cheque-calibrator-root * { cursor: grabbing !important; }`}</style>
      )}

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* ── Top toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'var(--surface, #fff)',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          flexShrink: 0,
          flexWrap: 'wrap',
          rowGap: 8,
        }}
      >
        <strong style={{ fontSize: 14, color: 'var(--text)', minWidth: 130 }}>
          ⚙ معايرة الشيكات
        </strong>

        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          البنك:
        </label>
        <select
          className="line-input"
          style={{ minWidth: 190 }}
          value={currentBank}
          onChange={(e) => {
            setCurrentBank(e.target.value);
            setSelected('beneficiary');
            setDraggingField(null);
          }}
        >
          {banks.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            marginInlineStart: 8,
          }}
        >
          تكبير:
        </label>
        <select
          className="line-input"
          style={{ width: 82 }}
          value={zoomLevel}
          onChange={(e) => setZoomLevel(Number(e.target.value))}
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {saveMsg && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color:
                saveMsg.type === 'ok'
                  ? 'var(--success, #16a34a)'
                  : 'var(--danger, #dc2626)',
              whiteSpace: 'nowrap',
            }}
          >
            {saveMsg.type === 'ok' ? '✓' : '⚠️'} {saveMsg.text}
          </span>
        )}

        <button
          type="button"
          className="btn secondary sm"
          onClick={handleExport}
          title="تصدير القالب كـ JSON"
        >
          ⬇ تصدير
        </button>
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => importInputRef.current?.click()}
          title="استيراد قالب من ملف JSON"
        >
          ⬆ استيراد
        </button>
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => {
            setShowCopyModal(true);
            setCopyTargets([]);
          }}
          title="نسخ القالب إلى بنوك أخرى"
        >
          نسخ إلى...
        </button>
        <button
          type="button"
          className="btn secondary sm"
          onClick={handleTestPrint}
          disabled={printing}
          title="طباعة ورقة اختبار المحاذاة (علامات الحقول فقط — لا تُطبع شيكاً ولا تُسجّل أي عملية)"
        >
          🖨 اختبار المعايرة
        </button>
        <input
          type="text"
          className="line-input"
          value={saveNote}
          onChange={(e) => setSaveNote(e.target.value)}
          placeholder="ملاحظة النسخة (اختياري)"
          title="ملاحظة تُحفظ مع نسخة النموذج"
          style={{ width: 160, fontSize: 12 }}
          maxLength={300}
        />
        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ نسخة'}
        </button>
        <button type="button" className="btn secondary" onClick={handleRestore}>
          استعادة الافتراضي
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          إغلاق
        </button>
      </div>

      {/* ── Studio bar ── */}
      <div className="chq-studio-bar">
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="chq-btn chq-btn--ghost"
          onClick={() => { setCorrectionSaved(false); setShowWizard(true); }}
          title="معالج معايرة الطابعة خطوة بخطوة"
        >
          <span className="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
          معالج المعايرة
        </button>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Cheque canvas ── */}
        <div
          style={{
            flex: 1,
            padding: 24,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            اسحب لتغيير الموضع · انقر لتحديد العنصر · أسهم لوحة المفاتيح = ±1 · Shift+سهم = ±10
          </p>

          {/* Cheque container — explicit pixel width for zoom, scrollable at high zoom */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: `${chequeWidth}px`,
              flexShrink: 0,
              aspectRatio: '700 / 272',
              border: '2px solid #94a3b8',
              borderRadius: 8,
              overflow: 'hidden',
              userSelect: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}
          >
            {/* Cheque background image */}
            <img
              src={chequeImg}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                pointerEvents: 'none',
              }}
            />

            {/* Guideline crosshairs during drag + coordinate badge */}
            {draggingCfg && (
              <>
                {/* Horizontal guideline */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${draggingCfg.top}%`,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: 'rgba(59,130,246,0.7)',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                />
                {/* Vertical guideline */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${draggingCfg.left}%`,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: 'rgba(59,130,246,0.7)',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                />
                {/* Coordinate badge — bottom-right of canvas */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    fontSize: 10,
                    background: 'rgba(37,99,235,0.9)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    zIndex: 21,
                    fontFamily: 'monospace',
                    letterSpacing: 0.3,
                  }}
                >
                  X:{draggingCfg.left.toFixed(2)}%&nbsp;&nbsp;Y:{draggingCfg.top.toFixed(2)}%
                </div>
              </>
            )}

            {/* Draggable field overlays */}
            {FIELD_KEYS.map((fieldKey) => {
              const cfg = currentTemplate[fieldKey];
              const isSelected = selected === fieldKey;
              return (
                <div
                  key={fieldKey}
                  onMouseDown={(e) => handleFieldMouseDown(e, fieldKey)}
                  style={fieldOverlayStyle(fieldKey, cfg)}
                >
                  {/* Field name badge — top-right corner of each field */}
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      fontSize: 8,
                      lineHeight: 1.7,
                      background: isSelected
                        ? 'rgba(37,99,235,0.9)'
                        : 'rgba(71,85,105,0.6)',
                      color: '#fff',
                      padding: '0 3px',
                      borderRadius: '0 0 0 3px',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    {FIELD_LABELS[fieldKey]}
                  </span>
                  {fieldText(fieldKey)}
                </div>
              );
            })}

            {/* Ghost overlay — proposed positions from the Measurement Assistant.
                Current = solid field boxes above; proposed = dashed ghosts here. */}
            {proposal &&
              proposal.affectedFields.map((fk) => {
                const gcfg = proposal.proposedTemplate[fk];
                return (
                  <div
                    key={`ghost-${fk}`}
                    className="chq-ghost"
                    style={{ top: `${gcfg.top}%`, left: `${gcfg.left}%`, width: `${gcfg.width}%`, height: `${gcfg.fontSize * 1.6}pt` }}
                  >
                    <span className="chq-ghost__tag">{FIELD_LABELS[fk]} — مقترح</span>
                  </div>
                );
              })}
          </div>

          {/* Quick-select field buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {FIELD_KEYS.map((fieldKey) => (
              <button
                key={fieldKey}
                type="button"
                className={`btn ${selected === fieldKey ? '' : 'secondary'} sm`}
                onClick={() => setSelected(fieldKey)}
              >
                {FIELD_LABELS[fieldKey]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Properties panel ── */}
        <div
          style={{
            width: 290,
            flexShrink: 0,
            borderRight: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface, #fff)',
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Selected field title */}
          <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 14, color: 'var(--text)' }}>
              {FIELD_LABELS[selected]}
            </strong>
          </div>

          {/* X / Y */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumInput
              label="X (يسار %)"
              value={selectedCfg.left}
              step={0.1}
              min={0}
              max={90}
              onChange={(v) => updateField({ left: v })}
            />
            <NumInput
              label="Y (أعلى %)"
              value={selectedCfg.top}
              step={0.1}
              min={0}
              max={85}
              onChange={(v) => updateField({ top: v })}
            />
          </div>

          {/* Width */}
          <NumInput
            label="العرض %"
            value={selectedCfg.width}
            step={0.5}
            min={5}
            max={100}
            onChange={(v) => updateField({ width: v })}
          />

          {/* Font family */}
          <PropSelect
            label="نوع الخط"
            value={selectedCfg.fontFamily}
            options={[...FONT_FAMILIES].map((f) => ({ value: f, label: f }))}
            onChange={(v) => updateField({ fontFamily: v })}
          />

          {/* Font size */}
          <PropSelect
            label="حجم الخط"
            value={String(selectedCfg.fontSize)}
            options={[...FONT_SIZES].map((s) => ({ value: String(s), label: `${s}pt` }))}
            onChange={(v) => updateField({ fontSize: Number(v) })}
          />

          {/* Bold + Italic */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn ${isBold(selectedCfg.fontWeight) ? '' : 'secondary'} sm`}
              style={{ flex: 1, fontWeight: 700 }}
              onClick={() =>
                updateField({ fontWeight: isBold(selectedCfg.fontWeight) ? '400' : '700' })
              }
            >
              B
            </button>
            <button
              type="button"
              className={`btn ${selectedCfg.fontStyle === 'italic' ? '' : 'secondary'} sm`}
              style={{ flex: 1, fontStyle: 'italic' }}
              onClick={() =>
                updateField({
                  fontStyle: selectedCfg.fontStyle === 'italic' ? 'normal' : 'italic',
                })
              }
            >
              I
            </button>
          </div>

          {/* Text align */}
          <div>
            <label style={labelStyle}>المحاذاة</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['right', 'center', 'left'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`btn ${selectedCfg.textAlign === align ? '' : 'secondary'} sm`}
                  style={{ flex: 1 }}
                  onClick={() => updateField({ textAlign: align })}
                >
                  {align === 'right' ? 'يمين' : align === 'center' ? 'وسط' : 'يسار'}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label style={labelStyle}>اللون</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={selectedCfg.color}
                onChange={(e) => updateField({ color: e.target.value })}
                style={{
                  width: 36,
                  height: 32,
                  padding: 2,
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <input
                type="text"
                className="line-input"
                value={selectedCfg.color}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value))
                    updateField({ color: e.target.value });
                }}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Coordinate summary — always visible */}
          <div
            style={{
              marginTop: 4,
              padding: '8px 10px',
              background: 'var(--bg, #f8fafc)',
              borderRadius: 6,
              border: '1px solid var(--border)',
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              lineHeight: 1.9,
            }}
          >
            <strong
              style={{
                fontSize: 11,
                color: 'var(--text)',
                display: 'block',
                marginBottom: 2,
              }}
            >
              {FIELD_LABELS[selected]}
            </strong>
            X: {selectedCfg.left.toFixed(2)}%&nbsp; Y: {selectedCfg.top.toFixed(2)}%
            <br />
            W: {selectedCfg.width.toFixed(2)}%
            <br />
            {selectedCfg.fontSize}pt · {selectedCfg.fontFamily} · {selectedCfg.fontWeight}
          </div>

          {/* ── Version history ── */}
          <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              📚 نسخ نموذج {currentBank}
            </strong>
            {versionsLoading ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>جارٍ التحميل…</p>
            ) : versions.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                لا توجد نسخ محفوظة بعد. احفظ لإنشاء أول نسخة.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {versions.map((v, i) => (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: 'var(--bg, #f8fafc)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                        نسخة {v.version}
                        {i === 0 && (
                          <span style={{ marginInlineStart: 6, fontSize: 10, color: 'var(--success, #16a34a)', fontWeight: 700 }}>
                            (الحالية)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatVersionDate(v.createdAt)}
                        {v.createdByName ? ` · ${v.createdByName}` : ''}
                        {v.note ? ` · ${v.note}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn secondary sm"
                      disabled={i === 0 || restoringId !== null}
                      onClick={() => handleRestoreVersion(v)}
                      title={i === 0 ? 'هذه هي النسخة الحالية' : `استعادة النسخة ${v.version}`}
                      style={{ flexShrink: 0 }}
                    >
                      {restoringId === v.id ? '…' : 'استعادة'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Measurement Assistant (hidden while the wizard owns it) ── */}
          {!showWizard && (
            <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <MeasurementAssistant
                template={currentTemplate}
                selectedField={selected}
                geometry={geometry}
                savedAsVersion={correctionSaved}
                onProposalChange={setProposal}
                onApply={(p) => setPendingProposal(p)}
                applyBusy={applyBusy}
              />
            </div>
          )}

          {/* ── Advanced geometry (SYSTEM_ADMIN only) ── */}
          {isSystemAdmin && (
            <div className="chq-geom" style={{ marginTop: 10 }}>
              <button type="button" className="chq-geom__head" onClick={() => setShowGeom((v) => !v)}>
                <span className="material-symbols-outlined" aria-hidden="true">tune</span>
                إعدادات القياس المتقدمة (مسؤول النظام)
                <span style={{ marginInlineStart: 'auto' }}>{showGeom ? '▲' : '▼'}</span>
              </button>
              {showGeom && (
                <>
                  <div className="chq-geom__grid">
                    {GEOMETRY_FIELDS.map((gf) => (
                      <label key={gf.key}>
                        <span>{gf.label}</span>
                        <input
                          type="number"
                          step={0.5}
                          value={geomDraft[gf.key]}
                          onChange={(e) =>
                            setGeomDraft((prev) => ({ ...prev, [gf.key]: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="chq-geom__foot">
                    <button type="button" className="chq-btn chq-btn--primary" onClick={handleSaveGeometry} disabled={geomBusy}>
                      {geomBusy ? 'جارٍ الحفظ…' : 'حفظ إعدادات القياس'}
                    </button>
                    <button type="button" className="chq-btn chq-btn--ghost" onClick={() => setGeomDraft(geometry)}>
                      إعادة تعيين
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Hidden calibration test-print layer (Calibration Studio) ── */}
      {/* Field markers only — no cheque background, no beneficiary data, no record
          touched. Rendered in mm at true scale. Isolated from the real cheque print
          output (.cheque-print-only). */}
      <div className="chq-calib-testprint" style={{ display: 'none' }}>
        <CalibrationTestSheet template={currentTemplate} geometry={geometry} />
      </div>
      <style>{`
        @media print {
          /* The Cheques page unmounts its real-cheque layer while the calibrator is
             open, so the test sheet is the only print surface in the document. No
             suppression rule and no z-index are needed to win against it — the
             competing layer simply does not exist. Everything else in the app shell
             is hidden, and the sheet is revealed. */
          body > * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .chq-calib-testprint {
            display: block !important;
            visibility: visible !important;
            position: fixed;
            inset: 0;
            background: white;
          }
          .chq-calib-testprint * { visibility: visible !important; }
          /* The sheet is authored at exactly 297 × 210 mm. Any page margin would
             shrink the printable box below that, and Chromium would scale the sheet
             down to fit — silently destroying the physical accuracy of the edge
             rulers. margin:0 makes the page box exactly A4, so 1 mm on the sheet is
             1 mm on paper, and the content fills exactly one page.
             This rule lives inside the calibrator, which Cheques.tsx unmounts before
             any real cheque is printed, so the cheque print path never sees it. */
          .chq-calib-testprint, .chq-calib-testprint * { box-sizing: border-box; }
        }
        /* The page box is derived from the SAME geometry that sizes the SVG, so the
           two can never disagree. A hardcoded "A4 landscape" would silently lie the
           moment a SYSTEM_ADMIN changes pageWidthMm/pageHeightMm — Chromium would then
           scale the sheet to fit and every physical measurement on it would be wrong.
           On the default geometry this resolves to 297mm × 210mm, i.e. A4 landscape. */
        @page { size: ${geometry.pageWidthMm}mm ${geometry.pageHeightMm}mm; margin: 0; }
      `}</style>

      {/* ── Copy template modal ── */}
      {showCopyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCopyModal(false);
              setCopyTargets([]);
            }
          }}
        >
          <div
            style={{
              background: 'var(--surface, #fff)',
              borderRadius: 12,
              padding: 24,
              minWidth: 300,
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>نسخ القالب إلى بنوك أخرى</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
              المصدر: <strong>{currentBank}</strong> — اختر البنوك المستهدفة:
            </p>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}
            >
              {otherBanks.map((bank) => (
                <label
                  key={bank}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}
                >
                  <input
                    type="checkbox"
                    checked={copyTargets.includes(bank)}
                    onChange={(e) =>
                      setCopyTargets((prev) =>
                        e.target.checked
                          ? [...prev, bank]
                          : prev.filter((b) => b !== bank),
                      )
                    }
                  />
                  {bank}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={handleConfirmCopy}
                disabled={copyTargets.length === 0 || copyBusy}
              >
                {copyBusy
                  ? 'جاري النسخ...'
                  : `نسخ إلى ${copyTargets.length} بنك`}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowCopyModal(false);
                  setCopyTargets([]);
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply-correction confirmation (never auto-saves) ── */}
      {pendingProposal && (
        <div
          className="chq-wiz__scrim"
          style={{ zIndex: 3400 }}
          onClick={(e) => e.target === e.currentTarget && !applyBusy && setPendingProposal(null)}
        >
          <div className="chq-wiz" role="dialog" aria-label="تأكيد التصحيح" style={{ width: 'min(440px, 96vw)' }}>
            <div className="chq-wiz__head">
              <div>
                <strong>تأكيد تطبيق التصحيح</strong>
                <span>{currentBank}</span>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                سيتم إنشاء نسخة جديدة من نموذج «{currentBank}» بالتصحيح المقترح (
                {pendingProposal.scope === 'all' ? 'كل الحقول' : FIELD_LABELS[selected]}). النسخة الحالية تبقى متاحة للاستعادة.
              </p>
              {pendingProposal.anyClamped && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger, #dc2626)' }}>
                  ⚠️ بعض القيم تجاوزت الحدود وتم قصّها إلى الحد المسموح.
                </p>
              )}
            </div>
            <div className="chq-wiz__foot">
              <button type="button" className="chq-btn chq-btn--ghost" onClick={() => setPendingProposal(null)} disabled={applyBusy}>
                إلغاء
              </button>
              <button type="button" className="chq-btn chq-btn--primary" onClick={() => performApplyCorrection(pendingProposal)} disabled={applyBusy}>
                {applyBusy ? 'جارٍ الحفظ…' : 'تطبيق كنسخة جديدة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Printer Calibration Wizard (skippable) ── */}
      {showWizard && (
        <CalibrationWizard
          bank={currentBank}
          template={currentTemplate}
          selectedField={selected}
          geometry={geometry}
          applied={correctionSaved}
          applyBusy={applyBusy}
          onProposalChange={setProposal}
          onApply={(p) => setPendingProposal(p)}
          onPrint={handleTestPrint}
          onClose={() => { setShowWizard(false); setProposal(null); }}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isBold(w: string): boolean {
  return w === 'bold' || Number(w) >= 600;
}

function deepCopy(t: ChequeTemplate): ChequeTemplate {
  return {
    beneficiary: { ...t.beneficiary },
    date: { ...t.date },
    tafqeet: { ...t.tafqeet },
    numeric: { ...t.numeric },
  };
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
} as const;

// ── Small reusable prop-panel controls ─────────────────────────────────────────

interface NumInputProps {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function NumInput({ label, value, step, min, max, onChange }: NumInputProps) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        className="line-input"
        value={value.toFixed(2)}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(clamp(n, min, max));
        }}
        style={{ width: '100%', fontSize: 13, fontFamily: 'monospace' }}
      />
    </div>
  );
}

interface PropSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function PropSelect({ label, value, options, onChange }: PropSelectProps) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        className="line-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', fontSize: 13 }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
