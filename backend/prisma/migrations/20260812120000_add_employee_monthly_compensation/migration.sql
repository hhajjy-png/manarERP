-- Employee Monthly Compensation v1 (مستحقات الموظف الشهرية) — additive only.
--
-- Creates FOUR new tables and NOTHING else. No existing table is altered, no column
-- is added, dropped, or retyped, no index on an existing table is touched, and no row
-- anywhere else is migrated or deleted. Running this migration on a populated
-- database leaves every existing record byte-identical.
--
-- The `Employee.compensationCalcs` field added alongside these tables is a Prisma
-- VIRTUAL back-relation. Prisma requires both sides of every relation to be declared;
-- the field materializes no column and emits no DDL against `employees`. That is why
-- this migration contains no `ALTER TABLE "employees"` statement — and must not.
--
-- ═══ Scope guarantee ═══
-- This module never writes outside these four tables: no payroll row, no journal
-- entry, no expense, no allowance/deduction in the payroll system, no end-of-service
-- record, no bank line, no cost centre. Its totals are NOT posted anywhere.
--
-- ═══ One calculation per employee/year/month ═══
-- The UNIQUE index below is the hard constraint the module's "no versioning" rule
-- rests on. Editing a month UPDATEs that same row; it never inserts a second one.
--
-- ═══ Snapshot columns ═══
-- `employeeNumberSnapshot` / `employeeNameSnapshot` / `jobTitleSnapshot` /
-- `departmentSnapshot` / `nationalitySnapshot` / `civilIdSnapshot` /
-- `basicSalarySnapshot` / `hourlyRateSnapshot` are written ONCE at creation and are
-- never refreshed from the live employee record. Renaming an employee or changing
-- their salary later cannot alter a historical statement.

-- CreateTable employee_compensation_calculations
CREATE TABLE "employee_compensation_calculations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "employeeNumberSnapshot" TEXT NOT NULL,
    "employeeNameSnapshot" TEXT NOT NULL,
    "jobTitleSnapshot" TEXT,
    "departmentSnapshot" TEXT,
    "nationalitySnapshot" TEXT,
    "civilIdSnapshot" TEXT,
    "basicSalarySnapshot" REAL NOT NULL,
    "legalRulesVersion" TEXT NOT NULL,
    "hourlyRateSnapshot" REAL NOT NULL,
    "totalOvertimeAmount" REAL NOT NULL DEFAULT 0,
    "totalOtherEarnings" REAL NOT NULL DEFAULT 0,
    "grossEntitlements" REAL NOT NULL DEFAULT 0,
    "totalDeductions" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "approvedAt" DATETIME,
    "approvedById" INTEGER,
    "approvedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_compensation_calculations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable employee_compensation_overtime_lines
-- `calculationMethod` / `reverseTargetAmount` / `rawHoursBeforeCeiling` are INTERNAL
-- audit metadata. They exist so an internal detailed report can explain how a line was
-- reached; the official short statement must never surface them.
CREATE TABLE "employee_compensation_overtime_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calculationId" INTEGER NOT NULL,
    "overtimeType" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "hourlyRate" REAL NOT NULL,
    "multiplier" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "calculationMethod" TEXT NOT NULL DEFAULT 'MANUAL_HOURS',
    "reverseTargetAmount" REAL,
    "rawHoursBeforeCeiling" REAL,
    "legalReference" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "employee_compensation_overtime_lines_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "employee_compensation_calculations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable employee_compensation_earning_lines
CREATE TABLE "employee_compensation_earning_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calculationId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "entryDate" DATETIME,
    "reason" TEXT,
    "notes" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "employee_compensation_earning_lines_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "employee_compensation_calculations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable employee_compensation_deduction_lines
CREATE TABLE "employee_compensation_deduction_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calculationId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "employee_compensation_deduction_lines_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "employee_compensation_calculations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensation_calculations_employeeId_year_month_key" ON "employee_compensation_calculations"("employeeId", "year", "month");
CREATE INDEX "employee_compensation_calculations_year_month_idx" ON "employee_compensation_calculations"("year", "month");
CREATE INDEX "employee_compensation_calculations_employeeId_year_idx" ON "employee_compensation_calculations"("employeeId", "year");
CREATE INDEX "employee_compensation_overtime_lines_calculationId_idx" ON "employee_compensation_overtime_lines"("calculationId");
CREATE INDEX "employee_compensation_earning_lines_calculationId_idx" ON "employee_compensation_earning_lines"("calculationId");
CREATE INDEX "employee_compensation_deduction_lines_calculationId_idx" ON "employee_compensation_deduction_lines"("calculationId");
