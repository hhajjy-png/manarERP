import { useState } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { formatUnit, GRID_PRESETS, type GridSizeOption } from '../utils/designerUtils';
import { INK_MODE_LABELS, type InkMode } from '../utils/inkFilter';

interface Props {
  designer: BrandingDesignerHandle;
  docLabel: string;
  onClose: () => void;
}

interface NumSliderProps {
  lbl: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function NumSlider({ lbl, min, max, step, value, onChange }: NumSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <label style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'end', flexShrink: 0 }}>
        {lbl}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={formatUnit(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        style={{
          width: 48,
          fontSize: 11,
          textAlign: 'center',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          padding: '2px 3px',
        }}
      />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: 6,
      marginTop: 12,
      paddingBottom: 4,
      borderBottom: '1px solid #f1f5f9',
    }}>
      {label}
    </div>
  );
}

const ALIGN_BTNS = [
  { icon: '⬛◻', label: 'توسيط أفقي', action: 'alignH' },
  { icon: '◻⬛', label: 'توسيط رأسي', action: 'alignV' },
  { icon: '▲', label: 'للأمام', action: 'bringForward' },
  { icon: '▼', label: 'للخلف', action: 'sendBackward' },
] as const;

export default function BrandingDesignerPanel({ designer, docLabel, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const {
    localLayout,
    selected,
    setSelected,
    docType,
    updateElement,
    alignCenterH,
    alignCenterV,
    bringForward,
    sendBackward,
    resetElement,
    resetDoc,
    snapEnabled,
    setSnapEnabled,
    gridSize,
    setGridSize,
    inkMode,
    setInkMode,
    saving,
    saveError,
    save,
  } = designer;

  const el = localLayout[docType][selected];
  const accentColor = selected === 'signature' ? '#3b82f6' : '#10b981';

  const handleAlign = (action: typeof ALIGN_BTNS[number]['action']) => {
    switch (action) {
      case 'alignH': alignCenterH(selected); break;
      case 'alignV': alignCenterV(selected); break;
      case 'bringForward': bringForward(selected); break;
      case 'sendBackward': sendBackward(selected); break;
    }
  };

  if (collapsed) {
    return (
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: 80,
          insetInlineEnd: 12,
          zIndex: 9000,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
          border: '1px solid #e2e8f0',
          direction: 'rtl',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="فتح لوحة الخصائص"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          ◀ خصائص
        </button>
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        top: 80,
        insetInlineEnd: 12,
        zIndex: 9000,
        width: 256,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: '1px solid #e2e8f0',
        direction: 'rtl',
        padding: '10px 12px 14px',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 96px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>
          خصائص — {docLabel}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="طي اللوحة"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#94a3b8', padding: '0 3px', lineHeight: 1,
            }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={onClose}
            title="إغلاق"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: '#94a3b8', padding: '0 3px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── SECTION: Selection ── */}
      <SectionHeader label="العنصر" />
      <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
        {(['signature', 'stamp'] as ElementType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelected(type)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${selected === type ? accentColor : '#d1d5db'}`,
              background: selected === type ? accentColor : 'transparent',
              color: selected === type ? '#fff' : '#6b7280',
            }}
          >
            {type === 'signature' ? '✏ التوقيع' : '🔵 الختم'}
          </button>
        ))}
      </div>

      {/* ── SECTION: Transform ── */}
      <SectionHeader label="الموضع والحجم" />
      <NumSlider lbl="أفقي X" min={-80} max={80} step={1} value={el.x} onChange={(v) => updateElement(selected, { x: v })} />
      <NumSlider lbl="رأسي Y" min={-60} max={60} step={1} value={el.y} onChange={(v) => updateElement(selected, { y: v })} />
      <NumSlider lbl="حجم" min={0.4} max={2.5} step={0.05} value={el.scale} onChange={(v) => updateElement(selected, { scale: v })} />
      <NumSlider lbl="شفافية" min={0.2} max={1} step={0.05} value={el.opacity} onChange={(v) => updateElement(selected, { opacity: v })} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#6b7280', width: 52, textAlign: 'end', flexShrink: 0 }}>طبقة</span>
        {[1, 2].map((z) => (
          <label key={z} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="radio"
              name="bd-zindex"
              checked={el.zIndex === z}
              onChange={() => updateElement(selected, { zIndex: z })}
            />
            {z === 1 ? 'خلف' : 'أمام'}
          </label>
        ))}
      </div>

      {/* ── SECTION: Appearance ── */}
      <SectionHeader label="المظهر" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>الحبر:</span>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {(['original', 'blue-ink', 'black'] as InkMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInkMode(mode)}
              title={INK_MODE_LABELS[mode]}
              style={{
                flex: 1,
                padding: '3px 2px',
                borderRadius: 5,
                fontSize: 10,
                fontWeight: inkMode === mode ? 700 : 400,
                cursor: 'pointer',
                border: `1px solid ${inkMode === mode ? '#3b82f6' : '#d1d5db'}`,
                background: inkMode === mode ? '#eff6ff' : 'transparent',
                color: inkMode === mode ? '#3b82f6' : '#6b7280',
              }}
            >
              {INK_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Snap */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          محاذاة للشبكة
        </label>
        {snapEnabled && (
          <select
            value={gridSize}
            aria-label="حجم الشبكة"
            title="حجم الشبكة"
            onChange={(e) => setGridSize(Number(e.target.value) as GridSizeOption)}
            style={{
              fontSize: 11,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid #d1d5db',
              marginInlineStart: 'auto',
            }}
          >
            {GRID_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── SECTION: Alignment ── */}
      <SectionHeader label="محاذاة" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 4 }}>
        <button
          type="button"
          title="توسيط أفقي — X = 0"
          onClick={() => handleAlign('alignH')}
          style={{ padding: '5px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fafafa', cursor: 'pointer', fontSize: 14 }}
        >
          ↔
        </button>
        <button
          type="button"
          title="توسيط رأسي — Y = 0"
          onClick={() => handleAlign('alignV')}
          style={{ padding: '5px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fafafa', cursor: 'pointer', fontSize: 14 }}
        >
          ↕
        </button>
        <button
          type="button"
          title="إحضار للأمام"
          onClick={() => handleAlign('bringForward')}
          style={{ padding: '5px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fafafa', cursor: 'pointer', fontSize: 13 }}
        >
          ⬆ أمام
        </button>
        <button
          type="button"
          title="إرسال للخلف"
          onClick={() => handleAlign('sendBackward')}
          style={{ padding: '5px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fafafa', cursor: 'pointer', fontSize: 13 }}
        >
          ⬇ خلف
        </button>
      </div>

      {/* ── SECTION: Reset ── */}
      <SectionHeader label="إعادة ضبط" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => resetElement('signature')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #3b82f633', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#3b82f6' }}
        >
          ↺ التوقيع
        </button>
        <button
          type="button"
          onClick={() => resetElement('stamp')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #10b98133', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#10b981' }}
        >
          ↺ الختم
        </button>
        <button
          type="button"
          onClick={resetDoc}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#64748b' }}
        >
          ↺ الكل
        </button>
      </div>

      {/* ── SECTION: Shortcuts ── */}
      <SectionHeader label="اختصارات" />
      <div style={{
        fontSize: 10,
        color: '#94a3b8',
        background: '#f8fafc',
        padding: '6px 8px',
        borderRadius: 6,
        lineHeight: 1.8,
        marginBottom: 12,
      }}>
        ← → ↑ ↓ &nbsp;تحريك بوحدة<br />
        Shift+سهم &nbsp;تحريك 10 وحدات<br />
        Delete &nbsp;إعادة ضبط المحدد<br />
        Ctrl+Z / Ctrl+Shift+Z &nbsp;تراجع / إعادة<br />
        Ctrl+0 &nbsp;ملاءمة صفحة<br />
        Esc &nbsp;إغلاق وضع التصميم
      </div>

      {/* Error */}
      {saveError && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {saveError}</div>
      )}

      {/* Save / Cancel */}
      <div style={{ display: 'flex', gap: 7 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            flex: 2,
            padding: '7px 0',
            borderRadius: 8,
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 700,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
        </button>
      </div>
    </div>
  );
}
