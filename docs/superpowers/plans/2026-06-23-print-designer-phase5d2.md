# Print Designer Phase 5D.2 — Universal Layout Designer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Print Designer into a true Universal Layout Designer that supports drag, resize, rotation, multi-selection, smart guides, lock/hide, copy/paste/duplicate, and import/export of layout JSON for all supported document elements (title, customer block, table, footer, signature, stamp).

**Architecture:** A CSS-transform injection approach: layout overrides per element per doc-type are stored in a new settings key (`print.layoutOverrides`) and applied as a `<style>` tag via `LayoutOverrideStyles`. A new `useLayoutDesigner` hook owns drag/resize/rotation/multi-select/history. A new `UniversalDesignerOverlay` replaces `BrandingDesignerOverlay` as the canvas, preserving the branding sub-system unchanged via its existing `BrandingDesignerHandle`. All features are frontend-only; no backend, no Prisma, no IPC changes.

**Tech Stack:** React 18, TypeScript 5.5, Pointer Events API, Web FileReader API (import), `URL.createObjectURL` (export), existing `historyPush`/`historyUndo`/`historyRedo` utilities, existing Axios API client.

## Global Constraints

- No new npm packages
- No Prisma migration; no backend route changes; no Electron IPC changes
- Settings persistence: `api.put('/settings', { settings: [{ key: 'print.layoutOverrides', value: JSON.stringify(...), group: 'print' }] })`
- Preserve all Phase 1–5D.1 exports: `BrandingDesignerHandle`, `BrandingElementLayout`, `useBrandingDesigner`, `BrandingDesignerOverlay`, `BrandingDesignerPanel`, `BrandingDesignerToolbar`, `useTextStyleDesigner`, `useStaticTextDesigner` — all unchanged
- `window.print()` and PDF export preserved — CSS injected via `<style>` tag applies during print
- A4 canvas: 794 × 1123 px at 100% zoom = 210 × 297 mm. Conversion: `PX_PER_MM = 794 / 210 ≈ 3.7795`
- RTL: all Arabic labels go right-to-left; direction: 'rtl' on all designer UI panels
- Layout element IDs reuse existing `data-designer-id` values; new IDs added for footer

## Layout Element Registry (Invoice)

Elements that can be layout-manipulated:

| data-designer-id        | DOM tag    | Transform safe? | Notes                         |
|-------------------------|-----------|-----------------|-------------------------------|
| invoice.title           | `<div>`   | ✅              | Already has data attr         |
| invoice.customerBlock   | `<div>`   | ✅              | Already has data attr         |
| invoice.tableBorder     | `<table>` | ✅ (Chromium)   | Wraps items + totals          |
| invoice.footerBlock     | `<div>`   | ✅              | **New** attr needed in tmpl   |
| invoice.signature       | `<img>`   | ✅              | Handled by branding sub-sys   |
| invoice.stamp           | `<img>`   | ✅              | Handled by branding sub-sys   |

Table internals (`thead`, `tbody`, `tfoot`) cannot receive independent CSS transforms. They are excluded from layout manipulation.

## File Structure

### New files
```
frontend/src/print-templates/designer/
  layoutOverrideTypes.ts         — LayoutElementOverride, AllLayoutOverrides types
  layoutOverrideUtils.ts         — clamp, CSS generation, serialize/deserialize, defaults

frontend/src/print-templates/hooks/
  useLayoutDesigner.ts           — core layout state: drag, resize, rotation, multi-select, history

frontend/src/print-templates/components/
  LayoutOverrideStyles.tsx       — renders <style> tag with transform CSS per element
  SmartGuides.tsx                — SVG guide lines rendered inside canvas
  UniversalDesignerOverlay.tsx   — full-canvas overlay replacing BrandingDesignerOverlay
  LayoutDesignerPanel.tsx        — floating properties panel for layout elements
  LayoutDesignerToolbar.tsx      — toolbar with copy/paste/duplicate/align/lock/hide/import/export

frontend/src/__tests__/printTemplates/
  layoutOverride.test.ts         — type util tests
  useLayoutDesigner.test.ts      — hook tests
  smartGuides.test.ts            — guide computation tests
```

### Modified files
```
frontend/src/print-templates/designer/designerTypes.ts
  — add 'layout' to DesignerElementKind; enable all DESIGNER_CAPABILITIES

frontend/src/print-templates/utils/designerUtils.ts
  — add mmToPx, pxToMm, computeSmartGuides, snapToGuide helpers

frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx
  — add data-designer-id="invoice.footerBlock" to .foot div

frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx
  — same footer instrumentation

frontend/src/print-templates/components/index.ts
  — export new components

frontend/src/pages/InvoicePreview.tsx
  — import useLayoutDesigner + LayoutOverrideStyles + UniversalDesignerOverlay; replace BrandingDesignerOverlay

frontend/src/pages/Quotation.tsx
  — same integration
```

---

## Task 1: Layout Override Types & Utilities

**Files:**
- Create: `frontend/src/print-templates/designer/layoutOverrideTypes.ts`
- Create: `frontend/src/print-templates/designer/layoutOverrideUtils.ts`
- Create: `frontend/src/__tests__/printTemplates/layoutOverride.test.ts`

