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
  getBrandingLayoutBounds,
  clampBrandingElementLayout,
  getBrandingLayoutForDocument,
  resolveBrandingElement,
  normalizeRotation,
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

/**
 * The kinds of element this designer moves. `barcode` is the third one, added by
 * Administrative Forms Barcode Designer v1: it is a plain member of this union — NOT a
 * parallel system — so every gesture, clamp, history entry, save and render path below
 * treats it exactly as it already treats a signature or a stamp.
 */
export type ElementType = 'signature' | 'stamp' | 'barcode';

/**
 * The roster a host gets when it does not declare one — the two elements every document
 * has always had. A document that draws a third element (today only Blank A4, with its
 * barcode) declares it via `BrandingDesignerConfig.elements`; every other surface keeps
 * exactly the pair it had, so no form gains a control for an element it never renders.
 */
export const DEFAULT_DESIGNER_ELEMENTS: readonly ElementType[] = ['signature', 'stamp'];

/** Plain Arabic name per element — one source for the panel, the handles and the a11y labels. */
export const ELEMENT_LABEL_AR: Record<ElementType, string> = {
  signature: 'التوقيع',
  stamp: 'الختم',
  barcode: 'الباركود',
};

/** The icon each element is tagged with in the properties panel. */
export const ELEMENT_ICON: Record<ElementType, string> = {
  signature: '✏',
  stamp: '🔵',
  barcode: '▦',
};

/** Selection colour per element — the panel's accent and the on-document outline agree by construction. */
export const ELEMENT_ACCENT_COLOR: Record<ElementType, string> = {
  signature: '#3b82f6',
  stamp: '#10b981',
  barcode: '#f97316',
};

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
  /**
   * Which elements this document actually draws. Omitted ⇒ `DEFAULT_DESIGNER_ELEMENTS`
   * (signature + stamp), which is every existing caller — so their panel, their reset
   * buttons and their saved record are unchanged to the character.
   */
  elements?: readonly ElementType[];
}

export interface BrandingDesignerHandle {
  docType: BrandingDocKey | undefined;
  /** The elements this document draws — the panel builds its controls from exactly this. */
  elements: readonly ElementType[];
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

  // Rotate — angle follows the pointer around the element's own centre
  isRotating: boolean;
  /**
   * `centerX`/`centerY` are the element's visual centre in CLIENT coordinates. The
   * caller measures them from the image's own bounding rect: because the element spins
   * about `transform-origin: center`, the centre of that rect IS the true pivot at any
   * angle, so the gesture stays accurate however far the element is already turned.
   */
  startRotate: (type: ElementType, centerX: number, centerY: number, pointerX: number, pointerY: number) => void;
  /** `snap` ⇒ Shift is held ⇒ land on the nearest 15°. Read live, not snapshotted. */
  continueRotate: (pointerX: number, pointerY: number, snap: boolean) => void;
  endRotate: () => void;
  /** Back to 0° for this element alone — leaves position, size and colour untouched. */
  resetRotation: (type: ElementType) => void;

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
  elements = DEFAULT_DESIGNER_ELEMENTS,
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

  /**
   * This document's envelope — the central one for every document but the documented
   * exception (see `getBrandingLayoutBounds`). Exposed so the panel's sliders, the resize
   * handles and the render-time transform all read the SAME range instead of repeating it,
   * which is what keeps a saved position from being clamped differently than it was edited.
   */
  const bounds = getBrandingLayoutBounds(docType);

  function patchDoc(type: ElementType, patch: Partial<BrandingElementLayout>): PrintBrandingLayoutSettings {
    if (!docType) return layoutRef.current;
    // A form key may be absent from the record (never designed) — resolve through the
    // shared lookup so the first edit starts from the identity layout, not `undefined`.
    const current = getBrandingLayoutForDocument(layoutRef.current, docType);
    return {
      ...layoutRef.current,
      [docType]: {
        ...current,
        // Clamped with THIS document's envelope, so drag, the resize handle, the panel
        // sliders, undo/redo and save all share one range — there is no second limit.
        // `resolveBrandingElement` (not `current[type]`) so an element the record has no
        // entry for yet — a barcode on its first edit — starts from the identity layout
        // instead of spreading `undefined` into a partial object.
        [type]: clampBrandingElementLayout({ ...resolveBrandingElement(current, type), ...patch }, bounds),
      },
    };
  }

  function updateElement(type: ElementType, patch: Partial<BrandingElementLayout>) {
    const next = patchDoc(type, patch);
    setLayout(next);
    pushHistory(next);
  }

  function startDrag(type: ElementType, pointerX: number, pointerY: number, renderScale?: number) {
    const el = resolveBrandingElement(getBrandingLayoutForDocument(layoutRef.current, docType), type);
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
    /** The angle the element carried at grab time — see `continueResize`. */
    rotation: number;
  } | null>(null);

  /** px of diagonal pointer travel that doubles the element's size. */
  const RESIZE_PX_PER_DOUBLING = 120;

  function startResize(type: ElementType, pointerX: number, pointerY: number, renderScale?: number) {
    const el = resolveBrandingElement(getBrandingLayoutForDocument(layoutRef.current, docType), type);
    resizeStartRef.current = {
      px: pointerX,
      py: pointerY,
      scale: el.scale,
      type,
      renderScale: renderScale && renderScale > 0 ? renderScale : effectiveZoom || 1,
      rotation: el.rotation ?? 0,
    };
    setIsResizing(true);
    setSelected(type);
  }

