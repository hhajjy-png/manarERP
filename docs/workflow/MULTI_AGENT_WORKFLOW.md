# Multi-Agent AI Development Workflow
# نظام المنار لإدارة الأعمال — سير العمل متعدد الوكلاء

> **Version:** 1.0  
> **Effective:** 2026-06-20  
> **Replaces:** Gemini Code Assist CLI/VS Code extension (deprecated for individual accounts)

---

## Background

Gemini Code Assist for individuals via CLI and VS Code extension is no longer supported:

> "This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, migrate to Antigravity."

This document formalizes the replacement workflow using four AI tools, each with a defined, non-overlapping role.

---

## Agent Roles

### 1. ChatGPT — Planner & Workflow Manager

**Access:** ChatGPT web or desktop app

**Responsibilities:**
- Feature planning and scoping
- Branch strategy and naming
- Writing implementation prompts for Claude Code
- Defining acceptance criteria
- Risk analysis and dependency ordering
- Deciding task sequencing across features
- Summarizing releases and recording roadmap notes
- Maintaining backlog priorities

**Artifacts produced:**
- Feature plans with acceptance criteria
- Implementation prompts (handed to Claude Code)
- Release summaries
- Roadmap updates

---

### 2. Claude Code — Implementation Agent

**Access:** Claude Code CLI or VS Code extension

**Responsibilities:**
- Implement all code changes
- Create and manage feature branches
- Follow `PROJECT_STATE.md`, `CLAUDE.md`, and `development-workflow.md`
- Run all validation steps
- Prepare implementation reports for Gemini Web review
- Stop before merge — awaiting human or Gemini approval

**Rules (non-negotiable):**
- No merge without Gemini Web review approval
- No direct edits to the `production` branch
- No `prisma migrate` without explicit human approval and SQL review
- No new `npm` packages without explicit human approval
- Always run full validation suite before declaring done
- Always prepare an implementation report before requesting Gemini review

**Validation suite (mandatory before any report):**
```bash
npx prisma validate
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
cd backend && npm test
npm run build:back
npm run build:front
git status
```

---

### 3. Gemini Web — Architecture & Security Reviewer

**Access:** gemini.google.com (web UI — paste content manually)

**Why web instead of CLI:** Gemini Code Assist individual CLI/VS Code authentication is deprecated. All Gemini reviews are now conducted by pasting implementation summaries or diffs into the Gemini web interface.

**Responsibilities:**
- Review implementation summaries submitted by Claude Code
- Review diffs when pasted for line-level analysis
- Architecture risk assessment
- Security risk assessment (auth bypass, injection, IPC exposure, permission gaps)
- Print/layout regression risk (forms, invoices, payslips)
- Issue a formal decision before any merge is allowed

**Formal decision options:**
- `APPROVED` — merge may proceed as-is
- `APPROVED WITH MINOR ISSUES` — merge may proceed after listed minor fixes
- `CHANGES REQUIRED` — merge blocked; Claude Code must address findings and re-submit

**Rules:**
- A Gemini review is mandatory for every feature merge, no exceptions
- Gemini approval must be obtained before running `git merge --no-ff`
- The review result must be saved to `docs/` (e.g., `GEMINI_REVIEW_<FEATURE>.md`)

---

### 4. Codex VS Code — Local IDE Assistant

**Access:** Codex extension within VS Code

**Responsibilities:**
- Quick inline code questions
- File and function explanation
- Small local edits during development
- Debugging assistance
- Code navigation within the IDE
- Reviewing selected code snippets

**Rules:**
- Do not use Codex as the sole reviewer for production merges
- Do not rely on Codex for full architecture or security reviews
- Codex is a development-time helper — Gemini Web is the gate-keeper

---

## Standard Feature Workflow

Every feature follows this sequence without exception:

