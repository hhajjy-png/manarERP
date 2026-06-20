# Gemini Web — Review Prompt Template

Paste this into gemini.google.com after Claude Code returns an implementation report.
Fill in each section using Claude Code's report output.

---

## Prompt (paste into Gemini Web)

```
You are reviewing a feature implementation for manarERP — an Electron desktop ERP system
built for Al Manar International Company (Kuwait). The stack is:
  - Electron 31 + React 18 + TypeScript 5.5 + Vite 5
  - Express 4 backend (child process, port 48211, localhost only)
  - Prisma 5 + SQLite
  - Arabic-first UI, Kuwaiti Dinar (KD, 3 decimal places)
  - JWT auth with RBAC (permission keys: <module>.<action>)
  - HashRouter (Electron file:// constraint)

This is a docs/config-only change OR a full code feature (select the appropriate context below).

---

## Gemini Web Review Request — manarERP

**Branch:** feature/<name>
**Commit:** <hash>
**Scope:** <one-line description>

---

### Files Changed
<paste `git diff --stat` output here>

---

### What Changed
<paste the "What Changed" section from Claude Code's report>

---

### What Must Not Change
- authenticate middleware behavior
- requirePermission guard logic
- JWT token structure and 12h expiry
- Prisma schema (unless explicitly in scope)
- Port 48211 binding
- HashRouter usage
- Print layouts for invoices, payslips, or forms
- preload.ts contextBridge surface (unless IPC change is in scope)

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
<list 2–4 specific things you want Gemini to scrutinize>

Example focus areas:
- New IPC channel: is it properly sandboxed in preload.ts?
- Zod validation schema: does it cover all edge cases?
- Permission key: is it registered in constants.ts and all route guards?
- Arabic text: is RTL direction applied consistently?
- KD formatting: are all amounts displayed with 3 decimal places?

---

### Required Output

Please provide:

1. **Executive Summary** (2–3 sentences on overall quality and risk level)
2. **Architecture Review** (structural concerns, pattern adherence, coupling, module boundaries)
3. **Security Review** (auth bypass risk, injection risk, IPC exposure, permission gaps, data validation)
4. **Regression Risk** (what existing features could break and why, with specific file references)
5. **Final Decision:**
   - APPROVED — merge may proceed as-is
   - APPROVED WITH MINOR ISSUES — merge may proceed after listed minor fixes (list each fix)
   - CHANGES REQUIRED — merge blocked (list each blocking issue with file and line reference if possible)
```

---

## After Gemini Responds

1. Copy the full response.
2. Save it to `docs/GEMINI_REVIEW_<FEATURE_NAME>.md` in the repository.
3. If APPROVED or APPROVED WITH MINOR ISSUES:
   - Apply any minor fixes Claude Code needs to make.
   - Proceed with merge: `git merge --no-ff feature/<name>`
4. If CHANGES REQUIRED:
   - Return to Claude Code with the blocking issues list.
   - Ask Claude Code to address each issue.
   - Re-run validation and prepare a new report.
   - Re-submit to Gemini Web.
