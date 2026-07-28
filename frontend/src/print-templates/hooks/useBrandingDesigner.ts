import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import type {
  BrandingDocKey,
  BrandingLayout,
  PrintBrandingLayoutSettings,
  BrandingElementLayout,
} from '../engine/types';
import {
  DEFAULT_BRANDING_LAYOUT,
  DEFAULT_ELEMENT_LAYOUT,
  BRANDING_LAYOUT_BOUNDS,
  clampBrandingElementLayout,
  getBrandingLayoutForDocument,
  serializeBrandingLayout,
  type BrandingLayoutBounds,
} from '../utils/brandingLayout';
import {
  snapToGrid,
  historyPush,
  historyUndo,
  historyRedo,
  type ZoomLevel,
  type GridSizeOption,
} from '../utils/designerUtils';
import {
  type InkMode,
  readStoredInkMode,
  writeStoredInkMode,
} from '../utils/inkFilter';

export type ElementType = 'signature' | 'stamp';

export interface BrandingDesignerConfig {
  /**
   * The document whose layout is being edited. `undefined` makes the designer INERT —
   * it cannot activate, edit or save. That exists so a shared host (e.g. `FormLayout`)
   * can call this hook unconditionally, as the rules of hooks require, without needing a
   * placeholder document name: a surface with no registered layout key simply gets a
   * designer that does nothing, instead of one aimed at somebody else's entry.
   */
  docType: BrandingDocKey | undefined;
  initialLayout: PrintBrandingLayoutSettings | undefined;
  onSaved?: (layout: PrintBrandingLayoutSettings) => void;
}

export interface BrandingDesignerHandle {
  docType: BrandingDocKey | undefined;
  /** The central travel/scale envelope every control derives its range from. */
  bounds: Readonly<BrandingLayoutBounds>;
  /** This document's layout, resolved (identity when it has never been designed). */
  docLayout: BrandingLayout;

  // Activation
  isActive: boolean;
  activate: () => void;
  deactivate: () => void;

  // Layout
  localLayout: PrintBrandingLayoutSettings;

  // Selection
  selected: ElementType;
  setSelected: (type: ElementType) => void;

  // Element updates (push to history)
  updateElement: (type: ElementType, patch: Partial<BrandingElementLayout>) => void;

  // Drag (live; history pushed on end)
  isDragging: boolean;
  /**
   * `renderScale` is the factor an ancestor transform currently renders the document at
   * — pointer deltas are divided by it so the element tracks the cursor exactly. The
   * print-template screens omit it and keep using the designer's own zoom, unchanged;
   * the form screens measure it from the DOM because `PrintWorkspace` owns their zoom.
   */
  startDrag: (type: ElementType, pointerX: number, pointerY: number, renderScale?: number) => void;
  continueDrag: (pointerX: number, pointerY: number) => void;
  endDrag: () => void;

  // Resize — uniform `scale`, so the image's aspect ratio can never change
  isResizing: boolean;
  startResize: (type: ElementType, pointerX: number, pointerY: number, renderScale?: number) => void;
  continueResize: (pointerX: number, pointerY: number) => void;
  endResize: () => void;

  // Alignment
  alignCenterH: (type: ElementType) => void;
  alignCenterV: (type: ElementType) => void;
  bringForward: (type: ElementType) => void;
  sendBackward: (type: ElementType) => void;
  resetElement: (type: ElementType) => void;
  resetDoc: () => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Zoom
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
  effectiveZoom: number;
  setFitWidthZoom: (z: number) => void;
  setFitPageZoom: (z: number) => void;

  // Grid + Snap
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  gridSize: GridSizeOption;
  setGridSize: (s: GridSizeOption) => void;

  // Ink mode (persisted in localStorage; applies to sig/stamp images)
  inkMode: InkMode;
  setInkMode: (mode: InkMode) => void;

  // Save
  saving: boolean;
  saveError: string | undefined;
  save: () => Promise<void>;
}

const MAX_HISTORY = 30;

