# Development Workflow v3.0 — manarERP (2026)

> Mandatory workflow, model routing, review process, release process, and operational rules.

---

## Project Principles

**This project is:**
- Internal-use ERP
- Electron desktop application
- Offline-first
- Low-maintenance
- Incrementally improved
- Practical over enterprise complexity

**Avoid:**
- SaaS conversion
- Large framework rewrites
- Enterprise governance layers
- Unnecessary abstractions
- Multi-agent autonomous coding
- Architecture for hypothetical scale

---

## Model Routing Policy

### Default Development Model — Claude Sonnet 4.6

Use for:
- Daily development
- Feature implementation
- Frontend changes
- Backend module work
- TypeScript fixes
- UI/UX improvements
- Refactoring
- Operational feedback implementation
- Documentation updates
- PROJECT_STATE updates

### Escalation Model — Claude Opus 4.8

Use **only** for:
- Payroll architecture
- Accounting architecture
- Inventory architecture redesign
- Large database changes
- Prisma schema redesign
- Security-sensitive features
- Major refactors
- Performance investigations
- Pre-release audits of large features
- Complex architectural uncertainty

Do **NOT** use Opus for:
- CSS
- i18n
- Forms
- Tables
- Reports tweaks
- Dashboard polishing
- Small bug fixes

Return to Sonnet 4.6 after any Opus escalation completes.

### External Review — Gemini

Mandatory before production merges.

Use for:
- Architecture review
- Security review
- Regression risk review
- UX review
- Final merge approval

Required output:
```
Decision: APPROVED
or
Decision: CHANGES_REQUIRED
```

### Project Management — ChatGPT

Responsible for:
- Workflow management
- Prioritization
- Feature planning
- Operational feedback triage
- Release tracking
- PROJECT_STATE tracking
- Long-term roadmap

---

## Workflow Modes

### QUICK FIX MODE

**Examples:**
- CSS fixes
- Labels
- i18n
- Table columns
- Dashboard tweaks
- Minor UX improvements

**Workflow:**

```
1.  Implement (Claude Sonnet 4.6)
2.  Run validation
3.  Gemini review
4.  Commit
5.  Merge
6.  Tag
7.  Update PROJECT_STATE if baseline changes
```

---

### FEATURE MODE

**Examples:**
- Prices
- Contracts
- Cheques
- Reports
- Dashboard enhancements
- Data import improvements

**Workflow:**

```
1.  Create checkpoint tag
2.  Create feature branch
3.  Implement (Claude Sonnet 4.6)
4.  Run validation
5.  Gemini review
6.  Fix findings
7.  Commit
8.  Merge --no-ff
9.  Final validation
10. Stable tag
11. Push
12. Update PROJECT_STATE
```

---

### MAJOR SYSTEM MODE

**Examples:**
- Payroll
- Accounting
- Inventory redesign
- Mobile companion
- Executive Dashboard major generation

**Workflow:**

```
1.  ChatGPT planning
2.  Claude Sonnet 4.6 audit
3.  Escalate to Opus 4.8 if complexity warrants
4.  Implementation
5.  Full validation
6.  Gemini architecture review
7.  Gemini security review
8.  Commit
9.  Merge
10. Stable tag
11. Update PROJECT_STATE
```

---

## Mandatory Implementation Rules

**Before implementing:**

1. Read existing architecture
2. Search for similar implementation
3. Check PROJECT_STATE.md
4. Check PROJECT_NOTES.md (if present)
5. Check permissions impact
6. Check Prisma impact
7. Check Electron IPC impact

**Never:**
- Commit automatically
- Push automatically
- Delete branches automatically
- Modify production directly
- Run Prisma migrations without review
- Introduce new permissions without updating `constants.ts`
- Bypass authentication
- Bypass RBAC

---

## Validation Rules

Before declaring complete, run all of the following. Do not declare success until all checks pass.

```bash
# Tests
cd backend && npm test

# TypeScript — Frontend
cd frontend && npx tsc --noEmit

# TypeScript — Backend
cd backend && npx tsc --noEmit

# TypeScript — Electron
tsc -p electron/tsconfig.json --noEmit

# Build — Backend
npm run build:back

# Build — Frontend
npm run build:front
```

**Success criteria:** Zero TypeScript errors, zero build errors, all tests pass.

---

## Review Rules

