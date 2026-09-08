# COMPACTION_MANIFEST_V1 — Completed Features Compaction & Archive

**Package:** Completed Features Documentation Compaction & Archive v1
**Date:** 2026-09-08
**Branch:** `docs/completed-features-compaction-v1`
**Base production HEAD:** `4702f90abc828f8eeea7ef3348bb43064c0f453f`
**Desktop version:** `2026.5.9` (unchanged)
**Scope:** documentation only — no code, schema, migration, database, build or version change.

---

## 1. Before / after

### The `## Completed Features` section

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Bytes | 315,536 | **16,027** | **−299,509 (−94.9 %)** |
| Lines | 133 | 130 | −3 |
| Heading | `## Completed Features` | `## Completed Features — Active Reference` | renamed |
| Shape | one flat 126-row table | 11 domain groups of current-behaviour rows | restructured |

The line count barely moves because the original was 133 lines of *enormous single-line table rows* — one
feature per line, several kilobytes each. The byte count is the meaningful measure.

### `PROJECT_STATE.md` as a whole

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Bytes | 590,449 | **290,940** | **−299,509 (−50.7 %)** |
| Lines | 1,569 | 1,567 | −2 |
| Completed Features share of file | 53.4 % | **5.5 %** | — |

No other section was touched to reduce size.

---

## 2. Counting model

This is stated explicitly because the active reference is **not** a subset copy of the archive.

- **Original entries — 126.** Every row of the old flat table.
- **Archived entries — 126.** All of them, moved verbatim. *This is the number that must be conserved.*
- **Active-reference items — 56 rows across 11 domain groups.** These are **newly written current-behaviour
  summaries**, not copies of archived entries. One summary may cover several archived features, and some
  archived features (classes D, E, F) are represented only by their domain's general statement.

Therefore the active-reference count is deliberately **not** added to the archived count. A summary that
references an archived feature is a *pointer*, not a second copy of that feature.

### Invariant

```
original_entries = archived_entries
             126 = 126
```

**Result: ✅ PASS** — and proven by hash, not by counting alone (section 4).

---

## 3. Classification

Assigned by **current relevance**, never by age. Precedence when several could apply:
`A > B > E > F > C > D`.

| Class | Meaning | Count |
|---|---|---:|
| **A** | Current core feature | 9 |
| **B** | Current architecture / rule | 7 |
| **C** | Recent implementation history | 29 |
| **D** | Historical completed feature | 22 |
| **E** | Superseded historical feature | 31 |
| **F** | Documented in detail elsewhere | 28 |
| | **Total** | **126** |

- **A** — the nine core-module entries (payroll, accounting, inventory, data import, audit log, reports, RBAC,
  backup/restore, authentication).
- **B** — standing rules rather than one-off releases: export file-naming standard, date-presentation
  standard, monetary-formatting policy, unified bank-account timeline architecture, approval-workflow
  foundation, print-template-engine foundation, print-profile registry.
- **E** — 31 entries whose design was replaced by a later entry; each carries an explicit *Superseded by*
  pointer in its file's index table.
- **F** — 28 entries whose stable tag also appears in the release log, which carries the fuller record of the
  same release.

**No class is deleted.** D, E and F are archived exactly like A, B and C; the class only determines how
prominently a feature is represented in the active reference.

---

## 4. Zero-information-loss verification

Each of the 126 rows was hashed with SHA-256 **as it stood in `PROJECT_STATE.md` at commit `4702f90a`**
(read back out of Git, not from a working copy) and again **as written into the archive**.

| Check | Result |
|---|---|
| Original entries found in the pre-package commit | ✅ 126 |
| Entries written to the archive | ✅ 126 |
| Every original entry present in the archive, byte-identical | ✅ **0 missing** |
| No entry present in the archive that was not in the original | ✅ **0 foreign / 0 rewritten** |
| Hash multiset identical before and after | ✅ PASS |
| No duplicate entry inside the archive | ✅ **0 duplicates** |
| No entry written into more than one archive file | ✅ PASS |
| No historical row left behind in the live file | ✅ **0** |
| Code fences balanced (live file + 5 archive files) | ✅ PASS |
| Headings well-formed | ✅ PASS |
| All Markdown links resolve | ✅ PASS |

**Truncation** is structurally impossible here: rows are whole table lines, moved intact, and any partial move
would break the hash comparison above.

---

## 5. Archive organisation

Split by **domain**, so a reader looking for a capability lands in one file rather than paging through a
single 300 KB blob.

| File | Entries | Bytes | Class spread |
|---|---:|---:|---|
| `hr-payroll-employees.md` | 10 | 29,784 | A1 · C5 · D2 · E1 · F1 |
| `finance-invoicing-banking.md` | 31 | 105,568 | A1 · B1 · C11 · D4 · E6 · F8 |
| `cheques-printing-documents.md` | 32 | 65,879 | B2 · C1 · D10 · E10 · F9 |
| `platform-ui-operations.md` | 53 | 138,414 | A7 · B4 · C12 · D6 · E14 · F10 |
| **Total** | **126** | **339,645** | |

Archive files total more bytes than the 315,536 they came from because each adds an index table and a header;
the historical rows themselves are byte-identical.

Each file opens with an index table carrying, per entry: feature name, stable tag, class, *superseded by*, and
a content SHA-256 prefix — so every entry is traceable even where no unique tag exists (12 entries have no
`stable-*` tag).

