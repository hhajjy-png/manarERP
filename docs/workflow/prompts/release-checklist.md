# Release Checklist — manarERP Production Release

Complete this checklist for every production release. Copy it, fill it in, and save the
completed copy as a comment in the merge commit message or in the Gemini review doc.

---

## Pre-Merge Gate

### Validation Results
- [ ] `npx prisma validate` — PASS
- [ ] `cd backend && npx tsc --noEmit` — PASS
- [ ] `cd frontend && npx tsc --noEmit` — PASS
- [ ] `tsc -p electron/tsconfig.json --noEmit` — PASS
- [ ] `cd backend && npm test` — PASS (___/___  tests)
- [ ] `npm run build:back` — PASS
- [ ] `npm run build:front` — PASS
- [ ] `git status` — working tree clean

### Review Gate
- [ ] Gemini Web review completed
- [ ] Gemini decision: `APPROVED` / `APPROVED WITH MINOR ISSUES`
- [ ] Minor issues (if any) applied and re-validated
- [ ] Gemini review saved to `docs/GEMINI_REVIEW_<FEATURE>.md`

---

## Merge

- [ ] Merge executed: `git merge --no-ff feature/<name>`
- [ ] Merge commit message includes feature summary

---

## Post-Merge Documentation

- [ ] `PROJECT_STATE.md` updated with:
  - [ ] New HEAD commit hash
  - [ ] Feature listed under "Delivered"
  - [ ] Deferred items noted (if any)

---

## Tagging

- [ ] Stable tag created: `git tag -a <tag> -m "<message>"`
- [ ] Tag follows naming convention: `stable-YYYY-MM-DD-<descriptor>`

---

## Push

- [ ] `git push origin production`
- [ ] `git push origin <tag>`
- [ ] Remote confirmed in sync: `git status` shows "up to date"

---

## Release Record

Fill in after push:

```
Feature commit hash:      ___________
Merge commit hash:        ___________
Docs/state commit hash:   ___________
Production HEAD:          ___________
Stable tag:               ___________
Validation:               ALL PASSED
Working tree:             clean
Remote sync:              pushed

Delivered features:
  -
  -

Deferred items:
  -
  -

Notes:
  <anything unusual about this release>
```

---

## ChatGPT Handoff

After pushing, give ChatGPT the completed release record so it can:
- Update the roadmap
- Mark delivered items as done
- Identify next priorities
- Draft any client-facing notes if needed
