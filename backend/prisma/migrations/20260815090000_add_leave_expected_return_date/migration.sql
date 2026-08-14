-- Employee Leave — Full Leave Request Data Capture v1. ADDITIVE ONLY.
--
-- One nullable column on an existing table. SQLite performs this as a pure
-- metadata `ALTER TABLE ADD COLUMN`: no table rebuild, no data copy, no index
-- or constraint change, and every existing row keeps NULL. Rolling back means
-- dropping this one column.
--
-- `expectedReturnDate` is administrative leave-REQUEST data (it appears on the
-- printed request form only). It is never read by the entitlements calculation
-- engine, payroll, or accounting.

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN "expectedReturnDate" DATETIME;
