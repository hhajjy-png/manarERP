import { useState, useRef } from 'react';
import type { PrintDocumentType, PrintBrandingLayoutSettings, BrandingElementLayout } from '../engine/types';
import {
  BRANDING_LAYOUT_BOUNDS,
  DEFAULT_BRANDING_LAYOUT,
  ROTATION_MAX,
  ROTATION_MIN,
  clampBrandingElementLayout,
  applyBrandingElementStyle,
  getBrandingLayoutForDocument,
} from '../utils/brandingLayout';

interface Props {
  signatureUrl?: string;
  stampUrl?: string;
  initialLayout: PrintBrandingLayoutSettings;
  onSave: (layout: PrintBrandingLayoutSettings) => void;
  onClose: () => void;
}

const DOC_LABELS: Record<PrintDocumentType, string> = {
  invoice: 'الفاتورة',
  quotation: 'عرض السعر',
};

function Slider({
  label, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <label style={{ width: 60, fontSize: 12, color: 'var(--text-muted, #6b7280)', textAlign: 'end', flexShrink: 0 }}>{label}</label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        style={{ width: 60, fontSize: 12, textAlign: 'center', border: '1px solid var(--border, #d1d5db)', borderRadius: 4, padding: '2px 4px' }}
      />
    </div>
  );
}

