-- Leave Request — Editable Request Date v1. ADDITIVE ONLY.
--
-- One nullable column on an existing table. SQLite performs this as a pure
-- metadata `ALTER TABLE ADD COLUMN`: no table rebuild, no data copy, no index
-- or constraint change, and every existing row keeps NULL. Rolling back means
-- dropping this one column.
--
-- `requestDate` is administrative leave-REQUEST data (it appears on the printed
-- request form only). It is never read by the entitlements calculation engine,
-- payroll, or accounting. Existing rows stay NULL and the printed form falls
-- back to today's date for them — byte-for-byte the previous behaviour.

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN "requestDate" DATETIME;
