# Employee Entitlements Domain

**Status:** Foundation + Holiday Intelligence + Al-Ojairi Integration. Introduced
by the **Employee Entitlements Intelligence Suite v1 (Foundation)** package;
extended by the **Kuwait Holiday Intelligence Pack v1** package (holiday
generation, providers, conflict detection, year comparison — wired to two new
additive `/api/holidays/generate/*` routes); completed by the **Al-Ojairi
Integration Pack v1** package (real, offline, deterministic Hijri↔Gregorian
conversion — see "Hijri holiday generation" below). No legal-calculation change
in any of the three packages.

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
- Historical Entitlements data (`Leave`, `EmployeeEntitlementLedger`)

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
                          generateForYear() returns a HolidayProviderResult
                          (`{ candidates, warnings }`), never throws for expected
                          conditions (unsupported year, etc.) — see "Hijri holiday
                          generation" below. DEFAULT_HOLIDAY_PROVIDERS is the list
                          HolidayEngine.generateCandidates consumes; add a future
                          source by adding one array entry, nothing else.
    fixedKuwaitHolidays.ts   The 3 fixed Kuwait Gregorian holidays.
    hijriHolidayTypes.ts     Hijri holiday definition shape + known holiday names.
    hijriCalendarConversion.ts  Real, offline, deterministic Hijri↔Gregorian date
                              conversion (Kuwaiti/tabular algorithm) + the
                              supported-year range. No network calls, ever.
    kuwaitHijriHolidayDefinitions.ts  The 5 Kuwait Hijri holiday definitions
                              (fixed Hijri month/day + duration — calendar facts,
                              not future dates) + the occurrence-finder that maps a
                              definition onto a target Gregorian year.
    holidayCandidate.ts      Shared HolidayCandidate shape used by every provider.
    classifyHoliday.ts       Derives origin/status for an already-stored Holiday row
                              at read time — no schema change. Prefers an explicit
                              `[ORIGIN:STATUS]` tag in `notes` (written by
                              HolidayGenerationExecutor for every generated row) so
                              a generated Hijri holiday still reads back as
                              EXPECTED_ALOJAIRI later; falls back to the original
                              date-based heuristic when no tag is present (manual
                              pre-Pack-v1 rows).
    holidayYearComparison.ts THE single comparison/conflict-detection algorithm
                              (Part 5 + Part 4) — compareHolidayYear() classifies every
                              candidate as NEW / EXISTING / CHANGED / SKIPPED /
                              CONFLICT, including duplicate-date/duplicate-name
                              detection within one generation batch. Nothing else
                              re-implements this logic.
    generateHolidaysWorkflow.ts  @deprecated thin compatibility shim over the
                              services below — kept only because this environment's
                              delete tooling was unavailable; delegates, does not
                              duplicate logic.
  engines/      HolidayEngine — holiday/working-day detection, exclusion, counting
                for LEAVE CALCULATIONS (unchanged). Since Al-Ojairi Integration Pack
                v1, it is also the **only** consumer of holiday providers in the
                system (`HolidayEngine.generateCandidates(year, providers?)`) — a
                purely additive static method; the leave-calculation instance
                methods below it are untouched. Still does not know about holiday
                *names* beyond what a candidate carries — record management stays
                owned by HolidayService/the generation services below.
  services/
    HolidayService.ts             Reads Holiday rows as the public Holiday model
                                   (with derived origin/status). The only place that
                                   queries the Holiday table for "what exists".
    WorkingDaysService.ts         Thin working-day wrapper over HolidayEngine.
    HijriHolidayService.ts        Real Hijri/Al-Ojairi generation (see below) —
                                   isolates hijriCalendarConversion.ts +
                                   kuwaitHijriHolidayDefinitions.ts behind the
                                   standard provider interface.
    HolidayValidationService.ts   Structural candidate validation (Part 6).
    HolidayConflictService.ts     Extracts CHANGED/CONFLICT entries from a comparison
                                   result — a view, not a second detection algorithm.
    HolidayGenerationPlanner.ts   Orchestrates providers + HolidayService +
                                   validation + comparison into one read-only preview
                                   (Part 1 "preview before applying" + Part 6).
    HolidayGenerationExecutor.ts  Re-plans server-side, then creates only the NEW
                                   bucket. Never updates/deletes. Idempotent —
                                   "safe regeneration" (Part 1).
  entitlements.service.ts  THE entitlement domain service (Employee Entitlements
                Core & Statement Pack v1) — builds the single statement read model
                and owns entitlement payment recording/validation. Every entitlement
                figure the API serves passes through here.
  entitlements.schema.ts   Zod schemas for the statement `asOf` query and payment
                recording. The user only ever supplies amount + date (+ optional
                method/reference/note) — never a calculated value.
  timeline/     buildEntitlementTimeline — server-side equivalent of the frontend's
                timeline builder, for future API use.
