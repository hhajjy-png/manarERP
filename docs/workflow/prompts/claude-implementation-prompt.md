# Claude Code — Implementation Prompt Template

Use this template when handing a feature to Claude Code for implementation.

---

## Prompt

```
## Task: <Feature Name>

### Branch
Create: `feature/<kebab-case-name>`

### Context
<1–3 sentences describing the business need or user problem this solves>

### Scope
<What must be implemented. Be explicit about the boundaries.>

**In scope:**
- ...
- ...

**Out of scope (do not touch):**
- frontend/
- backend/
- electron/
- prisma/

### Acceptance Criteria
- [ ] <Observable behavior 1>
- [ ] <Observable behavior 2>
- [ ] <Observable behavior 3>

### Files to Create or Modify
| File | Action | Notes |
|------|--------|-------|
| `path/to/file.ts` | create / modify | <why> |

### Constraints
- No new npm packages without approval
- No prisma migrate without SQL review and approval
- No direct edits to production branch
- No merge without Gemini Web review

### Validation Required
Run full suite before returning report:
1. `npx prisma validate`
2. `cd backend && npx tsc --noEmit`
3. `cd frontend && npx tsc --noEmit`
4. `tsc -p electron/tsconfig.json --noEmit`
5. `cd backend && npm test`
6. `npm run build:back`
7. `npm run build:front`
8. `git status`

### Return
Return an implementation report with:
- Branch name
- Commit hash
- Files changed (with line counts)
- What was implemented
- Validation results (all 8 checks)
- What was NOT touched
- Gemini review template pre-filled with the above
```

---

## Notes for ChatGPT when filling this template

- Be specific in acceptance criteria — Claude Code will use these as the definition of done.
- List the exact files if known; Claude Code will identify others as needed.
- The "Out of scope" section prevents scope creep — always fill it.
- If the task involves a Prisma schema change, explicitly state: "Schema change required — Claude Code must show SQL diff before migration."
