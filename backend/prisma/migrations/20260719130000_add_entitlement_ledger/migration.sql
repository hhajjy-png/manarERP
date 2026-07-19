-- CreateTable
CREATE TABLE "employee_entitlement_ledger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "entryType" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "description" TEXT,
    "leaveDays" REAL,
    "amount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    CONSTRAINT "employee_entitlement_ledger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "employee_entitlement_ledger_employeeId_idx" ON "employee_entitlement_ledger"("employeeId");

-- CreateIndex
CREATE INDEX "employee_entitlement_ledger_entryDate_idx" ON "employee_entitlement_ledger"("entryDate");
