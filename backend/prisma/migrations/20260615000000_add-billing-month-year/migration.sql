-- AlterTable: add billingMonth and billingYear to invoices
-- Both columns are nullable INTEGER — safe for existing rows (existing rows get NULL).
ALTER TABLE "invoices" ADD COLUMN "billingMonth" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "billingYear" INTEGER;
