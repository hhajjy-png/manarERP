# docs/history/ — PROJECT_STATE.md Rotation Archive

This directory holds archived release-log entries rotated out of `PROJECT_STATE.md` (repo root) per its
"Rotation & Archive Policy" section, introduced 2026-07-17 as part of the Cleanup & Architecture Remediation
Pack v1.

**Purpose:** `PROJECT_STATE.md` is a live, append-only document read at the start of every session. Without a
rotation mechanism it grows unbounded forever, degrading both human skimming and LLM session-start context
budget. This directory is where its oldest entries go once the live file crosses the rotation trigger, so the
live file stays a bounded, recent-first working document while nothing is lost.

**Not the same as `docs/PROJECT_HISTORY_FULL.md`** — that file is a separate, already-existing full historical
reconstruction of the project. This directory is specifically the destination for `PROJECT_STATE.md`'s own
rotated-out release entries, moved verbatim, one dated batch file per rotation event.

---

## Where to look for what

| I want… | Go to |
|---|---|
| The **current** state of the project (production baseline, architecture, module inventory, print engine, payroll rules, roadmap) | `PROJECT_STATE.md` (repo root) — the live file |
| The **most recent** releases (current release + the 15 before it) | `PROJECT_STATE.md` → `## Latest Release` / `## Previous Release` sections |
| An **older** release entry (before 2026-08-19) | The archive files in this directory — see the index below |
| A **full narrative** history of the project | `docs/PROJECT_HISTORY_FULL.md` (separate document, different purpose) |

---

## Two archives live here

| Archive | What it holds | Index |
|---|---|---|
| **Release log** (`PROJECT_STATE_ARCHIVE_*.md`, this directory) | Rotated `## Previous Release` entries — *what shipped, when* | the table below |
| **Completed features** (`completed-features/`) | Rotated `## Completed Features` entries — *what a capability does* | [`completed-features/README.md`](completed-features/README.md) |

The two are complementary: a release-log entry describes a **release**, a completed-feature entry describes a
**capability**. 28 features appear in both, from different angles.

> **Completed Features Compaction & Archive v1 (2026-09-08):** `PROJECT_STATE.md`'s `## Completed Features`
> section (315,536 bytes, 126 entries) was replaced by a current-only
> `## Completed Features — Active Reference` (16,027 bytes), and its 126 detailed entries were moved verbatim
> into [`completed-features/`](completed-features/README.md) across 4 domain files. Accounting and
> verification: [`completed-features/COMPACTION_MANIFEST_V1.md`](completed-features/COMPACTION_MANIFEST_V1.md).

---

## Index

| Archive file | Date range covered (newest → oldest) | Entries | Rotated on | Notes |
|---|---|---|---|---|
| [`PROJECT_STATE_ARCHIVE_2026-08-01_to_2026-08-19.md`](PROJECT_STATE_ARCHIVE_2026-08-01_to_2026-08-19.md) | 2026-08-19 → 2026-08-01 | 51 | 2026-09-08 | Starts at *Production Release 2026.5.6*, ends at *Dark Mode Color Consistency Pack v1*. Includes 4 entries with no explicit date field. |
| [`PROJECT_STATE_ARCHIVE_2026-07-26_to_2026-07-31.md`](PROJECT_STATE_ARCHIVE_2026-07-26_to_2026-07-31.md) | 2026-07-31 → 2026-07-26 | 41 | 2026-09-08 | Starts at *Project-Wide i18n Placeholder Integrity Pack v1*, ends at *Cheque Management Visual Polish Pack v1*. |
| [`PROJECT_STATE_ARCHIVE_2026-07-18_to_2026-07-26.md`](PROJECT_STATE_ARCHIVE_2026-07-18_to_2026-07-26.md) | 2026-07-26 → 2026-07-18 | 41 | 2026-09-08 | Starts at *Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1*, ends at *Employment Contract Workspace Integration & UX Refresh Pack v1*. |
| [`PROJECT_STATE_ARCHIVE_2026-07-11_to_2026-07-18.md`](PROJECT_STATE_ARCHIVE_2026-07-11_to_2026-07-18.md) | 2026-07-18 → 2026-07-11 | 39 | 2026-09-08 | Oldest batch. Starts at *Enterprise Data Grid Foundation v1*, ends at *Historical Salary Transfer Register Integration v1*. Contains the two entries that still carry a `## Latest Release —` heading (see manifest). |
| [`PROJECT_STATE_ARCHIVE_2026-08-19_to_2026-08-28.md`](PROJECT_STATE_ARCHIVE_2026-08-19_to_2026-08-28.md) | 2026-08-19 → 2026-08-28 | 8 | 2026-09-10، أثناء إصدار **Employee Debt Acknowledgment Administrative Form v1** — تجاوز سجلّ الإصدارات 19 مدخلًا فتجاوز عتبة الـ~15، فبقي الإصدار الحالي وأحدث 10 مدخلات |

**Total archived: 172 release entries** across 4 files (939,135 bytes).
Full accounting, invariants and verification results: [`ROTATION_MANIFEST_V1.md`](ROTATION_MANIFEST_V1.md).

---

## How to find an old release

The archive preserves the live file's own ordering — **newest first** — both across files (the index above is
newest-first) and inside each file.

1. **If you know roughly when it shipped:** pick the archive file whose date range contains it.
2. **If you only know its name:** grep across the archive, e.g.
   `grep -rn "Cheque Calibration" docs/history/`
3. **If you only know a tag or commit hash:** the entries carry them verbatim, so grep works the same way, e.g.
   `grep -rn "stable-xbrl-readiness-foundation-v1" docs/history/`
4. **Nothing was reworded**, so any phrase you remember from the live file is still searchable verbatim.

---

## What was preserved

Every archived entry was **moved, not rewritten**. Headings, tables, code blocks, hashes, tags, migration
counts, validation results, Product Owner approvals and known-issue notes are byte-identical to the live file
before rotation — verified per-entry by SHA-256 (see the manifest). Nothing was summarised, reformatted,
truncated or dropped.

---

## Process

See `PROJECT_STATE.md`'s "Rotation & Archive Policy" section for the full trigger condition and steps. In
short: when the live file's release-log section exceeds ~15 entries, move the oldest into a new
`PROJECT_STATE_ARCHIVE_<oldest-date>_to_<newest-date>.md` file here, verbatim, and add a row to the index
table above.

**Note on retention:** the policy's wording is "archive the oldest entries down to the most recent ~10". The
2026-09-08 rotation retained the current release plus the **15** most recent `## Previous Release` entries —
the more conservative end of that range, chosen so the live file still covers the whole span back to
*Production Release 2026.5.7* without a lookup, and recorded that tightening to 10 at a future rotation would
be a normal, non-destructive follow-up.

**That follow-up happened on 2026-09-10**, during the Employee Debt Acknowledgment Administrative Form v1
release: the log had grown to 19 entries, and the rotation retained the current release plus the **10** most
recent `## Previous Release` entries, which is the figure the policy actually names. The live file now reaches
back to *Remove Employee Vehicle License Expiry v1* (2026-08-28); everything older is here.
