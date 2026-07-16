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

## Index

*(empty — no rotation has occurred yet as of 2026-07-17; the first entry will be added here the next time
`PROJECT_STATE.md` crosses its rotation trigger)*

| Archive file | Date range covered | Rotated on |
|---|---|---|

## Process

See `PROJECT_STATE.md`'s "Rotation & Archive Policy" section for the full trigger condition and steps. In
short: when the live file's release-log section exceeds ~15 entries, move the oldest down to ~10 remaining
into a new `PROJECT_STATE_ARCHIVE_<oldest-date>_to_<newest-date>.md` file here, verbatim, and add a row to the
index table above.