export default function BrandingLayoutDesigner({ signatureUrl, stampUrl, initialLayout, onSave, onClose }: Props) {
  const [selectedDoc, setSelectedDoc] = useState<PrintDocumentType>('invoice');
  const [layout, setLayout] = useState<PrintBrandingLayoutSettings>(initialLayout);
  const [dragging, setDragging] = useState<'signature' | 'stamp' | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; ex: number; ey: number } | null>(null);

  const docLayout = getBrandingLayoutForDocument(layout, selectedDoc);

  function updateElement(type: 'signature' | 'stamp', patch: Partial<BrandingElementLayout>) {
    setLayout((prev) => ({
      ...prev,
      [selectedDoc]: {
        ...prev[selectedDoc],
        [type]: clampBrandingElementLayout({ ...prev[selectedDoc][type], ...patch }),
      },
    }));
  }

  function resetDoc() {
    setLayout((prev) => ({
      ...prev,
      [selectedDoc]: DEFAULT_BRANDING_LAYOUT[selectedDoc],
    }));
  }

  function handlePointerDown(e: React.PointerEvent, type: 'signature' | 'stamp') {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      mx: e.clientX, my: e.clientY,
      ex: docLayout[type].x, ey: docLayout[type].y,
    };
    setDragging(type);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    updateElement(dragging, {
      x: dragStartRef.current.ex + dx,
      y: dragStartRef.current.ey + dy,
    });
  }

  function handlePointerUp() {
    setDragging(null);
    dragStartRef.current = null;
  }

  const PREVIEW_W = 380;
  const PREVIEW_H = 240;

  function ElementPreview({ type }: { type: 'signature' | 'stamp' }) {
    const url = type === 'signature' ? signatureUrl : stampUrl;
    const el = docLayout[type];
    const label = type === 'signature' ? 'التوقيع' : 'الختم';
    const cssStyle = applyBrandingElementStyle(el);
    const borderColor = type === 'signature' ? '#3b82f6' : '#10b981';
    const isActive = dragging === type;

    return (
      <div
        onPointerDown={(ev) => handlePointerDown(ev, type)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute',
          left: '50%',
          top: '60%',
          cursor: isActive ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          outline: isActive ? `2px solid ${borderColor}` : `1px dashed ${borderColor}`,
          borderRadius: 4,
          padding: 2,
          ...cssStyle,
        }}
        title={`اسحب لتحريك ${label}`}
      >
        {url ? (
          <img
            src={url}
            alt={label}
            draggable={false}
            style={{ maxHeight: 48, maxWidth: 80, objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
          />
        ) : (
          <div style={{
            width: 72, height: 40, background: `${borderColor}22`, border: `1px dashed ${borderColor}`,
            borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: borderColor,
          }}>
            {label}
          </div>
        )}
      </div>
    );
  }

  function ControlPanel({ type }: { type: 'signature' | 'stamp' }) {
    const el = docLayout[type];
    const label = type === 'signature' ? 'التوقيع' : 'الختم';
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text, #111827)' }}>{label}</div>
        {/* المدى من الحدود المركزية — نفس ما يحكم السحب والمقابض ولوحة وضع التصميم،
            فلا يقصّ هذا الحوار موضعًا يسمح به المحرّر الآخر. */}
        <Slider label="أفقي" min={BRANDING_LAYOUT_BOUNDS.minX} max={BRANDING_LAYOUT_BOUNDS.maxX} step={1} value={el.x} onChange={(v) => updateElement(type, { x: v })} />
        <Slider label="رأسي" min={BRANDING_LAYOUT_BOUNDS.minY} max={BRANDING_LAYOUT_BOUNDS.maxY} step={1} value={el.y} onChange={(v) => updateElement(type, { y: v })} />
        <Slider label="حجم" min={BRANDING_LAYOUT_BOUNDS.minScale} max={BRANDING_LAYOUT_BOUNDS.maxScale} step={0.05} value={el.scale} onChange={(v) => updateElement(type, { scale: v })} />
        <Slider label="شفافية" min={0.2} max={1} step={0.05} value={el.opacity} onChange={(v) => updateElement(type, { opacity: v })} />
        {/* الدوران هنا هو نفسه الذي يحرّره وضع التصميم — الحقل ذاته في السجل ذاته. وجوده
            في هذا الحوار يمنع محرّرًا يعرض الزاوية ولا يستطيع تعديلها. زر ↺ يكتب
            `undefined` لا 0، فيُحذف المفتاح ويعود العنصر إلى حالة "لم يُدوَّر قط". */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Slider
              label="دوران °"
              min={ROTATION_MIN}
              max={ROTATION_MAX}
              step={1}
              value={el.rotation ?? 0}
              onChange={(v) => updateElement(type, { rotation: v })}
            />
          </div>
          <button
            type="button"
            onClick={() => updateElement(type, { rotation: undefined })}
            title="إعادة الدوران إلى 0°"
            aria-label="إعادة الدوران إلى 0°"
            style={{
              flexShrink: 0, marginBottom: 8, padding: '3px 6px', borderRadius: 5,
              fontSize: 11, border: '1px solid var(--border, #d1d5db)',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-muted, #6b7280)',
            }}
          >
            ↺ 0°
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>الطبقة</span>
          {[1, 2].map((z) => (
            <label key={z} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name={`zIndex-${type}`} checked={el.zIndex === z} onChange={() => updateElement(type, { zIndex: z })} />
              {z === 1 ? 'خلف' : 'أمام'}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="معايرة التوقيع والختم"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        borderRadius: 12, padding: 24, width: 680, maxWidth: '95vw', maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        direction: 'rtl',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>معايرة موضع التوقيع والختم</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted, #6b7280)', lineHeight: 1 }}>✕</button>
        </div>

        {/* Doc type tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(Object.keys(DOC_LABELS) as PrintDocumentType[]).map((doc) => (
            <button
              key={doc}
              type="button"
              onClick={() => setSelectedDoc(doc)}
              style={{
                padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: selectedDoc === doc ? 'var(--accent, #3b82f6)' : 'var(--bg-muted, #f3f4f6)',
                color: selectedDoc === doc ? '#fff' : 'var(--text-muted, #6b7280)',
              }}
            >
              {DOC_LABELS[doc]}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Preview area */}
          <div style={{
            width: PREVIEW_W, height: PREVIEW_H, flexShrink: 0,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
            position: 'relative', overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            {/* Mock page lines */}
            {[40, 60, 80, 100, 120, 140, 160].map((y) => (
              <div key={y} style={{ position: 'absolute', top: y, left: 20, right: 20, height: 1, background: '#f3f4f6' }} />
            ))}
            <div style={{ position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#9ca3af' }}>
              معاينة — {DOC_LABELS[selectedDoc]}
            </div>
            <ElementPreview type="signature" />
            <ElementPreview type="stamp" />
          </div>

          {/* Controls */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <ControlPanel type="signature" />
            <hr style={{ border: 'none', borderTop: '1px solid var(--border, #e5e7eb)', margin: '12px 0' }} />
            <ControlPanel type="stamp" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button
            type="button"
            onClick={resetDoc}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted, #6b7280)' }}
          >
            إعادة ضبط {DOC_LABELS[selectedDoc]}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'none', cursor: 'pointer', fontSize: 13 }}
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => onSave(layout)}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent, #3b82f6)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              حفظ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
