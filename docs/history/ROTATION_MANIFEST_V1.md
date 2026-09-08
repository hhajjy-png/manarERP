# ROTATION_MANIFEST_V1 — PROJECT_STATE.md Release-Log Rotation

**Package:** PROJECT_STATE Documentation Rotation & Maintenance v1
**Rotated on:** 2026-09-08
**Branch:** `docs/project-state-rotation-v1`
**Base production HEAD:** `f37c9c7f6dac02437ef4371420e8dcd94b517561`
**Scope:** documentation only — no code, schema, migration, database or build change.

---

## 1. Before / After

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| `PROJECT_STATE.md` bytes | 1,520,435 | 585,854 | **−934,581 (−61.5 %)** |
| `PROJECT_STATE.md` lines | 7,963 | 1,530 | −6,433 (−80.8 %) |
| `## Latest Release` headings | 3 | **1** | −2 |
| `## Previous Release` entries | 185 | **15** | −170 |
| Release-log sections total | 188 | 16 | −172 |
| Release log as share of file | 68.4 % | **19.2 %** | — |

The `git` diff on `PROJECT_STATE.md` is **0 insertions / 6,433 deletions** — a pure removal, with no line
rewritten. BOM and CRLF line endings are preserved byte-for-byte.

---

## 2. Count invariant

```
before_previous_release_count = retained_previous_release_count + archived_previous_release_count
                          185 =                              15 +                              170
```

**Result: ✅ PASS**

Total release sections are conserved as well: `188 = 16 retained + 172 archived`.

---

## 3. Retained in the live file (16 sections)

The current release plus the 15 most recent `## Previous Release` entries, covering **2026-08-25 → 2026-09-08**
plus the five undated cheque/financial packs that sit immediately below them.

| # | Kind | Date | Entry |
|---:|---|---|---|
| 0 | Latest | 2026-09-08 | Complete User Manual v1 |
| 1 | Previous | 2026-09-07 | Production Release 2026.5.9 (Desktop Installer) |
| 2 | Previous | 2026-09-07 | Receipt Voucher Company Letterhead Template v1 |
| 3 | Previous | 2026-09-07 | Payment Voucher Print Fix & Letterhead Template v1 |
| 4 | Previous | 2026-09-07 | Leave Request Editable Request Date v1 |
| 5 | Previous | 2026-08-31 | Production Release 2026.5.8 (Desktop Installer) |
| 6 | Previous | 2026-08-29 | Employee ↔ Payroll Eligibility & Status Transition Integrity v1 |
| 7 | Previous | 2026-08-28 | Remove Employee Vehicle License Expiry v1 |
| 8 | Previous | 2026-08-28 | Expiration Center — Single Source of Truth & Data Integrity v1 |
| 9 | Previous | 2026-08-27 | Bank Salary Analytics — Western Digits Consistency v1 |
| 10 | Previous | 2026-08-25 | Production Release 2026.5.7 (Desktop Installer) |
| 11 | Previous | — | Simple Cheque Calibration Profiles + Persistent Default v1 |
| 12 | Previous | — | Multi-Bank Cheque Profiles Readiness v1 |
| 13 | Previous | — | Gulf Bank A4 Cheque Template + Professional Calibration v1 |
| 14 | Previous | — | Financial Accuracy & KPI Integrity v1 |
| 15 | Previous | — | Multi-Bank Cheques Foundation v1 |

### Retention decision

`PROJECT_STATE.md`'s own policy says: *"archive the oldest entries down to the most recent ~10"*, with the
trigger at *"~15 dated release entries"*. This rotation retained **15** — the conservative end of that
approximate range — so the live file still reaches back to *Production Release 2026.5.7* without a lookup, and
so the whole current cheque-calibration/multi-bank sequence stays together. Tightening to 10 at a later
rotation is non-destructive and needs no re-archiving.

---

## 4. Archived (172 sections, 4 files)

