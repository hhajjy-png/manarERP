# Print Designer Phase 5A — WYSIWYG In-Document Designer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the branding designer experience directly into `InvoicePreview.tsx` and `Quotation.tsx` so users edit signature/stamp position on the real rendered document — not in a Settings modal.

**Architecture:** A shared `useBrandingDesigner` hook manages all designer state (layout, history, drag, zoom, grid, snap). A `BrandingDesignerOverlay` component wraps the document and renders rulers, a grid, and drag handles located via `data-bd-type` attributes on sig/stamp `<img>` elements. A `BrandingDesignerPanel` is a floating properties panel. Both preview pages activate designer mode via a toolbar button and wrap their document content with these shared components. The existing `BrandingLayoutDesigner` in Settings is kept as a fallback but is no longer the primary UX.

**Tech Stack:** React 18, TypeScript 5.5, native pointer events (`setPointerCapture`), `getBoundingClientRect` for drag handle positioning, `api.put('/settings')` for persistence. Zero new npm packages.

## Global Constraints

- No Prisma schema changes, no migrations, no new backend routes, no Electron IPC changes.
- No new npm packages.
- Settings key `print.brandingLayout` and JSON shape unchanged: `{ invoice: { signature: {x,y,scale,opacity,zIndex}, stamp: {...} }, quotation: {...} }`.
- Zoom, grid, snap are component-local only — NOT persisted to Settings.
- History (undo/redo) is local to the designer session only — NOT persisted.
- Save calls `api.put('/settings', { settings: [{ key: 'print.brandingLayout', value: '...', group: 'print' }] })`.
- Phase 1–4 compatibility: `applyBrandingElementStyle`, `getBrandingLayoutForDocument`, all templates, PDF export, and `window.print` are unchanged.
- Designer mode must not interfere with printing: all designer UI must carry `className="no-print"` or be conditionally hidden before any print/PDF call.
- Arabic labels for all user-facing strings; English for code identifiers.

---

## File Structure

### New files
| Path | Responsibility |
|------|---------------|
| `frontend/src/print-templates/utils/designerUtils.ts` | Pure helpers: `snapToGrid`, `formatUnit`, `keyboardMove`, `historyPush`, `historyUndo`, `historyRedo` |
| `frontend/src/print-templates/hooks/useBrandingDesigner.ts` | Shared React hook — all designer state (layout ref + state, history ref, drag ref, zoom, grid, snap, save) |
| `frontend/src/print-templates/components/BrandingDesignerOverlay.tsx` | Wraps document — rulers, grid, zoom scale, drag handles via `[data-bd-type]` query |
| `frontend/src/print-templates/components/BrandingDesignerPanel.tsx` | Floating properties panel — X/Y/Scale/Opacity/ZIndex controls, alignment, undo/redo, reset, save/cancel |
| `frontend/src/__tests__/printTemplates/designerUtils.test.ts` | Vitest unit tests for all 6 pure helpers |

### Modified files
| Path | Change |
|------|--------|
| `frontend/src/pages/InvoicePreview.tsx` | Add "Designer Mode" toolbar button; in designer mode wrap the legacy-view sig/stamp with draggable elements carrying `data-bd-type`; pass `localLayout` |
| `frontend/src/pages/Quotation.tsx` | Add "Designer Mode" toolbar button in engine mode; wrap `EngineComponent` in `BrandingDesignerOverlay` with `localLayout` |
| `frontend/src/print-templates/reference/quotations/QuotationBase.tsx` | Add `data-bd-type="signature"` and `data-bd-type="stamp"` to the two branding `<img>` elements |

### Unchanged
`BrandingLayoutDesigner.tsx`, `brandingLayout.ts`, `brandingHelpers.ts`, `types.ts`, all invoice templates, `Settings.tsx`, `useCompanyBranding.ts`.

---

## Task 1: Git Setup

**Files:** no code files changed.

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

- [ ] **Step 2: Tag production HEAD as checkpoint**

```bash
git tag pre-print-designer-phase5a
```

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b feature/print-designer-phase5a
```
Expected: `Switched to a new branch 'feature/print-designer-phase5a'`

- [ ] **Step 4: Commit plan doc**

```bash
git add docs/superpowers/plans/2026-06-22-print-designer-phase5a.md
git commit -m "docs: add Phase 5A in-document designer plan"
```

---

## Task 2: Shared Designer Engine (utilities, hook, overlay, panel)

**Files:**
- Create: `frontend/src/print-templates/utils/designerUtils.ts`
- Create: `frontend/src/print-templates/hooks/useBrandingDesigner.ts`
- Create: `frontend/src/print-templates/components/BrandingDesignerOverlay.tsx`
- Create: `frontend/src/print-templates/components/BrandingDesignerPanel.tsx`
- Create: `frontend/src/__tests__/printTemplates/designerUtils.test.ts`

**Interfaces produced:**
```typescript
// designerUtils.ts
export type ZoomLevel = 50 | 75 | 100 | 150 | 200 | 'fit';
export const ZOOM_PRESETS: readonly (Exclude<ZoomLevel,'fit'>)[];
export const GRID_SIZES: readonly (1|2|5|10)[];
export type GridSizeOption = 1|2|5|10;
export function snapToGrid(value: number, gridSize: number, enabled: boolean): number;
export function formatUnit(value: number): string;
export function keyboardMove(pos:{x:number;y:number}, dir:'left'|'right'|'up'|'down', step:number): {x:number;y:number};
export function historyPush<T>(history:T[], cursor:number, state:T, max:number): {history:T[];cursor:number};
export function historyUndo<T>(history:T[], cursor:number): {state:T;cursor:number}|null;
export function historyRedo<T>(history:T[], cursor:number): {state:T;cursor:number}|null;

// useBrandingDesigner.ts
export type ElementType = 'signature' | 'stamp';
export interface BrandingDesignerHandle { /* see Step 3d */ }
export function useBrandingDesigner(config: BrandingDesignerConfig): BrandingDesignerHandle;

// BrandingDesignerOverlay.tsx
export default function BrandingDesignerOverlay(props: BrandingDesignerOverlayProps): JSX.Element;

