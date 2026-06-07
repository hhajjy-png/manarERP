# Development Workflow — manarERP

> الإجراء الإلزامي لجميع التغييرات على codebase المنار ERP.
> لا يجوز تخطي أي خطوة أو تغيير ترتيبها.

---

## Overview

| الخطوة | الوصف |
|--------|-------|
| 1 | Pull latest production |
| 2 | Create git checkpoint tag |
| 3 | Create feature branch |
| 4 | Implement feature |
| 5 | Run build and validation |
| 6 | Run /simplify |
| 7 | Run code review |
| 8 | Run security review |
| 9 | Prepare Gemini review report |
| 10 | Commit |
| 11 | Merge using --no-ff |
| 12 | Verify merge result |
| 13 | Push production |
| 14 | Create stable tag |
| 15 | Update project baseline |

---

## Step-by-Step

### Step 1 — Pull Latest Production

```bash
git checkout production
git pull origin production
```

**Why:** Ensures your baseline includes all merged work. Avoids merge conflicts caused by working on a stale base.

---

### Step 2 — Create Git Checkpoint Tag

```bash
git tag pre-<feature-name>
git push origin pre-<feature-name>
```

**Example:** `git tag pre-payroll-advances`

**Why:** Creates a named rollback point. If the feature causes issues after merge, `git reset --hard pre-<feature-name>` restores exact pre-feature state.

---

### Step 3 — Create Feature Branch

```bash
git checkout -b feature/<feature-name>
```

**Example:** `git checkout -b feature/payroll-advances`

**Why:** Protects the `production` branch. All work-in-progress stays isolated until it passes all reviews.

**Branch naming:** `feature/<kebab-case-name>`

---

### Step 4 — Implement Feature

**Before writing any code:**
- Read the relevant existing module files to understand current patterns
- Check `backend/src/config/constants.ts` for existing enums, roles, and permission keys
- Check `backend/prisma/schema.prisma` to understand current data model
- Invoke `superpowers:brainstorming` for non-trivial features
- Invoke `superpowers:test-driven-development` before writing implementation code

**Implementation checklist:**
- [ ] Follow the module pattern: routes → controller → service → schema
- [ ] Add permission keys to `constants.ts` if new actions are introduced
- [ ] Add Zod validation schemas for all new request bodies
- [ ] Apply `authenticate` + `requirePermission` to all new routes
- [ ] Add AuditLog entries for all write operations
- [ ] Update `backend/prisma/schema.prisma` if new models/fields are needed
- [ ] Run `npm run db:migrate` and `npm run db:generate` after schema changes
- [ ] Add frontend page, route in `App.tsx`, and sidebar entry in `Layout.tsx`
- [ ] Protect frontend routes with `ProtectedRoute` and `hasPermission` checks
- [ ] Update `backend/prisma/seed.ts` for any new role-permission assignments

**Multi-session features:** Features spanning multiple sessions will accumulate several commits during development — that is expected and correct. Commit incrementally as logical units of work complete (e.g., "feat(payroll): add generate endpoint", "feat(payroll): add payslip page"). Step 10 is not the only commit; it is the final cleanup commit that ensures the branch is clean and ready for merge.

---

### Step 5 — Run Build and Validation

Run all of the following. **Do not proceed to Step 6 if any fail.**

```bash
# TypeScript — Backend
cd backend && npx tsc --noEmit

# TypeScript — Frontend
cd frontend && npx tsc --noEmit

# TypeScript — Electron
tsc -p electron/tsconfig.json --noEmit

# Build — Backend
npm run build:back

# Build — Frontend
npm run build:front

# Tests
cd backend && npm test

# Lint
cd frontend && npm run lint
cd backend && npm run lint
```

**Success criteria:** Zero TypeScript errors, zero build errors, all tests pass.

---

### Step 6 — Run /simplify

```
/simplify
```

**Focus areas:**
- Remove duplication introduced during implementation
- Improve variable and function naming
- Flatten unnecessary nesting
- Extract repeated logic into shared utilities (only when used 3+ times)
- Remove dead code and unused imports

**Do not:** Redesign architecture, introduce new abstractions, or change behavior. Simplify only.

**Block if:** Simplification changes introduce new TypeScript errors — re-run `tsc --noEmit` after applying simplifications.

---

### Step 7 — Run Code Review

```
/code-review
```

Or use the PR Review Toolkit for comprehensive coverage:

```
/pr-review-toolkit:review-pr
```

**Focus areas:**
- Adherence to module pattern (routes → controller → service → schema)
- No business logic in controllers
- No raw SQL (use Prisma query builder)
- Error handling using `AppError` + `asyncHandler`
- Consistent use of `successResponse` / `errorResponse`
- No hardcoded permission keys (must reference `constants.ts`)
- Pagination applied to all list endpoints

**Block if:** Any finding rated high severity or that breaks the module pattern.

---

### Step 8 — Run Security Review

```
/security-review
```

**Focus areas:**
- All routes protected by `authenticate` + `requirePermission`
- No JWT secrets exposed in logs or responses
- No plain-text passwords anywhere
- `preload.ts` — no dangerous Node APIs exposed via contextBridge
- IPC handlers validate input before acting on it
- No path traversal in backup/file operations
- SQL injection: not applicable (Prisma parameterizes all queries)
- Zod validation applied before any DB write

