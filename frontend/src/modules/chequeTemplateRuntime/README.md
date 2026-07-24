# Cheque Template Runtime Engine v1

A **UI-independent** engine that resolves a stored cheque template + a runtime
data object into a **fully-resolved render model**. Pure TypeScript — no React,
no printer, no dialog, no side effects.

> **Status:** runtime infrastructure only. Not wired into preview, printing,
> PDF, data binding, or any cheque record. Runtime values are a mock placeholder.

## Role

```
Template Storage → [ Runtime Engine ] → Resolved Render Model → (future) Preview / Printing / PDF
```

It is intended to be the **single rendering source** for future Preview,
Printing, and PDF export, so no rendering logic is duplicated downstream.

## Pipeline (`resolveChequeTemplate`)

```
Load template
  → Validate template (shape / empty / surface)
  → Resolve runtime values (mock placeholder, overridable)
  → per field: normalize + validate → resolve bound text → resolve layout (%+mm)
  → Assemble render model (painting order, ascending zIndex)
  → Return
```

No printer logic anywhere.

## Input

- `template: RuntimeTemplateInput` — `{ surface, fields }` (structurally a stored template).
- `data?: RuntimeData` — semantic → string map; defaults to `MOCK_RUNTIME_DATA`, provided keys override.
- `bindingResolver?` — maps a field to a semantic key; defaults to id-based (`beneficiary`, `date`, `amount`, `amountInWords`, …).

## Output — `ResolvedRenderModel`

Each `ResolvedRenderField` already contains everything a renderer needs:
final **position** and **size** (percent **and** mm), **rotation**, **font**
(size/weight), **alignment**, **color**, **visibility**, resolved **binding**,
`zIndex`, and the final rendered **text**. Plus `surface` (cm+mm), `issues`,
`visibleFields`, and `meta`.

## Validation (graceful — never throws)

Collected as `RenderIssue[]` (`error` / `warning` / `info`):
`INVALID_TEMPLATE`, `EMPTY_TEMPLATE`, `MISSING_FIELD_PROPS`, `INVALID_POSITION`
(clamped), `INVALID_SIZE` (corrected), `INVISIBLE_FIELD` (flagged, excluded from
`visibleFields`). Malformed fields are skipped; valid ones still resolve.

## Public API
See `index.ts`. Unit tests: `frontend/src/__tests__/chequeTemplateRuntime.test.ts`.