**Interfaces:**
- Produces: `LayoutElementOverride`, `DocumentLayoutOverrides`, `AllLayoutOverrides`, `DEFAULT_LAYOUT_ELEMENT`, `clampLayoutElement`, `applyLayoutCSS`, `serializeAllLayouts`, `parseAllLayouts`, exported from `layoutOverrideTypes.ts` and `layoutOverrideUtils.ts`

---

- [ ] **Step 1.1: Write types file**

Create `frontend/src/print-templates/designer/layoutOverrideTypes.ts`:
```typescript
import type { PrintDocumentType } from '../engine/types';

export interface LayoutElementOverride {
  x: number;        // px offset from natural position (translate X)
  y: number;        // px offset from natural position (translate Y)
  rotation: number; // degrees, -180 to 180
  scaleX: number;   // width scale, 0.1 to 5
  scaleY: number;   // height scale, 0.1 to 5
  zIndex: number;   // 1 to 20
  opacity: number;  // 0.1 to 1
  hidden: boolean;
  locked: boolean;
}

// keyed by data-designer-id value, e.g. 'invoice.title'
export type DocumentLayoutOverrides = Partial<Record<string, LayoutElementOverride>>;

export type AllLayoutOverrides = Record<PrintDocumentType, DocumentLayoutOverrides>;

// IDs eligible for layout manipulation (excludes table internals)
export const LAYOUT_ELEMENT_IDS = [
  'invoice.title',
  'invoice.customerBlock',
  'invoice.tableBorder',
  'invoice.footerBlock',
  'quotation.title',
  'quotation.customerBlock',
  'quotation.tableBorder',
  'quotation.footerBlock',
] as const;

export type LayoutElementId = typeof LAYOUT_ELEMENT_IDS[number];

export const LAYOUT_ELEMENT_LABELS: Record<string, string> = {
  'invoice.title': 'عنوان الفاتورة',
  'invoice.customerBlock': 'بيانات العميل',
  'invoice.tableBorder': 'جدول البنود',
  'invoice.footerBlock': 'تذييل الصفحة',
  'quotation.title': 'عنوان عرض السعر',
  'quotation.customerBlock': 'بيانات العميل',
  'quotation.tableBorder': 'جدول البنود',
  'quotation.footerBlock': 'تذييل الصفحة',
};
```

- [ ] **Step 1.2: Write utilities file**

Create `frontend/src/print-templates/designer/layoutOverrideUtils.ts`:
```typescript
import type { LayoutElementOverride, DocumentLayoutOverrides, AllLayoutOverrides } from './layoutOverrideTypes';
import type { PrintDocumentType } from '../engine/types';

export const DEFAULT_LAYOUT_ELEMENT: LayoutElementOverride = {
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
  zIndex: 1, opacity: 1, hidden: false, locked: false,
};

export const DEFAULT_ALL_LAYOUTS: AllLayoutOverrides = {
  invoice: {},
  quotation: {},
};

export function clampLayoutElement(el: LayoutElementOverride): LayoutElementOverride {
  return {
    ...el,
    x: Math.max(-400, Math.min(400, el.x)),
    y: Math.max(-600, Math.min(600, el.y)),
    rotation: Math.max(-180, Math.min(180, el.rotation)),
    scaleX: Math.max(0.1, Math.min(5, el.scaleX)),
    scaleY: Math.max(0.1, Math.min(5, el.scaleY)),
    zIndex: Math.max(1, Math.min(20, Math.round(el.zIndex))),
    opacity: Math.max(0.1, Math.min(1, el.opacity)),
  };
}

export function getLayoutElement(
  overrides: DocumentLayoutOverrides,
  id: string,
): LayoutElementOverride {
  return overrides[id] ?? { ...DEFAULT_LAYOUT_ELEMENT };
}

// Generate CSS transform string for an override
export function layoutElementToCSS(id: string, el: LayoutElementOverride): string {
  const transform = `translate(${el.x}px, ${el.y}px) rotate(${el.rotation}deg) scaleX(${el.scaleX}) scaleY(${el.scaleY})`;
  const display = el.hidden ? 'display: none !important;' : '';
  return `[data-designer-id="${id}"] {
  transform: ${transform} !important;
  transform-origin: top left !important;
  opacity: ${el.opacity} !important;
  position: relative !important;
  z-index: ${el.zIndex} !important;
  ${display}
}`;
}

// Build full <style> content for all overrides
export function buildLayoutStyleSheet(overrides: DocumentLayoutOverrides): string {
  const rules: string[] = [];
  for (const [id, el] of Object.entries(overrides)) {
    if (!el) continue;
    // Only emit CSS if something non-default
    const isDefault = el.x === 0 && el.y === 0 && el.rotation === 0 &&
      el.scaleX === 1 && el.scaleY === 1 && el.zIndex === 1 &&
      el.opacity === 1 && !el.hidden;
    if (!isDefault) {
      rules.push(layoutElementToCSS(id, el));
    }
  }
  return rules.join('\n');
}

export function serializeAllLayouts(layouts: AllLayoutOverrides): string {
  return JSON.stringify(layouts);
}

export function parseAllLayouts(value: string | null | undefined): AllLayoutOverrides {
  if (!value) return { invoice: {}, quotation: {} };
  try {
    const parsed = JSON.parse(value) as AllLayoutOverrides;
    return {
      invoice: parsed.invoice ?? {},
      quotation: parsed.quotation ?? {},
    };
  } catch {
    return { invoice: {}, quotation: {} };
  }
}

export function patchDocumentLayout(
  all: AllLayoutOverrides,
  docType: PrintDocumentType,
  id: string,
  patch: Partial<LayoutElementOverride>,
): AllLayoutOverrides {
  const existing = all[docType][id] ?? { ...DEFAULT_LAYOUT_ELEMENT };
  return {
    ...all,
    [docType]: {
      ...all[docType],
      [id]: clampLayoutElement({ ...existing, ...patch }),
    },
  };
}
```

