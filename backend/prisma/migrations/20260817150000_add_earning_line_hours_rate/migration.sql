-- Employee Compensation — Earning Line Hourly Detail v1. ADDITIVE ONLY.
--
-- Two nullable columns on one table that belongs to this module alone. SQLite
-- performs each as a pure metadata `ALTER TABLE ADD COLUMN`: no table rebuild, no
-- data copy, no index change, no constraint change, no UPDATE. Every existing row
-- keeps NULL on both new columns. Rolling back means dropping these two columns.
--
-- ═══ Why two typed columns instead of free text ═══
-- "7 hours × 4.000" is two numbers, not a sentence. They are rendered in their own
-- columns, summed, and checked against the line amount (hours × rate = amount).
-- Storing them inside `notes` would force every reader — month screen, statement,
-- detailed report, tests — to re-parse prose, and the first wording change would
-- break all of them silently.
--
-- ═══ These are NOT proven working hours ═══
-- Both columns explain how a financial line's amount was composed. They never enter
-- the legal compliance engine. The single source of truth for overtime hours remains
-- `employee_compensation_overtime_day_entries` — with its dates. A line carrying
-- "7 hours" does not assert that seven hours were worked on a known date, so it is
-- excluded from the Article 66 counters (2h/day, 3 days/week, 90 days/year,
-- 180h/year). Feeding dateless numbers into those counters would manufacture a
-- "compliance" verdict out of nothing — precisely what the daily ledger exists to
-- prevent.
--
-- NULL together or NOT NULL together (enforced in the engine, not by a CHECK, so the
-- rule lives with the rest of the module's invariants): a purely financial line
-- (expense, bonus) has neither an hour nor a rate, and hours without a rate explain
-- no amount.

-- AlterTable
ALTER TABLE "employee_compensation_earning_lines" ADD COLUMN "hours" REAL;

-- AlterTable
ALTER TABLE "employee_compensation_earning_lines" ADD COLUMN "rate" REAL;
