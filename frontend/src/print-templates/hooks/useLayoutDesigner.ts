import { useState, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import type { PrintDocumentType } from '../engine/types';
import type { AllLayoutOverrides, LayoutElementOverride } from '../designer/layoutOverrideTypes';
import {
  DEFAULT_ALL_LAYOUTS,
  DEFAULT_LAYOUT_ELEMENT,
  clampLayoutElement,
  patchDocumentLayout,
  serializeAllLayouts,
  parseAllLayouts,
  getLayoutElement,
} from '../designer/layoutOverrideUtils';
import {
  historyPush,
  historyUndo,
  historyRedo,
  snapToGrid,
  type ZoomLevel,
  type GridSizeOption,
} from '../utils/designerUtils';

// Suppress unused-import lint warnings — clampLayoutElement is used transitively
// through patchDocumentLayout; keep explicit import for tree-shaking clarity.
void clampLayoutElement;
void parseAllLayouts;

const MAX_HISTORY = 30;

export interface LayoutDesignerHandle {
  docType: PrintDocumentType;
  isActive: boolean;
  activate: () => void;
  deactivate: () => void;

  // All layout overrides (both doc types)
  layouts: AllLayoutOverrides;

  // Selection (multi-select by ID)
  selectedIds: ReadonlySet<string>;
  selectOne: (id: string) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;

  // Element updates
  updateElement: (id: string, patch: Partial<LayoutElementOverride>) => void;
  updateMany: (ids: string[], patch: Partial<LayoutElementOverride>) => void;

  // Drag (all selected elements)
  isDragging: boolean;
  startDrag: (primaryId: string, pointerX: number, pointerY: number) => void;
  continueDrag: (pointerX: number, pointerY: number) => void;
  endDrag: () => void;

  // Resize (8-handle: direction name)
  isResizing: boolean;
  startResize: (id: string, handle: ResizeHandle, pointerX: number, pointerY: number) => void;
  continueResize: (pointerX: number, pointerY: number) => void;
  endResize: () => void;

  // Rotation
  isRotating: boolean;
  startRotate: (id: string, originX: number, originY: number, pointerX: number, pointerY: number) => void;
  continueRotate: (pointerX: number, pointerY: number) => void;
  endRotate: () => void;

  // Alignment (operates on all selected, or given id)
  alignLeft: () => void;
  alignRight: (canvasW: number) => void;
  alignTop: () => void;
  alignBottom: (canvasH: number) => void;
  alignCenterH: (canvasW: number) => void;
  alignCenterV: (canvasH: number) => void;

  // Per-element ops
  lockSelected: () => void;
  unlockSelected: () => void;
  hideSelected: () => void;
  showSelected: () => void;
  resetElement: (id: string) => void;

  // Copy / Paste / Duplicate
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Zoom (shared with branding designer; passed from parent)
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
  effectiveZoom: number;
  setFitWidthZoom: (z: number) => void;
  setFitPageZoom: (z: number) => void;

  // Grid
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  gridSize: GridSizeOption;
  setGridSize: (s: GridSizeOption) => void;

  // Import / Export
  exportLayout: () => void;   // downloads JSON file
  importLayout: (file: File) => void; // reads JSON file

  // Dirty flag (unsaved changes)
  isDirty: boolean;

  // Save
  saving: boolean;
  saveError: string | undefined;
  save: () => Promise<void>;
}

export type ResizeHandle =
  | 'top-left' | 'top' | 'top-right'
  | 'right' | 'bottom-right' | 'bottom'
  | 'bottom-left' | 'left';

export function useLayoutDesigner({
  docType,
  initialLayouts,
  onSaved,
}: {
  docType: PrintDocumentType;
  initialLayouts?: AllLayoutOverrides;
  onSaved?: (layouts: AllLayoutOverrides) => void;
}): LayoutDesignerHandle {
  const effective = initialLayouts ?? DEFAULT_ALL_LAYOUTS;

  // ── Layout state ──
  const layoutRef = useRef<AllLayoutOverrides>(effective);
  const [layouts, setLayouts_] = useState<AllLayoutOverrides>(effective);

  function setLayouts(next: AllLayoutOverrides) {
    layoutRef.current = next;
    setLayouts_(next);
  }

  // ── History ──
  const histRef = useRef({ entries: [effective], cursor: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  function syncHist() {
    setCanUndo(histRef.current.cursor > 0);
    setCanRedo(histRef.current.cursor < histRef.current.entries.length - 1);
  }

  function pushHist(next: AllLayoutOverrides) {
    const r = historyPush(histRef.current.entries, histRef.current.cursor, next, MAX_HISTORY);
    histRef.current = { entries: r.history, cursor: r.cursor };
    syncHist();
    setIsDirty(true);
  }

  function undo() {
    const r = historyUndo(histRef.current.entries, histRef.current.cursor);
    if (!r) return;
    histRef.current.cursor = r.cursor;
    setLayouts(r.state);
    syncHist();
    setIsDirty(true);
  }

  function redo() {
    const r = historyRedo(histRef.current.entries, histRef.current.cursor);
    if (!r) return;
    histRef.current.cursor = r.cursor;
    setLayouts(r.state);
    syncHist();
    setIsDirty(true);
  }

  // ── Active ──
  const [isActive, setIsActive] = useState(false);

  function activate() {
    const start = initialLayouts ?? DEFAULT_ALL_LAYOUTS;
    layoutRef.current = start;
    setLayouts_(start);
    histRef.current = { entries: [start], cursor: 0 };
    setCanUndo(false); setCanRedo(false); setIsDirty(false);
    setIsActive(true);
  }

  function deactivate() { setIsActive(false); }

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectOne = useCallback((id: string) => setSelectedIds(new Set([id])), []);
  const addToSelection = useCallback((id: string) => setSelectedIds((s) => new Set([...s, id])), []);
  const removeFromSelection = useCallback((id: string) => setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; }), []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  // ── Update helpers ──
  function updateElement(id: string, patch: Partial<LayoutElementOverride>) {
    const next = patchDocumentLayout(layoutRef.current, docType, id, patch);
    setLayouts(next);
    pushHist(next);
  }

  function updateMany(ids: string[], patch: Partial<LayoutElementOverride>) {
    let next = layoutRef.current;
    for (const id of ids) {
      next = patchDocumentLayout(next, docType, id, patch);
    }
    setLayouts(next);
    pushHist(next);
  }

  // ── Drag ──
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number; startY: number;
    origins: Record<string, { x: number; y: number }>;
    zoom: number;
    snap: { enabled: boolean; size: GridSizeOption };
  } | null>(null);

  const zoomRef = useRef<ZoomLevel>(100);
  const fitWidthRef = useRef(0.85);
  const fitPageRef = useRef(0.7);
  const snapEnabledRef = useRef(false);
  const gridSizeRef = useRef<GridSizeOption>(5);

  function getEffectiveZoom(): number {
    const z = zoomRef.current;
    if (z === 'fit-width' || z === 'fit') return fitWidthRef.current;
    if (z === 'fit-page') return fitPageRef.current;
    return (z as number) / 100;
  }

  function startDrag(primaryId: string, pointerX: number, pointerY: number) {
    // Add primary to selection if not already
    if (!selectedIds.has(primaryId)) selectOne(primaryId);
    const ids = selectedIds.has(primaryId) ? [...selectedIds] : [primaryId];
    const origins: Record<string, { x: number; y: number }> = {};
    const docOverrides = layoutRef.current[docType];
    for (const id of ids) {
      const el = getLayoutElement(docOverrides, id);
      origins[id] = { x: el.x, y: el.y };
    }
    dragRef.current = {
      startX: pointerX, startY: pointerY, origins,
      zoom: getEffectiveZoom(),
      snap: { enabled: snapEnabledRef.current, size: gridSizeRef.current },
    };
    setIsDragging(true);
  }

  function continueDrag(pointerX: number, pointerY: number) {
    const d = dragRef.current;
    if (!d) return;
    const zm = d.zoom;
    const rawDx = (pointerX - d.startX) / zm;
    const rawDy = (pointerY - d.startY) / zm;
    let next = layoutRef.current;
    for (const [id, origin] of Object.entries(d.origins)) {
      const newX = snapToGrid(origin.x + rawDx, d.snap.size, d.snap.enabled);
      const newY = snapToGrid(origin.y + rawDy, d.snap.size, d.snap.enabled);
      next = patchDocumentLayout(next, docType, id, { x: newX, y: newY });
    }
    layoutRef.current = next;
    setLayouts_(next);
  }

  function endDrag() {
    if (dragRef.current) pushHist(layoutRef.current);
    dragRef.current = null;
    setIsDragging(false);
  }

  // ── Resize ──
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{
    id: string; handle: ResizeHandle;
    startX: number; startY: number;
    originScaleX: number; originScaleY: number;
    zoom: number;
  } | null>(null);

  function startResize(id: string, handle: ResizeHandle, pointerX: number, pointerY: number) {
    const el = getLayoutElement(layoutRef.current[docType], id);
    resizeRef.current = {
      id, handle,
      startX: pointerX, startY: pointerY,
      originScaleX: el.scaleX, originScaleY: el.scaleY,
      zoom: getEffectiveZoom(),
    };
    setIsResizing(true);
  }

  function continueResize(pointerX: number, pointerY: number) {
    const r = resizeRef.current;
    if (!r) return;
    const zm = r.zoom;
    const dx = (pointerX - r.startX) / zm;
    const dy = (pointerY - r.startY) / zm;
    // Scale sensitivity: 200px drag = 1.0 scale unit
    const SENSITIVITY = 200;
    const h = r.handle;
    const affectsRight = h.includes('right');
    const affectsBottom = h.includes('bottom');
    const affectsLeft = h.includes('left');
    const affectsTop = h.includes('top');
    const newScaleX = r.originScaleX + ((affectsRight ? dx : affectsLeft ? -dx : 0) / SENSITIVITY);
    const newScaleY = r.originScaleY + ((affectsBottom ? dy : affectsTop ? -dy : 0) / SENSITIVITY);
    const next = patchDocumentLayout(layoutRef.current, docType, r.id, { scaleX: newScaleX, scaleY: newScaleY });
    layoutRef.current = next;
    setLayouts_(next);
  }

  function endResize() {
    if (resizeRef.current) pushHist(layoutRef.current);
    resizeRef.current = null;
    setIsResizing(false);
  }

  // ── Rotation ──
  const [isRotating, setIsRotating] = useState(false);
  const rotateRef = useRef<{
    id: string;
    originX: number; originY: number;
    startAngle: number;
    originRotation: number;
  } | null>(null);

  function startRotate(id: string, originX: number, originY: number, pointerX: number, pointerY: number) {
    const el = getLayoutElement(layoutRef.current[docType], id);
    const startAngle = Math.atan2(pointerY - originY, pointerX - originX) * (180 / Math.PI);
    rotateRef.current = { id, originX, originY, startAngle, originRotation: el.rotation };
    setIsRotating(true);
  }

  function continueRotate(pointerX: number, pointerY: number) {
    const r = rotateRef.current;
    if (!r) return;
    const angle = Math.atan2(pointerY - r.originY, pointerX - r.originX) * (180 / Math.PI);
    const delta = angle - r.startAngle;
    const newRotation = r.originRotation + delta;
    const next = patchDocumentLayout(layoutRef.current, docType, r.id, { rotation: newRotation });
    layoutRef.current = next;
    setLayouts_(next);
  }

  function endRotate() {
    if (rotateRef.current) pushHist(layoutRef.current);
    rotateRef.current = null;
    setIsRotating(false);
  }

  // ── Alignment ──
  // These work on bounding-box concept: since we only have x/y offsets,
  // we align relative to 0 (natural position) or canvas edges.
  // Full rect-based alignment requires measuring DOM — deferred to overlay.
  // For now: align means set x=0 (left/center) or specific value.
  function alignLeft() { updateMany([...selectedIds], { x: 0 }); }
  function alignRight(canvasW: number) { updateMany([...selectedIds], { x: canvasW - 100 }); }
  function alignTop() { updateMany([...selectedIds], { y: 0 }); }
  function alignBottom(canvasH: number) { updateMany([...selectedIds], { y: canvasH - 50 }); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function alignCenterH(_canvasW: number) { updateMany([...selectedIds], { x: 0 }); } // natural = centered
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function alignCenterV(_canvasH: number) { updateMany([...selectedIds], { y: 0 }); }

  // ── Lock / Hide ──
  function lockSelected() { updateMany([...selectedIds], { locked: true }); }
  function unlockSelected() { updateMany([...selectedIds], { locked: false }); }
  function hideSelected() { updateMany([...selectedIds], { hidden: true }); }
  function showSelected() { updateMany([...selectedIds], { hidden: false }); }

  function resetElement(id: string) {
    const next = patchDocumentLayout(layoutRef.current, docType, id, { ...DEFAULT_LAYOUT_ELEMENT });
    setLayouts(next);
    pushHist(next);
  }

  // ── Copy / Paste / Duplicate ──
  const clipboardRef = useRef<Record<string, LayoutElementOverride>>({});

  function copySelected() {
    const docOverrides = layoutRef.current[docType];
    const copied: Record<string, LayoutElementOverride> = {};
    for (const id of selectedIds) {
      copied[id] = { ...getLayoutElement(docOverrides, id) };
    }
    clipboardRef.current = copied;
  }

  function paste() {
    const clipboard = clipboardRef.current;
    if (!Object.keys(clipboard).length) return;
    let next = layoutRef.current;
    for (const [id, el] of Object.entries(clipboard)) {
      // Offset paste by 10px so it's visible as separate from original
      next = patchDocumentLayout(next, docType, id, { ...el, x: el.x + 10, y: el.y + 10 });
    }
    setLayouts(next);
    pushHist(next);
  }

  function duplicateSelected() {
    copySelected();
    paste();
  }

  // ── Zoom ──
  const [zoom, setZoom_] = useState<ZoomLevel>(100);
  const [fitWidthZoom, setFitWidthZoom_] = useState(0.85);
  const [fitPageZoom, setFitPageZoom_] = useState(0.7);

  function setZoom(z: ZoomLevel) { zoomRef.current = z; setZoom_(z); }
  function setFitWidthZoom(z: number) { fitWidthRef.current = z; setFitWidthZoom_(z); }
  function setFitPageZoom(z: number) { fitPageRef.current = z; setFitPageZoom_(z); }

  const effectiveZoom = (() => {
    if (zoom === 'fit-width' || zoom === 'fit') return fitWidthZoom;
    if (zoom === 'fit-page') return fitPageZoom;
    return (zoom as number) / 100;
  })();

  // ── Grid ──
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled_] = useState(false);
  const [gridSize, setGridSize_] = useState<GridSizeOption>(5);

  function setSnapEnabled(v: boolean) { snapEnabledRef.current = v; setSnapEnabled_(v); }
  function setGridSize(s: GridSizeOption) { gridSizeRef.current = s; setGridSize_(s); }

  // ── Import / Export ──
  function exportLayout() {
    const json = serializeAllLayouts(layoutRef.current);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manar-layout-${docType}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importLayout(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseAllLayouts(text);
      setLayouts(parsed);
      pushHist(parsed);
    };
    reader.readAsText(file);
  }

  // ── Save ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  async function save() {
    setSaving(true);
    setSaveError(undefined);
    try {
      await api.put('/settings', {
        settings: [{
          key: 'print.layoutOverrides',
          value: serializeAllLayouts(layoutRef.current),
          group: 'print',
        }],
      });
      onSaved?.(layoutRef.current);
      setIsDirty(false);
      deactivate();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return {
    docType, isActive, activate, deactivate,
    layouts,
    selectedIds,
    selectOne, addToSelection, removeFromSelection, clearSelection, isSelected,
    updateElement, updateMany,
    isDragging, startDrag, continueDrag, endDrag,
    isResizing, startResize, continueResize, endResize,
    isRotating, startRotate, continueRotate, endRotate,
    alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV,
    lockSelected, unlockSelected, hideSelected, showSelected, resetElement,
    copySelected, paste, duplicateSelected,
    canUndo, canRedo, undo, redo,
    zoom, setZoom, effectiveZoom, setFitWidthZoom, setFitPageZoom,
    showGrid, setShowGrid,
    snapEnabled, setSnapEnabled,
    gridSize, setGridSize,
    exportLayout, importLayout,
    isDirty,
    saving, saveError, save,
  };
}
