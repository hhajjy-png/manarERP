-- Employee Compensation — Configurable Company Overtime Rate Pack v1. ADDITIVE ONLY.
--
-- Seven nullable columns on two tables that belong to this module alone. SQLite
-- performs each of these as a pure metadata `ALTER TABLE ADD COLUMN`: no table
-- rebuild, no data copy, no index change, no constraint change. Every existing row
-- keeps NULL on every new column.
--
-- ═══ NULL is the point, not an oversight ═══
-- A calculation saved before this pack has no company overtime policy — it was
-- computed from the statutory minimum alone. NULL records exactly that fact. The
-- engine reads NULL as "statutory floor only" and reproduces the original formula
-- byte for byte, so re-saving an old month never moves its amount by a single fils.
-- There is deliberately NO backfill and NO default value: writing today's company
-- rate onto last year's rows would silently rewrite financial history.
--
-- ═══ Why hand-written rather than `prisma migrate diff` output ═══
-- `migrate diff` against this repository emits a full RedefineTables rebuild of a
-- dozen UNRELATED tables (bank_statement_imports, bank_statement_transactions, …).
-- That is pre-existing drift between the migration history and the datamodel and has
-- nothing to do with this pack. Executing it would rewrite operational banking tables
-- in order to ship an overtime rate setting. This migration is therefore scoped by
-- hand to exactly the seven statements the feature needs — the same approach both
-- previous migrations of this module took.
--
-- ═══ No new table for the default rate ═══
-- The company-wide default lives in the existing key/value `settings` table under
-- `employeeCompensation.companyOvertimeBaseRate` (group `employeeCompensation`).
-- No schema change is required for it, it enters backup/restore automatically with
-- the rest of `manar.db`, and no second settings mechanism is introduced.
-- It is NOT seeded here: an absent setting means "not chosen yet", and that must not
-- silently become "the user chose 4.000".

-- AlterTable employee_compensation_calculations — the month's company rate snapshot
ALTER TABLE "employee_compensation_calculations" ADD COLUMN "companyOvertimeBaseRateSnapshot" REAL;
ALTER TABLE "employee_compensation_calculations" ADD COLUMN "companyOvertimePolicyVersion" TEXT;

-- AlterTable employee_compensation_overtime_lines — per-line rate provenance
ALTER TABLE "employee_compensation_overtime_lines" ADD COLUMN "statutoryMinimumRate" REAL;
ALTER TABLE "employee_compensation_overtime_lines" ADD COLUMN "companyBaseRate" REAL;
ALTER TABLE "employee_compensation_overtime_lines" ADD COLUMN "companyDerivedRate" REAL;
ALTER TABLE "employee_compensation_overtime_lines" ADD COLUMN "effectiveRate" REAL;
ALTER TABLE "employee_compensation_overtime_lines" ADD COLUMN "rateSource" TEXT;
