import React from 'react';
import type { BrandingDesignerHandle } from '../hooks/useBrandingDesigner';
import { ZOOM_PRESETS, type ZoomLevel } from '../utils/designerUtils';

interface Props {
  designer: BrandingDesignerHandle;
  docLabel: string;
  onClose: () => void;
}

const BTN_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  color: '#374151',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  minHeight: 28,
};

const DIVIDER: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#e2e8f0',
  margin: '0 2px',
  flexShrink: 0,
};

function Btn({
  onClick,
  title,
  disabled,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        ...BTN_BASE,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#eff6ff' : '#fff',
        borderColor: active ? '#3b82f6' : '#d1d5db',
        color: active ? '#3b82f6' : '#374151',
      }}
    >
      {children}
    </button>
  );
}

export default function BrandingDesignerToolbar({ designer, docLabel, onClose }: Props) {
  const {
    canUndo, canRedo, undo, redo,
    zoom, setZoom,
    showGrid, setShowGrid,
    snapEnabled, setSnapEnabled,
    saving, save,
  } = designer;

  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        flexWrap: 'wrap',
        direction: 'rtl',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        minHeight: 44,
      }}
    >
      {/* Mode label */}
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        padding: '2px 8px',
        background: '#3b82f6',
        borderRadius: 5,
        marginInlineEnd: 4,
      }}>
        ✏ وضع التصميم — {docLabel}
      </span>

      <div style={DIVIDER} />

      {/* History */}
      <Btn onClick={undo} title="تراجع (Ctrl+Z)" disabled={!canUndo}>↩ تراجع</Btn>
      <Btn onClick={redo} title="إعادة (Ctrl+Shift+Z)" disabled={!canRedo}>↪ إعادة</Btn>

      <div style={DIVIDER} />

      {/* Zoom */}
      <span style={{ fontSize: 11, color: '#6b7280', padding: '0 4px' }}>تكبير:</span>
      <select
        value={zoom}
        title="مستوى التكبير"
        aria-label="مستوى التكبير"
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'fit-width') setZoom('fit-width');
          else if (v === 'fit-page') setZoom('fit-page');
          else setZoom(Number(v) as Exclude<ZoomLevel, 'fit-width' | 'fit-page' | 'fit'>);
        }}
        style={{
          fontSize: 12,
          padding: '3px 6px',
          borderRadius: 5,
          border: '1px solid #d1d5db',
          background: '#fff',
          cursor: 'pointer',
          height: 28,
        }}
      >
        {ZOOM_PRESETS.map((z) => (
          <option key={z} value={z}>{z}%</option>
        ))}
        <option value="fit-width">ملاءمة عرض</option>
        <option value="fit-page">ملاءمة صفحة</option>
      </select>

      <div style={DIVIDER} />

      {/* Grid toggle */}
      <Btn
        onClick={() => setShowGrid(!showGrid)}
        title={showGrid ? 'إخفاء الشبكة' : 'إظهار الشبكة'}
        active={showGrid}
      >
        ⊞ شبكة
      </Btn>

      {/* Snap toggle */}
      <Btn
        onClick={() => setSnapEnabled(!snapEnabled)}
        title={snapEnabled ? 'إلغاء المحاذاة' : 'تفعيل المحاذاة'}
        active={snapEnabled}
      >
        ⊡ محاذاة
      </Btn>

      {/* Spacer */}
      <div style={{ flex: 1, minWidth: 8 }} />

      {/* Save */}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        title="حفظ التخطيط (Ctrl+S)"
        style={{
          ...BTN_BASE,
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          fontWeight: 700,
          opacity: saving ? 0.7 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
          padding: '4px 14px',
        }}
      >
        {saving ? '⏳ حفظ...' : '💾 حفظ'}
      </button>

      {/* Exit */}
      <button
        type="button"
        onClick={onClose}
        title="إغلاق وضع التصميم (Esc)"
        style={{
          ...BTN_BASE,
          color: '#64748b',
          background: 'transparent',
          border: '1px solid #d1d5db',
        }}
      >
        ✕ إغلاق
      </button>
    </div>
  );
}
