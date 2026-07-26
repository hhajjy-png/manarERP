# Operations & Management Suite Phase 1 — Master Plan

> This document covers execution order, architecture, totals, and merge strategy only.
> Each phase has its own plan file. Read the phase file before starting implementation.

---

## Phase Plan Files

| Phase | File | Focus |
|---|---|---|
| A | `2026-06-26-phase-a-print-polish.md` | English forms (3 templates + shared components) |
| B | `2026-06-26-phase-b-document-expiration.md` | Document Expiration Center (new module) |
| C | `2026-06-26-phase-c-backup-verification.md` | Backup integrity check (extend existing) |
| D | `2026-06-26-phase-d-financial-dashboard.md` | Financial Operations Dashboard (new page) |
| E | `2026-06-26-phase-e-attachments.md` | Attachments Center (new module + Electron IPC) |
| F | `2026-06-26-phase-f-ui-polish.md` | DataTable, FormDialog, shortcuts, TruncatedText |

---

## Recommended Execution Order

```
A → B → C → D → E → F
```

### Why this order

1. **A first** — pure frontend, no dependencies, zero risk of breaking the backend. Good warmup.
2. **B second** — one Prisma migration (Equipment.insuranceExpiry). Completing migrations early reduces merge risk.
3. **C third** — one Prisma migration (Backup fields). Keep migrations sequential to avoid conflict.
4. **D fourth** — no migration needed. Builds on the stable backend from A–C.
5. **E fifth** — two schema changes (Attachment model) + Electron IPC + new npm dep (multer). Highest risk of touching multiple layers. Save until A–D are tested.
6. **F last** — pure frontend utility. No risk of breaking anything. Easiest to revert if needed.

> Never run two Prisma migrations in parallel on the same branch. Always complete and commit one migration before starting the next.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Electron (main process)                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  IPC handlers                                                    │    │
│  │  + dialog.ipc (existing)                                        │    │
│  │  + backup.ipc (existing)                                        │    │
│  │  + attachments.ipc  ← Phase E (NEW: openFileDialog, openPath)  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ contextBridge (window.manar.*)
┌────────────────────────▼────────────────────────────────────────────────┐
│  React Frontend (renderer)                                               │
│                                                                          │
│  Pages (new)                          Shared components (modified)       │
│  ┌──────────────────────────────┐     ┌──────────────────────────────┐  │
│  │ DocumentExpirationCenter  B  │     │ DataTable          (F)       │  │
│  │ FinancialOpsDashboard     D  │     │ FormDialog         (F)       │  │
│  └──────────────────────────┬──┘     │ AttachmentsPanel   (E)       │  │
│                              │        │ TruncatedText      (F)       │  │
│  Form templates (modified)   │        │ ExpirationWidget   (B)       │  │
│  ┌──────────────────────────┐│        └──────────────────────────────┘  │
│  │ EmploymentContract    A  ││                                           │
│  │ PurchaseRequest       A  ││  Utilities (new)                          │
│  │ Quotation             A  ││  ┌──────────────────────────────┐         │
│  │ ApprovalSection       A  ││  │ useShortcut hook   (F)       │         │
│  └──────────────────────────┘│  └──────────────────────────────┘         │
└────────────────────────┬─────┴──────────────────────────────────────────┘
                         │ HTTP to localhost:48211
┌────────────────────────▼────────────────────────────────────────────────┐
│  Express Backend                                                         │
│                                                                          │
│  New modules                        Modified modules                     │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐    │
│  │ /api/expirations         B   │   │ /api/backups         (C)     │    │
│  │ /api/attachments         E   │   │ /api/executive       (D)     │    │
│  └──────────────────────────┬──┘   └──────────────────────────────┘    │
│                              │                                            │
│  New services                │                                            │
│  ┌──────────────────────────┐│                                            │
│  │ ExpirationsService    B  ││                                            │
│  │ FinancialExecService  D  ││                                            │
│  │ AttachmentsService    E  ││                                            │
│  └──────────────────────────┘│                                            │
└────────────────────────┬─────┴──────────────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────▼────────────────────────────────────────────────┐
│  SQLite (manar.db)                                                       │
│                                                                          │
│  Existing models used (read-only by new code):                           │
│    Employee, Equipment, Contract, Invoice, Expense, Customer, Supplier   │
│                                                                          │
│  Modified models:                                                        │
│    Equipment  ← insuranceExpiry  (Phase B)                               │
│    Backup     ← 4 verification fields  (Phase C)                         │
│                                                                          │
│  New models:                                                             │
│    Attachment  (Phase E)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Totals