Split at the natural month boundary (August in one file), with July subdivided into three because it alone
holds 121 entries. Ordering is preserved exactly as it stood in the live file: **newest first**, both across
files and inside each file.

| # | Archive file | Range (newest → oldest) | Entries | Bytes |
|---:|---|---|---:|---:|
| 1 | `PROJECT_STATE_ARCHIVE_2026-08-01_to_2026-08-19.md` | 2026-08-19 → 2026-08-01 | 51 | 356,885 |
| 2 | `PROJECT_STATE_ARCHIVE_2026-07-26_to_2026-07-31.md` | 2026-07-31 → 2026-07-26 | 41 | 216,172 |
| 3 | `PROJECT_STATE_ARCHIVE_2026-07-18_to_2026-07-26.md` | 2026-07-26 → 2026-07-18 | 41 | 164,233 |
| 4 | `PROJECT_STATE_ARCHIVE_2026-07-11_to_2026-07-18.md` | 2026-07-18 → 2026-07-11 | 39 | 201,845 |
| | **Total** | **2026-08-19 → 2026-07-11** | **172** | **939,135** |

Adjacent files may share a boundary date because several releases shipped on the same day; ranges are
inclusive and the entry sequence is contiguous with no gap and no overlap.

### Boundaries of each file

| File | First entry | Last entry |
|---|---|---|
| 1 | Previous Release — Production Release 2026.5.6 | Previous Release — Dark Mode Color Consistency Pack v1 |
| 2 | Previous Release — Project-Wide i18n Placeholder Integrity Pack v1 | Previous Release — Cheque Management Visual Polish Pack v1 |
| 3 | Previous Release — Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1 | Previous Release — Employment Contract Workspace Integration & UX Refresh Pack v1 |
| 4 | Previous Release — Enterprise Data Grid Foundation v1 | **Latest Release** — Historical Salary Transfer Register Integration v1 |

---

## 5. Content-integrity verification (automated, not visual)

Each release section was hashed with SHA-256 **before** the move (as extracted from the live file) and
**after** (as re-parsed out of the live file and the archive files). The comparison is over the full section
text — heading, tables, prose, code blocks and trailing separator.

| Check | Result |
|---|---|
| Region reconstruction is byte-identical before splitting | ✅ PASS |
| Every original section found afterwards (no lost release) | ✅ PASS — 0 missing |
| No section present afterwards that was not in the original (no rewritten/injected content) | ✅ PASS — 0 extra |
| Multiset of section hashes identical before and after | ✅ PASS |
| No duplicate section by hash (no double-write) | ✅ PASS — 0 duplicates |
| No duplicate section by title | ✅ PASS |
| Every section starts with a `## ` heading (no orphan fragment) | ✅ PASS |
| No section swallowed a following heading (no merged sections) | ✅ PASS |
| Code fences balanced in live file and all 4 archives | ✅ PASS |
| No malformed headings (`#` without a space) | ✅ PASS |
| BOM preserved | ✅ PASS |
| CRLF preserved, uniform, zero bare LF | ✅ PASS |

**Truncation:** structurally impossible in this rotation — sections were cut only at `## ` heading boundaries
and moved whole, and the hash comparison above would fail on any partial move.

---

## 6. Current-state verification

The live file's non-release-log reference sections were left in place untouched, as the policy requires. All
17 are present after rotation:

`Rotation & Archive Policy` · `Current Production Baseline` · `Completed Features` · `Module Inventory` ·
`Print Engine` · `Electron IPC Registry` · `Dashboard` · `Reports` · `Testing Summary` · `Architecture` ·
`Security` · `Seed Data State` · `Feature Status Snapshot` · `Future Roadmap` · `Deferred Accounting Notes` ·
`Validation Checklist (Before Every Commit)` · `Release History`

Facts checked against the repository itself (not against the document):

