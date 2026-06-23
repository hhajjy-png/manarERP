import { useRef } from 'react';
import type { LayoutDesignerHandle } from '../hooks/useLayoutDesigner';
import type { BrandingDesignerHandle } from '../hooks/useBrandingDesigner';
import type { TextStyleDesignerHandle } from '../designer/useTextStyleDesigner';
import { getLayoutElement } from '../designer/layoutOverrideUtils';
import { LAYOUT_ELEMENT_LABELS } from '../designer/layoutOverrideTypes';
import { pxToMm, mmToPx, formatUnit, GRID_PRESETS, type GridSizeOption } from '../utils/designerUtils';

// ─── Sub-components ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <label style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'end', flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );
}

function Slider({ min, max, step, value, onChange }: {
  min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <input type="number" min={min} max={max} step={step} value={formatUnit(value)}
        onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onChange(v); }}
        style={{ width: 48, fontSize: 11, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 3px' }} />
    </>
  );
}

function IconBtn({ title, onClick, disabled, active, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} style={{
      padding: '4px 8px', borderRadius: 5, border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: active ? '#ddd6fe' : '#f1f5f9', color: active ? '#7c3aed' : '#374151',
      fontSize: 12, opacity: disabled ? 0.4 : 1,
    }}>
      {children}
    </button>
  );
}

function SectionHdr({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 6, marginTop: 12, paddingBottom: 4,
      borderBottom: '1px solid #f1f5f9',
    }}>
      {label}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

interface Props {
  layoutDesigner: LayoutDesignerHandle;
  designer: BrandingDesignerHandle; // for zoom/grid/snap controls
  textStyleDesigner?: TextStyleDesignerHandle;
  docLabel: string;
  onClose: () => void;
  onSave?: () => Promise<void>;
}