| Metric | Count |
|---|---|
| **New files created** | ~27 |
| **Files modified** | ~23 |
| **Total files touched** | ~50 |
| **Estimated new LOC** | ~2,700–3,100 |
| **Prisma migrations** | 3 (B: equipmentInsurance, C: backupVerification, E: attachment) |
| **New npm dependencies** | 1 (`multer` + `@types/multer` in backend) |
| **New Electron IPC channels** | 2 (`attachments:openFileDialog`, `attachments:openPath`) |
| **New backend modules** | 2 (`expirations`, `attachments`) |
| **New frontend pages** | 2 (`DocumentExpirationCenter`, `FinancialOperationsDashboard`) |
| **New frontend components** | 3 (`ExpirationWidget`, `AttachmentsPanel`, `TruncatedText`) |
| **New utilities** | 1 (`useShortcut`) |

---

## Testing Strategy

### After each phase

1. `cd backend && npx tsc --noEmit` — must pass with 0 errors.
2. `cd frontend && npx tsc --noEmit` — must pass with 0 errors.
3. `tsc -p electron/tsconfig.json --noEmit` — run after Phase E (only phase touching Electron).
4. `cd backend && npm test` — run after any phase that adds backend tests (B, C, D).
5. Visual smoke test: launch the app in dev mode (`npm run dev`) and confirm the affected pages load without console errors.

### Before Gemini review

Run the full validation suite:

```
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
cd backend && npm run build:back
cd frontend && npm run build:front
```

All commands must exit 0.

### Phase-specific tests

| Phase | Unit test files added |
|---|---|
| B | `backend/src/modules/expirations/__tests__/expirations.service.test.ts` |
| C | `backend/src/modules/backups/__tests__/backup.verify.test.ts` |
| D | `backend/src/modules/executive/__tests__/financial-exec.service.test.ts` |

---

## Migration Requirements

| Migration | Phase | Breaking? | Rollback |
|---|---|---|---|
| `add_equipment_insurance_expiry` | B | No — nullable field added | Drop column |
| `add_backup_verification_fields` | C | No — nullable fields added | Drop columns |
| `add_attachment_model` | E | No — new table | Drop table |

All three migrations are additive-only. No existing columns are modified or removed. Rollback is safe at any point.

Run migrations in sequence, not in parallel:
```
# Phase B migration first
cd backend && npx prisma migrate dev --name add_equipment_insurance_expiry

# Phase C migration second (after B is committed)
cd backend && npx prisma migrate dev --name add_backup_verification_fields

# Phase E migration third (after C is committed)
cd backend && npx prisma migrate dev --name add_attachment_model
```

---

## Git Strategy

### Branch

```
git checkout -b feature/ops-management-suite-phase1
```

Create from `production` **after** creating a checkpoint tag.

### Checkpoint tag (before starting)

```
git tag checkpoint-before-ops-suite-phase1
git push origin checkpoint-before-ops-suite-phase1
```

### Commit discipline

- One commit per task step (as specified in each phase file).
- Commit messages use: `feat(module): description`, `test(module): description`, `feat(db): description`.
- Never commit if `tsc --noEmit` fails.

### Stable tag (after all 6 phases pass review)

```
git tag stable-ops-management-suite-phase1-v1
```

### Merge

```
git checkout production
git merge --no-ff feature/ops-management-suite-phase1 -m "Merge Operations & Management Suite Phase 1 into production"
```

---

## Gemini Review Checklist

Before requesting Gemini review, confirm all of the following:

- [ ] All 6 phases implemented and committed.
- [ ] `cd backend && npx tsc --noEmit` → 0 errors.
- [ ] `cd frontend && npx tsc --noEmit` → 0 errors.
- [ ] `tsc -p electron/tsconfig.json --noEmit` → 0 errors.
- [ ] `cd backend && npm test` → all tests PASS.
- [ ] `cd backend && npm run build:back` → exits 0.
- [ ] `cd frontend && npm run build:front` → exits 0.
- [ ] Visual smoke test: all 6 new features work in the running app.
- [ ] No `console.error` or unhandled promise rejections in dev mode.

---

## Merge Risks

| Risk | Severity | Mitigation |
|---|---|---|
| multer multipart upload fails in Electron context | Medium | Test file upload in dev Electron before Phase E commit |
| Prisma migration conflict if run out of order | Low | Always migrate sequentially (B → C → E) |
| `shell.openPath` blocked on some Windows file types | Low | Test PDF and DOCX open in Electron dev mode |
| Column visibility state lost on page navigation | Low | Acceptable for Phase F — persistence can be added later |
| `checksumSha256` computation blocks event loop for large backups | Low | Files are local, typically <200 MB; acceptable for desktop |

---

## Final Recommendation

Start with Phase A. It is self-contained, zero-risk, and produces immediate user-facing value (English forms). This lets you build momentum and validate the development workflow before touching the database.

Do not start Phase E until Phases B, C, and D are committed — Phase E introduces the most new surface area (Electron IPC, multer, new model) and is easiest to debug on a clean branch state.

The three Prisma migrations (B, C, E) are each a single nullable column or table addition. They are the lowest-risk schema changes possible — no existing data is altered, no foreign keys are added to existing heavy tables, and all three can be rolled back in seconds.

Estimated implementation time: **3–5 focused development sessions** working through phases in order.