**Block if:** Any auth bypass, exposed secret, or unsafe IPC channel found.

---

### Step 9 — Prepare Gemini Review Report

Prepare a Markdown report with the following sections, then submit to Gemini for architecture and security audit:

```markdown
## Feature: <Feature Name>

### Summary
<1-3 sentence description of what the feature does>

### Files Changed
<list of all modified/added files>

### Schema Changes
<Prisma model additions/modifications, or "None">

### New Permission Keys
<list of new permission keys added to constants.ts, or "None">

### API Changes
<list of new routes added, or "None">

### Security Considerations
<summary of auth/permission/validation decisions made>

### Build Validation Results
- Backend TypeScript: PASS / FAIL
- Frontend TypeScript: PASS / FAIL
- Electron TypeScript: PASS / FAIL
- Backend Build: PASS / FAIL
- Frontend Build: PASS / FAIL
- Tests: PASS / FAIL

### Code Review Findings
<summary of /code-review output and how findings were addressed>

### Security Review Findings
<summary of /security-review output and how findings were addressed>

### Open Questions for Gemini
<any architectural decisions you want Gemini to validate>
```

**Block merge if:** Gemini reports blockers. Fix blockers, re-run Steps 5–8, update report, resubmit.

---

### Step 10 — Commit

Stage and commit the final state of the branch:

```bash
git add <specific files>
git commit -m "feat(<module>): <short description>"
```

**Commit message format:** `feat(module): description` / `fix(module): description` / `refactor(module): description`

**Note on multi-commit features:** If the branch already has incremental commits from development (Step 4), this step is only needed if there are remaining unstaged changes after reviews. Do not amend or squash existing commits unless they are truly WIP noise — the commit history on the feature branch is preserved through the `--no-ff` merge and aids future debugging.

**Do NOT:**
- Use `git add .` or `git add -A` (may include unintended files)
- Commit `.env` files, `*.db` files, or `backend/dist/`
- Amend commits that have already been shared or reviewed

---

### Step 11 — Merge Using --no-ff

Switch to production and merge:

```bash
git checkout production
git merge --no-ff feature/<feature-name>
```

**Why `--no-ff`:** Preserves the merge commit and feature branch topology in git history. Makes rollback and audit easier.

**If conflicts occur:** Resolve conflicts manually, then `git add <resolved files>` and `git commit`. Do not use `git merge --abort` unless the conflict is truly unresolvable — investigate root cause first.

---

### Step 12 — Verify Merge Result

Before pushing, confirm the merge is clean:

```bash
# Confirm HEAD is the merge commit, not a stale state
git log --oneline -5

# Confirm no conflicts were left unresolved
git status

# Confirm the merged files are what you expect
git diff HEAD~1 --name-only
```

**Success criteria:**
- `git status` shows `nothing to commit, working tree clean`
- `git log` shows the merge commit at HEAD with the correct message
- `git diff HEAD~1 --name-only` lists only the files you intended to change

**Block push if:** Any unexpected files in the diff, or `git status` shows uncommitted changes.

---

### Step 13 — Push Production

```bash
git push origin production
```

**Confirm:** Only push after Step 12 verification passes.

---

### Step 14 — Create Stable Tag

```bash
git tag stable-<feature-name>
git push origin stable-<feature-name>
```

**Example:** `git tag stable-payroll-advances`

**Why:** Marks a known-good production state. Used for rollback and release tracking.

---

### Step 15 — Update Project Baseline

Update `memory/project_baseline.md` with:
- New completed feature in the appropriate section
- New stable tag name
- Current HEAD commit hash
- Any new modules, routes, or schema models added
- Date of completion

Use `docs/project-baseline-template.md` as reference for what to include.

---

## Rollback Procedure

If a merged feature causes a regression:

```bash
# Option 1: Roll back to pre-feature checkpoint
git checkout production
git reset --hard pre-<feature-name>
git push origin production --force-with-lease

# Option 2: Revert the merge commit (safer — keeps history)
git revert -m 1 <merge-commit-hash>
git push origin production
```

**Always** create a new tag after rollback: `git tag rollback-<feature-name>-<date>`

---

## Checklist Summary

```
[ ] Step 1:  git pull production
[ ] Step 2:  git tag pre-<feature>
[ ] Step 3:  git checkout -b feature/<name>
[ ] Step 4:  Implement (module pattern, permissions, Zod, audit)
[ ] Step 5:  tsc --noEmit + build + tests all PASS
[ ] Step 6:  /simplify — no new TS errors introduced
[ ] Step 7:  /code-review — all high findings resolved
[ ] Step 8:  /security-review — zero blockers
[ ] Step 9:  Gemini report submitted + approved
[ ] Step 10: git commit (specific files, message format)
[ ] Step 11: git merge --no-ff feature/<name>
[ ] Step 12: git log + git status + git diff verify clean merge
[ ] Step 13: git push origin production
[ ] Step 14: git tag stable-<name> + push tag
[ ] Step 15: project_baseline.md updated
```