```

## Entitlement core (Employee Entitlements Core & Statement Pack v1)

One calculation engine, one read model, one payment history — no second source of
entitlement truth anywhere:

- **Canonical engine:** `modules/employees/entitlements.calc.ts` (pure, unchanged
  location). The `calculators/` re-export shim was **removed** — it had zero
  consumers and only created a second import surface over the same engine.
- **Statement read model:** `GET /api/employees/:id/entitlements[?asOf=YYYY-MM-DD]`
  returns everything the UI needs (`result`, `wageBase`, `balances`, `payments`,
  `estimatedEndOfService`). The frontend never recombines endpoints to reconstruct
  entitlement truth, and holds no entitlement formula.
- **Payment history:** `EmployeeEntitlementLedger` (existing model, no migration).
  `GET`/`POST /api/employees/:id/entitlement-payments`. Every "paid" figure is a
  `SUM` over real movements; nothing mutable is stored.
- **Remaining balance:** always derived (`entitlement − paid`), never stored,
  never editable.

Approved business rules (project decisions, not re-derived here):

| Rule | Value |
|---|---|
| Entitlement wage source | `Employee.salary` **only** — no allowances, no payroll snapshots |
| Annual leave rate | 30 days per year of service |
| Leave eligibility gate | 6 completed months (replaced the previous 9-month gate) |
| `asOf` | Explicit and validated; defaults to today |
| End-of-service while active | Estimate only — excluded from payable totals and not disbursable |
| Overpayment | Rejected outright, never silently clamped |

Module boundary: recording a payment writes to the entitlement ledger and the audit
log **only**. No journal entry, no GL liability, no payroll effect, no
`SalaryPayment`, no bank export, and no leave record is created, consumed, or
modified — a cash payment is never converted into leave days.

## Holiday generation API (Kuwait Holiday Intelligence Pack v1)

Two new, purely additive routes on the existing `/api/holidays` router (the 3
original routes — `GET /`, `POST /`, `DELETE /:id` — are unchanged):

- `POST /api/holidays/generate/preview` (`employees.read`) — `{ year }` → the full
  `HolidayGenerationPlan` (comparison + conflicts + invalid candidates + provider
  `warnings`, additive field since Al-Ojairi Integration Pack v1). **No write.**
- `POST /api/holidays/generate/apply` (`employees.update`) — `{ year }` → creates
  only the `NEW`-category rows, returns a `HolidayGenerationReport`. The frontend
  only calls this after the user explicitly confirms the preview.

`GET /api/holidays` now also returns derived `origin`/`status` per row (additive
response fields, same underlying Prisma columns — no schema change).

## Hijri holiday generation (Al-Ojairi Integration Pack v1)

This package completed the Hijri generation pipeline that Kuwait Holiday
Intelligence Pack v1 left as an architecture-only stub (`HijriHolidayService`
previously always returned `[]`).

### Data source

The app is **offline-only** (see repo-root `CLAUDE.md`), so no live calendar API
is used. The data source is a real, deterministic, publicly-documented arithmetic
algorithm — the **tabular/civil Islamic calendar**, commonly called the "Kuwaiti
algorithm" (`holidays/hijriCalendarConversion.ts`): a fixed epoch (Julian Day
1948440, matching the well-known civil-calendar correspondence 1 Muharram 1 AH =
19 July 622 CE) plus the standard 11-leap-years-per-30-year cycle, composed with
the standard Fliegel & Van Flandern Julian-Day↔Gregorian conversion. This is the
same *class* of calculation Kuwait's Al-Ojairi almanac itself performs — an
astronomical/arithmetic **prediction** of a lunar month's start ahead of the
official moon-sighting announcement — which is exactly why every holiday it
produces carries `status: EXPECTED_ALOJAIRI`, never `OFFICIAL` (Part 3): it is a
calculated estimate that may differ by a day from the eventual official
announcement, by design, the same way the real Al-Ojairi calendar can. No future
Gregorian date is ever hardcoded — only fixed Hijri month/day facts
(`kuwaitHijriHolidayDefinitions.ts`) are constants; every Gregorian date is
computed on demand.

### Supported years

`SUPPORTED_HIJRI_GENERATION_YEARS` in `hijriCalendarConversion.ts` — Gregorian
2020–2050. The algorithm is mathematically valid far outside this window, but
generation is scoped to a practical HR-planning horizon; a request outside it
returns zero Hijri candidates plus a `UNSUPPORTED_YEAR` warning (fixed Gregorian
holidays are unaffected). Widen the range by editing that one constant.

### Provider architecture

`HolidaySourceProvider.generateForYear(year)` returns a `HolidayProviderResult`
(`{ candidates, warnings }`) and must never throw for an expected condition —
warnings (`UNSUPPORTED_YEAR` / `PROVIDER_FAILURE` / `INVALID_DATA`) communicate
that instead, so generation always "fails safely" (Part 5). `HolidayEngine.
generateCandidates(year, providers?)` is the **only** place in the system that
calls `provider.generateForYear` (Part 7) — it also wraps each provider call in
its own try/catch, so an unexpected exception from any one provider becomes a
`PROVIDER_FAILURE` warning instead of aborting generation for the others.
`HolidayGenerationPlanner` consumes `HolidayEngine.generateCandidates` exclusively
and threads `warnings` straight into the preview response for the UI to render.

### Extension points

A future holiday source (a different country's calendar, a company-specific
calendar) needs only: (1) a class implementing `HolidaySourceProvider`, (2) one
new entry in `DEFAULT_HOLIDAY_PROVIDERS` (`holidays/providers/index.ts`). No
change to `HolidayEngine`, `HolidayGenerationPlanner`, `HolidayGenerationExecutor`,
`compareHolidayYear`, or the frontend dialog is required — the dialog renders
`origin`/provider labels and `warnings` generically from whatever the plan
contains.

## What this package deliberately did NOT do

- Did **not** move `entitlements.calc.ts` — it remains the canonical engine at its
  original path. (Entitlements Core & Statement Pack v1 later removed the
  `calculators/` re-export shim and moved the *service* layer here instead.)
- Did **not** add any new Prisma model, column, or migration — Hijri status
  persistence (Part 3) reuses the existing `notes` text column via a parsed
  `[ORIGIN:STATUS]` tag (see `classifyHoliday.ts` above), not a new column.
- Did **not** change any of the 3 pre-existing `/api/holidays` route contracts —
  only 2 new routes were added, and `GET /` only gained additive response fields.
- Did **not** build a "confirm as Official" workflow for a generated Hijri
  holiday — Part 3 only requires that generation itself never assigns `OFFICIAL`
  automatically, which is guaranteed by construction
  (`HijriHolidayService` always emits `EXPECTED_ALOJAIRI`). Promoting a specific
  holiday to `OFFICIAL` after a real government announcement remains a manual
  edit via the existing `/api/holidays` add/delete flow, unchanged from Kuwait
  Holiday Intelligence Pack v1.
- Did **not** auto-apply `CHANGED`/`CONFLICT` entries — those always require a
  human decision via the existing manual add/delete flow.
- Did **not** change any existing calculation, permission, or legal behavior.
