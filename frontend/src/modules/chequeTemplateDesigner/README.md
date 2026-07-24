# Cheque Template Designer — Dual Cheque Printing Modes Foundation v1

A **generic, business-logic-free WYSIWYG editor**, extracted from the reusable
engines of the Professional Cheque Printing module. It is the foundation for a
future **"Cheque Template"** printing mode inside Official Cheque Management.

> **Status:** foundation only. This module is **not wired into any route, tab,
> page, printing, calibration, persistence, or settings.** Nothing in the app
> imports it yet. Classic Calibration and the Professional module are untouched.

## Why it exists

Official Cheque Management is intended to eventually support two independent
printing modes:

```
Official Cheque Management
├── Classic Calibration   (existing, unchanged)
├── Cheque Template       (future — this module is its editor foundation)
└── Printing
    ├── Classic Calibration
    └── Cheque Template
```

This pack prepares only the reusable editor. It does **not** implement Mode 2.

## What was extracted (and generalised)

| Concern | Source (Professional module) | Here |
|---|---|---|
| Field model | `chequeField.types.ts` (`ChequeField`) | `designerField.types.ts` (`DesignerField`) — **drops** `type` + `semanticId` (business/binding) |
| Surface | `DesignSurface` + `designSurface.constants` (fixed 17.8×8.9 cm) | `DesignerSurface` + `surface.constants` — **size is a prop**, not hardcoded |
| Selection | `useFieldSelection` | `useDesignerSelection` |
| History / undo | `useEditorHistory` | `useDesignerHistory` |
| Drag | `useFieldDrag` | `useDesignerDrag` |
| Resize | `useFieldResize` | `useDesignerResize` |
| Rotation | `useFieldRotation` | `useDesignerRotation` |
| Keyboard nudge | `useFieldKeyboard` | `useDesignerKeyboard` |
| Alignment / snap / guides | `alignmentGuides` + `AlignmentGuidesOverlay` | same names, `ctd-` classes |
| Object manipulation | `fieldActions` (duplicate/delete/z-order) | `fieldActions` — id prefix is generic `field-` |
| Field layer (WYSIWYG editor) | `ChequeFieldLayer` | `DesignerFieldLayer` |
| Properties panel | `FieldInspector` (app i18n) | `PropertiesPanel` — **no i18n dependency**; default English labels + `labels` override |
| Mutation contract / geometry | `fieldGeometry` | `fieldGeometry` |

### Business logic deliberately **not** extracted
`runtimeDataBinding`, `templatesApi`, `printEngine/*`, `printedCheques/*`,
`documentTypes`, `fixedBackgrounds`, seed data — all remain host concerns.

## Coordinates
Percentages (0–100) of the design surface. **No mm/px conversion** happens in
this module. A host maps percentages to a physical medium via the surface spec.

## Intended future embed (later pack)

```tsx
import { ChequeTemplateDesigner, PHYSICAL_CHEQUE_SURFACE_CM } from '@/modules/chequeTemplateDesigner';

<ChequeTemplateDesigner
  surface={PHYSICAL_CHEQUE_SURFACE_CM}   // or any { widthCm, heightCm }
  backgroundSrc={chequeBackground}
  initialFields={fields}
  onChange={setFields}
  labels={arabicLabels}                  // host supplies localisation
/>
```

A future pack wires persistence, printing, and (optionally) data binding
**around** this component — the designer itself stays generic.

## Public API
See `index.ts` — the top-level component plus every engine, pure-logic helper,
and presentational piece are exported for hosts that compose their own layout.
