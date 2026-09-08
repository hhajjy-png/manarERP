# docs/history/completed-features/ — Completed Features Archive

This directory holds the detailed feature entries rotated out of `PROJECT_STATE.md`'s `## Completed Features`
section on **2026-09-08**, as part of *Completed Features Documentation Compaction & Archive v1*.

---

## Why this exists

`## Completed Features` had grown into a flat 126-row table of **315,536 bytes** — about **54 %** of
`PROJECT_STATE.md` after the release-log rotation. It mixed three different things in one place:

- what the system does **today**,
- how a feature was **originally implemented**, and
- designs that had since been **superseded** by later work.

That mixture is actively dangerous for a session-start document: an AI assistant or a developer skimming it
could implement against a design that no longer exists.

The split is therefore by **purpose**, not by age:

| | Where | Contains |
|---|---|---|
| **Active** | `PROJECT_STATE.md` → `## Completed Features — Active Reference` | Current behaviour only, grouped by domain, ~16 KB |
| **Archive** | this directory | All 126 original entries, **verbatim**, including superseded designs |

---

## The reading rule

> **If the active reference and an archived entry disagree, the active reference wins.**

This archive deliberately preserves superseded behaviour so the historical record stays complete. Never
implement against an archived entry without checking the active reference — and the code — first. Entries
whose design was later replaced are marked **Class E** with an explicit *Superseded by* pointer in each
file's index table.

---

## Files

| File | Domain | Entries | Bytes |
|---|---|---:|---:|
| [`hr-payroll-employees.md`](hr-payroll-employees.md) | Employees · payroll · payroll bank import · employment contract | 10 | 29,784 |
| [`finance-invoicing-banking.md`](finance-invoicing-banking.md) | Invoices · expenses · accounting/GL · financial & statement centres · banking · bank-statement import · Bank Account Explorer | 31 | 105,568 |
| [`cheques-printing-documents.md`](cheques-printing-documents.md) | Cheque printing · Print Designer / Template Studio · print profiles · vouchers · HR forms · PDF export | 32 | 65,879 |
| [`platform-ui-operations.md`](platform-ui-operations.md) | ExplorerKit & unified design system · dashboards & executive centres · AI assistant · integrations · data import · backup · RBAC · auth · core modules | 53 | 138,414 |
| | **Total** | **126** | **339,645** |

Archive files are larger than the 315,536 bytes they came from because each carries an added index table and
header — the historical rows themselves are byte-identical.

Full accounting, invariants and verification results: [`COMPACTION_MANIFEST_V1.md`](COMPACTION_MANIFEST_V1.md).

---

## Classification policy

Every archived entry carries a class in its file's index table. Classes are assigned by **current relevance**,
never by age alone.

| Class | Meaning | Count |
|---|---|---:|
| **A** | Current core feature — still a direct, important part of the system | 9 |
| **B** | Current architecture / rule — became a standing rule, not just a release | 7 |
| **C** | Recent implementation history — useful for understanding recent changes and troubleshooting | 29 |
| **D** | Historical completed feature — correct, but its detail is no longer needed day to day | 22 |
| **E** | Superseded historical feature — replaced or evolved later; record kept, behaviour no longer current | 31 |
| **F** | Documented in detail elsewhere — the release log or `docs/history/` carries the fuller record | 28 |
| | **Total** | **126** |

**Nothing was deleted.** Classes D, E and F are archived exactly like A, B and C — the class only decides how
prominently the feature is represented in the active reference.

---

## How to find an old feature

1. **By domain** — pick the file above; entries are grouped by the area they belong to.
2. **By name** — every file opens with an index table listing every feature it contains.
3. **By tag or hash** — entries are verbatim, so tags and commit hashes are searchable:
   `grep -rn "stable-print-designer-phase-6" docs/history/completed-features/`
4. **By anything you remember** — nothing was reworded, so any phrase from the old section is still findable:
   `grep -rn "WYSIWYG" docs/history/completed-features/`
5. **Superseded work** — check the *Superseded by* column in the index table to jump straight to what replaced it.

---

## Relationship to the rest of `docs/history/`

- `docs/history/PROJECT_STATE_ARCHIVE_*.md` — rotated **release-log** entries (`## Previous Release` sections).
- `docs/history/completed-features/` — rotated **feature** entries (this directory).
- `docs/PROJECT_HISTORY_FULL.md` — a separate, pre-existing full historical reconstruction.

The two archives are complementary: a release-log entry describes *a release*, a completed-feature entry
describes *a capability*. 28 features (Class F) appear in both, from different angles.
