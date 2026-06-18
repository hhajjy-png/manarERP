import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import chequeImg from '../assets/cheakv1.png';
import {
  DEFAULT_TEMPLATE,
  FIELD_KEYS,
  FIELD_LABELS,
  FONT_FAMILIES,
  FONT_SIZES,
  settingKey,
} from '../utils/chequeTemplate';
import type { ChequeTemplate, FieldConfig, FieldKey } from '../utils/chequeTemplate';

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
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200] as const;
const BASE_CHEQUE_WIDTH = 820;

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

export default function ChequeCalibrator({
  banks,
  initialBank,
  loadedTemplates,
  previewData,
  onSaved,
  onClose,
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

  // ── Save ───────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.put('/settings', {
        settings: [{ key: settingKey(currentBank), value: JSON.stringify(currentTemplate), group: 'cheque' }],
      });
      onSaved(currentBank, currentTemplate);
      setSaveMsg({ type: 'ok', text: `تم حفظ نموذج ${currentBank}` });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch {
      setSaveMsg({ type: 'error', text: 'حدث خطأ أثناء الحفظ' });
    } finally {
      setSaving(false);
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
      const settings = copyTargets.map((bank) => ({
        key: settingKey(bank),
        value: JSON.stringify(currentTemplate),
        group: 'cheque',
      }));
      await api.put('/settings', { settings });
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
        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
        <button type="button" className="btn secondary" onClick={handleRestore}>
          استعادة الافتراضي
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          إغلاق
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
        </div>
      </div>

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
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
