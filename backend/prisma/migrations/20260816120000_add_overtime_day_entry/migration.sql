-- Employee Compensation — Daily Overtime Ledger v1
--
-- Additive only: creates one new table plus its indexes.
-- No ALTER, no DROP, no UPDATE, no backfill. Existing calculations and their
-- monthly aggregate overtime lines are untouched, and a calculation with zero
-- rows here is a legacy monthly record by definition.

-- CreateTable
CREATE TABLE "employee_compensation_overtime_day_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calculationId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "overtimeType" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "notes" TEXT,
    "compensatoryRestStatus" TEXT,
    "compensatoryRestDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_compensation_overtime_day_entries_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "employee_compensation_calculations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "employee_compensation_overtime_day_entries_calculationId_idx" ON "employee_compensation_overtime_day_entries"("calculationId");

-- CreateIndex
CREATE INDEX "employee_compensation_overtime_day_entries_date_idx" ON "employee_compensation_overtime_day_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensation_overtime_day_entries_calculationId_date_overtimeType_key" ON "employee_compensation_overtime_day_entries"("calculationId", "date", "overtimeType");