- [ ] **Step 1.3: Write tests**

Create `frontend/src/__tests__/printTemplates/layoutOverride.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  clampLayoutElement,
  DEFAULT_LAYOUT_ELEMENT,
  layoutElementToCSS,
  buildLayoutStyleSheet,
  serializeAllLayouts,
  parseAllLayouts,
  patchDocumentLayout,
} from '../../print-templates/designer/layoutOverrideUtils';

describe('clampLayoutElement', () => {
  it('clamps x to -400..400', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, x: 9999 }).x).toBe(400);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, x: -9999 }).x).toBe(-400);
  });

  it('clamps rotation to -180..180', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, rotation: 270 }).rotation).toBe(180);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, rotation: -270 }).rotation).toBe(-180);
  });

  it('clamps scaleX to 0.1..5', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, scaleX: 0 }).scaleX).toBe(0.1);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, scaleX: 100 }).scaleX).toBe(5);
  });

  it('clamps opacity to 0.1..1', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, opacity: 0 }).opacity).toBe(0.1);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, opacity: 2 }).opacity).toBe(1);
  });
});

describe('layoutElementToCSS', () => {
  it('generates transform with all components', () => {
    const el = { ...DEFAULT_LAYOUT_ELEMENT, x: 10, y: -5, rotation: 15, scaleX: 1.2, scaleY: 0.9 };
    const css = layoutElementToCSS('invoice.title', el);
    expect(css).toContain('translate(10px, -5px)');
    expect(css).toContain('rotate(15deg)');
    expect(css).toContain('scaleX(1.2)');
    expect(css).toContain('scaleY(0.9)');
    expect(css).toContain('[data-designer-id="invoice.title"]');
  });

  it('includes display none for hidden elements', () => {
    const el = { ...DEFAULT_LAYOUT_ELEMENT, hidden: true };
    expect(layoutElementToCSS('invoice.title', el)).toContain('display: none');
  });
});

describe('buildLayoutStyleSheet', () => {
  it('emits empty string when all overrides are default', () => {
    const css = buildLayoutStyleSheet({ 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT } });
    expect(css).toBe('');
  });

  it('emits CSS only for non-default elements', () => {
    const css = buildLayoutStyleSheet({
      'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT, x: 20 },
      'invoice.customerBlock': { ...DEFAULT_LAYOUT_ELEMENT },
    });
    expect(css).toContain('invoice.title');
    expect(css).not.toContain('invoice.customerBlock');
  });
});

describe('parseAllLayouts / serializeAllLayouts', () => {
  it('round-trips correctly', () => {
    const layouts = {
      invoice: { 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT, x: 10 } },
      quotation: {},
    };
    const result = parseAllLayouts(serializeAllLayouts(layouts));
    expect(result.invoice['invoice.title']?.x).toBe(10);
  });

  it('returns defaults for null/invalid input', () => {
    expect(parseAllLayouts(null)).toEqual({ invoice: {}, quotation: {} });
    expect(parseAllLayouts('not-json')).toEqual({ invoice: {}, quotation: {} });
  });
});

describe('patchDocumentLayout', () => {
  it('patches a single element without affecting others', () => {
    const all = { invoice: { 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT } }, quotation: {} };
    const result = patchDocumentLayout(all, 'invoice', 'invoice.title', { x: 50 });
    expect(result.invoice['invoice.title']?.x).toBe(50);
    expect(result.invoice['invoice.title']?.y).toBe(0); // unchanged
    expect(result.quotation).toEqual({});
  });
});
```

- [ ] **Step 1.4: Run tests**

```bash
cd frontend && npx vitest run src/__tests__/printTemplates/layoutOverride.test.ts
```
Expected: All tests PASS.

- [ ] **Step 1.5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 1.6: Commit**

```bash
git add frontend/src/print-templates/designer/layoutOverrideTypes.ts frontend/src/print-templates/designer/layoutOverrideUtils.ts frontend/src/__tests__/printTemplates/layoutOverride.test.ts
git commit -m "feat(print): Phase 5D.2 — layout override types and utilities"
```

---

## Task 2: Smart Guide Utilities

**Files:**
- Modify: `frontend/src/print-templates/utils/designerUtils.ts`
- Create: `frontend/src/__tests__/printTemplates/smartGuides.test.ts`

**Interfaces:**
- Produces: `mmToPx(mm)`, `pxToMm(px)`, `ElementRect`, `GuideSnap`, `computeSmartGuides(movingRects, staticRects, canvasW, canvasH, threshold)`, `applyGuideSnap(x, y, snaps)`