```
Step 1  │ ChatGPT creates feature plan + implementation prompt
Step 2  │ Claude Code creates feature branch (checkpoint tag first)
Step 3  │ Claude Code implements on feature branch
Step 4  │ Claude Code runs full validation suite
Step 5  │ Claude Code prepares implementation report
Step 6  │ Gemini Web reviews report (paste into web UI)
Step 7  │ If CHANGES REQUIRED → Claude Code fixes → repeat Steps 4–6
Step 8  │ If APPROVED (or APPROVED WITH MINOR ISSUES):
        │   a. Apply any minor fixes
        │   b. git merge --no-ff feature/... into production
        │   c. Update PROJECT_STATE.md
        │   d. Create stable tag
        │   e. Push production branch and tag
Step 9  │ ChatGPT records release summary and updates roadmap
```

---

## Validation Checklist

Run every item in sequence before issuing an implementation report. All must pass.

| # | Command | Scope |
|---|---------|-------|
| 1 | `npx prisma validate` | Schema integrity |
| 2 | `cd backend && npx tsc --noEmit` | Backend types |
| 3 | `cd frontend && npx tsc --noEmit` | Frontend types |
| 4 | `tsc -p electron/tsconfig.json --noEmit` | Electron types |
| 5 | `cd backend && npm test` | Unit tests |
| 6 | `npm run build:back` | Backend compile |
| 7 | `npm run build:front` | Frontend compile |
| 8 | `git status` | Working tree clean |

---

## Release Checklist

For every production release, record the following:

```
Feature commit hash:      ___________
Merge commit hash:        ___________
Docs commit hash:         ___________
Production HEAD:          ___________
Stable tag:               ___________
Validation results:       ALL PASSED / PARTIAL (details below)
Working tree status:      clean
Remote sync status:       pushed
Delivered features:
  -
  -
Deferred items:
  -
  -
```

---

## Gemini Web Review Template

When submitting a feature for Gemini review, paste the following template into the Gemini web UI and fill in each section:

```
## Gemini Web Review Request — manarERP

**Branch:** feature/<name>
**Commit:** <hash>
**Scope:** <one-line description>

---

### Files Changed
<list changed files with +/- line counts>

---

### What Changed
<describe what was implemented, what logic was added or modified>

---

### What Must Not Change
<list invariants — middleware, auth flow, print layouts, etc. that must remain untouched>

---

### Validation Results
- prisma validate: PASS / FAIL
- backend tsc --noEmit: PASS / FAIL
- frontend tsc --noEmit: PASS / FAIL
- electron tsc --noEmit: PASS / FAIL
- npm test: PASS / FAIL (X/Y tests)
- build:back: PASS / FAIL
- build:front: PASS / FAIL

---

### Review Focus Areas
<list specific concerns — e.g., "new IPC channel security", "Zod schema completeness", "permission key coverage">

---

### Required Output

Please provide:

1. **Executive Summary** — 2–3 sentences on overall quality
2. **Architecture Review** — structural concerns, pattern adherence, coupling
3. **Security Review** — auth bypass risk, injection risk, IPC exposure, permission gaps
4. **Regression Risk** — what existing features could break and why
5. **Final Decision:**
   - APPROVED
   - APPROVED WITH MINOR ISSUES (list issues)
   - CHANGES REQUIRED (list blocking issues)
```

---

## File Locations

| Artifact | Location |
|----------|----------|
| This document | `docs/workflow/MULTI_AGENT_WORKFLOW.md` |
| Reusable prompts | `docs/workflow/prompts/` |
| Gemini review records | `docs/GEMINI_REVIEW_<FEATURE>.md` |
| Dev workflow | `docs/development-workflow.md` |
| Project state | `docs/PROJECT_STATE.md` (root or docs/) |
| CLAUDE.md rules | `CLAUDE.md` |

---

## Quick Reference Card

| Task | Agent |
|------|-------|
| Plan the feature | ChatGPT |
| Write the prompt | ChatGPT |
| Implement the code | Claude Code |
| Run validations | Claude Code |
| Write the report | Claude Code |
| Architecture review | Gemini Web |
| Security review | Gemini Web |
| Approve merge | Gemini Web |
| Execute merge | Human (after Gemini approval) |
| Local questions/navigation | Codex VS Code |
| Update roadmap | ChatGPT |
