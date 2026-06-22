import { useRef, useEffect, useState } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import type { TextStyleDesignerHandle } from '../designer/useTextStyleDesigner';
import { getDesignerElementFromTarget } from '../designer/designerDom';
import { formatUnit } from '../utils/designerUtils';
import BrandingDesignerToolbar from './BrandingDesignerToolbar';

const RULER = 20;

type ElemRect = { x: number; y: number; w: number; h: number };

interface Props {
  designer: BrandingDesignerHandle;
  textStyleDesigner?: TextStyleDesignerHandle;
  signatureUrl?: string;
  stampUrl?: string;
  docLabel: string;
  children: React.ReactNode;
}

export default function BrandingDesignerOverlay({
  designer,
  textStyleDesigner,
  signatureUrl,
  stampUrl,
  docLabel,
  children,
}: Props) {
  const {
    isActive,
    effectiveZoom,
    showGrid,
    gridSize,
    selected,
    setSelected,
    isDragging,
    startDrag,
    continueDrag,
    endDrag,
    undo,
    redo,
    updateElement,
    resetElement,
    localLayout,
    docType,
    deactivate,
    setZoom,
    save,
    setFitWidthZoom,
    setFitPageZoom,
  } = designer;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  // ── Fit-zoom computation ──
  useEffect(() => {
    if (!isActive || !wrapperRef.current) return;
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const availW = Math.max(el.clientWidth - RULER - 32, 200);
      const availH = Math.max(el.clientHeight - RULER - 44 - 32, 200);
      setFitWidthZoom(Math.min(Math.max(availW / 794, 0.25), 2.0));
      setFitPageZoom(Math.min(Math.max(Math.min(availW / 794, availH / 1123), 0.25), 2.0));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Keyboard listener ──
  useEffect(() => {
    if (!isActive) return;
    const el = wrapperRef.current;
    if (!el) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); deactivate(); return; }
      if (e.key === 'Delete') { e.preventDefault(); resetElement(selected); return; }
      if (e.ctrlKey && (e.key === '0')) { e.preventDefault(); setZoom('fit-page'); return; }
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); undo(); return; }

      // Copy / Paste / Duplicate — reserved for Phase 5D+
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey) { e.preventDefault(); return; }
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V') && !e.shiftKey) { e.preventDefault(); return; }
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && !e.shiftKey) { e.preventDefault(); return; }

      const dirMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      };
      const dir = dirMap[e.key];
      if (!dir) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const current = localLayout[docType][selected];
      const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
      const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
      updateElement(selected, { x: current.x + dx, y: current.y + dy });
    }

    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [isActive, selected, undo, redo, updateElement, localLayout, docType, deactivate, resetElement, setZoom, save]);

  // Focus overlay wrapper
  useEffect(() => {
    if (isActive) wrapperRef.current?.focus();
  }, [isActive]);

  // ── Branding element rects ──
  const [sigRect, setSigRect] = useState<ElemRect | null>(null);
  const [stampRect, setStampRect] = useState<ElemRect | null>(null);
  const [hoveredType, setHoveredType] = useState<ElementType | null>(null);

  useEffect(() => {
    if (!isActive || !docRef.current) return;
    const container = docRef.current;

    function findRect(selector: string): ElemRect | null {
      const el = container.querySelector(selector);
      if (!el) return null;
      const cr = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    }

    setSigRect(findRect('[data-designer-type="branding"][data-designer-id="signature"], [data-bd-type="signature"]'));
    setStampRect(findRect('[data-designer-type="branding"][data-designer-id="stamp"], [data-bd-type="stamp"]'));
  }, [isActive, localLayout, effectiveZoom]);

  // ── Text area rect tracking ──
  const [textAreaRect, setTextAreaRect] = useState<ElemRect | null>(null);

  useEffect(() => {
    if (!isActive || !textStyleDesigner?.selectedArea || !docRef.current) {
      setTextAreaRect(null);
      return;
    }
    const container = docRef.current;
    const areaId = textStyleDesigner.selectedArea;
    const el = container.querySelector(`[data-designer-id="${areaId}"]`);
    if (!el) { setTextAreaRect(null); return; }
    const cr = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTextAreaRect({ x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, textStyleDesigner?.selectedArea, effectiveZoom]);

  // ── Click on doc canvas to pick text areas ──
  function handleDocClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isDragging) return;
    const element = getDesignerElementFromTarget(e.target as HTMLElement);
    if (element?.kind === 'text' && textStyleDesigner) {
      textStyleDesigner.setSelectedArea(element.id);
      e.stopPropagation();
    }
  }

  // ── DragHandle ──
  function DragHandle({ type, rect }: { type: ElementType; rect: ElemRect }) {
    const isSel = selected === type && textStyleDesigner?.selectedArea === null;
    const isHovered = hoveredType === type && !isSel;
    const isThisDragging = isDragging && designer.selected === type;

    return (
      <div
        data-bd-handle={type}
        title={`اسحب لتحريك ${type === 'signature' ? 'التوقيع' : 'الختم'}`}
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: Math.max(rect.w, 16),
          height: Math.max(rect.h, 16),
          border: isSel
            ? '2px solid #3b82f6'
            : isHovered
            ? '1.5px dashed #93c5fd'
            : '2px solid transparent',
          boxShadow: isSel ? '0 0 0 4px rgba(59,130,246,0.15)' : 'none',
          borderRadius: 3,
          cursor: isThisDragging ? 'grabbing' : 'grab',
          boxSizing: 'border-box',
          zIndex: 1000,
          touchAction: 'none',
          pointerEvents: 'all',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}
        onMouseEnter={() => setHoveredType(type)}
        onMouseLeave={() => setHoveredType(null)}
        onClick={(e) => { e.stopPropagation(); setSelected(type); textStyleDesigner?.setSelectedArea(null); }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setSelected(type);
          textStyleDesigner?.setSelectedArea(null);
          startDrag(type, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (isDragging && designer.selected === type) continueDrag(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          endDrag();
        }}
        onPointerCancel={(e) => {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          endDrag();
        }}
      >
        {isSel && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => {
          const [v, h] = pos.split('-') as ['top' | 'bottom', 'left' | 'right'];
          return (
            <div key={pos} style={{
              position: 'absolute', [v]: -4, [h]: -4,
              width: 8, height: 8,
              background: '#3b82f6', border: '1.5px solid #fff', borderRadius: 2, zIndex: 2,
            }} />
          );
        })}
        {isSel && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6, height: 6,
            background: '#3b82f6', border: '1.5px solid #fff', borderRadius: '50%', zIndex: 2,
          }} />
        )}
      </div>
    );
  }

  if (!isActive) return <>{children}</>;

  const scaledWidth = Math.round(794 * effectiveZoom);
  const scaledHeight = Math.round(1123 * effectiveZoom);
  const el = localLayout[docType][selected];
  const hasAnyImage = !!(signatureUrl || stampUrl);
  const selectedTextArea = textStyleDesigner?.selectedArea ?? null;

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      style={{ outline: 'none', background: '#e2e8f0', display: 'flex', flexDirection: 'column' } as React.CSSProperties}
      className="no-print"
    >
      {/* Toolbar */}
      <BrandingDesignerToolbar designer={designer} docLabel={docLabel} onClose={deactivate} />

      {/* Corner + top ruler row */}
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <div style={{
          width: RULER, height: RULER, flexShrink: 0,
          background: '#f8fafc', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1',
        }} />
        <div style={{
          flex: 1, height: RULER, background: '#f8fafc',
          borderBottom: '1px solid #cbd5e1', position: 'relative', overflow: 'hidden',
        }}>
          {Array.from({ length: Math.ceil(scaledWidth / 50) + 1 }).map((_, i) => {
            const px = i * 50;
            const unit = Math.round(px / effectiveZoom);
            return (
              <div key={px} style={{ position: 'absolute', left: px, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 1, height: 6, background: '#94a3b8' }} />
                <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1, whiteSpace: 'nowrap' }}>{unit}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Left ruler + scaled document */}
      <div style={{ display: 'flex', overflow: 'auto', flex: 1, maxHeight: 'calc(100vh - 188px)' }}>
        {/* Left ruler */}
        <div style={{ width: RULER, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #cbd5e1', position: 'relative' }}>
          {Array.from({ length: Math.ceil(scaledHeight / 50) + 1 }).map((_, i) => {
            const py = i * 50;
            const unit = Math.round(py / effectiveZoom);
            return (
              <div key={py} style={{ position: 'absolute', top: py, left: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 6, height: 1, background: '#94a3b8', flexShrink: 0 }} />
                <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1, whiteSpace: 'nowrap', marginLeft: 1 }}>{unit}</span>
              </div>
            );
          })}
        </div>

        {/* Document area */}
        <div style={{ padding: 16, flex: 1 }}>
          {!hasAnyImage && (
            <div style={{
              marginBottom: 12, padding: '10px 16px',
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
              fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span>لم يتم رفع صورة توقيع أو ختم بعد. أضفها من <strong>الإعدادات ← الطباعة</strong> ثم عد لتعديل المواضع.</span>
            </div>
          )}

          <div style={{ position: 'relative', width: scaledWidth, height: scaledHeight, flexShrink: 0 }}>
            {/* Scaled document with text click handler */}
            <div
              ref={docRef}
              onClick={handleDocClick}
              style={{
                position: 'absolute', top: 0, left: 0,
                transform: `scale(${effectiveZoom})`,
                transformOrigin: 'top left',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                borderRadius: 1,
              }}
            >
              {children}
            </div>

            {/* Grid overlay */}
            {showGrid && (
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
                {(() => {
                  const g = Math.max(gridSize, 1) * effectiveZoom;
                  const lines: React.ReactNode[] = [];
                  for (let x = 0; x <= scaledWidth; x += g)
                    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={scaledHeight} stroke="#94a3b850" strokeWidth={0.5} />);
                  for (let y = 0; y <= scaledHeight; y += g)
                    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={scaledWidth} y2={y} stroke="#94a3b850" strokeWidth={0.5} />);
                  return lines;
                })()}
              </svg>
            )}

            {/* Branding + text selection overlays */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
              {sigRect && <DragHandle type="signature" rect={sigRect} />}
              {stampRect && <DragHandle type="stamp" rect={stampRect} />}

              {/* Text area selection highlight */}
              {selectedTextArea && textAreaRect && (
                <div style={{
                  position: 'absolute',
                  left: textAreaRect.x,
                  top: textAreaRect.y,
                  width: textAreaRect.w,
                  height: Math.max(textAreaRect.h, 4),
                  border: '2px solid #f59e0b',
                  boxShadow: '0 0 0 4px rgba(245,158,11,0.15)',
                  borderRadius: 2,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  zIndex: 1001,
                  transition: 'all 0.12s',
                }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '4px 14px', background: '#f1f5f9',
        borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
        flexShrink: 0, direction: 'rtl', flexWrap: 'wrap',
      }}>
        {selectedTextArea ? (
          <span style={{ fontWeight: 600, color: '#f59e0b' }}>
            📝 {selectedTextArea.split('.').pop()}
          </span>
        ) : (
          <span style={{ fontWeight: 600, color: selected === 'signature' ? '#3b82f6' : '#10b981' }}>
            {selected === 'signature' ? '✏ التوقيع' : '🔵 الختم'}
          </span>
        )}
        <span style={{ color: '#94a3b8' }}>|</span>
        {!selectedTextArea && (
          <>
            <span>X: <strong>{formatUnit(el.x)}</strong></span>
            <span>Y: <strong>{formatUnit(el.y)}</strong></span>
            <span>حجم: <strong>{formatUnit(el.scale)}×</strong></span>
            <span style={{ color: '#94a3b8' }}>|</span>
          </>
        )}
        <span>
          تكبير:{' '}
          <strong>
            {designer.zoom === 'fit-width' ? 'ملاءمة عرض'
              : designer.zoom === 'fit-page' ? 'ملاءمة صفحة'
              : `${Math.round(effectiveZoom * 100)}%`}
          </strong>
        </span>
        {designer.snapEnabled && <span>محاذاة: <strong>{designer.gridSize}</strong></span>}
        <span style={{ marginInlineStart: 'auto', color: '#94a3b8' }}>
          انقر نصاً لتعديله · Esc إغلاق · Ctrl+0 ملاءمة
        </span>
      </div>
    </div>
  );
}
