-- Employee Final Settlement v1 — additive only.
--
-- Creates two new tables and nothing else: no existing table is altered, no column
-- is dropped or retyped, no data is migrated or deleted. Existing employees simply
-- have no settlement row until one is explicitly created.
--
-- Scope note: a final settlement is a self-contained entitlement record. It has no
-- foreign key to payroll, salary payments, journal entries, or bank data, because it
-- deliberately produces no effect in any of those modules.

-- CreateTable employee_final_settlements
-- Snapshot columns are all nullable: they stay NULL for a DRAFT (which is recalculated
-- live from authoritative data) and are written exactly once at approval, after which
-- they are never updated again.
CREATE TABLE "employee_final_settlements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lastWorkingDay" DATETIME NOT NULL,
    "terminationReason" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "approvedBy" INTEGER,
    "snapshotHireDate" DATETIME,
    "snapshotSalaryUsed" REAL,
    "snapshotDailyWage" REAL,
    "snapshotWageDivisor" INTEGER,
    "snapshotServiceYears" REAL,
    "snapshotServiceMonths" INTEGER,
    "snapshotServiceDays" INTEGER,
    "snapshotServiceTotalDays" INTEGER,
    "snapshotLeaveDays" REAL,
    "snapshotLeaveValue" REAL,
    "snapshotPriorLeavePaid" REAL,
    "snapshotLeaveRemaining" REAL,
    "snapshotEosScenario" TEXT,
    "snapshotEosFullAmount" REAL,
    "snapshotEosFraction" REAL,
    "snapshotEosAmount" REAL,
    "snapshotTotalAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" INTEGER,
    CONSTRAINT "employee_final_settlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable final_settlement_payments
-- Kept separate from employee_entitlement_ledger on purpose: pre-settlement entitlement
-- payments and settlement payments are different financial facts and must never be
-- aggregated into one another by accident.
CREATE TABLE "final_settlement_payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "settlementId" INTEGER NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    CONSTRAINT "final_settlement_payments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "employee_final_settlements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
-- One non-cancelled settlement per employee is a v1 business rule; enforcing it as a
-- unique index means a concurrent double-create fails at the database, not just in the UI.
CREATE UNIQUE INDEX "employee_final_settlements_employeeId_key" ON "employee_final_settlements"("employeeId");

-- CreateIndex
CREATE INDEX "employee_final_settlements_status_idx" ON "employee_final_settlements"("status");

-- CreateIndex
CREATE INDEX "final_settlement_payments_settlementId_idx" ON "final_settlement_payments"("settlementId");

-- CreateIndex
CREATE INDEX "final_settlement_payments_paymentDate_idx" ON "final_settlement_payments"("paymentDate");