export default function LayoutDesignerPanel({
  layoutDesigner,
  designer,
  textStyleDesigner,
  docLabel,
  onClose,
  onSave,
}: Props) {
  const {
    selectedIds, layouts, docType, updateElement,
    resetElement, lockSelected, unlockSelected, hideSelected, showSelected,
    copySelected, paste, duplicateSelected,
    alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV,
    canUndo, canRedo, undo, redo,
    exportLayout, importLayout,
    isDirty, saving, saveError, save,
  } = layoutDesigner;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSelection = selectedIds.size > 0;
  const singleId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const singleEl = singleId ? getLayoutElement(layouts[docType], singleId) : null;

  function handleImportClick() { fileInputRef.current?.click(); }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) importLayout(file);
    e.target.value = '';
  }

  const PANEL_W = 240;

  return (
    <div style={{
      position: 'fixed', top: 80, insetInlineEnd: 12,
      width: PANEL_W, background: '#fff', borderRadius: 10,
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
      padding: '12px 14px', direction: 'rtl',
      maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      zIndex: 2000, fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>تصميم التخطيط — {docLabel}</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
      </div>

      {/* Undo / Redo */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <IconBtn title="تراجع (Ctrl+Z)" onClick={undo} disabled={!canUndo}>↩</IconBtn>
        <IconBtn title="إعادة (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>↪</IconBtn>
      </div>

      {/* Selection info */}
      {singleId && (
        <>
          <SectionHdr label="العنصر المحدد" />
          <div style={{ marginBottom: 8, fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
            {LAYOUT_ELEMENT_LABELS[singleId] ?? singleId}
          </div>
        </>
      )}
      {selectedIds.size > 1 && (
        <>
          <SectionHdr label="عناصر محددة" />
          <div style={{ marginBottom: 8, color: '#7c3aed', fontWeight: 600 }}>{selectedIds.size} عناصر</div>
        </>
      )}

      {/* Position & Transform — single selection only */}
      {singleEl && singleId && (
        <>
          <SectionHdr label="الموضع والحجم" />
          <Row label="X (mm)">
            <Slider min={-400} max={400} step={0.5}
              value={pxToMm(singleEl.x)}
              onChange={(v) => updateElement(singleId, { x: mmToPx(v) })} />
          </Row>
          <Row label="Y (mm)">
            <Slider min={-600} max={600} step={0.5}
              value={pxToMm(singleEl.y)}
              onChange={(v) => updateElement(singleId, { y: mmToPx(v) })} />
          </Row>
          <Row label="دوران°">
            <Slider min={-180} max={180} step={1}
              value={singleEl.rotation}
              onChange={(v) => updateElement(singleId, { rotation: v })} />
          </Row>
          <Row label="عرض×">
            <Slider min={0.1} max={3} step={0.05}
              value={singleEl.scaleX}
              onChange={(v) => updateElement(singleId, { scaleX: v })} />
          </Row>
          <Row label="ارتفاع×">
            <Slider min={0.1} max={3} step={0.05}
              value={singleEl.scaleY}
              onChange={(v) => updateElement(singleId, { scaleY: v })} />
          </Row>
          <Row label="شفافية">
            <Slider min={0.1} max={1} step={0.05}
              value={singleEl.opacity}
              onChange={(v) => updateElement(singleId, { opacity: v })} />
          </Row>
          <Row label="طبقة">
            <Slider min={1} max={20} step={1}
              value={singleEl.zIndex}
              onChange={(v) => updateElement(singleId, { zIndex: Math.round(v) })} />
          </Row>
        </>
      )}

      {/* Ops for selection */}
      {hasSelection && (
        <>
          <SectionHdr label="العمليات" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            <IconBtn title="نسخ (Ctrl+C)" onClick={copySelected}>📋 نسخ</IconBtn>
            <IconBtn title="لصق (Ctrl+V)" onClick={paste}>📌 لصق</IconBtn>
            <IconBtn title="تكرار (Ctrl+D)" onClick={duplicateSelected}>⧉ تكرار</IconBtn>
            <IconBtn title="إخفاء" onClick={hideSelected}>👁‍🗨 إخفاء</IconBtn>
            <IconBtn title="إظهار" onClick={showSelected}>👁 إظهار</IconBtn>
            <IconBtn title="قفل" onClick={lockSelected}>🔒 قفل</IconBtn>
            <IconBtn title="فتح" onClick={unlockSelected}>🔓 فتح</IconBtn>
            {singleId && <IconBtn title="إعادة ضبط" onClick={() => resetElement(singleId)}>↺ ضبط</IconBtn>}
          </div>

          <SectionHdr label="المحاذاة" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            <IconBtn title="محاذاة يساراً" onClick={() => alignLeft()}>⇤</IconBtn>
            <IconBtn title="توسيط أفقي" onClick={() => alignCenterH(794)}>↔</IconBtn>
            <IconBtn title="محاذاة يميناً" onClick={() => alignRight(794)}>⇥</IconBtn>
            <IconBtn title="محاذاة أعلى" onClick={() => alignTop()}>⇡</IconBtn>
            <IconBtn title="توسيط رأسي" onClick={() => alignCenterV(1123)}>↕</IconBtn>
            <IconBtn title="محاذاة أسفل" onClick={() => alignBottom(1123)}>⇣</IconBtn>
          </div>
        </>
      )}

      {/* Grid / Snap (from branding designer shared state) */}
      <SectionHdr label="الشبكة" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <IconBtn title="إظهار الشبكة" onClick={() => layoutDesigner.setShowGrid(!layoutDesigner.showGrid)} active={layoutDesigner.showGrid}>
          ⊞ شبكة
        </IconBtn>
        <IconBtn title="محاذاة للشبكة" onClick={() => layoutDesigner.setSnapEnabled(!layoutDesigner.snapEnabled)} active={layoutDesigner.snapEnabled}>
          ◫ مغناطيس
        </IconBtn>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {([1, 2, 5, 10] as GridSizeOption[]).map((s) => (
          <button key={s} type="button" onClick={() => layoutDesigner.setGridSize(s)}
            style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 11,
              border: 'none', cursor: 'pointer',
              background: layoutDesigner.gridSize === s ? '#ddd6fe' : '#f1f5f9',
              color: layoutDesigner.gridSize === s ? '#7c3aed' : '#374151',
            }}>
            {s}px
          </button>
        ))}
      </div>

      {/* Import / Export */}
      <SectionHdr label="استيراد / تصدير" />
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <IconBtn title="تصدير التخطيط JSON" onClick={exportLayout}>⬇ تصدير</IconBtn>
        <IconBtn title="استيراد تخطيط JSON" onClick={handleImportClick}>⬆ استيراد</IconBtn>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Save / Cancel */}
      {saveError && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 6 }}>⚠ {saveError}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onClose}
          style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid #d1d5db', background: 'none', cursor: 'pointer', fontSize: 12 }}>
          إغلاق
        </button>
        <button type="button" onClick={onSave ?? save} disabled={saving}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
            background: isDirty ? '#7c3aed' : '#9ca3af',
            color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600,
          }}>
          {saving ? '...' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