Every production feature requires:
- Gemini review
- Risk assessment
- Commit approval
- Merge approval

No exceptions.

---

## Project Documentation

### PROJECT_STATE.md

Tracks:
- Current production baseline
- Stable tag
- Completed features
- Module inventory
- Recommended next work

### PROJECT_NOTES.md

Tracks:
- Operational observations
- UX feedback
- Future improvements
- Open issues
- Enhancement requests

When a note is implemented:
1. Link implementation to note
2. Mark note resolved
3. Update PROJECT_STATE.md if production changes

---

## Current Baseline

| Field | Value |
|-------|-------|
| **Production HEAD** | `82f361c` |
| **Stable tag** | `stable-contracts-price-binding-v1` |

Recent releases:
- Contracts Price Binding
- Remove DataTable Sticky Header
- Operational Feedback Phase 1
- Executive Dashboard V3A-Lite
- Page Headers Standardization
- DataTable Enhancement Phase 1

---

## Success Criteria

**Prefer:**
- Small safe releases
- Incremental improvements
- Clean production history
- Stable tags
- Operational simplicity

**Over:**
- Large risky releases
- Rewrites
- Premature architecture
- Unnecessary complexity

> The goal is not maximum sophistication.
> The goal is a reliable ERP system that remains maintainable for years.

---

## Git Tag Naming Convention

```
Checkpoint (pre-feature):   pre-<feature-slug>
Stable release:             stable-<feature-slug>-v<n>

Examples:
  pre-cheques-enhancement
  stable-cheques-enhancement-v1
```

## Git Safety Rules

| Action | Policy |
|--------|--------|
| `git push` | Never automatic — always confirm with user |
| `git merge` | Always `--no-ff`, always confirm |
| `git tag` | Always confirm before pushing |
| `git reset --hard` | Never without explicit user request |
| `git clean -fd` | Never without explicit user request |
| Modify `production` directly | NEVER |

---

## Appendix — Implementation Reference

> Tactical commands, review templates, and procedures for use during workflow execution.
> Feature Mode and Major System Mode apply all sections. Quick Fix Mode applies B–D for non-trivial changes; may skip `/simplify` only for true one-line CSS or text fixes.

---

### A. Pre-implementation Checklist

Before writing any code:

```bash
# 1. Pull latest production
git checkout production
git pull origin production

# 2. Confirm clean working tree
git status   # must show "nothing to commit, working tree clean"

# 3. Create checkpoint tag (Feature Mode and Major System Mode)
git tag pre-<feature-name>
git push origin pre-<feature-name>

# 4. Create feature branch
git checkout -b feature/<feature-name>
```

Codebase checks before writing:
- [ ] Read the relevant existing module files to understand current patterns
- [ ] Check `backend/src/config/constants.ts` — existing permission keys, roles, enums
- [ ] Check `backend/prisma/schema.prisma` — current data model
- [ ] Search for similar existing implementations to reuse
- [ ] Identify permissions impact — new actions require new keys in `constants.ts`
- [ ] Identify Prisma/schema impact — new models or fields require a migration + `db:generate`
- [ ] Identify Electron IPC/preload impact — new IPC channels must be bridged in `preload.ts`

---

### B. Code Quality Steps

Run in this order after implementation passes validation, before Gemini review.

**`/simplify`**

Applies to: Feature Mode, Major System Mode.
Quick Fix Mode: may skip only for a trivial one-line CSS or text change.

Focus:
- Remove duplication introduced during implementation
- Flatten unnecessary nesting
- Remove dead code and unused imports
- Improve variable and function naming
- Extract repeated logic only when it appears 3+ times

Rule: do not change behavior. Re-run `tsc --noEmit` after applying simplifications.

---

**`/code-review`**

Applies to: Feature Mode, Major System Mode.

Focus:
- Module pattern: routes → controller → service → schema
- No business logic in controllers — controllers validate input and call the service only
- No raw SQL — use Prisma query builder unless explicitly justified
- Error handling via `AppError` + `asyncHandler`
- Consistent use of `successResponse` / `errorResponse`
- Pagination applied to all list endpoints
- No hardcoded permission keys — all keys must reference `constants.ts`

Block if: any finding is high severity or breaks the module pattern.

---

**`/security-review`**

Applies to: Feature Mode, Major System Mode.

