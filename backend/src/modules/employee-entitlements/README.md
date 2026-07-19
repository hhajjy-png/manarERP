# Employee Entitlements Domain

**Status:** Foundation + Holiday Intelligence. Introduced by the **Employee
Entitlements Intelligence Suite v1 (Foundation)** package; extended by the
**Kuwait Holiday Intelligence Pack v1** package (holiday generation, providers,
conflict detection, year comparison — wired to two new additive
`/api/holidays/generate/*` routes; no legal-calculation change in either package).

## Purpose

Employee Entitlements is an independent domain. It owns leave/holiday/entitlement
presentation and planning logic that does not belong to any specific accounting or
operational workflow.

## Allowed dependencies

- Employee data (`modules/employees`)
- HR Settings
- Official Holidays (`modules/holidays`, the existing `Holiday` Prisma model)
- Hijri (Al-Ojairi) holiday architecture (this domain, `holidays/` + `services/HijriHolidayService.ts`)
- Calendar services (this domain, `services/`)
- Historical Entitlements data (`Leave`, `LeaveSettlement`, `EmployeeEntitlementLedger`)

## Forbidden dependencies

This domain must **never** import from: Accounting, Journal Entries/Transactions,
Projects, Contracts, Inventory, Equipment, Banks, Cash, Invoices, Purchases, Sales.

As of this package, the existing `modules/employees` code (which this domain wraps)
was audited and has **zero** imports from any forbidden module — only shared
framework infrastructure (`core/*`, `config/database`, `shared/repositories`).

## Folder layout

```
employee-entitlements/
  models/       Public interfaces (EmployeeProfile, Holiday, LeavePeriod, LeaveAdvance,
                Settlement, EntitlementSummary, TimelineEvent) — clean domain-boundary
                types independent of raw Prisma shapes where practical.
  holidays/
    providers/           HolidaySourceProvider interface + FixedHolidayProvider +
                          HijriHolidayProvider — pluggable holiday candidate sources.
                          DEFAULT_HOLIDAY_PROVIDERS is the list the planner consumes;
                          add a future source by adding one array entry, nothing else.
    fixedKuwaitHolidays.ts   The 3 fixed Kuwait Gregorian holidays.
    hijriHolidayTypes.ts     Hijri holiday definition shape + known holiday names.
    holidayCandidate.ts      Shared HolidayCandidate shape used by every provider.
    classifyHoliday.ts       Derives origin/status for an already-stored Holiday row
                              at read time (date-based heuristic) — no schema change.
    holidayYearComparison.ts THE single comparison/conflict-detection algorithm
                              (Part 5 + Part 4) — compareHolidayYear() classifies every
                              candidate as NEW / EXISTING / CHANGED / SKIPPED /
                              CONFLICT. Nothing else re-implements this logic.
    generateHolidaysWorkflow.ts  @deprecated thin compatibility shim over the
                              services below — kept only because this environment's
                              delete tooling was unavailable; delegates, does not
                              duplicate logic.
  engines/      HolidayEngine — holiday/working-day detection, exclusion, counting
                for LEAVE CALCULATIONS. Deliberately does not know about holiday
                *names* or generation — that is a different concern owned by
                HolidayService/the generation services below.
  services/
    HolidayService.ts             Reads Holiday rows as the public Holiday model
                                   (with derived origin/status). The only place that
                                   queries the Holiday table for "what exists".
    WorkingDaysService.ts         Thin working-day wrapper over HolidayEngine.
    HijriHolidayService.ts        Architecture-only Hijri/Al-Ojairi stub (see below).
    HolidayValidationService.ts   Structural candidate validation (Part 6).
    HolidayConflictService.ts     Extracts CHANGED/CONFLICT entries from a comparison
                                   result — a view, not a second detection algorithm.
    HolidayGenerationPlanner.ts   Orchestrates providers + HolidayService +
                                   validation + comparison into one read-only preview
                                   (Part 1 "preview before applying" + Part 6).
    HolidayGenerationExecutor.ts  Re-plans server-side, then creates only the NEW
                                   bucket. Never updates/deletes. Idempotent —
                                   "safe regeneration" (Part 1).
  calculators/  Re-export surface over the existing legal calculator
                (modules/employees/entitlements.calc.ts) — first step of a
                progressive move; the original file remains the single source of
                truth and was not relocated in this package.
  timeline/     buildEntitlementTimeline — server-side equivalent of the frontend's
                timeline builder, for future API use.
```

## Holiday generation API (Kuwait Holiday Intelligence Pack v1)

Two new, purely additive routes on the existing `/api/holidays` router (the 3
original routes — `GET /`, `POST /`, `DELETE /:id` — are unchanged):

- `POST /api/holidays/generate/preview` (`employees.read`) — `{ year }` → the full
  `HolidayGenerationPlan` (comparison + conflicts + invalid candidates). **No write.**
- `POST /api/holidays/generate/apply` (`employees.update`) — `{ year }` → creates
  only the `NEW`-category rows, returns a `HolidayGenerationReport`. The frontend
  only calls this after the user explicitly confirms the preview.

`GET /api/holidays` now also returns derived `origin`/`status` per row (additive
response fields, same underlying Prisma columns — no schema change).

## What this package deliberately did NOT do

- Did **not** move `entitlements.calc.ts` or `employees.service.ts` — too high-risk
  for a "no functional change" package; only a re-export surface was added.
- Did **not** add any new Prisma model, column, or migration.
- Did **not** change any of the 3 pre-existing `/api/holidays` route contracts —
  only 2 new routes were added, and `GET /` only gained additive response fields.
- Did **not** implement real Hijri↔Gregorian date conversion. `HijriHolidayService`
  is a documented architectural stub returning `[]` until a real Al-Ojairi/Umm
  al-Qura data source is available — no future dates were hardcoded or guessed.
  `HijriHolidayProvider` isolates this behind the standard provider interface so a
  future real implementation requires no change anywhere else.
- Did **not** auto-apply `CHANGED`/`CONFLICT` entries — those always require a
  human decision via the existing manual add/delete flow.
- Did **not** change any existing calculation, permission, or legal behavior.