// BrandingDesignerPanel.tsx
export default function BrandingDesignerPanel(props: BrandingDesignerPanelProps): JSX.Element;
```

- [ ] **Step 2a: Write failing tests**

Create `frontend/src/__tests__/printTemplates/designerUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  snapToGrid, formatUnit, keyboardMove,
  historyPush, historyUndo, historyRedo,
} from '../../print-templates/utils/designerUtils';

describe('snapToGrid', () => {
  it('snaps down to nearest multiple', () => expect(snapToGrid(7, 5, true)).toBe(5));
  it('snaps up to nearest multiple', () => expect(snapToGrid(8, 5, true)).toBe(10));
  it('no-op when already on grid', () => expect(snapToGrid(10, 5, true)).toBe(10));
  it('returns value unchanged when disabled', () => expect(snapToGrid(7, 5, false)).toBe(7));
  it('handles negative values', () => {
    expect(snapToGrid(-7, 5, true)).toBe(-5);
    expect(snapToGrid(-8, 5, true)).toBe(-10);
  });
  it('returns value unchanged for gridSize <= 0', () => expect(snapToGrid(7, 0, true)).toBe(7));
});

describe('formatUnit', () => {
  it('formats whole number without decimal', () => expect(formatUnit(10)).toBe('10'));
  it('formats negative whole number', () => expect(formatUnit(-5)).toBe('-5'));
  it('formats 1 decimal place', () => expect(formatUnit(10.5)).toBe('10.5'));
  it('rounds to 1 decimal', () => expect(formatUnit(10.123)).toBe('10.1'));
  it('rounds up at .15', () => expect(formatUnit(10.156)).toBe('10.2'));
  it('no trailing zero for .0', () => expect(formatUnit(10.0)).toBe('10'));
});

describe('keyboardMove', () => {
  const pos = { x: 0, y: 0 };
  it('right increases x', () => expect(keyboardMove(pos, 'right', 1)).toEqual({ x: 1, y: 0 }));
  it('left decreases x', () => expect(keyboardMove(pos, 'left', 10)).toEqual({ x: -10, y: 0 }));
  it('up decreases y', () => expect(keyboardMove(pos, 'up', 1)).toEqual({ x: 0, y: -1 }));
  it('down increases y', () => expect(keyboardMove(pos, 'down', 1)).toEqual({ x: 0, y: 1 }));
  it('does not mutate original', () => {
    const original = { x: 5, y: 5 };
    keyboardMove(original, 'right', 3);
    expect(original).toEqual({ x: 5, y: 5 });
  });
});

describe('historyPush', () => {
  it('appends new state', () => {
    const r = historyPush([{x:0}], 0, {x:1}, 30);
    expect(r).toEqual({ history: [{x:0},{x:1}], cursor: 1 });
  });
  it('truncates forward history on branch', () => {
    const r = historyPush([{x:0},{x:1},{x:2}], 1, {x:5}, 30);
    expect(r).toEqual({ history: [{x:0},{x:1},{x:5}], cursor: 2 });
  });
  it('drops oldest when at max', () => {
    const r = historyPush([{x:0},{x:1},{x:2}], 2, {x:3}, 3);
    expect(r.history).toHaveLength(3);
    expect(r.history[0]).toEqual({x:1});
    expect(r.cursor).toBe(2);
  });
});

describe('historyUndo', () => {
  it('returns previous state', () => {
    expect(historyUndo([{x:0},{x:1}], 1)).toEqual({ state: {x:0}, cursor: 0 });
  });
  it('returns null at start', () => expect(historyUndo([{x:0}], 0)).toBeNull());
});

describe('historyRedo', () => {
  it('returns next state', () => {
    expect(historyRedo([{x:0},{x:1}], 0)).toEqual({ state: {x:1}, cursor: 1 });
  });
  it('returns null at end', () => expect(historyRedo([{x:0},{x:1}], 1)).toBeNull());
});
```

- [ ] **Step 2b: Run tests — verify FAIL**

```bash
cd frontend && npm test -- --run 2>&1 | grep -E "(designerUtils|FAIL|Cannot find)"
```
Expected: fails because the module does not exist yet.

- [ ] **Step 2c: Create `designerUtils.ts`**

```typescript
// frontend/src/print-templates/utils/designerUtils.ts

export type ZoomLevel = 50 | 75 | 100 | 150 | 200 | 'fit';
export const ZOOM_PRESETS = [50, 75, 100, 150, 200] as const satisfies ReadonlyArray<Exclude<ZoomLevel,'fit'>>;
export const GRID_SIZES = [1, 2, 5, 10] as const;
export type GridSizeOption = typeof GRID_SIZES[number];