Focus:
- All new routes protected by `authenticate` + `requirePermission`
- No JWT secrets or password hashes in logs or API responses
- `preload.ts` — no dangerous Node APIs exposed via contextBridge
- IPC handlers validate input before acting
- Zod validation applied before every DB write
- No path traversal in backup or file operations
- No auth or RBAC bypass

Block if: any auth bypass, exposed secret, or unsafe IPC channel found.

---

### C. Gemini Review Report Template

Prepare and submit this report along with the relevant diff or file content.

```markdown
## Feature: <Feature Name>

### Summary
<1–3 sentence description of what the feature does>

### Files Changed
<list of all modified and added files>

### Schema Changes
<Prisma model additions/modifications, or "None">

### New Permission Keys
<list of new keys added to constants.ts, or "None">

### API Changes
<list of new routes added, or "None">

### Security Considerations
<summary of auth/permission/validation decisions made>

### Validation Results
- Backend TypeScript: PASS / FAIL
- Frontend TypeScript: PASS / FAIL
- Electron TypeScript: PASS / FAIL
- Backend Build:      PASS / FAIL
- Frontend Build:     PASS / FAIL
- Tests:             PASS / FAIL

### Code Review Findings
<summary of /code-review output and how findings were addressed>

### Security Review Findings
<summary of /security-review output and how findings were addressed>

### Open Questions for Gemini
<any architectural decisions you want Gemini to validate>
```

Block merge if Gemini returns `Decision: CHANGES_REQUIRED`. Fix all blockers, re-run validation and reviews, resubmit before merging.

---

### D. Merge Verification Commands

After `git merge --no-ff feature/<name>`, run all three before pushing:

```bash
# 1. Confirm merge commit is at HEAD with correct message
git log --oneline -5

# 2. Confirm no uncommitted conflicts remain
git status

# 3. Confirm only intended files are in the diff
git diff HEAD~1 --name-only
```

Success criteria:
- `git log` shows the merge commit at HEAD with the expected message
- `git status` shows `nothing to commit, working tree clean`
- `git diff HEAD~1 --name-only` lists only the files you intended to change

Block push if any unexpected files appear, or if `git status` shows uncommitted changes.

---

### E. Commit Message Format

```
feat(module): description
fix(module): description
refactor(module): description
docs: description
style(ui): description
```

Examples:
```
feat(contracts): add linked price selector and customer column
fix(ui): remove sticky header causing first-row overlap
refactor(payroll): extract salary calculation into payroll.calc.ts
docs: update development-workflow to v3.0
style(ui): align page-head class across Cheques and DataImport
```

Notes:
- `module` is the backend module name (`contracts`, `invoices`, `employees`, etc.) or `ui` for frontend-only changes
- Keep the description under 72 characters
- Multi-session features will accumulate incremental commits on the feature branch — that is correct. The commit step in Feature Mode is the final cleanup commit for any remaining unstaged changes after reviews; do not amend or squash earlier commits

---

### F. Tag and Push Rules

**Checkpoint tags** — create before feature work begins:
```bash
git tag pre-<feature-name>
git push origin pre-<feature-name>
```

**Stable release tags** — create after merge is verified:
```bash
git tag stable-<feature-name>-v1
git push origin stable-<feature-name>-v1
```

Naming convention:
```
Checkpoint:  pre-<feature-slug>           e.g.  pre-contracts-price-binding
Stable:      stable-<feature-slug>-v<n>   e.g.  stable-contracts-price-binding-v1
```

After tagging, always push both production branch and the stable tag:
```bash
git push origin production
git push origin stable-<feature-name>-v1
```

---

### G. Rollback Procedure

If a merged feature causes a regression in production:

**Option 1 — Revert merge commit (preferred — keeps history intact):**
```bash
git revert -m 1 <merge-commit-hash>
git push origin production
```
After reverting, tag the state: `git tag rollback-<feature-name>-<date>`

**Option 2 — Reset to checkpoint tag (destructive — requires explicit user approval):**
```bash
git reset --hard pre-<feature-name>
git push origin production --force-with-lease
```

> **Warning:** Option 2 rewrites the branch tip and discards commits. It requires explicit user approval before execution. Never use `--force`; use `--force-with-lease` to avoid overwriting concurrent pushes.

When in doubt, use Option 1. Option 2 is appropriate only when the regression is caught immediately and no one else has pulled the bad state.
