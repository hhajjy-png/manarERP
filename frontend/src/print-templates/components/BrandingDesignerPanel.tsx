import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { formatUnit, ZOOM_PRESETS, GRID_SIZES, type GridSizeOption, type ZoomLevel } from '../utils/designerUtils';

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
          width: 52,
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

export default function BrandingDesignerPanel({ designer, docLabel, onClose }: Props) {
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
    canUndo,
    canRedo,
    undo,
    redo,
    zoom,
    setZoom,
    showGrid,
    setShowGrid,
    snapEnabled,
    setSnapEnabled,
    gridSize,
    setGridSize,
    saving,
    saveError,
    save,
  } = designer;

  const el = localLayout[docType][selected];
  const accentColor = selected === 'signature' ? '#3b82f6' : '#10b981';

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        top: 80,
        insetInlineEnd: 12,
        zIndex: 9000,
        width: 270,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        border: '1px solid #e2e8f0',
        direction: 'rtl',
        padding: '12px 14px',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 100px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
          مصمم التوقيع — {docLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#94a3b8',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Undo / Redo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          { lbl: '↩ تراجع', fn: undo, enabled: canUndo },
          { lbl: '↪ إعادة', fn: redo, enabled: canRedo },
        ].map(({ lbl, fn, enabled }) => (
          <button
            key={lbl}
            type="button"
            onClick={fn}
            disabled={!enabled}
            style={{
              flex: 1,
              padding: '4px 0',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: enabled ? '#fff' : 'transparent',
              cursor: enabled ? 'pointer' : 'not-allowed',
              fontSize: 12,
              opacity: enabled ? 1 : 0.4,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>تكبير:</span>
        <select
          value={zoom}
          onChange={(e) => {
            const v = e.target.value;
            setZoom(v === 'fit' ? 'fit' : (Number(v) as Exclude<ZoomLevel, 'fit'>));
          }}
          style={{
            fontSize: 12,
            padding: '3px 6px',
            borderRadius: 5,
            border: '1px solid #d1d5db',
            flex: 1,
          }}
        >
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={z}>{z}%</option>
          ))}
          <option value="fit">ملاءمة</option>
        </select>
      </div>

      {/* Grid + Snap */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          شبكة
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          محاذاة
        </label>
        {snapEnabled && (
          <select
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value) as GridSizeOption)}
            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db' }}
          >
            {GRID_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />

      {/* Element selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
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
            {type === 'signature' ? 'التوقيع' : 'الختم'}
          </button>
        ))}
      </div>

      {/* Properties */}
      <NumSlider lbl="أفقي X" min={-80} max={80} step={1} value={el.x} onChange={(v) => updateElement(selected, { x: v })} />
      <NumSlider lbl="رأسي Y" min={-60} max={60} step={1} value={el.y} onChange={(v) => updateElement(selected, { y: v })} />
      <NumSlider lbl="حجم" min={0.4} max={2.5} step={0.05} value={el.scale} onChange={(v) => updateElement(selected, { scale: v })} />
      <NumSlider lbl="شفافية" min={0.2} max={1} step={0.05} value={el.opacity} onChange={(v) => updateElement(selected, { opacity: v })} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
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

      <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />

      {/* Alignment */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>محاذاة</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
        {[
          { lbl: 'توسيط أفقي', fn: () => alignCenterH(selected) },
          { lbl: 'توسيط رأسي', fn: () => alignCenterV(selected) },
          { lbl: 'للأمام', fn: () => bringForward(selected) },
          { lbl: 'للخلف', fn: () => sendBackward(selected) },
        ].map(({ lbl, fn }) => (
          <button
            key={lbl}
            type="button"
            onClick={fn}
            style={{
              padding: '4px 0',
              borderRadius: 5,
              border: '1px solid #e2e8f0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Reset */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => resetElement('signature')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #3b82f644', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#3b82f6' }}
        >
          إعادة ضبط التوقيع
        </button>
        <button
          type="button"
          onClick={() => resetElement('stamp')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #10b98144', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#10b981' }}
        >
          إعادة ضبط الختم
        </button>
        <button
          type="button"
          onClick={resetDoc}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#64748b' }}
        >
          إعادة ضبط {docLabel}
        </button>
      </div>

      {/* Keyboard hint */}
      <div style={{
        fontSize: 10,
        color: '#94a3b8',
        background: '#f8fafc',
        padding: '6px 8px',
        borderRadius: 6,
        lineHeight: 1.7,
        marginBottom: 12,
      }}>
        ← → ↑ ↓ للتحريك — Shift+سهم: 10 وحدات<br />
        Ctrl+Z تراجع — Ctrl+Shift+Z إعادة
      </div>

      {/* Error */}
      {saveError && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠️ {saveError}</div>
      )}

      {/* Save / Cancel */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'none',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            padding: '8px 0',
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
          {saving ? '⏳' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
