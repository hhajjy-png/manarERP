import { useRef, useEffect, useState } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';

const RULER = 20;

interface Props {
  designer: BrandingDesignerHandle;
  children: React.ReactNode;
}

export default function BrandingDesignerOverlay({ designer, children }: Props) {
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
    localLayout,
    docType,
  } = designer;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  // ── Keyboard listener ──
  useEffect(() => {
    if (!isActive) return;
    const el = wrapperRef.current;
    if (!el) return;

    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); undo(); return; }

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
  }, [isActive, selected, undo, redo, updateElement, localLayout, docType]);

  // ── Drag handle positions (read from DOM after layout changes) ──
  const [sigPos, setSigPos] = useState<{ x: number; y: number } | null>(null);
  const [stampPos, setStampPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isActive || !docRef.current) return;
    const container = docRef.current;

    function findHandlePos(type: ElementType) {
      const el = container.querySelector(`[data-bd-type="${type}"]`);
      if (!el) return null;
      const containerRect = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      };
    }

    setSigPos(findHandlePos('signature'));
    setStampPos(findHandlePos('stamp'));
  }, [isActive, localLayout, effectiveZoom]);

  // ── Drag handle component ──
  function DragHandle({ type, pos }: { type: ElementType; pos: { x: number; y: number } }) {
    const isSelected = selected === type;
    const color = type === 'signature' ? '#3b82f6' : '#10b981';
    const label = type === 'signature' ? 'التوقيع' : 'الختم';

    return (
      <div
        data-bd-handle={type}
        title={`اسحب لتحريك ${label}`}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -50%)',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: isSelected ? color : `${color}88`,
          border: `2px solid ${color}`,
          cursor: isDragging && type === designer.selected ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: '#fff',
          fontWeight: 700,
          zIndex: 1000,
          boxShadow: isSelected ? `0 0 0 3px ${color}44` : 'none',
          userSelect: 'none',
          touchAction: 'none',
          pointerEvents: 'all',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setSelected(type);
          startDrag(type, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (isDragging && designer.selected === type) {
            continueDrag(e.clientX, e.clientY);
          }
        }}
        onPointerUp={() => endDrag()}
      >
        ✥
      </div>
    );
  }

  if (!isActive) {
    return <>{children}</>;
  }

  const scaledWidth = Math.round(794 * effectiveZoom);
  const scaledHeight = Math.round(1123 * effectiveZoom);

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      style={{ outline: 'none', background: '#e2e8f0', overflowAuto: 'auto' } as React.CSSProperties}
      className="no-print"
    >
      {/* Corner + top ruler row */}
      <div style={{ display: 'flex' }}>
        <div style={{
          width: RULER, height: RULER, flexShrink: 0,
          background: '#f8fafc',
          borderRight: '1px solid #cbd5e1',
          borderBottom: '1px solid #cbd5e1',
        }} />
        <div style={{ flex: 1, height: RULER, background: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'relative', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', overflow: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
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
          <div
            style={{
              position: 'relative',
              width: scaledWidth,
              height: scaledHeight,
              flexShrink: 0,
            }}
          >
            {/* Scaled document */}
            <div
              ref={docRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${effectiveZoom})`,
                transformOrigin: 'top left',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
              }}
            >
              {children}
            </div>

            {/* Grid overlay (rendered over the scaled wrapper so it matches visual pixels) */}
            {showGrid && (
              <svg
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
                xmlns="http://www.w3.org/2000/svg"
              >
                {(() => {
                  const g = Math.max(gridSize, 1) * effectiveZoom;
                  const lines: React.ReactNode[] = [];
                  for (let x = 0; x <= scaledWidth; x += g) {
                    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={scaledHeight} stroke="#94a3b840" strokeWidth={0.5} />);
                  }
                  for (let y = 0; y <= scaledHeight; y += g) {
                    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={scaledWidth} y2={y} stroke="#94a3b840" strokeWidth={0.5} />);
                  }
                  return lines;
                })()}
              </svg>
            )}

            {/* Drag handles (positioned in scaled-document pixel space) */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
              {sigPos && <DragHandle type="signature" pos={sigPos} />}
              {stampPos && <DragHandle type="stamp" pos={stampPos} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