  function continueResize(pointerX: number, pointerY: number) {
    const rs = resizeStartRef.current;
    if (!rs) return;
    // Outward along the handle's diagonal grows, inward shrinks. Averaging the two axes
    // keeps the gesture predictable whichever way the pointer drifts.
    //
    // The delta is first UN-ROTATED by the element's own angle. Without this the axes the
    // average is taken over stay screen-aligned while the element's diagonal has turned
    // away from them, so on a 90°-rotated stamp "pull outward" reads as shrink and the
    // handle feels inverted. Rotating the delta by −θ expresses the pointer travel in the
    // element's own frame, which is the frame the handle visually belongs to. At θ = 0 the
    // rotation is the identity, so the unrotated gesture is bit-for-bit what it was.
    const rawDx = (pointerX - rs.px) / rs.renderScale;
    const rawDy = (pointerY - rs.py) / rs.renderScale;
    const rad = (-rs.rotation * Math.PI) / 180;
    const dx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad);
    const dy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad);
    const travel = (dx + dy) / 2;
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

  // ── Rotate ──
  /**
   * The same `atan2`-around-a-centre gesture the layout designer and the cheque field
   * designer already use (`useLayoutDesigner.startRotate`, `useDesignerRotation`) — the
   * pointer's angle relative to the pivot at grab time is remembered, and every move
   * applies the DELTA to the angle the element had then. Remembering the delta rather
   * than the absolute angle is what stops the element snapping to the pointer on grab.
   */
  const [isRotating, setIsRotating] = useState(false);
  const rotateStartRef = useRef<{
    cx: number;
    cy: number;
    startPointerAngle: number;
    startRotation: number;
    type: ElementType;
  } | null>(null);

  /** Shift-snap increment, in degrees. */
  const ROTATION_SNAP_DEG = 15;

  const pointerAngle = (cx: number, cy: number, px: number, py: number): number =>
    (Math.atan2(py - cy, px - cx) * 180) / Math.PI;

  function startRotate(
    type: ElementType,
    centerX: number,
    centerY: number,
    pointerX: number,
    pointerY: number,
  ) {
    const el = resolveBrandingElement(getBrandingLayoutForDocument(layoutRef.current, docType), type);
    rotateStartRef.current = {
      cx: centerX,
      cy: centerY,
      startPointerAngle: pointerAngle(centerX, centerY, pointerX, pointerY),
      startRotation: el.rotation ?? 0,
      type,
    };
    setIsRotating(true);
    setSelected(type);
  }

  function continueRotate(pointerX: number, pointerY: number, snap: boolean) {
    const rs = rotateStartRef.current;
    if (!rs) return;
    const delta = pointerAngle(rs.cx, rs.cy, pointerX, pointerY) - rs.startPointerAngle;
    const raw = rs.startRotation + delta;
    // Snap the RESULTING angle, not the delta, so Shift always lands on an absolute
    // multiple of 15° regardless of where the element started.
    const angle = snap ? Math.round(raw / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG : raw;
    // `patchDoc` → `clampBrandingElementLayout` normalizes into (-180, 180] and drops the
    // field entirely at 0°, so a full turn back to upright leaves no trace behind.
    const next = patchDoc(rs.type, { rotation: normalizeRotation(angle) });
    layoutRef.current = next;
    setLayoutState(next);
  }

  function endRotate() {
    if (rotateStartRef.current) {
      pushHistory(layoutRef.current);
    }
    rotateStartRef.current = null;
    setIsRotating(false);
  }

  function resetRotation(type: ElementType) {
    updateElement(type, { rotation: undefined });
  }

  // ── Alignment ──
  function alignCenterH(type: ElementType) { updateElement(type, { x: 0 }); }
  function alignCenterV(type: ElementType) { updateElement(type, { y: 0 }); }
  function bringForward(type: ElementType) { updateElement(type, { zIndex: 2 }); }
  function sendBackward(type: ElementType) { updateElement(type, { zIndex: 1 }); }

  /**
   * Back to the template's own placement — identity offset, scale 1, full opacity, no
   * rotation — AND back to no per-element ink color. `inkMode: undefined` and
   * `rotation: undefined` must both be explicit here: `DEFAULT_ELEMENT_LAYOUT` simply has
   * neither key, and `patchDoc`'s `{...current, ...patch}` merge only OVERWRITES keys the
   * patch actually contains — an absent key would leave a previously-set color or angle
   * untouched, not clear it. Explicit `undefined` is the correct backward-compatible reset
   * target: it is indistinguishable from an element that was never customized, so Reset
   * falls back to the legacy global default exactly like a pre-v2 document would, and the
   * element's stored record loses the rotation key altogether.
   */
  function resetElement(type: ElementType) {
    updateElement(type, { ...DEFAULT_ELEMENT_LAYOUT, inkMode: undefined, rotation: undefined });
  }

  /**
   * Every element this document draws, back to the template's own placement — same reset
   * value `resetElement` writes, applied across the roster. `signature`/`stamp` are seeded
   * unconditionally because they are required by the type and were always cleared here;
   * the loop then covers whatever else the host declared (Blank A4's barcode). A document
   * with the default roster therefore produces the exact record it produced before.
   */
  function resetDoc() {
    if (!docType) return;
    const cleared: BrandingLayout = {
      signature: { ...DEFAULT_ELEMENT_LAYOUT, inkMode: undefined, rotation: undefined },
      stamp: { ...DEFAULT_ELEMENT_LAYOUT, inkMode: undefined, rotation: undefined },
    };
    for (const type of elements) {
      cleared[type] = { ...DEFAULT_ELEMENT_LAYOUT, inkMode: undefined, rotation: undefined };
    }
    const next: PrintBrandingLayoutSettings = { ...layoutRef.current, [docType]: cleared };
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
    elements,
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
    isRotating,
    startRotate,
    continueRotate,
    endRotate,
    resetRotation,
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
    saving,
    saveError,
    save,
  };
}
