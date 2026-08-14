-- Monthly Entitlements Bank Statement v1 — ADDITIVE ONLY.
-- Two new tables + their indexes. No existing table is altered, renamed, or dropped;
-- no existing column or index is touched. Rolling back = dropping these two tables.

-- CreateTable
CREATE TABLE "entitlements_bank_statements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" INTEGER,
    "approvedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "entitlements_bank_statement_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "statementId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "calculationId" INTEGER,
    "employeeCodeSnapshot" TEXT NOT NULL,
    "employeeNameSnapshot" TEXT NOT NULL,
    "employeeNameEnSnapshot" TEXT,
    "civilIdSnapshot" TEXT,
    "bankAccountSnapshot" TEXT,
    "netAmountSnapshot" REAL NOT NULL,
    "basicSalarySnapshot" REAL NOT NULL,
    "transferAmount" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entitlements_bank_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "entitlements_bank_statements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "entitlements_bank_statements_year_month_idx" ON "entitlements_bank_statements"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_bank_statements_year_month_key" ON "entitlements_bank_statements"("year", "month");

-- CreateIndex
CREATE INDEX "entitlements_bank_statement_lines_statementId_idx" ON "entitlements_bank_statement_lines"("statementId");

-- CreateIndex
CREATE INDEX "entitlements_bank_statement_lines_employeeId_idx" ON "entitlements_bank_statement_lines"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_bank_statement_lines_statementId_employeeId_key" ON "entitlements_bank_statement_lines"("statementId", "employeeId");
