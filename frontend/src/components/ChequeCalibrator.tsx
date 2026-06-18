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
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
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
        [bank]: {
          ...prev[bank],
          [fieldKey]: { ...prev[bank][fieldKey], left: newLeft, top: newTop },
        },
      }));
    }
    function onUp() {
      draggingRef.current = null;
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  function handleFieldMouseDown(e: React.MouseEvent, fieldKey: FieldKey) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(fieldKey);
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
        settings: [
          { key: settingKey(currentBank), value: JSON.stringify(currentTemplate), group: 'cheque' },
        ],
      });
      onSaved(currentBank, currentTemplate);
      setSaveMsg({ type: 'ok', text: `تم حفظ نموذج ${currentBank} بنجاح` });
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

  // ── Field CSS style for the draggable overlay element ─────────────────────────

  function fieldOverlayStyle(fieldKey: FieldKey, cfg: FieldConfig): React.CSSProperties {
    const isSelected = selected === fieldKey;
    return {
      position: 'absolute',
      top: `${cfg.top}%`,
      left: `${cfg.left}%`,
      width: `${cfg.width}%`,
      fontSize: `${cfg.fontSize}pt`,
      fontFamily: cfg.fontFamily === 'monospace' ? 'monospace, monospace' : `'${cfg.fontFamily}', Arial, sans-serif`,
      fontWeight: cfg.fontWeight,
      fontStyle: cfg.fontStyle,
      textAlign: cfg.textAlign,
      color: cfg.color,
      direction: fieldKey === 'tafqeet' ? 'rtl' : 'ltr',
      cursor: 'grab',
      boxSizing: 'border-box',
      padding: '1px 3px',
      lineHeight: 1.4,
      outline: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(0,0,0,0.3)',
      background: isSelected ? 'rgba(59,130,246,0.07)' : 'transparent',
      userSelect: 'none',
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'var(--bg, #f1f5f9)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Top toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: 'var(--surface, #fff)',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 15, color: 'var(--text)', minWidth: 160 }}>
          معايرة طباعة الشيكات
        </strong>

        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          البنك:
        </label>
        <select
          className="line-input"
          style={{ minWidth: 200 }}
          value={currentBank}
          onChange={(e) => { setCurrentBank(e.target.value); setSelected('beneficiary'); }}
        >
          {banks.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        {saveMsg && (
          <span style={{ fontSize: 13, fontWeight: 600, color: saveMsg.type === 'ok' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
            {saveMsg.type === 'ok' ? '✓' : '⚠️'} {saveMsg.text}
          </span>
        )}

        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ النموذج'}
        </button>
        <button type="button" className="btn secondary" onClick={handleRestore}>
          استعادة الافتراضي
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Cheque canvas ── */}
        <div
          style={{
            flex: 1,
            padding: 20,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            اسحب أي عنصر لتغيير موضعه · انقر لتحديده وتعديل خصائصه
          </p>

          {/* Cheque preview container — keeps 700:272 aspect ratio */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 820,
              aspectRatio: '700 / 272',
              border: '2px solid var(--border, #cbd5e1)',
              borderRadius: 8,
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            <img
              src={chequeImg}
              alt=""
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }}
            />

            {FIELD_KEYS.map((fieldKey) => (
              <div
                key={fieldKey}
                onMouseDown={(e) => handleFieldMouseDown(e, fieldKey)}
                style={fieldOverlayStyle(fieldKey, currentTemplate[fieldKey])}
              >
                {fieldText(fieldKey)}
              </div>
            ))}
          </div>

          {/* Quick-select buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
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
            width: 280,
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
            <strong style={{ fontSize: 14, color: 'var(--text)' }}>{FIELD_LABELS[selected]}</strong>
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
              onClick={() => updateField({ fontWeight: isBold(selectedCfg.fontWeight) ? '400' : '700' })}
            >
              B
            </button>
            <button
              type="button"
              className={`btn ${selectedCfg.fontStyle === 'italic' ? '' : 'secondary'} sm`}
              style={{ flex: 1, fontStyle: 'italic' }}
              onClick={() => updateField({ fontStyle: selectedCfg.fontStyle === 'italic' ? 'normal' : 'italic' })}
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
                style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                type="text"
                className="line-input"
                value={selectedCfg.color}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateField({ color: e.target.value });
                }}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Info summary */}
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
            X: {selectedCfg.left.toFixed(2)}%&nbsp; Y: {selectedCfg.top.toFixed(2)}%<br />
            W: {selectedCfg.width.toFixed(2)}%<br />
            {selectedCfg.fontSize}pt · {selectedCfg.fontFamily} · {selectedCfg.fontWeight}
          </div>
        </div>
      </div>
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
};

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
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}
