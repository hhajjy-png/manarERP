# Project Baseline — manarERP

> Template for documenting the production state after each completed feature.
> Copy this template, fill in all sections, and save to `memory/project_baseline.md`.

---

## Production State

| العنصر | القيمة |
|---|---|
| Branch | `production` |
| HEAD | `<commit-hash>` |
| Current Stable Tag | `stable-<feature-name>` |
| Date Updated | `YYYY-MM-DD` |
| Git Status | Clean — Fully Pushed to Origin |

---

## Completed Modules

> List all production-ready modules. Add new entries as features merge.

### Core System
- ✅ Electron Desktop Application
- ✅ SQLite Database + Prisma ORM
- ✅ React + TypeScript Frontend
- ✅ Express Backend API

### Business Modules

| Module | Status | Tag |
|--------|--------|-----|
| Initial ERP Foundation | ✅ Complete | `stable-manarerp-v1` |
| Dashboard (Electron) | ✅ Complete | `stable-dashboard-electron` |
| Customers Management | ✅ Complete | — |
| Contracts Management | ✅ Complete | — |
| Invoices Management | ✅ Complete | — |
| Expenses Management | ✅ Complete | — |
| Employees Management | ✅ Complete | — |
| Equipment Management | ✅ Complete | — |
| Accounting Module | ✅ Complete | `stable-accounting-v2-f7d8dda` |
| Backup & Restore | ✅ Complete | `stable-backup-restore-v1` |
| Roles & Permissions (RBAC) | ✅ Complete | `stable-roles-permissions-v1` |
| Reports & Export Center | ✅ Complete | `stable-reports-center-v1` |
| Executive Dashboard v2 | ✅ Complete | `stable-executive-dashboard-v2` |
| Dev Backend Watch | ✅ Complete | `stable-dev-backend-watch` |
| Payroll System | 🔄 Active — branch: `feature/payroll-system`, checkpoint: `pre-payroll-system` | — |
| `<Next Module>` | ⬜ Planned | — |

### Roles & Permissions
- 74 Permissions, 7 Roles, RBAC Security
- Backend Verified Sessions, Electron Token Authentication

---

## Latest Feature Details

### Feature Name
`<feature name>`

### Summary
`<1-3 sentence description>`

### Files Added
```
<list new files>
```

### Files Modified
```
<list modified files>
```

### Schema Changes
```
<new models or fields added to schema.prisma, or "None">
```

### New Permission Keys
```
<list of new permission keys added to constants.ts, or "None">
```

### New API Routes
```
<list of new endpoints, or "None">
```

### New Frontend Pages
```
<list of new pages, or "None">
```

---

## Deferred Features

> Features that were discussed but explicitly deferred to a later phase.

| Feature | Priority | Notes |
|---------|----------|-------|
| Force Password Change On First Login | High | Deferred from auth system work |
| Auto Logout On Idle | High | Deferred from auth system work |
| `<add more>` | — | — |

---

## Next Roadmap

> Update after each phase completes.

**Phase 1 — Payroll System** *(current)*
- Salary Management, Allowances, Deductions, Advances
- Monthly Payroll Generation, Approval, Payment
- Payslip PDF, Payroll Reports

**Phase 2 — Inventory & Materials Management**
- Warehouse, Inventory Tracking, Material Requests
- Stock Movement, Low Stock Alerts

**Phase 3 — Commercial Release**
- Installer Packaging, Auto Update, Licensing System
- Branding, Production Deployment

---

## Gemini Audit Status

| Feature | Gemini Status | Blockers |
|---------|--------------|---------|
| Executive Dashboard v2 | ✅ Approved | None |
| Dev Backend Watch | ✅ Approved | None |
| `<latest feature>` | ⬜ Pending | — |

---

## Tag History

| Tag | Description | Date |
|-----|-------------|------|
| `stable-dashboard-electron` | Initial Electron dashboard | — |
| `stable-manarerp-v1` | Initial ERP foundation release | — |
| `stable-accounting-v1` | Accounting module v1 | — |
| `stable-accounting-v2-f7d8dda` | Accounting v2 with production DB path fix | — |
| `stable-backup-restore-v1` | SQLite backup & restore | — |
| `stable-roles-permissions-v1` | RBAC roles & permissions | — |
| `stable-reports-center-v1` | Full reports & export center | — |
| `stable-executive-dashboard-v2` | Executive dashboard v2 with unified endpoint | — |
| `stable-dev-backend-watch` | Backend hot-reload + graceful shutdown | 2026-06-07 |
| `pre-payroll-system` | Rollback checkpoint before payroll system | 2026-06-07 |
| `pre-<feature>` | Rollback checkpoint before `<feature>` | `YYYY-MM-DD` |
| `stable-<feature>` | Stable after `<feature>` merge | `YYYY-MM-DD` |

---

## Development Workflow Reference

13-step workflow: `docs/development-workflow.md`

## Architecture Reference

Full architecture details: `docs/01-معمارية-النظام.md`