export function useBrandingDesigner({
  docType,
  initialLayout,
  onSaved,
}: BrandingDesignerConfig): BrandingDesignerHandle {
  const effective = initialLayout ?? DEFAULT_BRANDING_LAYOUT;

  // ── Layout (ref for sync reads during drag, state for rendering) ──
  const layoutRef = useRef<PrintBrandingLayoutSettings>(effective);
  const [layout, setLayoutState] = useState<PrintBrandingLayoutSettings>(effective);

  function setLayout(next: PrintBrandingLayoutSettings) {
    layoutRef.current = next;
    setLayoutState(next);
  }

  useEffect(() => {
    if (!initialLayout) return;
    layoutRef.current = initialLayout;
    setLayoutState(initialLayout);
    histRef.current = { entries: [initialLayout], cursor: 0 };
    setCanUndo(false);
    setCanRedo(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLayout]);

  // ── History ──
  const histRef = useRef<{ entries: PrintBrandingLayoutSettings[]; cursor: number }>({
    entries: [effective],
    cursor: 0,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function syncHistButtons() {
    setCanUndo(histRef.current.cursor > 0);
    setCanRedo(histRef.current.cursor < histRef.current.entries.length - 1);
  }

  function pushHistory(next: PrintBrandingLayoutSettings) {
    const result = historyPush(histRef.current.entries, histRef.current.cursor, next, MAX_HISTORY);
    histRef.current = { entries: result.history, cursor: result.cursor };
    syncHistButtons();
  }

  function undo() {
    const result = historyUndo(histRef.current.entries, histRef.current.cursor);
    if (!result) return;
    histRef.current.cursor = result.cursor;
    setLayout(result.state);
    syncHistButtons();
  }

  function redo() {
    const result = historyRedo(histRef.current.entries, histRef.current.cursor);
    if (!result) return;
    histRef.current.cursor = result.cursor;
    setLayout(result.state);
    syncHistButtons();
  }

  // ── Active state ──
  const [isActive, setIsActive] = useState(false);

  function activate() {
    if (!docType) return; // inert designer — nothing to edit
    const start = initialLayout ?? DEFAULT_BRANDING_LAYOUT;
    layoutRef.current = start;
    setLayoutState(start);
    histRef.current = { entries: [start], cursor: 0 };
    setCanUndo(false);
    setCanRedo(false);
    setIsActive(true);
  }

  function deactivate() {
    setIsActive(false);
  }

  // ── Selection ──
  const [selected, setSelected] = useState<ElementType>('signature');

  // ── Zoom ──
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [fitWidthZoom, setFitWidthZoom] = useState(0.85);
  const [fitPageZoom, setFitPageZoom] = useState(0.7);

  const effectiveZoom = (() => {
    if (zoom === 'fit-width' || zoom === 'fit') return fitWidthZoom;
    if (zoom === 'fit-page') return fitPageZoom;
    return (zoom as number) / 100;
  })();

  // ── Grid + Snap ──
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [gridSize, setGridSize] = useState<GridSizeOption>(5);

  // ── Ink mode (persisted) ──
  const [inkMode, setInkModeState] = useState<InkMode>(readStoredInkMode);

  function setInkMode(mode: InkMode) {
    setInkModeState(mode);
    writeStoredInkMode(mode);
  }

  // ── Drag ──
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    px: number;
    py: number;
    ex: number;
    ey: number;
    type: ElementType;
  } | null>(null);

  const dragZoomRef = useRef<number>(1);
  const dragSnapRef = useRef<{ enabled: boolean; size: GridSizeOption }>({
    enabled: false,
    size: 5,
  });

  /** The one central envelope — the same for every document. Exposed so the panel's
   *  sliders and the resize handles read their range from it rather than repeating it. */
  const bounds = BRANDING_LAYOUT_BOUNDS;

  function patchDoc(type: ElementType, patch: Partial<BrandingElementLayout>): PrintBrandingLayoutSettings {
    if (!docType) return layoutRef.current;
    // A form key may be absent from the record (never designed) — resolve through the
    // shared lookup so the first edit starts from the identity layout, not `undefined`.
    const current = getBrandingLayoutForDocument(layoutRef.current, docType);
    return {
      ...layoutRef.current,
      [docType]: {
        ...current,
        [type]: clampBrandingElementLayout({ ...current[type], ...patch }),
      },
    };
  }

  function updateElement(type: ElementType, patch: Partial<BrandingElementLayout>) {
    const next = patchDoc(type, patch);
    setLayout(next);
    pushHistory(next);
  }

  function startDrag(type: ElementType, pointerX: number, pointerY: number, renderScale?: number) {
    const el = getBrandingLayoutForDocument(layoutRef.current, docType)[type];
    dragStartRef.current = { px: pointerX, py: pointerY, ex: el.x, ey: el.y, type };
    // Snapshot effective zoom at drag start — an explicit render scale wins, because the
    // caller measured what the document is ACTUALLY rendered at.
    if (renderScale && renderScale > 0) dragZoomRef.current = renderScale;
    else if (zoom === 'fit-width' || zoom === 'fit') dragZoomRef.current = fitWidthZoom;
    else if (zoom === 'fit-page') dragZoomRef.current = fitPageZoom;
    else dragZoomRef.current = (zoom as number) / 100;
    dragSnapRef.current = { enabled: snapEnabled, size: gridSize };
    setIsDragging(true);
    setSelected(type);
  }

  function continueDrag(pointerX: number, pointerY: number) {
    const ds = dragStartRef.current;
    if (!ds) return;
    const zm = dragZoomRef.current;
    const snap = dragSnapRef.current;
    const newX = snapToGrid(ds.ex + (pointerX - ds.px) / zm, snap.size, snap.enabled);
    const newY = snapToGrid(ds.ey + (pointerY - ds.py) / zm, snap.size, snap.enabled);
    const next = patchDoc(ds.type, { x: newX, y: newY });
    layoutRef.current = next;
    setLayoutState(next);
  }

  function endDrag() {
    if (dragStartRef.current) {
      pushHistory(layoutRef.current);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  }

  // ── Resize ──
  /**
   * A single uniform `scale` — never a width/height pair — so the image's aspect ratio
   * is structurally incapable of changing. The corner handle's diagonal travel maps to a
   * multiplier on the scale the element had when the gesture began.
   */
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{
    px: number;
    py: number;
    scale: number;
    type: ElementType;
    renderScale: number;
  } | null>(null);

  /** px of diagonal pointer travel that doubles the element's size. */
  const RESIZE_PX_PER_DOUBLING = 120;

  function startResize(type: ElementType, pointerX: number, pointerY: number, renderScale?: number) {
    const el = getBrandingLayoutForDocument(layoutRef.current, docType)[type];
    resizeStartRef.current = {
      px: pointerX,
      py: pointerY,
      scale: el.scale,
      type,
      renderScale: renderScale && renderScale > 0 ? renderScale : effectiveZoom || 1,
    };
    setIsResizing(true);
    setSelected(type);
  }

  function continueResize(pointerX: number, pointerY: number) {
    const rs = resizeStartRef.current;
    if (!rs) return;
    // Outward along the handle's diagonal grows, inward shrinks. Averaging the two axes
    // keeps the gesture predictable whichever way the pointer drifts.
    const travel = ((pointerX - rs.px) + (pointerY - rs.py)) / 2 / rs.renderScale;
    const next = patchDoc(rs.type, {
      scale: rs.scale * (1 + travel / RESIZE_PX_PER_DOUBLING),
    });
    layoutRef.current = next;
    setLayoutState(next);
  }

  function endResize() {
    if (resizeStartRef.current) {
      pushHistory(layoutRef.current);
    }
    resizeStartRef.current = null;
    setIsResizing(false);
  }

  // ── Alignment ──
  function alignCenterH(type: ElementType) { updateElement(type, { x: 0 }); }
  function alignCenterV(type: ElementType) { updateElement(type, { y: 0 }); }
  function bringForward(type: ElementType) { updateElement(type, { zIndex: 2 }); }
  function sendBackward(type: ElementType) { updateElement(type, { zIndex: 1 }); }

  /** Back to the template's own placement — identity offset, scale 1, full opacity. */
  function resetElement(type: ElementType) {
    updateElement(type, { ...DEFAULT_ELEMENT_LAYOUT });
  }

  function resetDoc() {
    if (!docType) return;
    const next: PrintBrandingLayoutSettings = {
      ...layoutRef.current,
      [docType]: {
        signature: { ...DEFAULT_ELEMENT_LAYOUT },
        stamp: { ...DEFAULT_ELEMENT_LAYOUT },
      },
    };
    setLayout(next);
    pushHistory(next);
  }

  // ── Save ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  async function save() {
    if (!docType) return; // inert designer — never writes settings
    setSaving(true);
    setSaveError(undefined);
    try {
      await api.put('/settings', {
        settings: [{
          key: 'print.brandingLayout',
          value: serializeBrandingLayout(layoutRef.current),
          group: 'print',
        }],
      });
      onSaved?.(layoutRef.current);
      deactivate();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return {
    docType,
    bounds,
    docLayout: getBrandingLayoutForDocument(layout, docType),
    isActive,
    activate,
    deactivate,
    localLayout: layout,
    selected,
    setSelected,
    updateElement,
    isDragging,
    startDrag,
    continueDrag,
    endDrag,
    isResizing,
    startResize,
    continueResize,
    endResize,
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
    effectiveZoom,
    setFitWidthZoom,
    setFitPageZoom,
    showGrid,
    setShowGrid,
    snapEnabled,
    setSnapEnabled,
    gridSize,
    setGridSize,
    inkMode,
    setInkMode,
    saving,
    saveError,
    save,
  };
}