---

## 6. Superseded features

**31** entries are marked Class E. The largest chains:

| Superseded chain | Count | Superseded by |
|---|---:|---|
| Print Designer phases 5A → 5D.2, Print Template Engine 2B | 7 | Print Designer — Phase 6.0 (Universal WYSIWYG Template Studio) |
| Unified Explorer Design System Rollout phases 1 → 3E | 7 | ExplorerKit Professional Modernization Pack v1 |
| Bank Account Explorer phases B → D + Polish | 4 | Bank Account Explorer — Phase E |
| AI Assistant phases AI-1, AI-1.5, AI-2 | 3 | AI Assistant — Phase AI-2.5 |
| Print & Document Suite phases 1 → 3 | 3 | Print & Document Suite — Phase 4 |
| Executive Intelligence Bundle 1 → 2, Command Center Redesign | 3 | Executive Command Center Evolution v1 |
| Bank Statement Import Phase A + Phase 1 | 2 | Bank Statement Incremental Import v2 |
| Smart Import Validation Phase 1 | 1 | Smart Import Assistant — Phase 2 |
| Payroll Bank Import Phase 1 | 1 | Payroll Bank Import Assistant v1 |

Historical text was **not** edited to say "superseded" — that metadata lives only in the index tables, so the
original wording stays faithful.

---

## 7. Duplicate analysis

- **Duplicate names in the original section: 0.**
- **Byte-identical duplicate rows: 0.**
- **Overlapping documentation (Class F): 28** — features whose stable tag also appears in the release log.
  These are *not* duplicates within Completed Features; they are the same release described from a different
  angle in a different document. Both records are preserved.
- A notable structural finding: **69 of the 114 tagged entries have no counterpart anywhere in the release log
  or its archive.** For those features, this Completed Features table was the *only* record in the repository —
  which is precisely why the whole table was archived rather than partly discarded.

---

## 8. Current-behaviour verification

Every statement kept in the active reference was checked against the repository, not copied from the old
prose. Verified this pass:

| Fact | Source of truth | Result |
|---|---|---|
| Import entities | `frontend/src/config/importEntities.ts` | **9** — the old text said *7* ❗ |
| Print profiles | `frontend/src/forms/shared/printProfiles.ts` | 7 registered, **3 selectable** |
| Cheque template statuses | `frontend/src/modules/chequePrint/bankChequeProfiles.ts` | Gulf `APPROVED`, KFH/NBK `PROVISIONAL` |
| Calibration profiles | `frontend/src/modules/chequePrint/calibrationProfiles.ts` | `office` · `home` · `other` |
| Employee statuses | `backend/src/config/constants.ts` | `ACTIVE` · `ON_LEAVE` · `TERMINATED` |
| Payroll statuses | `backend/src/config/constants.ts` | `DRAFT` · `APPROVED` · `PAID` · `CANCELLED` |
| Cheque statuses | `backend/src/config/constants.ts` | `DRAFT` · `PRINTED` · `CANCELLED` |
| Roles | `backend/src/config/constants.ts` | **7** |
| Permission modules | `backend/src/config/constants.ts` | **44** |
| Migrations / models | `backend/prisma/` | **71** / **87** |
| Desktop version | `package.json` | **2026.5.9** |

Domains that had changed repeatedly were re-checked specifically: payroll eligibility, employee entitlements,
leave, vouchers, bank statements, cheques, calibration, vehicle insurance, expiration centre, printing, Google
Drive sync and reporting. The active reference states the **current** rule in each case, not the first
implementation.

---

## 9. Findings

| # | Finding | Action |
|---|---|---|
| 1 | **The old section stated "Data Import — 7 entities"; the repository has 9** (invoices and payroll runs were added later and the line was never updated). A stale fact presented as current — exactly the risk this package targets. | Corrected in the active reference; the original row is archived verbatim so the historical claim is not rewritten. |
| 2 | **69 of 114 tagged features have no release-log entry at all** (they predate the archived release window). Completed Features was their only record. | Whole table archived rather than partly discarded. Worth knowing before anyone treats Completed Features as redundant. |
| 3 | **12 entries carry no `stable-*` tag** (`*(stable)*`, `*(merged)*`, or a prose note). | Traced by content SHA-256 in the index tables instead. |
| 4 | **Class F overlap (28 entries)** means the release log and Completed Features will drift apart over time if both are maintained by hand. | Recorded only. A future decision could make one of the two canonical. |
| 5 | `PROJECT_MASTER_STATUS.md` still maintains a **third** parallel history. | Out of scope here; already recorded as a future maintenance concern by the rotation package. |

---

## 10. Confirmations

- ✅ **No information lost** — 126 = 126, proven by SHA-256 set equality against the pre-package Git commit.
- ✅ **Nothing rewritten** — archived rows are byte-identical; only index tables and headers were added.
- ✅ **Active reference is current-only** and states the reading rule that it wins over any archived entry.
- ✅ **`## Previous Release` rotation untouched** — 1 Latest + 16 Previous, exactly as the previous package left it.
- ✅ **Documentation-only** — no `backend/`, `frontend/`, `electron/`, `scripts/`, Prisma, migration,
  `package.json`, `.gitignore`, Golden DB, installer or `docs/user-manual/` change.
- ✅ **No build, no installer, no version bump** — desktop stays `2026.5.9`.
