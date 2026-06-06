PRAGMA foreign_keys=OFF;

CREATE TABLE "new_invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'SALES',
    "invoiceType" TEXT NOT NULL DEFAULT 'نقل اسفلت',
    "customerId" INTEGER,
    "supplierId" INTEGER,
    "contractId" INTEGER,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_invoices" (
    "id", "number", "invoiceNumber", "direction", "invoiceType", "customerId", "supplierId", "contractId",
    "issueDate", "dueDate", "subtotal", "taxRate", "taxAmount", "discount", "total", "paidAmount",
    "status", "notes", "createdAt", "updatedAt"
)
SELECT
    "id", "number", "number", "direction", "invoiceType", "customerId", "supplierId", "contractId",
    "issueDate", "dueDate", "subtotal", "taxRate", "taxAmount", "discount", "total", "paidAmount",
    "status", "notes", "createdAt", "updatedAt"
FROM "invoices";

DROP TABLE "invoices";
ALTER TABLE "new_invoices" RENAME TO "invoices";

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX "invoices_direction_idx" ON "invoices"("direction");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");
CREATE INDEX "invoices_supplierId_idx" ON "invoices"("supplierId");
CREATE INDEX "invoices_contractId_idx" ON "invoices"("contractId");
CREATE INDEX "invoices_issueDate_idx" ON "invoices"("issueDate");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
