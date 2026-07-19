# Employee Entitlements Domain

**Status:** Foundation (architecture only — no functional/legal-calculation change).
Introduced by the **Employee Entitlements Intelligence Suite v1 (Foundation)** package.

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
  holidays/     Fixed Kuwait holiday definitions, Hijri holiday type architecture,
                the "Generate Year" plan/apply workflow.
  engines/      HolidayEngine — holiday/working-day detection, exclusion, counting.
  services/     HolidayService, WorkingDaysService, HijriHolidayService.
  calculators/  Re-export surface over the existing legal calculator
                (modules/employees/entitlements.calc.ts) — first step of a
                progressive move; the original file remains the single source of
                truth and was not relocated in this package.
  timeline/     buildEntitlementTimeline — server-side equivalent of the frontend's
                timeline builder, for future API use.
```

## What this package deliberately did NOT do

- Did **not** move `entitlements.calc.ts` or `employees.service.ts` — too high-risk
  for a "no functional change" package; only a re-export surface was added.
- Did **not** add any new Prisma model, column, or migration.
- Did **not** add or change any Express route/API contract. Nothing in this domain
  is wired to an HTTP endpoint yet — it is callable, unit-tested library code only.
- Did **not** implement real Hijri↔Gregorian date conversion. `HijriHolidayService`
  is a documented architectural stub returning `[]` until a real Al-Ojairi/Umm
  al-Qura data source is available — no future dates were hardcoded or guessed.
- Did **not** change any existing calculation, permission, or legal behavior.