| Fact | Repository | Document | Status |
|---|---|---|---|
| Desktop version | `package.json` = `2026.5.9` | `2026.5.9` | ✅ agrees |
| Prisma migrations | 71 folders in `backend/prisma/migrations/` | "migrations stay at 71" | ✅ agrees |
| Prisma models | 87 `model` blocks in `schema.prisma` | 87 | ✅ agrees |
| Complete User Manual v1 | merged `57e2c8a1`, tag `stable-complete-user-manual-v1` | present as `## Latest Release`, RELEASED | ✅ agrees |

---

## 7. Reference and link integrity

| Check | Result |
|---|---|
| Anchor links into `PROJECT_STATE.md` headings (`PROJECT_STATE.md#…`, `#previous-release`, `#latest-release`) anywhere in the repo | **none exist** — nothing could break |
| Scripts or source code reading `PROJECT_STATE.md` | **none** — no functional dependency |
| Prose references in `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `docs/development-workflow.md` | still valid — they instruct "update `PROJECT_STATE.md`", and the file still exists at the same path |
| Archive index links | all 4 verified to resolve to existing files |
| `PROJECT_MASTER_STATUS.md` `### Latest/Previous Release` headings | **its own** release log, a separate document — not links into `PROJECT_STATE.md`, unaffected |

---

## 8. Findings — recorded, not acted on

| # | Finding | Why not fixed here |
|---|---|---|
| 1 | **Two entries still carry a `## Latest Release —` heading** — *Global Date Input Standardization Audit & Completion v1* and *Historical Salary Transfer Register Integration v1*. They are the two oldest entries in the log; a past release added a new `## Latest Release` above them without demoting them to `## Previous Release`. Both are now in archive file 4, **preserved verbatim with their original heading**. | Renaming them would rewrite historical text, which this package forbids. They are flagged in the archive file's own header and here. Demoting them is a one-line editorial change a future pass can make deliberately. |
| 2 | **`## Completed Features` is 315,536 bytes — 54 % of the remaining live file.** It is the single largest growth driver left, and the rotation policy explicitly protects it ("never archived"). | Out of scope: the policy names it as an always-current reference section. If the live file needs to shrink further, this section needs its own retention rule — a Product Owner decision, not a rotation mechanic. |
| 3 | **`## Current Production Baseline` → "Production HEAD" is stale.** It reads `95f67a9c` / `stable-production-release-2026.5.5`, while actual production HEAD is `f37c9c7f` and the last two releases are Production Release 2026.5.9 and Complete User Manual v1. | The instruction for this package is to fix only what is 100 % mechanically provable. The correct HEAD is provable, but that table cell is a long narrative describing the 2026.5.5 release — updating it means composing new content, i.e. an editorial decision. Recorded for a dedicated pass. |
| 4 | **`PROJECT_MASTER_STATUS.md` was not refreshed.** The rotation policy's step 5 asks for its "Current Production State" and "Repository Status" tables to be regenerated at rotation time. It is 224,750 bytes, last refreshed 2026-08-20, and does not know about 2026.5.7/5.8/5.9 or the User Manual. | Explicitly outside this package's stated scope. Regenerating it requires re-deriving repository statistics and rewriting narrative — a separate maintenance task. |
| 5 | **`PROJECT_MASTER_STATUS.md` maintains a parallel release log** (`### Latest Release` / `### Previous Release`, ~2,504 lines) that duplicates much of `PROJECT_STATE.md`'s history in a different format. | Deduplicating two independently-maintained histories is a design decision, not a rotation step. |

---

## 9. Confirmation

- ✅ **No information lost** — every one of the 188 original release sections is either in the live file or in
  the archive, proven by SHA-256 set equality.
- ✅ **Nothing rewritten** — archived content is byte-identical to the original; only per-file headers were added.
- ✅ **Documentation-only change** — no `backend/`, `frontend/`, `electron/`, `scripts/`, Prisma, migration,
  `package.json`, Golden DB, installer or user-manual change.
- ✅ **Desktop version unchanged** at `2026.5.9`; no build run.
- ✅ **`docs/user-manual/` untouched** — the released Complete User Manual v1 package was not modified.