---

- [ ] **Step 2.1: Add mm/px utilities and smart guide logic to designerUtils.ts**

Append to `frontend/src/print-templates/utils/designerUtils.ts`:
```typescript
// ── mm ↔ px conversion (A4: 794px = 210mm) ──────────────────────────────────

export const PX_PER_MM = 794 / 210; // ≈ 3.7795

export function mmToPx(mm: number): number { return mm * PX_PER_MM; }
export function pxToMm(px: number): number { return px / PX_PER_MM; }

// ── Smart guides ──────────────────────────────────────────────────────────────

export interface ElementRect { x: number; y: number; w: number; h: number; }

export interface GuideLine {
  axis: 'x' | 'y'; // x = vertical line, y = horizontal line
  position: number; // px coordinate on that axis
  from: number;     // perpendicular axis start (for rendering)
  to: number;       // perpendicular axis end
}

export interface GuideSnap {
  lines: GuideLine[];
  dx: number; // x correction to snap
  dy: number; // y correction to snap
}

function centerX(r: ElementRect) { return r.x + r.w / 2; }
function centerY(r: ElementRect) { return r.y + r.h / 2; }

export function computeSmartGuides(
  movingRects: ElementRect[],
  staticRects: ElementRect[],
  canvasW: number,
  canvasH: number,
  threshold = 6,
): GuideSnap {
  const lines: GuideLine[] = [];
  let dx = 0;
  let dy = 0;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  const canvasRect: ElementRect = { x: 0, y: 0, w: canvasW, h: canvasH };
  const allStatic = [...staticRects, canvasRect];

  // X-axis candidates: left edges, centers, right edges
  const xCandidates = allStatic.flatMap((r) => [r.x, centerX(r), r.x + r.w]);
  const yCandidates = allStatic.flatMap((r) => [r.y, centerY(r), r.y + r.h]);

  for (const moving of movingRects) {
    const mPoints = {
      left: moving.x, centerX: centerX(moving), right: moving.x + moving.w,
      top: moving.y, centerY: centerY(moving), bottom: moving.y + moving.h,
    };

    for (const candidate of xCandidates) {
      for (const mKey of ['left', 'centerX', 'right'] as const) {
        const diff = candidate - mPoints[mKey];
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestDx)) {
          bestDx = diff;
          dx = diff;
          lines.push({ axis: 'x', position: candidate, from: 0, to: canvasH });
        }
      }
    }

    for (const candidate of yCandidates) {
      for (const mKey of ['top', 'centerY', 'bottom'] as const) {
        const diff = candidate - mPoints[mKey];
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestDy)) {
          bestDy = diff;
          dy = diff;
          lines.push({ axis: 'y', position: candidate, from: 0, to: canvasW });
        }
      }
    }
  }

  // Deduplicate guide lines
  const seen = new Set<string>();
  const uniqueLines = lines.filter((g) => {
    const key = `${g.axis}:${g.position}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { lines: uniqueLines, dx: bestDx > threshold ? 0 : dx, dy: bestDy > threshold ? 0 : dy };
}
```

- [ ] **Step 2.2: Write smart guide tests**

Create `frontend/src/__tests__/printTemplates/smartGuides.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { computeSmartGuides, mmToPx, pxToMm } from '../../print-templates/utils/designerUtils';

describe('mmToPx / pxToMm', () => {
  it('converts A4 width correctly', () => {
    expect(Math.round(mmToPx(210))).toBe(794);
    expect(Math.round(pxToMm(794))).toBe(210);
  });
  it('round-trips', () => {
    expect(pxToMm(mmToPx(50))).toBeCloseTo(50);
  });
});

