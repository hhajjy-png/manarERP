import { useRef, useEffect, useState, useCallback } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import type { LayoutDesignerHandle, ResizeHandle } from '../hooks/useLayoutDesigner';
import type { TextStyleDesignerHandle } from '../designer/useTextStyleDesigner';
import type { StaticTextDesignerHandle } from '../designer/useStaticTextDesigner';
import type { StaticTextKey } from '../designer/staticTextTypes';
import { getDesignerElementFromTarget } from '../designer/designerDom';
import { formatUnit, pxToMm, computeSmartGuides, type GuideLine, type ElementRect } from '../utils/designerUtils';
import { LAYOUT_ELEMENT_LABELS } from '../designer/layoutOverrideTypes';
import { getLayoutElement } from '../designer/layoutOverrideUtils';
import BrandingDesignerToolbar from './BrandingDesignerToolbar';
import SmartGuides from './SmartGuides';
import InlineTextEditor from '../designer/InlineTextEditor';

const RULER = 24; // px
const A4_W = 794;
const A4_H = 1123;
// Resize handle size
const RH = 8;

type ElemRect = { x: number; y: number; w: number; h: number };

interface Props {
  layoutDesigner: LayoutDesignerHandle;
  designer: BrandingDesignerHandle; // branding sub-system (sig/stamp)
  textStyleDesigner?: TextStyleDesignerHandle;
  staticTextDesigner?: StaticTextDesignerHandle;
  signatureUrl?: string;
  stampUrl?: string;
  docLabel: string;
  onSave?: () => Promise<void>;
  children: React.ReactNode;
}

// Resize handle positions for a rect
const RESIZE_HANDLES: { key: ResizeHandle; cx: (r: ElemRect) => number; cy: (r: ElemRect) => number }[] = [
  { key: 'top-left',     cx: (r) => r.x,              cy: (r) => r.y },
  { key: 'top',          cx: (r) => r.x + r.w / 2,    cy: (r) => r.y },
  { key: 'top-right',    cx: (r) => r.x + r.w,        cy: (r) => r.y },
  { key: 'right',        cx: (r) => r.x + r.w,        cy: (r) => r.y + r.h / 2 },
  { key: 'bottom-right', cx: (r) => r.x + r.w,        cy: (r) => r.y + r.h },
  { key: 'bottom',       cx: (r) => r.x + r.w / 2,    cy: (r) => r.y + r.h },
  { key: 'bottom-left',  cx: (r) => r.x,              cy: (r) => r.y + r.h },
  { key: 'left',         cx: (r) => r.x,              cy: (r) => r.y + r.h / 2 },
];

const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  'top-left': 'nw-resize', 'top': 'n-resize', 'top-right': 'ne-resize',
  'right': 'e-resize', 'bottom-right': 'se-resize', 'bottom': 's-resize',
  'bottom-left': 'sw-resize', 'left': 'w-resize',
};

