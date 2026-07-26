# Financial Center Phase 2 — Master Plan

> **Specification:** `docs/superpowers/specs/2026-06-24-financial-center-phase2-spec.md`
> **Status:** Ready for Implementation
> **Architecture:** Financial Module as Orchestrator — never re-implements logic owned by other modules.

---

## Goal

Build `/financial` — a unified financial reporting hub with 6 tabs (Statement, Aging, GL, Trial Balance, Journal Book, Financial Reports) plus a "مالي" tab on the existing Dashboard. No changes to existing `/statements`, `/reports`, or `/accounting` endpoints. No schema migrations required.

---

## Implementation Files

| File | Scope |
|------|-------|
| [Part 1 — Foundation](financial-center-phase2-part1-foundation.md) | Shared utilities, types, permissions |
| [Part 2 — Statement Center](financial-center-phase2-part2-statements.md) | Backend module scaffold + Statement endpoint + frontend foundation + Statement tab |
| [Part 3 — Aging Center](financial-center-phase2-part3-aging.md) | AR/AP Aging backend + Aging tab |
| [Part 4 — GL, Trial Balance, Journal Book](financial-center-phase2-part4-gl-trial-journal.md) | GL Statement, GL Report, Trial Balance, Journal Book |
| [Part 5 — Dashboard & Reports](financial-center-phase2-part5-dashboard-reports.md) | Dashboard Summary, Financial Reports tab, export adapters, source page DrillDown, migration banner |
| [Validation & Release](financial-center-phase2-validation-and-release.md) | TypeScript checks, build, UI verification, release steps |

---

## Dependency Graph

```
Part 1 (Foundation)
  ├─ Creates: shared financial utilities, types, permission keys
  └─ Blocks all other parts

Part 2 (Statements)         Part 3 (Aging)          Part 4 (GL/Trial/Journal)
  ├─ Requires: Part 1         ├─ Requires: Part 1       ├─ Requires: Part 1
  ├─ Creates: module scaffold  ├─ Extends: service       ├─ Extends: service
  └─ Creates: Statement tab   └─ Creates: Aging tab     └─ Creates: GL/Trial/Journal tabs

Part 5 (Dashboard & Reports)
  ├─ Requires: Part 1, Part 2, Part 3, Part 4
  ├─ Creates: export adapters, dashboard-summary.service.ts
  └─ Modifies: Dashboard.tsx, Statements.tsx

Validation & Release
  └─ Requires: All parts
```

---

## Execution Phases

### Phase 0 — Foundation (Sequential, ~2h)
Run **Part 1** alone. Do not proceed until all unit tests pass and TypeScript is clean.

```
Part 1 → Unit tests pass → TypeScript clean → Gate ✓
```

### Phase 1 — Core Backend + Statement (Sequential, ~3h)
Run **Part 2** in full. Backend module scaffold + statement endpoint + App.ts registration + frontend Statement tab.

```
Part 2 → API tests pass → Frontend Statement tab renders → Gate ✓
```

### Phase 2 — Feature Expansion (Can run in parallel if two engineers)
**Part 3** (Aging) and **Part 4** (GL/Trial/Journal) are independent of each other once Part 2 is complete. Safe to parallelize.

```
Part 3 ─┬─→ merge when done
Part 4 ─┘
```

**Single engineer:** Run Part 3 first, then Part 4.

### Phase 3 — Dashboard & Integration (~3h)
Run **Part 5** only after Parts 3 and 4 are merged. Requires all service methods to exist.

```
Part 5 → Export tests pass → Dashboard tab renders → DrillDown round-trip works → Gate ✓
```

### Phase 4 — Validation & Release
Run **Validation** plan. Full TypeScript build, Electron smoke test, acceptance criteria checklist.

---

## Parallelization Strategy

| Safe to parallelize? | Reason |
|---------------------|--------|
| Part 3 + Part 4 (after Part 2 complete) | Independent service methods; both extend same files but non-overlapping sections |
| NOT Part 1 + Part 2 | Part 2 imports from Part 1 — types must exist first |
| NOT Part 5 + any of 2/3/4 | Part 5 calls service methods created in Parts 2–4 |