describe('computeSmartGuides', () => {
  it('returns no snap when far from any guide', () => {
    const moving = [{ x: 100, y: 100, w: 50, h: 30 }];
    const static_ = [{ x: 500, y: 500, w: 50, h: 30 }];
    const result = computeSmartGuides(moving, static_, 794, 1123, 6);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('snaps left edge to static left edge when within threshold', () => {
    const moving = [{ x: 97, y: 200, w: 50, h: 30 }]; // 3px away from x=100
    const static_ = [{ x: 100, y: 50, w: 80, h: 40 }];
    const result = computeSmartGuides(moving, static_, 794, 1123, 6);
    expect(result.dx).toBe(3); // move +3 to align left at x=100
    expect(result.lines.some((l) => l.axis === 'x' && l.position === 100)).toBe(true);
  });

  it('snaps to canvas center', () => {
    const moving = [{ x: 370, y: 100, w: 50, h: 30 }]; // center at 395, canvas center at 397
    const result = computeSmartGuides(moving, [], 794, 1123, 6);
    // canvas center is 794/2=397. moving center is 370+25=395. diff=2, within threshold
    expect(result.dx).toBe(2);
  });
});
```

- [ ] **Step 2.3: Run tests**

```bash
cd frontend && npx vitest run src/__tests__/printTemplates/smartGuides.test.ts
```
Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add frontend/src/print-templates/utils/designerUtils.ts frontend/src/__tests__/printTemplates/smartGuides.test.ts
git commit -m "feat(print): Phase 5D.2 — mm conversion and smart guide computation"
```

---

## Task 3: useLayoutDesigner Hook

**Files:**
- Create: `frontend/src/print-templates/hooks/useLayoutDesigner.ts`
- Create: `frontend/src/__tests__/printTemplates/useLayoutDesigner.test.ts`

**Interfaces:**
- Consumes: `AllLayoutOverrides`, `DocumentLayoutOverrides`, `LayoutElementOverride` from Task 1; `historyPush`, `historyUndo`, `historyRedo`, `snapToGrid`, `ZoomLevel`, `GridSizeOption` from existing utils
- Produces: `LayoutDesignerHandle`, `useLayoutDesigner`

---

- [ ] **Step 3.1: Create the hook**

Create `frontend/src/print-templates/hooks/useLayoutDesigner.ts`:
```typescript
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
  function alignCenterH(canvasW: number) { updateMany([...selectedIds], { x: 0 }); } // natural = centered
  function alignCenterV(canvasH: number) { updateMany([...selectedIds], { y: 0 }); }

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
```

- [ ] **Step 3.2: Write hook tests**

Create `frontend/src/__tests__/printTemplates/useLayoutDesigner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutDesigner } from '../../print-templates/hooks/useLayoutDesigner';

describe('useLayoutDesigner', () => {
  it('starts inactive', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    expect(result.current.isActive).toBe(false);
  });

  it('activates and deactivates', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    expect(result.current.isActive).toBe(true);
    act(() => result.current.deactivate());
    expect(result.current.isActive).toBe(false);
  });

  it('updateElement pushes to history and enables undo', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    act(() => result.current.updateElement('invoice.title', { x: 50 }));
    expect(result.current.layouts.invoice['invoice.title']?.x).toBe(50);
    expect(result.current.canUndo).toBe(true);
  });

  it('undo reverts updateElement', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    act(() => result.current.updateElement('invoice.title', { x: 50 }));
    act(() => result.current.undo());
    expect(result.current.layouts.invoice['invoice.title']?.x ?? 0).toBe(0);
  });

  it('selectOne replaces selection', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.selectOne('invoice.title'));
    act(() => result.current.addToSelection('invoice.customerBlock'));
    act(() => result.current.selectOne('invoice.tableBorder'));
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.isSelected('invoice.tableBorder')).toBe(true);
  });

  it('hideSelected sets hidden on all selected', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    act(() => result.current.selectOne('invoice.title'));
    act(() => result.current.addToSelection('invoice.footerBlock'));
    act(() => result.current.hideSelected());
    expect(result.current.layouts.invoice['invoice.title']?.hidden).toBe(true);
    expect(result.current.layouts.invoice['invoice.footerBlock']?.hidden).toBe(true);
  });

  it('resetElement restores defaults', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    act(() => result.current.updateElement('invoice.title', { x: 100, rotation: 45 }));
    act(() => result.current.resetElement('invoice.title'));
    const el = result.current.layouts.invoice['invoice.title'];
    expect(el?.x ?? 0).toBe(0);
    expect(el?.rotation ?? 0).toBe(0);
  });

  it('copySelected then paste offsets by 10px', () => {
    const { result } = renderHook(() => useLayoutDesigner({ docType: 'invoice' }));
    act(() => result.current.activate());
    act(() => result.current.updateElement('invoice.title', { x: 30 }));
    act(() => result.current.selectOne('invoice.title'));
    act(() => result.current.copySelected());
    act(() => result.current.paste());
    expect(result.current.layouts.invoice['invoice.title']?.x).toBe(40); // 30 + 10
  });
});
```

- [ ] **Step 3.3: Run tests**

```bash
cd frontend && npx vitest run src/__tests__/printTemplates/useLayoutDesigner.test.ts
```
Expected: PASS.

- [ ] **Step 3.4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/print-templates/hooks/useLayoutDesigner.ts frontend/src/__tests__/printTemplates/useLayoutDesigner.test.ts
git commit -m "feat(print): Phase 5D.2 — useLayoutDesigner hook"
```

---

## Task 4: LayoutOverrideStyles Component

**Files:**
- Create: `frontend/src/print-templates/components/LayoutOverrideStyles.tsx`

**Interfaces:**
- Consumes: `DocumentLayoutOverrides`, `buildLayoutStyleSheet` from Task 1
- Produces: `LayoutOverrideStyles` React component — renders a `<style>` tag; used in InvoicePreview.tsx and Quotation.tsx

---

- [ ] **Step 4.1: Create the component**

Create `frontend/src/print-templates/components/LayoutOverrideStyles.tsx`:
```typescript
import type { DocumentLayoutOverrides } from '../designer/layoutOverrideTypes';
import { buildLayoutStyleSheet } from '../designer/layoutOverrideUtils';

interface Props {
  overrides: DocumentLayoutOverrides;
}

export default function LayoutOverrideStyles({ overrides }: Props) {
  const css = buildLayoutStyleSheet(overrides);
  if (!css) return null;
  // dangerouslySetInnerHTML is safe here: css is generated from typed data, not user text
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
```

- [ ] **Step 4.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/print-templates/components/LayoutOverrideStyles.tsx
git commit -m "feat(print): Phase 5D.2 — LayoutOverrideStyles CSS injection"
```

---

## Task 5: SmartGuides Component

**Files:**
- Create: `frontend/src/print-templates/components/SmartGuides.tsx`

**Interfaces:**
- Consumes: `GuideLine` from `designerUtils.ts` (Task 2)
- Produces: `SmartGuides` SVG component — renders blue guide lines over the canvas

---

- [ ] **Step 5.1: Create the component**

Create `frontend/src/print-templates/components/SmartGuides.tsx`:
```typescript
import type { GuideLine } from '../utils/designerUtils';

interface Props {
  lines: GuideLine[];
  canvasW: number;
  canvasH: number;
}

export default function SmartGuides({ lines, canvasW, canvasH }: Props) {
  if (!lines.length) return null;
  return (
    <svg
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 50,
      }}
    >
      {lines.map((g, i) => {
        if (g.axis === 'x') {
          // vertical line at x = g.position
          return (
            <line
              key={i}
              x1={g.position} y1={0} x2={g.position} y2={canvasH}
              stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
            />
          );
        }
        // horizontal line at y = g.position
        return (
          <line
            key={i}
            x1={0} y1={g.position} x2={canvasW} y2={g.position}
            stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
git add frontend/src/print-templates/components/SmartGuides.tsx
git commit -m "feat(print): Phase 5D.2 — SmartGuides SVG component"
```

---

## Task 6: Update designerTypes.ts

**Files:**
- Modify: `frontend/src/print-templates/designer/designerTypes.ts`

**Purpose:** Add `'layout'` kind, enable capabilities, add `isLayoutElement` type guard.

---

- [ ] **Step 6.1: Update designerTypes.ts**

Edit `frontend/src/print-templates/designer/designerTypes.ts` — replace the file content with:
```typescript
export type DesignerElementKind = 'branding' | 'text' | 'layout' | 'image' | 'shape' | 'qr' | 'barcode';

export interface DesignerElement {
  id: string;
  kind: DesignerElementKind;
  documentType: string;
  label: string;
}

export interface DesignerSelection {
  element: DesignerElement;
}

export type DesignerCommand = 'copy' | 'paste' | 'duplicate' | 'lock' | 'hide' | 'rotate';

export type DesignerMode = 'branding' | 'text' | 'layout' | 'idle';

export interface DesignerCapabilities {
  rotation: boolean;
  copy: boolean;
  paste: boolean;
  duplicate: boolean;
  lock: boolean;
  hide: boolean;
}

export const DESIGNER_CAPABILITIES: DesignerCapabilities = {
  rotation: true,
  copy: true,
  paste: true,
  duplicate: true,
  lock: true,
  hide: true,
};

export function isBrandingElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'branding' } {
  return el != null && el.kind === 'branding';
}

export function isTextElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'text' } {
  return el != null && el.kind === 'text';
}

export function isLayoutElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'layout' } {
  return el != null && el.kind === 'layout';
}
```

- [ ] **Step 6.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors (adding new values is backwards-compatible).

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/print-templates/designer/designerTypes.ts
git commit -m "feat(print): Phase 5D.2 — enable layout element kind and designer capabilities"
```

---

## Task 7: Template Instrumentation

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx`

**Purpose:** Add `data-designer-id="invoice.footerBlock"` to the footer `<div className={styles.foot}>` in both files.

---

- [ ] **Step 7.1: Instrument InvoiceDesign1.tsx**

In `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx`, find line 114:
```tsx
  <div className={styles.foot}>
```
Replace with:
```tsx
  <div className={styles.foot} data-designer-id="invoice.footerBlock">
```

- [ ] **Step 7.2: Instrument InvoiceDesign1Blank.tsx**

Apply the same change to `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx` — add `data-designer-id="invoice.footerBlock"` to `<div className={styles.foot}>`.

- [ ] **Step 7.3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx
git commit -m "feat(print): Phase 5D.2 — instrument invoice footer block with data-designer-id"
```

---

## Task 8: UniversalDesignerOverlay

**Files:**
- Create: `frontend/src/print-templates/components/UniversalDesignerOverlay.tsx`

**Interfaces:**
- Consumes: `LayoutDesignerHandle` (Task 3), `BrandingDesignerHandle` (existing), `TextStyleDesignerHandle`, `StaticTextDesignerHandle`, `computeSmartGuides`, `GuideLine`, `PX_PER_MM`, `pxToMm` (Task 2), `SmartGuides` (Task 5), `BrandingDesignerToolbar` (existing), `InlineTextEditor` (existing)
- Produces: `UniversalDesignerOverlay` component — the main interactive canvas

---

- [ ] **Step 8.1: Create the overlay**

Create `frontend/src/print-templates/components/UniversalDesignerOverlay.tsx`:
```typescript
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
```

- [ ] **Step 8.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/print-templates/components/UniversalDesignerOverlay.tsx
git commit -m "feat(print): Phase 5D.2 — UniversalDesignerOverlay with drag/resize/rotation handles"
```

---

## Task 9: LayoutDesignerPanel

**Files:**
- Create: `frontend/src/print-templates/components/LayoutDesignerPanel.tsx`

**Interfaces:**
- Consumes: `LayoutDesignerHandle`, `BrandingDesignerHandle`, `TextStyleDesignerHandle`, `LayoutElementOverride`, `LAYOUT_ELEMENT_LABELS`
- Produces: `LayoutDesignerPanel` floating sidebar component

---

- [ ] **Step 9.1: Create the panel**

Create `frontend/src/print-templates/components/LayoutDesignerPanel.tsx`:
```typescript
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
```

- [ ] **Step 9.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 9.3: Commit**

```bash
git add frontend/src/print-templates/components/LayoutDesignerPanel.tsx
git commit -m "feat(print): Phase 5D.2 — LayoutDesignerPanel properties panel"
```

---

## Task 10: Update components/index.ts

**Files:**
- Modify: `frontend/src/print-templates/components/index.ts`

---

- [ ] **Step 10.1: Add new exports**

Read `frontend/src/print-templates/components/index.ts` and add:
```typescript
export { default as LayoutOverrideStyles } from './LayoutOverrideStyles';
export { default as SmartGuides } from './SmartGuides';
export { default as UniversalDesignerOverlay } from './UniversalDesignerOverlay';
export { default as LayoutDesignerPanel } from './LayoutDesignerPanel';
```

- [ ] **Step 10.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 10.3: Commit**

```bash
git add frontend/src/print-templates/components/index.ts
git commit -m "feat(print): Phase 5D.2 — export new designer components"
```

---

## Task 11: Integration — InvoicePreview.tsx and Quotation.tsx

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`
- Modify: `frontend/src/pages/Quotation.tsx`

**Purpose:** Wire `useLayoutDesigner` alongside existing `useBrandingDesigner`; add `LayoutOverrideStyles` inside the template wrapper; replace `BrandingDesignerOverlay` with `UniversalDesignerOverlay`; add `LayoutDesignerPanel`.

> **Read both files fully before editing.** The integration differs per page; do not assume identical structure.

---

- [ ] **Step 11.1: Read InvoicePreview.tsx fully**

Use the Read tool on `frontend/src/pages/InvoicePreview.tsx`.

- [ ] **Step 11.2: Add useLayoutDesigner to InvoicePreview.tsx**

Import and initialize alongside existing hooks. The `initialLayouts` comes from a new settings key loaded on mount (similar to how brandingLayout is loaded). Add:

```typescript
import { useLayoutDesigner } from '../print-templates/hooks/useLayoutDesigner';
import LayoutOverrideStyles from '../print-templates/components/LayoutOverrideStyles';
import UniversalDesignerOverlay from '../print-templates/components/UniversalDesignerOverlay';
import LayoutDesignerPanel from '../print-templates/components/LayoutDesignerPanel';
import type { AllLayoutOverrides } from '../print-templates/designer/layoutOverrideTypes';
import { parseAllLayouts } from '../print-templates/designer/layoutOverrideUtils';
```

In the settings-loading effect, also load `print.layoutOverrides`:
```typescript
// Alongside loading print.brandingLayout:
const rawLayoutOverrides = settingsMap['print.layoutOverrides'];
const parsedLayoutOverrides: AllLayoutOverrides = parseAllLayouts(rawLayoutOverrides);
setLayoutOverrides(parsedLayoutOverrides);
```

Add state: `const [layoutOverrides, setLayoutOverrides] = useState<AllLayoutOverrides>({ invoice: {}, quotation: {} });`

Initialize hook:
```typescript
const layoutDesigner = useLayoutDesigner({
  docType: 'invoice',
  initialLayouts: layoutOverrides,
  onSaved: (next) => setLayoutOverrides(next),
});
```

- [ ] **Step 11.3: Add LayoutOverrideStyles inside the template render**

In the JSX where the invoice template is rendered, add LayoutOverrideStyles as a sibling:
```tsx
<>
  <LayoutOverrideStyles overrides={layoutOverrides.invoice} />
  <InvoiceDesign1 data={printData} /> {/* or whichever template is active */}
</>
```

- [ ] **Step 11.4: Replace BrandingDesignerOverlay with UniversalDesignerOverlay**

Where `BrandingDesignerOverlay` is currently used, replace with:
```tsx
<UniversalDesignerOverlay
  layoutDesigner={layoutDesigner}
  designer={designer}
  textStyleDesigner={textStyleDesigner}
  staticTextDesigner={staticTextDesigner}
  signatureUrl={companyData?.signatureUrl}
  stampUrl={companyData?.stampUrl}
  docLabel="الفاتورة"
  onSave={handleSaveAll}
>
  <LayoutOverrideStyles overrides={layoutOverrides.invoice} />
  {/* template component */}
</UniversalDesignerOverlay>
```

- [ ] **Step 11.5: Add LayoutDesignerPanel**

Add alongside the existing `BrandingDesignerPanel`:
```tsx
{layoutDesigner.isActive && (
  <LayoutDesignerPanel
    layoutDesigner={layoutDesigner}
    designer={designer}
    textStyleDesigner={textStyleDesigner}
    docLabel="الفاتورة"
    onClose={layoutDesigner.deactivate}
    onSave={handleSaveAll}
  />
)}
```

Also add a button to activate the layout designer (in the print preview toolbar or settings area):
```tsx
<button onClick={layoutDesigner.activate}>🔲 تخطيط</button>
```

- [ ] **Step 11.6: Repeat steps 11.1–11.5 for Quotation.tsx**

Read `frontend/src/pages/Quotation.tsx` and apply the same integration with `docType: 'quotation'` and `overrides={layoutOverrides.quotation}`.

- [ ] **Step 11.7: TypeScript check (all)**

```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
```
Expected: 0 errors across all three.

- [ ] **Step 11.8: Backend tests**

```bash
cd backend && npm test
```
Expected: PASS (no backend changes).

- [ ] **Step 11.9: Frontend tests**

```bash
cd frontend && npx vitest run
```
Expected: PASS.

- [ ] **Step 11.10: Build validation**

```bash
npm run build:back && npm run build:front && npm run electron:build
```
Expected: All succeed.

- [ ] **Step 11.11: Prisma validate**

```bash
cd backend && npx prisma validate
```
Expected: Schema is valid.

- [ ] **Step 11.12: Commit integration**

```bash
git add frontend/src/pages/InvoicePreview.tsx frontend/src/pages/Quotation.tsx
git commit -m "feat(print): Phase 5D.2 — integrate Universal Layout Designer into InvoicePreview and Quotation"
```

---

## Self-Review: Spec Coverage Check

| Spec Requirement | Task Covering It |
|-----------------|-----------------|
| Drag any supported element | Task 3 (hook), Task 8 (overlay) |
| Resize handles | Task 3 (`startResize`), Task 8 (8 handles in overlay) |
| Rotation | Task 3 (`startRotate`), Task 8 (rotation handle) |
| Z-index | Task 1 (type), Task 3 (`updateElement`), Task 9 (panel slider) |
| Alignment | Task 3 (`alignLeft/Right/Top/Bottom/CenterH/CenterV`), Task 9 (panel buttons) |
| Multi-selection | Task 3 (`selectedIds`, `addToSelection`), Task 8 (Ctrl+click, Shift+click) |
| Smart Guides | Task 2 (`computeSmartGuides`), Task 5 (`SmartGuides.tsx`), Task 8 (guide display during drag) |
| Rulers (mm) | Task 2 (`mmToPx`, `pxToMm`), Task 8 (mm ruler rendering) |
| Lock / Unlock | Task 3, Task 8 (locked cursor), Task 9 (panel buttons) |
| Hide / Show | Task 3, Task 4 (CSS `display:none`), Task 9 (panel buttons) |
| Copy / Paste | Task 3 (`copySelected`, `paste`), Task 8 (Ctrl+C/V), Task 9 (panel buttons) |
| Duplicate | Task 3 (`duplicateSelected`), Task 8 (Ctrl+D), Task 9 |
| Arrow-key movement | Task 8 (keyboard handler) |
| Shift = 10px | Task 8 (keyboard handler `step = e.shiftKey ? 10 : 1`) |
| Alt = fine movement | Task 8 (keyboard handler `step = e.altKey ? 0.5 : 1`) |
| Import / Export Layout JSON | Task 3, Task 9 (panel buttons), Task 11 (file input) |
| Preserve Phase 1–5D.1 | All existing hooks/components untouched; branding sub-system preserved in overlay |
| Preserve PDF / window.print() | Task 4 (`LayoutOverrideStyles` — `<style>` tag applies during print) |
| Preserve A4 fidelity | No template layout changes; CSS transforms only |
| No new npm packages | ✅ All native Web APIs |
| No Prisma migration | ✅ Frontend-only new settings key |
| No backend routes | ✅ Reuses `api.put('/settings', ...)` |

---

## Regression Risks

1. **BrandingDesignerOverlay is replaced** — `InvoicePreview.tsx` and `Quotation.tsx` must no longer import `BrandingDesignerOverlay` directly; only `UniversalDesignerOverlay`. Verify imports.
2. **CSS transform on template elements** — The `<style>` tag from `LayoutOverrideStyles` uses `!important` on `transform`. If any template element already has inline `style={{ transform: ... }}`, there is a conflict. Current templates do not set `transform` on `[data-designer-id]` layout elements (they use `transform` only on branding images via `applyBrandingElementStyle`). Verify no conflict.
3. **Table elements** — `<table>` with `data-designer-id="invoice.tableBorder"` will have `transform` applied. This works in Chromium (Electron) but verify visually that the table renders correctly when moved.
4. **`window.print()` with hidden elements** — Elements with `hidden: true` receive `display: none !important`. Verify the printed output correctly omits hidden elements.
5. **Pointer event capture** — Multiple drag handlers (branding + layout) both use `setPointerCapture`. Ensure only one is active at a time via `e.stopPropagation()`.

---

## JSON Layout Export Format

```json
{
  "invoice": {
    "invoice.title": {
      "x": 20.5,
      "y": -10,
      "rotation": 0,
      "scaleX": 1,
      "scaleY": 1,
      "zIndex": 2,
      "opacity": 1,
      "hidden": false,
      "locked": false
    },
    "invoice.footerBlock": {
      "x": 0, "y": 0, "rotation": 0,
      "scaleX": 1, "scaleY": 1,
      "zIndex": 1, "opacity": 0.8,
      "hidden": false, "locked": true
    }
  },
  "quotation": {}
}
```