export default function UniversalDesignerOverlay({
  layoutDesigner,
  designer,
  textStyleDesigner,
  staticTextDesigner,
  signatureUrl,
  stampUrl,
  docLabel,
  onSave,
  children,
}: Props) {
  const {
    isActive, effectiveZoom, showGrid, gridSize, deactivate, save,
    setZoom, setFitWidthZoom, setFitPageZoom,
    selectedIds, selectOne, addToSelection, clearSelection, isSelected,
    isDragging, startDrag, continueDrag, endDrag,
    isResizing, startResize, continueResize, endResize,
    isRotating, startRotate, continueRotate, endRotate,
    updateElement, resetElement,
    undo, redo, canUndo, canRedo,
    layouts, docType,
    copySelected, paste, duplicateSelected,
    lockSelected, unlockSelected, hideSelected, showSelected,
    importLayout, exportLayout,
  } = layoutDesigner;

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
      setFitWidthZoom(Math.min(Math.max(availW / A4_W, 0.25), 2.0));
      setFitPageZoom(Math.min(Math.max(Math.min(availW / A4_W, availH / A4_H), 0.25), 2.0));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Layout element rects (detected from DOM) ──
  const [elemRects, setElemRects] = useState<Record<string, ElemRect>>({});
  const [sigRect, setSigRect] = useState<ElemRect | null>(null);
  const [stampRect, setStampRect] = useState<ElemRect | null>(null);

  const updateRects = useCallback(() => {
    if (!isActive || !docRef.current) return;
    const container = docRef.current;
    const cr = container.getBoundingClientRect();
    const rects: Record<string, ElemRect> = {};

    // Layout elements: any element with data-designer-id (except table internals)
    const skip = new Set(['invoice.tableHeader', 'invoice.lineItem', 'invoice.totals',
      'quotation.tableHeader', 'quotation.lineItem', 'quotation.totals']);
    const els = container.querySelectorAll<HTMLElement>('[data-designer-id]');
    els.forEach((el) => {
      const id = el.getAttribute('data-designer-id') ?? '';
      if (skip.has(id)) return;
      if (el.getAttribute('data-designer-type') === 'branding') return; // handled separately
      const r = el.getBoundingClientRect();
      rects[id] = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    });
    setElemRects(rects);

    // Branding
    const findRect = (sel: string): ElemRect | null => {
      const el = container.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    };
    setSigRect(findRect('[data-bd-type="signature"],[data-designer-id="signature"][data-designer-type="branding"]'));
    setStampRect(findRect('[data-bd-type="stamp"],[data-designer-id="stamp"][data-designer-type="branding"]'));
  }, [isActive]);

  useEffect(() => { updateRects(); }, [isActive, layouts, effectiveZoom, updateRects]);

  // ── Text area rect ──
  const [textAreaRect, setTextAreaRect] = useState<ElemRect | null>(null);
  useEffect(() => {
    if (!isActive || !textStyleDesigner?.selectedArea || !docRef.current) { setTextAreaRect(null); return; }
    const el = docRef.current.querySelector(`[data-designer-id="${textStyleDesigner.selectedArea}"]`);
    if (!el) { setTextAreaRect(null); return; }
    const cr = docRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTextAreaRect({ x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, textStyleDesigner?.selectedArea, effectiveZoom]);

  // ── Inline text editor rect ──
  const [editingTextRect, setEditingTextRect] = useState<ElemRect | null>(null);
  useEffect(() => { if (!staticTextDesigner?.editingKey) setEditingTextRect(null); }, [staticTextDesigner?.editingKey]);

  // ── Smart guides state ──
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);

  // Compute guides during drag
  useEffect(() => {
    if (!isDragging) { setGuideLines([]); return; }
    const movingRects = [...selectedIds].map((id) => elemRects[id]).filter(Boolean) as ElemRect[];
    const staticRects = Object.entries(elemRects)
      .filter(([id]) => !selectedIds.has(id))
      .map(([, r]) => r);
    const result = computeSmartGuides(movingRects, staticRects, A4_W * effectiveZoom, A4_H * effectiveZoom, 6);
    setGuideLines(result.lines);
  }, [isDragging, selectedIds, elemRects, effectiveZoom]);

  // ── Keyboard handler ──
  useEffect(() => {
    if (!isActive) return;
    const el = wrapperRef.current;
    if (!el) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); deactivate(); return; }
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); setZoom('fit-page'); return; }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); return; }
      if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (e.ctrlKey && e.key === 'v') { e.preventDefault(); paste(); return; }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (e.key === 'Delete') {
        e.preventDefault();
        for (const id of selectedIds) resetElement(id);
        return;
      }

      const dirMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      };
      const dir = dirMap[e.key];
      if (!dir) return;
      e.preventDefault();
      // Shift = 10px, Alt = 0.5px, default = 1px
      const step = e.shiftKey ? 10 : e.altKey ? 0.5 : 1;
      const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
      const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
      for (const id of selectedIds) {
        const el_ = getLayoutElement(layouts[docType], id);
        updateElement(id, { x: el_.x + dx, y: el_.y + dy });
      }
    }

    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [isActive, selectedIds, undo, redo, updateElement, layouts, docType, deactivate, setZoom, save, copySelected, paste, duplicateSelected, resetElement]);

  useEffect(() => { if (isActive) wrapperRef.current?.focus(); }, [isActive]);

  // ── Click on doc to pick elements ──
  function handleDocClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isDragging || isResizing || isRotating) return;
    const element = getDesignerElementFromTarget(e.target as HTMLElement);
    if (element?.kind === 'text' && textStyleDesigner) {
      textStyleDesigner.setSelectedArea(element.id);
      clearSelection();
      e.stopPropagation();
      return;
    }
    if (!element) {
      clearSelection();
      textStyleDesigner?.setSelectedArea(null);
    }
  }

  function handleDocDblClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!staticTextDesigner) return;
    const el = (e.target as HTMLElement).closest('[data-designer-editable="true"]') as HTMLElement | null;
    if (!el) return;
    const key = el.getAttribute('data-designer-key') as StaticTextKey | null;
    if (!key) return;
    const container = docRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setEditingTextRect({ x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
    staticTextDesigner.startEdit(key, el.textContent?.trim() ?? '');
    e.stopPropagation();
  }

  // ── Render ──
  if (!isActive) return <>{children}</>;

  const scaledW = Math.round(A4_W * effectiveZoom);
  const scaledH = Math.round(A4_H * effectiveZoom);
  const selectedTextArea = textStyleDesigner?.selectedArea ?? null;

  // Branding drag handle sub-component (preserve existing behavior)
  function BrandingDragHandle({ type, rect }: { type: ElementType; rect: ElemRect }) {
    const isSel = designer.selected === type && !selectedTextArea;
    return (
      <div
        data-bd-handle={type}
        style={{
          position: 'absolute', left: rect.x, top: rect.y,
          width: Math.max(rect.w, 16), height: Math.max(rect.h, 16),
          border: isSel ? '2px solid #3b82f6' : '2px solid transparent',
          boxShadow: isSel ? '0 0 0 4px rgba(59,130,246,0.15)' : 'none',
          borderRadius: 3, cursor: 'grab', boxSizing: 'border-box', zIndex: 1000,
          touchAction: 'none', pointerEvents: 'all',
        }}
        onClick={(e) => { e.stopPropagation(); designer.setSelected(type); textStyleDesigner?.setSelectedArea(null); }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          designer.setSelected(type);
          designer.startDrag(type, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (designer.isDragging && designer.selected === type) designer.continueDrag(e.clientX, e.clientY); }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); designer.endDrag(); }}
        onPointerCancel={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); designer.endDrag(); }}
      >
        {isSel && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => {
          const [v, h] = pos.split('-') as ['top' | 'bottom', 'left' | 'right'];
          return <div key={pos} style={{ position: 'absolute', [v]: -4, [h]: -4, width: 8, height: 8, background: '#3b82f6', border: '1.5px solid #fff', borderRadius: 2 }} />;
        })}

        {/* Rotation handle — same gesture as the layout elements' one directly below, but
            driving the BRANDING designer's angle. It lives in this overlay layer, outside
            the document's own transform tree, so nothing it measures is affected by the
            rotation it applies. `rect` is the image's axis-aligned box, whose centre is
            the true pivot under `transform-origin: center` at any angle. */}
        {isSel && (
          <div
            title="اسحب للتدوير — Shift بخطوات 15° · نقر مزدوج للعودة إلى 0°"
            style={{
              position: 'absolute', left: rect.w / 2 - 5, top: -24,
              width: 10, height: 10, background: '#fff',
              border: '1.5px solid #3b82f6', borderRadius: '50%',
              cursor: 'crosshair', pointerEvents: 'all', zIndex: 2,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const container = docRef.current?.getBoundingClientRect();
              if (!container) return;
              designer.startRotate(
                type,
                container.left + rect.x + rect.w / 2,
                container.top + rect.y + rect.h / 2,
                e.clientX,
                e.clientY,
              );
            }}
            onPointerMove={(e) => { if (designer.isRotating) designer.continueRotate(e.clientX, e.clientY, e.shiftKey); }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); designer.endRotate(); }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); designer.endRotate(); }}
            onDoubleClick={(e) => { e.stopPropagation(); designer.resetRotation(type); }}
          />
        )}
      </div>
    );
  }

  // Layout element handle sub-component
  function LayoutDragHandle({ id, rect }: { id: string; rect: ElemRect }) {
    const sel = isSelected(id);
    const override = getLayoutElement(layouts[docType], id);
    const isLocked = override.locked;
    const COLOR = '#a855f7'; // purple for layout elements

    return (
      <div
        style={{
          position: 'absolute', left: rect.x, top: rect.y,
          width: Math.max(rect.w, 16), height: Math.max(rect.h, 16),
          border: sel ? `2px solid ${COLOR}` : '2px dashed #c4b5fd55',
          boxShadow: sel ? `0 0 0 3px ${COLOR}22` : 'none',
          borderRadius: 2, boxSizing: 'border-box', zIndex: 900,
          cursor: isLocked ? 'not-allowed' : isDragging && sel ? 'grabbing' : 'grab',
          touchAction: 'none', pointerEvents: 'all',
        }}
        onClick={(e) => {
          e.stopPropagation();
          textStyleDesigner?.setSelectedArea(null);
          if (e.ctrlKey || e.metaKey) {
            sel ? (clearSelection(), selectOne(id)) : addToSelection(id);
          } else if (e.shiftKey) {
            addToSelection(id);
          } else {
            selectOne(id);
          }
        }}
        onPointerDown={(e) => {
          if (isLocked) return;
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (!sel) selectOne(id);
          startDrag(id, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (isDragging) continueDrag(e.clientX, e.clientY); }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endDrag(); }}
        onPointerCancel={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endDrag(); }}
      >
        {/* Label tooltip */}
        {sel && (
          <div style={{
            position: 'absolute', top: -20, left: 0, whiteSpace: 'nowrap',
            fontSize: 10, color: '#fff', background: COLOR, borderRadius: 3,
            padding: '2px 5px', pointerEvents: 'none',
          }}>
            {LAYOUT_ELEMENT_LABELS[id] ?? id}
            {isLocked && ' 🔒'}
          </div>
        )}

        {/* Resize handles */}
        {sel && !isLocked && RESIZE_HANDLES.map(({ key, cx, cy }) => (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: cx(rect) - rect.x - RH / 2,
              top: cy(rect) - rect.y - RH / 2,
              width: RH, height: RH,
              background: '#fff', border: `1.5px solid ${COLOR}`, borderRadius: 2,
              cursor: RESIZE_CURSORS[key], zIndex: 2, pointerEvents: 'all',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              startResize(id, key, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => { if (isResizing) continueResize(e.clientX, e.clientY); }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endResize(); }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endResize(); }}
          />
        ))}

        {/* Rotation handle (above top-center) */}
        {sel && !isLocked && (
          <div
            style={{
              position: 'absolute',
              left: rect.w / 2 - 5,
              top: -24,
              width: 10, height: 10,
              background: '#fff', border: `1.5px solid ${COLOR}`,
              borderRadius: '50%', cursor: 'crosshair',
              pointerEvents: 'all', zIndex: 2,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const centerX = rect.x + rect.w / 2;
              const centerY = rect.y + rect.h / 2;
              const container = docRef.current?.getBoundingClientRect();
              if (!container) return;
              startRotate(id, container.left + centerX, container.top + centerY, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => { if (isRotating) continueRotate(e.clientX, e.clientY); }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endRotate(); }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); endRotate(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      style={{ outline: 'none', background: '#e2e8f0', display: 'flex', flexDirection: 'column' } as React.CSSProperties}
      className="no-print"
    >
      {/* Toolbar — reuse existing BrandingDesignerToolbar */}
      <BrandingDesignerToolbar designer={designer} docLabel={docLabel} onClose={deactivate} onSave={onSave} />

      {/* Rulers */}
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <div style={{ width: RULER, height: RULER, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }} />
        <div style={{ flex: 1, height: RULER, background: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'relative', overflow: 'hidden' }}>
          {/* Ruler marks every 10mm */}
          {Array.from({ length: Math.ceil(scaledW / (10 * effectiveZoom * 3.7795)) + 1 }).map((_, i) => {
            const mm = i * 10;
            const px = mm * 3.7795 * effectiveZoom;
            if (px > scaledW) return null;
            return (
              <div key={mm} style={{ position: 'absolute', left: px, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 1, height: mm % 50 === 0 ? 10 : 6, background: '#94a3b8' }} />
                {mm % 20 === 0 && <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1, whiteSpace: 'nowrap' }}>{mm}mm</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Left ruler + canvas */}
      <div style={{ display: 'flex', overflow: 'auto', flex: 1, maxHeight: 'calc(100vh - 188px)' }}>
        <div style={{ width: RULER, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #cbd5e1', position: 'relative' }}>
          {Array.from({ length: Math.ceil(scaledH / (10 * effectiveZoom * 3.7795)) + 1 }).map((_, i) => {
            const mm = i * 10;
            const py = mm * 3.7795 * effectiveZoom;
            if (py > scaledH) return null;
            return (
              <div key={mm} style={{ position: 'absolute', top: py, left: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: mm % 50 === 0 ? 10 : 6, height: 1, background: '#94a3b8', flexShrink: 0 }} />
                {mm % 20 === 0 && <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1, whiteSpace: 'nowrap', marginLeft: 1 }}>{mm}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 16, flex: 1 }}>
          <div style={{ position: 'relative', width: scaledW, height: scaledH, flexShrink: 0 }}>
            {/* Scaled document */}
            <div
              ref={docRef}
              onClick={handleDocClick}
              onDoubleClick={handleDocDblClick}
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
                  for (let x = 0; x <= scaledW; x += g) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={scaledH} stroke="#94a3b850" strokeWidth={0.5} />);
                  for (let y = 0; y <= scaledH; y += g) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={scaledW} y2={y} stroke="#94a3b850" strokeWidth={0.5} />);
                  return lines;
                })()}
              </svg>
            )}

            {/* Smart guides */}
            <SmartGuides lines={guideLines} canvasW={scaledW} canvasH={scaledH} />

            {/* Handles overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
              {/* Layout element handles */}
              {Object.entries(elemRects).map(([id, rect]) => (
                <LayoutDragHandle key={id} id={id} rect={rect} />
              ))}

              {/* Branding handles */}
              {sigRect && <BrandingDragHandle type="signature" rect={sigRect} />}
              {stampRect && <BrandingDragHandle type="stamp" rect={stampRect} />}

              {/* Text area selection highlight */}
              {selectedTextArea && textAreaRect && (
                <div style={{
                  position: 'absolute', left: textAreaRect.x, top: textAreaRect.y,
                  width: textAreaRect.w, height: Math.max(textAreaRect.h, 4),
                  border: '2px solid #f59e0b', boxShadow: '0 0 0 4px rgba(245,158,11,0.15)',
                  borderRadius: 2, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 1001,
                }} />
              )}
            </div>

            {/* Inline static text editor */}
            {staticTextDesigner?.editingKey && editingTextRect && (
              <InlineTextEditor
                left={editingTextRect.x}
                top={editingTextRect.y + editingTextRect.h + 4}
                minWidth={editingTextRect.w}
                editingKey={staticTextDesigner.editingKey}
                value={staticTextDesigner.draftValue}
                error={staticTextDesigner.draftError}
                onChange={staticTextDesigner.updateDraft}
                onCommit={staticTextDesigner.commitEdit}
                onCancel={staticTextDesigner.cancelEdit}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 14px', background: '#f1f5f9',
        borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
        flexShrink: 0, direction: 'rtl', flexWrap: 'wrap',
      }}>
        {selectedIds.size > 0 ? (
          <span style={{ fontWeight: 600, color: '#a855f7' }}>
            {selectedIds.size > 1
              ? `${selectedIds.size} عناصر محددة`
              : LAYOUT_ELEMENT_LABELS[[...selectedIds][0]] ?? [...selectedIds][0]}
          </span>
        ) : selectedTextArea ? (
          <span style={{ fontWeight: 600, color: '#f59e0b' }}>📝 {selectedTextArea.split('.').pop()}</span>
        ) : (
          <span style={{ color: '#94a3b8' }}>انقر عنصراً لتحريكه</span>
        )}
        <span style={{ color: '#94a3b8' }}>|</span>
        {selectedIds.size === 1 && (() => {
          const id = [...selectedIds][0];
          const el = getLayoutElement(layouts[docType], id);
          return (
            <>
              <span>X: <strong>{formatUnit(pxToMm(el.x))}mm</strong></span>
              <span>Y: <strong>{formatUnit(pxToMm(el.y))}mm</strong></span>
              {el.rotation !== 0 && <span>↻ <strong>{formatUnit(el.rotation)}°</strong></span>}
              <span style={{ color: '#94a3b8' }}>|</span>
            </>
          );
        })()}
        <span>تكبير: <strong>
          {layoutDesigner.zoom === 'fit-width' ? 'ملاءمة عرض'
            : layoutDesigner.zoom === 'fit-page' ? 'ملاءمة صفحة'
            : `${Math.round(effectiveZoom * 100)}%`}
        </strong></span>
        <span style={{ marginInlineStart: 'auto', color: '#94a3b8' }}>
          Ctrl+C نسخ · Ctrl+V لصق · Ctrl+D تكرار · Delete إعادة ضبط · Esc إغلاق
        </span>
      </div>
    </div>
  );
}
