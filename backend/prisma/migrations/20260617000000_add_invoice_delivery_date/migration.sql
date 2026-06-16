-- AlterTable: add deliveryDate to invoices
-- Nullable DateTime — safe for existing rows (existing rows get NULL).
-- متابعة داخلية فقط — لا يظهر في الطباعة ولا يؤثر على الحسابات.
ALTER TABLE "invoices" ADD COLUMN "deliveryDate" DATETIME;