/** Snap value to nearest grid multiple. Returns original if disabled or gridSize ≤ 0. */
export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Round to at most 1 decimal place, dropping trailing zeros. */
export function formatUnit(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Move position by one keyboard step. 'up' decreases y (CSS coordinate direction). */
export function keyboardMove(
  pos: { x: number; y: number },
  direction: 'left' | 'right' | 'up' | 'down',
  step: number,
): { x: number; y: number } {
  switch (direction) {
    case 'left':  return { ...pos, x: pos.x - step };
    case 'right': return { ...pos, x: pos.x + step };
    case 'up':    return { ...pos, y: pos.y - step };
    case 'down':  return { ...pos, y: pos.y + step };
  }
}

/** Push new state. Truncates forward history if cursor is not at end. Drops oldest beyond max. */
export function historyPush<T>(
  history: T[], cursor: number, newState: T, maxEntries: number,
): { history: T[]; cursor: number } {
  const truncated = history.slice(0, cursor + 1);
  const next = [...truncated, newState];
  if (next.length > maxEntries) {
    return { history: next.slice(next.length - maxEntries), cursor: maxEntries - 1 };
  }
  return { history: next, cursor: next.length - 1 };
}

/** Undo: returns previous state or null if at start. */
export function historyUndo<T>(
  history: T[], cursor: number,
): { state: T; cursor: number } | null {
  if (cursor <= 0) return null;
  return { state: history[cursor - 1], cursor: cursor - 1 };
}

/** Redo: returns next state or null if at end. */
export function historyRedo<T>(
  history: T[], cursor: number,
): { state: T; cursor: number } | null {
  if (cursor >= history.length - 1) return null;
  return { state: history[cursor + 1], cursor: cursor + 1 };
}
```

- [ ] **Step 2d: Run tests — verify PASS**

```bash
cd frontend && npm test -- --run 2>&1 | grep -E "(designerUtils|Tests)"
```
Expected: all 22 tests pass.

- [ ] **Step 2e: Create `useBrandingDesigner.ts`**

```typescript
// frontend/src/print-templates/hooks/useBrandingDesigner.ts

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { PrintDocumentType, PrintBrandingLayoutSettings, BrandingElementLayout } from '../engine/types';
import {
  DEFAULT_BRANDING_LAYOUT, clampBrandingElementLayout,
  serializeBrandingLayout,
} from '../utils/brandingLayout';
import {
  snapToGrid, keyboardMove, historyPush, historyUndo, historyRedo,
  type ZoomLevel, type GridSizeOption,
} from '../utils/designerUtils';

export type ElementType = 'signature' | 'stamp';

export interface BrandingDesignerConfig {
  docType: PrintDocumentType;
  initialLayout: PrintBrandingLayoutSettings | undefined;
  onSaved?: (layout: PrintBrandingLayoutSettings) => void;
}

export interface BrandingDesignerHandle {
  // Activation
  isActive: boolean;
  activate: () => void;
  deactivate: () => void;

  // Layout (always reflects latest local edits)
  localLayout: PrintBrandingLayoutSettings;

  // Selection
  selected: ElementType;
  setSelected: (type: ElementType) => void;

  // Element updates (use for slider/numeric controls — these push to history)
  updateElement: (type: ElementType, patch: Partial<BrandingElementLayout>) => void;

  // Drag (live updates, no history push on each move)
  isDragging: boolean;
  startDrag: (type: ElementType, pointerX: number, pointerY: number) => void;
  continueDrag: (pointerX: number, pointerY: number) => void;
  endDrag: () => void;

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
}: BrandingDesignerConfig): BrandingDesignerHandle {
  const effective = initialLayout ?? DEFAULT_BRANDING_LAYOUT;

  // ── Layout state (ref for sync reads, state for rendering) ──
  const layoutRef = useRef<PrintBrandingLayoutSettings>(effective);
  const [layout, setLayoutState] = useState<PrintBrandingLayoutSettings>(effective);

  // Keep in sync when parent branding loads
  useEffect(() => {
    if (!initialLayout) return;
    layoutRef.current = initialLayout;
    setLayoutState(initialLayout);
    histRef.current = { entries: [initialLayout], cursor: 0 };
    setCanUndo(false);
    setCanRedo(false);
  }, [initialLayout]);

  function setLayout(next: PrintBrandingLayoutSettings) {
    layoutRef.current = next;
    setLayoutState(next);
  }

  // ── History ──
  const histRef = useRef<{ entries: PrintBrandingLayoutSettings[]; cursor: number }>({
    entries: [effective], cursor: 0,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function syncHistButtons() {
    setCanUndo(histRef.current.cursor > 0);
    setCanRedo(histRef.current.cursor < histRef.current.entries.length - 1);
  }

  function pushHistory(next: PrintBrandingLayoutSettings) {
    const result = historyPush(histRef.current.entries, histRef.current.cursor, next, MAX_HISTORY);
    histRef.current = result;
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
    layoutRef.current = initialLayout ?? DEFAULT_BRANDING_LAYOUT;
    setLayoutState(layoutRef.current);
    histRef.current = { entries: [layoutRef.current], cursor: 0 };
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
  const [fitZoom, setFitZoom] = useState(1);
  const effectiveZoom = zoom === 'fit' ? fitZoom : zoom / 100;

  // ── Grid + Snap ──
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [gridSize, setGridSize] = useState<GridSizeOption>(5);

  // ── Drag ──
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ px: number; py: number; ex: number; ey: number; type: ElementType } | null>(null);

  function patchDoc(type: ElementType, patch: Partial<BrandingElementLayout>): PrintBrandingLayoutSettings {
    return {
      ...layoutRef.current,
      [docType]: {
        ...layoutRef.current[docType],
        [type]: clampBrandingElementLayout({ ...layoutRef.current[docType][type], ...patch }),
      },
    };
  }

  function updateElement(type: ElementType, patch: Partial<BrandingElementLayout>) {
    const next = patchDoc(type, patch);
    setLayout(next);
    pushHistory(next);
  }

  function startDrag(type: ElementType, pointerX: number, pointerY: number) {
    const el = layoutRef.current[docType][type];
    dragStartRef.current = { px: pointerX, py: pointerY, ex: el.x, ey: el.y, type };
    setIsDragging(true);
    setSelected(type);
  }

  function continueDrag(pointerX: number, pointerY: number) {
    const ds = dragStartRef.current;
    if (!ds) return;
    const zm = zoom === 'fit' ? fitZoom : zoom / 100;
    const newX = snapToGrid(ds.ex + (pointerX - ds.px) / zm, gridSize, snapEnabled);
    const newY = snapToGrid(ds.ey + (pointerY - ds.py) / zm, gridSize, snapEnabled);
    const next = patchDoc(ds.type, { x: newX, y: newY });
    layoutRef.current = next; // sync ref immediately for smooth drag
    setLayoutState(next);
  }

  function endDrag() {
    if (dragStartRef.current) {
      pushHistory(layoutRef.current);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  }

  // ── Alignment ──
  function alignCenterH(type: ElementType) { updateElement(type, { x: 0 }); }
  function alignCenterV(type: ElementType) { updateElement(type, { y: 0 }); }
  function bringForward(type: ElementType) { updateElement(type, { zIndex: 2 }); }
  function sendBackward(type: ElementType) { updateElement(type, { zIndex: 1 }); }

  function resetElement(type: ElementType) {
    const next = patchDoc(type, { ...DEFAULT_BRANDING_LAYOUT[docType][type] });
    setLayout(next);
    pushHistory(next);
  }

  function resetDoc() {
    const next: PrintBrandingLayoutSettings = {
      ...layoutRef.current,
      [docType]: { ...DEFAULT_BRANDING_LAYOUT[docType] },
    };
    setLayout(next);
    pushHistory(next);
  }

  // ── Save ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  async function save() {
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
    isActive, activate, deactivate,
    localLayout: layout,
    selected, setSelected,
    updateElement,
    isDragging, startDrag, continueDrag, endDrag,
    alignCenterH, alignCenterV, bringForward, sendBackward, resetElement, resetDoc,
    canUndo, canRedo, undo, redo,
    zoom, setZoom, effectiveZoom,
    showGrid, setShowGrid,
    snapEnabled, setSnapEnabled,
    gridSize, setGridSize,
    saving, saveError, save,
  };
}
```

- [ ] **Step 2f: Create `BrandingDesignerOverlay.tsx`**

This component wraps the document content. When `isActive=true` it:
1. Adds a keyboard listener (arrows, Ctrl+Z, Ctrl+Shift+Z) to the wrapper div
2. Renders horizontal + vertical rulers around the document
3. Renders a grid SVG on top of the document
4. Finds `[data-bd-type="signature"]` and `[data-bd-type="stamp"]` elements inside the document and renders drag handles at their visual positions
5. Applies `transform: scale(effectiveZoom)` to the document

```tsx
// frontend/src/print-templates/components/BrandingDesignerOverlay.tsx

import { useRef, useEffect, useState } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { formatUnit } from '../utils/designerUtils';

const RULER = 20;

interface Props {
  designer: BrandingDesignerHandle;
  children: React.ReactNode;
}

export default function BrandingDesignerOverlay({ designer, children }: Props) {
  const {
    isActive, effectiveZoom, showGrid, gridSize,
    selected, setSelected,
    isDragging, startDrag, continueDrag, endDrag,
    canUndo, canRedo, undo, redo,
    snapEnabled, localLayout,
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
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      const dir: Record<string, 'left'|'right'|'up'|'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      };
      if (!dir[e.key]) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const el2 = designer.localLayout[designer.docType ?? 'invoice'][selected];
      // Move via updateElement — which clamps and pushes history
      // We derive new position here since we can't call keyboardMove from hook directly
      // But the hook exposes updateElement with partial patch:
      const dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
      const dy = (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      designer.updateElement(selected, { x: el2.x + dx, y: el2.y + dy });
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [isActive, selected, undo, redo, designer]);

  // ── Drag handle positions (read from DOM after each layout change) ──
  const [sigPos, setSigPos] = useState<{ x: number; y: number } | null>(null);
  const [stampPos, setStampPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isActive || !docRef.current) return;
    const container = docRef.current;
    const containerRect = container.getBoundingClientRect();

    function findHandlePos(type: ElementType) {
      const el = container.querySelector(`[data-bd-type="${type}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      };
    }

    setSigPos(findHandlePos('signature'));
    setStampPos(findHandlePos('stamp'));
  }, [isActive, localLayout, effectiveZoom]);

  // ── Ruler helpers ──
  function HRuler({ width }: { width: number }) {
    const ticks = [];
    for (let px = 0; px <= width; px += 50) {
      const unit = Math.round(px / effectiveZoom);
      ticks.push(
        <div key={px} style={{ position: 'absolute', left: px, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 1, height: 6, background: '#94a3b8' }} />
          <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1 }}>{unit}</span>
        </div>
      );
    }
    return (
      <div style={{ height: RULER, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
        {ticks}
      </div>
    );
  }

  function VRuler({ height }: { height: number }) {
    const ticks = [];
    for (let py = 0; py <= height; py += 50) {
      const unit = Math.round(py / effectiveZoom);
      ticks.push(
        <div key={py} style={{ position: 'absolute', top: py, left: 0, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 6, height: 1, background: '#94a3b8' }} />
          <span style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1, marginLeft: 1 }}>{unit}</span>
        </div>
      );
    }
    return (
      <div style={{ width: RULER, background: '#f8fafc', borderRight: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
        {ticks}
      </div>
    );
  }

  function DragHandle({ type, pos }: { type: ElementType; pos: { x: number; y: number } }) {
    const color = type === 'signature' ? '#3b82f6' : '#10b981';
    const isSelected = selected === type;
    const label = type === 'signature' ? 'التوقيع' : 'الختم';
    return (
      <div
        data-bd-handle={type}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -50%)',
          width: 28, height: 28,
          borderRadius: '50%',
          background: isSelected ? color : `${color}88`,
          border: `2px solid ${color}`,
          cursor: isDragging && type === designer.selected ? 'grabbing' : 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#fff', fontWeight: 700,
          zIndex: 1000,
          boxShadow: isSelected ? `0 0 0 3px ${color}44` : 'none',
          userSelect: 'none', touchAction: 'none',
        }}
        title={`اسحب لتحريك ${label}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setSelected(type);
          startDrag(type, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (isDragging) continueDrag(e.clientX, e.clientY); }}
        onPointerUp={() => endDrag()}
      >
        ✥
      </div>
    );
  }

  if (!isActive) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      style={{ outline: 'none', position: 'relative', background: '#f1f5f9' }}
      className="no-print"
    >
      {/* Document in zoom+ruler wrapper */}
      <div style={{ display: 'flex', overflow: 'auto' }}>
        {/* Corner square */}
        <div style={{ width: RULER, height: RULER, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }} />
        {/* Top ruler — scrolls horizontally with doc */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <HRuler width={Math.round(800 * effectiveZoom)} />
        </div>
      </div>

      <div style={{ display: 'flex', overflow: 'auto' }}>
        {/* Left ruler */}
        <div style={{ flexShrink: 0 }}>
          <VRuler height={Math.round(1200 * effectiveZoom)} />
        </div>

        {/* Scaled document + grid + drag handles */}
        <div style={{ position: 'relative', padding: 16 }}>
          <div
            ref={docRef}
            style={{
              position: 'relative',
              transform: `scale(${effectiveZoom})`,
              transformOrigin: 'top left',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}
          >
            {children}

            {/* Grid overlay */}
            {showGrid && (
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
                xmlns="http://www.w3.org/2000/svg"
              >
                {(() => {
                  const lines = [];
                  const g = Math.max(gridSize, 1);
                  for (let x = 0; x <= 1000; x += g) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={2000} stroke="#e2e8f044" strokeWidth={0.5} />);
                  for (let y = 0; y <= 2000; y += g) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#e2e8f044" strokeWidth={0.5} />);
                  return lines;
                })()}
              </svg>
            )}

            {/* Drag handles (absolutely positioned over the scaled document) */}
            {sigPos && <DragHandle type="signature" pos={sigPos} />}
            {stampPos && <DragHandle type="stamp" pos={stampPos} />}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Note on `designer.docType`:** The hook needs to expose `docType` so the overlay's keyboard handler can read the current element layout. Add `docType: PrintDocumentType` to the `BrandingDesignerHandle` return value and to `BrandingDesignerConfig`.

- [ ] **Step 2g: Create `BrandingDesignerPanel.tsx`**

```tsx
// frontend/src/print-templates/components/BrandingDesignerPanel.tsx

import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { formatUnit, ZOOM_PRESETS, GRID_SIZES, type GridSizeOption } from '../utils/designerUtils';
import type { ZoomLevel } from '../utils/designerUtils';

interface Props {
  designer: BrandingDesignerHandle;
  docLabel: string;
  onClose: () => void;
}

export default function BrandingDesignerPanel({ designer, docLabel, onClose }: Props) {
  const {
    localLayout, selected, setSelected, docType, updateElement,
    alignCenterH, alignCenterV, bringForward, sendBackward,
    resetElement, resetDoc,
    canUndo, canRedo, undo, redo,
    zoom, setZoom, showGrid, setShowGrid,
    snapEnabled, setSnapEnabled, gridSize, setGridSize,
    saving, saveError, save,
  } = designer;

  // Helper: access current element layout
  const el = localLayout[(docType ?? 'invoice') as 'invoice'|'quotation'][selected];
  const accentColor = selected === 'signature' ? '#3b82f6' : '#10b981';

  function NumSlider({ lbl, min, max, step, value, onChange }: {
    lbl: string; min: number; max: number; step: number; value: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'end', flexShrink: 0 }}>{lbl}</label>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input type="number" min={min} max={max} step={step}
          value={formatUnit(value)}
          onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) onChange(v); }}
          style={{ width: 52, fontSize: 11, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 3px' }}
        />
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 80, insetInlineEnd: 12, zIndex: 9000,
        width: 270, background: '#fff', borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0',
        direction: 'rtl', padding: '12px 14px', overflowY: 'auto', maxHeight: 'calc(100vh - 100px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>مصمم التوقيع — {docLabel}</span>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}>✕</button>
      </div>

      {/* Undo / Redo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button type="button" onClick={undo} disabled={!canUndo}
          style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid #d1d5db', background: canUndo ? '#fff' : 'transparent', cursor: canUndo ? 'pointer' : 'not-allowed', fontSize: 12, opacity: canUndo ? 1 : 0.4 }}>
          ↩ تراجع
        </button>
        <button type="button" onClick={redo} disabled={!canRedo}
          style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid #d1d5db', background: canRedo ? '#fff' : 'transparent', cursor: canRedo ? 'pointer' : 'not-allowed', fontSize: 12, opacity: canRedo ? 1 : 0.4 }}>
          ↪ إعادة
        </button>
      </div>

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>تكبير:</span>
        <select value={zoom}
          onChange={e => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value) as Exclude<ZoomLevel,'fit'>)}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', flex: 1 }}>
          {ZOOM_PRESETS.map(z => <option key={z} value={z}>{z}%</option>)}
          <option value="fit">ملاءمة</option>
        </select>
      </div>

      {/* Grid + Snap */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          شبكة
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} />
          محاذاة
        </label>
        {snapEnabled && (
          <select value={gridSize} onChange={e => setGridSize(Number(e.target.value) as GridSizeOption)}
            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db' }}>
            {GRID_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />

      {/* Element selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['signature', 'stamp'] as ElementType[]).map(type => (
          <button key={type} type="button" onClick={() => setSelected(type)}
            style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${selected === type ? accentColor : '#d1d5db'}`,
              background: selected === type ? accentColor : 'transparent',
              color: selected === type ? '#fff' : '#6b7280' }}>
            {type === 'signature' ? 'التوقيع' : 'الختم'}
          </button>
        ))}
      </div>

      {/* Properties */}
      <NumSlider lbl="أفقي X" min={-80} max={80} step={1} value={el.x} onChange={v => updateElement(selected, { x: v })} />
      <NumSlider lbl="رأسي Y" min={-60} max={60} step={1} value={el.y} onChange={v => updateElement(selected, { y: v })} />
      <NumSlider lbl="حجم" min={0.4} max={2.5} step={0.05} value={el.scale} onChange={v => updateElement(selected, { scale: v })} />
      <NumSlider lbl="شفافية" min={0.2} max={1} step={0.05} value={el.opacity} onChange={v => updateElement(selected, { opacity: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#6b7280', width: 52, textAlign: 'end' }}>طبقة</span>
        {[1, 2].map(z => (
          <label key={z} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="zidx" checked={el.zIndex === z} onChange={() => updateElement(selected, { zIndex: z })} />
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
          <button key={lbl} type="button" onClick={fn}
            style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Reset */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <button type="button" onClick={() => resetElement('signature')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #3b82f644', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#3b82f6' }}>
          إعادة ضبط التوقيع
        </button>
        <button type="button" onClick={() => resetElement('stamp')}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #10b98144', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#10b981' }}>
          إعادة ضبط الختم
        </button>
        <button type="button" onClick={resetDoc}
          style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#64748b' }}>
          إعادة ضبط {docLabel}
        </button>
      </div>

      {/* Keyboard hint */}
      <div style={{ fontSize: 10, color: '#94a3b8', background: '#f8fafc', padding: '6px 8px', borderRadius: 6, lineHeight: 1.6, marginBottom: 12 }}>
        ← → ↑ ↓ للتحريك — Shift+سهم: 10 وحدات<br />
        Ctrl+Z تراجع — Ctrl+Shift+Z إعادة
      </div>

      {/* Save / Cancel */}
      {saveError && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠️ {saveError}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onClose}
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #d1d5db', background: 'none', cursor: 'pointer', fontSize: 13 }}>
          إلغاء
        </button>
        <button type="button" onClick={save} disabled={saving}
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
          {saving ? '⏳' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2h: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors. Fix any TypeScript issues before continuing.

Common fix needed: add `docType: PrintDocumentType` to `BrandingDesignerHandle` interface and return it from the hook. Verify the overlay's keyboard handler uses `designer.docType` correctly.

- [ ] **Step 2i: Run tests — all pass**

```bash
cd frontend && npm test -- --run 2>&1 | tail -15
```
Expected: no failures.

- [ ] **Step 2j: Commit**

```bash
git add \
  frontend/src/print-templates/utils/designerUtils.ts \
  frontend/src/print-templates/hooks/useBrandingDesigner.ts \
  frontend/src/print-templates/components/BrandingDesignerOverlay.tsx \
  frontend/src/print-templates/components/BrandingDesignerPanel.tsx \
  frontend/src/__tests__/printTemplates/designerUtils.test.ts
git commit -m "feat(print): Phase 5A — shared branding designer engine (hook, overlay, panel, utils)"
```

---

## Task 3: Designer Mode in Invoice Preview

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`

**Approach:** InvoicePreview renders sig/stamp directly in the legacy view (lines 684–705). In designer mode we:
1. Pass `localLayout` instead of `branding.brandingLayout` to the signature rendering section
2. Add `data-bd-type="signature"` / `data-bd-type="stamp"` to the sig/stamp `<img>` elements when designer is active (so the overlay's drag handles can find them)
3. Wrap the document `<div>` in `<BrandingDesignerOverlay>`
4. Render `<BrandingDesignerPanel>` as a floating panel

The designer mode **does NOT switch to engine mode** — it works inside the existing legacy view which already has real invoice data (number, customer, amounts, items, payments).

**Interfaces consumed:**
```typescript
import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';
import BrandingDesignerOverlay from '../print-templates/components/BrandingDesignerOverlay';
import BrandingDesignerPanel from '../print-templates/components/BrandingDesignerPanel';
import { getBrandingLayoutForDocument } from '../print-templates/utils/brandingLayout';
```

**State to add (after existing state declarations):**
```typescript
const [savedBrandingLayout, setSavedBrandingLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
const designer = useBrandingDesigner({
  docType: 'invoice',
  initialLayout: branding.brandingLayout,
  onSaved: (layout) => setSavedBrandingLayout(layout),
});
const effectiveBrandingLayout = designer.isActive
  ? designer.localLayout
  : (savedBrandingLayout ?? branding.brandingLayout);
```

**Toolbar button to add** (inside the `no-print` toolbar div, after the PDF button):
```tsx
{branding.signatureUrl || branding.stampUrl ? (
  <button
    type="button"
    className="btn secondary"
    onClick={() => designer.isActive ? designer.deactivate() : designer.activate()}
    style={{ fontWeight: 600 }}
  >
    {designer.isActive ? '✓ إنهاء التصميم' : '🔧 وضع التصميم'}
  </button>
) : null}
```

**Signature rendering section change** (replace lines 684–705):
```tsx
{printShowSignature && branding.signatureUrl ? (() => {
  const invLayout = getBrandingLayoutForDocument(effectiveBrandingLayout, 'invoice');
  return (
    <img
      src={branding.signatureUrl}
      alt="توقيع المدير"
      {...(designer.isActive ? { 'data-bd-type': 'signature' } : {})}
      style={{ maxHeight: 40, maxWidth: 120, objectFit: 'contain', display: 'block', margin: '0 auto', ...applyBrandingElementStyle(invLayout.signature) }}
    />
  );
})() : <div style={{ height: 40 }} />}
{printShowStamp && branding.stampUrl ? (() => {
  const invLayout = getBrandingLayoutForDocument(effectiveBrandingLayout, 'invoice');
  return (
    <img
      src={branding.stampUrl}
      alt="ختم الشركة"
      {...(designer.isActive ? { 'data-bd-type': 'stamp' } : {})}
      style={{ maxHeight: 36, maxWidth: 100, objectFit: 'contain', display: 'block', margin: '4px auto 0', ...applyBrandingElementStyle(invLayout.stamp) }}
    />
  );
})() : null}
```

**Wrap the main document div** — the outer `<div className="inv-wrap" ...>` should be wrapped:

```tsx
<BrandingDesignerOverlay designer={designer}>
  <div className="inv-wrap" style={{ ... }}>
    {/* existing content */}
  </div>
</BrandingDesignerOverlay>
{designer.isActive && (
  <BrandingDesignerPanel
    designer={designer}
    docLabel="الفاتورة"
    onClose={designer.deactivate}
  />
)}
```

- [ ] **Step 3a: Implement the changes to InvoicePreview.tsx**

Add imports, state, `effectiveBrandingLayout`, toolbar button, modified sig/stamp rendering, overlay + panel wrapping as described above.

- [ ] **Step 3b: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3c: Run tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -10
```
Expected: no failures.

- [ ] **Step 3d: Manual smoke test — Invoice Designer**

1. Run `npm run dev`
2. Open an invoice in the browser
3. Click "🔧 وضع التصميم" — panel slides in
4. Rulers and grid controls appear
5. Blue/green drag handles appear over signature and stamp
6. Drag a handle — the image moves
7. X/Y values in panel update
8. Press arrow keys — image moves 1 unit
9. Shift+arrow — 10 units
10. Enable grid → grid lines appear
11. Enable snap → drag snaps to grid
12. Ctrl+Z → undo
13. Ctrl+Shift+Z → redo
14. "توسيط أفقي" → signature centers horizontally (x=0)
15. Reset signature → x/y/scale/opacity reset
16. Click "حفظ" → panel closes, branding remains at new position
17. Print (Ctrl+P) → designer UI hidden, document prints correctly
18. PDF export → works
19. Switch to engine template mode (✨ قالب الطباعة) → still works (not affected)

- [ ] **Step 3e: Commit**

```bash
git add frontend/src/pages/InvoicePreview.tsx
git commit -m "feat(print): Phase 5A — Designer Mode inside Invoice Preview"
```

---

## Task 4: Designer Mode in Quotation Preview

**Files:**
- Modify: `frontend/src/print-templates/reference/quotations/QuotationBase.tsx`
- Modify: `frontend/src/pages/Quotation.tsx`

**Sub-task 4a: Add `data-bd-type` attributes to QuotationBase**

In `QuotationBase.tsx`, the signature section is around lines 275–289. Add `data-bd-type` to both `<img>` elements:

```tsx
{d.company?.showSignature !== false && d.company?.signatureUrl && (
  <img
    src={d.company.signatureUrl}
    alt=""
    data-bd-type="signature"   {/* ADD THIS LINE */}
    style={{ maxHeight: '20mm', maxWidth: '40mm', objectFit: 'contain', display: 'block', margin: '0 auto 2mm', ...applyBrandingElementStyle(brandingLayout.signature) }}
  />
)}
...
{d.company?.showStamp !== false && d.company?.stampUrl ? (
  <img
    src={d.company.stampUrl}
    alt=""
    data-bd-type="stamp"       {/* ADD THIS LINE */}
    style={{ maxHeight: '20mm', maxWidth: '40mm', objectFit: 'contain', display: 'block', margin: '4mm auto 0', ...applyBrandingElementStyle(brandingLayout.stamp) }}
  />
) : ...}
```

This is a 2-line addition. No logic changes. All 10 quotation template variants use `QuotationBase`, so they all inherit the data attributes automatically.

**Sub-task 4b: Add Designer Mode to Quotation.tsx (engine mode only)**

In `Quotation.tsx`, the engine mode section starts around line 214. In engine mode, the document is rendered via `<EngineComponent data={brandedPrintData ?? undefined} />`.

**State to add** (at the top of the component, with other state):
```typescript
const [savedBrandingLayout, setSavedBrandingLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
const designer = useBrandingDesigner({
  docType: 'quotation',
  initialLayout: branding.brandingLayout,
  onSaved: (layout) => setSavedBrandingLayout(layout),
});
```

**Effective branding layout** — in the `brandedPrintData` useMemo, replace `brandingLayout: branding.brandingLayout` with:
```typescript
brandingLayout: designer.isActive
  ? designer.localLayout
  : (savedBrandingLayout ?? branding.brandingLayout),
```

But `brandedPrintData` is a `useMemo` that doesn't have `designer` in its dep array yet — add it:
```typescript
const brandedPrintData = useMemo(() => {
  if (!printData) return null;
  const effectiveLayout = designer.isActive
    ? designer.localLayout
    : (savedBrandingLayout ?? branding.brandingLayout);
  return {
    ...printData,
    company: createCompanyPrintData({
      signatureUrl: branding.signatureUrl,
      stampUrl: branding.stampUrl,
      showSignature: printShowSignature,
      showStamp: printShowStamp,
      brandingLayout: effectiveLayout,
    }),
  };
}, [printData, branding.signatureUrl, branding.stampUrl, printShowSignature, printShowStamp,
    designer.isActive, designer.localLayout, savedBrandingLayout, branding.brandingLayout]);
```

**Toolbar button** (add to engine mode toolbar, after the PDF button):
```tsx
{(branding.signatureUrl || branding.stampUrl) && (
  <button
    type="button"
    className="btn secondary"
    onClick={() => designer.isActive ? designer.deactivate() : designer.activate()}
    style={{ fontWeight: 600 }}
  >
    {designer.isActive ? '✓ إنهاء التصميم' : '🔧 وضع التصميم'}
  </button>
)}
```

**Engine template section** — wrap `<EngineComponent>` in the overlay:
```tsx
{/* Engine template */}
<BrandingDesignerOverlay designer={designer}>
  <EngineComponent data={brandedPrintData ?? undefined} />
</BrandingDesignerOverlay>
{designer.isActive && (
  <BrandingDesignerPanel
    designer={designer}
    docLabel="عرض السعر"
    onClose={designer.deactivate}
  />
)}
```

- [ ] **Step 4a: Add data-bd-type attributes to QuotationBase.tsx**

Make the 2-line change described above. Verify with TypeScript: these are valid HTML attributes on `<img>` elements.

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i quotation
```
Expected: no errors.

- [ ] **Step 4b: Add designer mode to Quotation.tsx**

Implement the changes: import statements, state declarations, updated `brandedPrintData` memo, toolbar button, overlay wrapping.

- [ ] **Step 4c: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4d: Manual smoke test — Quotation Designer**

1. Open Quotation page
2. Click "✨ قالب الطباعة" to switch to engine mode
3. Click "🔧 وضع التصميم" — panel appears
4. Fill in customer name and items; template re-renders with real data
5. Drag handles appear over sig/stamp in the rendered template
6. Drag signature → moves in the template
7. Values update in panel
8. Keyboard arrows work
9. Snap/grid work
10. Undo/redo work
11. Save → panel closes, layout persisted
12. Switch back to legacy mode → form still works
13. Print → designer UI hidden, template prints correctly

- [ ] **Step 4e: Commit**

```bash
git add \
  frontend/src/print-templates/reference/quotations/QuotationBase.tsx \
  frontend/src/pages/Quotation.tsx
git commit -m "feat(print): Phase 5A — Designer Mode inside Quotation Preview (engine template)"
```

---

## Task 5: Validation, Tests, and Smoke Tests

**Files:** no new code — validation only.

- [ ] **Step 5a: TypeScript — all three layers**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
cd frontend && npx tsc --noEmit 2>&1 | head -20
npx tsc -p electron/tsconfig.json --noEmit 2>&1 | head -20
```
Expected: all produce no output.

- [ ] **Step 5b: Prisma validate**

```bash
cd backend && npx prisma validate
```
Expected: `The schema at ... is valid 🚀`

- [ ] **Step 5c: All tests pass**

```bash
cd backend && npm test -- --run 2>&1 | tail -10
cd frontend && npm test -- --run 2>&1 | tail -10
```
Expected: no failures. Frontend should include the 22 new `designerUtils.test.ts` tests.

- [ ] **Step 5d: Build validation**

```bash
npm run build:back 2>&1 | tail -5
npm run build:front 2>&1 | tail -5
npm run electron:build 2>&1 | tail -5
```
Expected: all three succeed with no errors.

- [ ] **Step 5e: Full smoke test (30 points)**

Run `npm run dev` and verify manually:

1. Open Settings → Print Documents section
2. `BrandingLayoutDesigner` still accessible via "معايرة التوقيع والختم" (Phase 4 regression check)
3. Open an invoice
4. Invoice displays correctly (legacy view — regression check)
5. Click "🔧 وضع التصميم"
6. Designer panel slides in at top-right
7. Horizontal + vertical rulers appear
8. Grid checkbox shows grid overlay when checked
9. Snap works during drag
10. Drag signature handle → sig moves in real invoice
11. Drag stamp handle → stamp moves in real invoice
12. Slider values in panel update during drag
13. Arrow key (1 unit move) works
14. Shift+arrow (10 unit move) works
15. Undo (Ctrl+Z) works
16. Redo (Ctrl+Shift+Z) works
17. "توسيط أفقي" → x becomes 0
18. "إعادة ضبط التوقيع" → signature resets
19. Click "حفظ" → panel closes, layout saved
20. Print Ctrl+P → no designer UI visible in print
21. PDF export → works, layout applied correctly
22. Engine mode (✨ قالب الطباعة) → still works (Phase 4 regression)
23. Open Quotation page → legacy form works
24. Switch to engine mode (✨ قالب الطباعة)
25. Click "🔧 وضع التصميم"
26. Panel appears
27. Drag handles visible over sig/stamp in template
28. Drag works
29. Save → layout persisted
30. QuotationDesign1 through QuotationDesign5 all show `data-bd-type` handles (check by switching templates in the selector)

- [ ] **Step 5f: Final commit (any validation fixes)**

```bash
git add -p
git commit -m "fix(print): Phase 5A validation fixes"
```

---

## Self-Review Checklist

| Spec Requirement | Task | Covered |
|-----------------|------|---------|
| Designer Mode inside InvoicePreview | Task 3 | ✓ |
| Designer Mode inside Quotation | Task 4 | ✓ |
| Real invoice data shown | Task 3 (legacy view with real API data) | ✓ |
| Real quotation data shown | Task 4 (engine template with real form fields) | ✓ |
| Real signature / stamp images | Tasks 3 + 4 | ✓ |
| Direct drag on real document | Tasks 3 + 4 | ✓ |
| Selected element outline | BrandingDesignerOverlay DragHandle `isSelected` border | ✓ |
| Zoom (50/75/100/150/200/Fit) | BrandingDesignerPanel + hook `zoom` state | ✓ |
| Grid overlay | BrandingDesignerOverlay SVG grid | ✓ |
| Snap to grid | hook `snapEnabled` + `snapToGrid` in `continueDrag` | ✓ |
| Rulers | BrandingDesignerOverlay `HRuler`/`VRuler` | ✓ |
| Keyboard movement (Arrow + Shift+Arrow) | BrandingDesignerOverlay `onKey` handler | ✓ |
| Undo / Redo (Ctrl+Z / Ctrl+Shift+Z) | hook history + overlay key handler | ✓ |
| Undo / Redo buttons | BrandingDesignerPanel | ✓ |
| Alignment (center H/V, bring/send) | hook + panel | ✓ |
| Reset element / Reset doc | hook + panel | ✓ |
| Save persists to Settings API | hook `save()` → `api.put('/settings')` | ✓ |
| Settings key unchanged | `print.brandingLayout` | ✓ |
| JSON shape unchanged | Phase 4 serialization used as-is | ✓ |
| No zoom/grid/snap persisted | local state only | ✓ |
| Phase 1–4 compatibility | BrandingLayoutDesigner unchanged | ✓ |
| PDF export unaffected | no changes to export logic | ✓ |
| window.print unaffected | designer UI has `.no-print` class | ✓ |
| Shared architecture (reusable) | `useBrandingDesigner` + `BrandingDesignerOverlay` used by both pages | ✓ |
| Pure-function tests | 22 tests in `designerUtils.test.ts` | ✓ |
| Zero new npm packages | ✓ | ✓ |

**Deferred (out of scope for Phase 5A):**
- Designer mode on invoice ENGINE templates (InvoiceDesign1-5) — needs `data-bd-type` on those templates; planned for Phase 5B
- Ctrl+mouse-wheel zoom — deferred
- Rotation field — deferred
- Text editing / text styling — Phase 5C
- Settings `BrandingLayoutDesigner` simplified to a launcher — Phase 5B cleanup

---

## Regression Risks

| Risk | Mitigation |
|------|-----------|
| `designer.isActive` useMemo dependency array changes trigger extra renders | `useMemo` dep array explicitly includes `designer.isActive` and `designer.localLayout` |
| `BrandingDesignerOverlay` `[data-bd-type]` query finds no elements (handles disappear) | Check happens in `useEffect` with `localLayout` and `effectiveZoom` deps; graceful null guard |
| `data-bd-type` on QuotationBase breaks existing snapshot/integration tests | No snapshot tests exist for templates (confirmed by existing test files) |
| `useBrandingDesigner` initial layout is `undefined` (branding not yet loaded) | Hook initializes with `DEFAULT_BRANDING_LAYOUT` and updates via `useEffect` when `initialLayout` changes |
| Print stylesheet hides `no-print` elements | All designer UI uses `className="no-print"` consistently |