**Merge protocol for parallel Parts 3 & 4:** Both parts extend `financial.schema.ts`, `financial.routes.ts`, `financial.controller.ts`, `financial.service.ts`. Merge one at a time — no concurrent edits to same file.

---

## New Files Summary

### Backend (all new, additive)
```
backend/src/modules/financial/
  financial.routes.ts
  financial.controller.ts
  financial.service.ts
  financial.schema.ts

backend/src/shared/services/financial/
  financial.types.ts
  balance.utils.ts
  aging.utils.ts
  drilldown.utils.ts
  financial.response.ts
  summary.utils.ts
  dashboard-summary.service.ts

backend/src/shared/services/financial/export/
  statement.export.adapter.ts
  aging.export.adapter.ts
  gl.export.adapter.ts
  trial.export.adapter.ts
  journal.export.adapter.ts
  summary.export.adapter.ts

Tests:
  backend/src/shared/services/financial/balance.utils.test.ts
  backend/src/shared/services/financial/aging.utils.test.ts
  backend/src/shared/services/financial/drilldown.utils.test.ts
  backend/src/modules/financial/financial.service.test.ts
```

### Frontend (all new)
```
frontend/src/pages/FinancialCenter.tsx
frontend/src/api/financial.ts
frontend/src/hooks/useHighlight.ts

frontend/src/components/financial/
  FinancialTabs.tsx
  FilterBar.tsx
  SummaryCards.tsx
  ExportBar.tsx
  DrillDownLink.tsx
  ReturnToReportButton.tsx
  StatementTable.tsx
  GroupedTable.tsx
  AgingTable.tsx
  AgingSummaryCards.tsx
  AgingChart.tsx
  AccountSelector.tsx
  TrialBalanceTable.tsx
  ModeToggle.tsx
  ImbalanceAlert.tsx
  JournalBookTable.tsx
  FinancialReportsTab.tsx
  FinancialDashboardTab.tsx
```

### Modified Files (minimal changes)
```
backend/src/config/constants.ts       ← add 6 modules to MODULES array
backend/prisma/seed.ts                ← add MODULE_ACTIONS + role grants
backend/src/app.ts                    ← register /api/financial router

frontend/src/App.tsx                  ← add /financial route
frontend/src/config/modules.tsx       ← add NAV entry for financial
frontend/src/pages/Dashboard.tsx      ← add مالي tab (wrap existing in GeneralDashboardContent)
frontend/src/pages/Statements.tsx     ← add migration banner (Phase X, deferred)
frontend/src/pages/Invoices.tsx       ← add ?highlight= + ReturnToReportButton
frontend/src/pages/Expenses.tsx       ← add ?highlight= + ReturnToReportButton
frontend/src/pages/Accounting.tsx     ← add ?highlight= to journal entries table
```

---

## Architecture Rules (never violate)

1. `financial.service.ts` calls `buildStatement()` for statements — NEVER re-implements it
2. `financial.service.ts` calls `accountingService.listJournalEntries()` for journal book
3. `financial.service.ts` queries Prisma directly ONLY for: GL Statement, GL Report, Trial Balance, Dashboard Summary, AR/AP Aging
4. All `/financial/*` endpoints return `FinancialResponse<T>` — except GL Report which returns `GlReportResponse`
5. `/statements` page is completely untouched (no internal changes)
6. No new npm libraries — all features use existing Prisma, ExcelJS, PDFKit, Recharts, React Router
7. URL is the single source of truth for Financial Center navigation state
8. DrillDown max 3 clicks to reach source document

---

## Release Strategy (per spec §15)

**Phase 0 (This Implementation):** `/statements` and `/financial` coexist. No redirect. No banner yet.

**Phase X (Next Release):** Add dismissible info banner to `Statements.tsx` pointing to `/financial`. See [Part 5](financial-center-phase2-part5-dashboard-reports.md) for banner code — it's implemented now but placed behind a deferred note.

**Phase Final (After Adoption):** Replace `Statements.tsx` with `<Navigate to="/financial?tab=statement" replace />`. Remove route. Remove NAV entry. (Not in scope of this plan.)
