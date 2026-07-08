-- Add an audit-only `createdAt` (system entry time) to payments, keeping `date`
-- as the official user-editable collection date (تاريخ التحصيل).
-- SQLite cannot ADD COLUMN with a non-constant default (CURRENT_TIMESTAMP), so we
-- follow the Prisma table-redefine pattern. Existing rows backfill createdAt = date
-- (best-available entry-time approximation; audit-only, does not affect amounts,
-- status, or collection reports, which continue to use `date`).
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_payments" (
    "id", "invoiceId", "amount", "method", "date", "createdAt", "reference", "notes"
)
SELECT
    "id", "invoiceId", "amount", "method", "date", "date", "reference", "notes"
FROM "payments";

DROP TABLE "payments";
ALTER TABLE "new_payments" RENAME TO "payments";

CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
