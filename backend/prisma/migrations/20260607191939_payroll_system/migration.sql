-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "payrollId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "quantity" REAL,
    "rate" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_lines_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payroll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "employee_allowances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_allowances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "employee_recurring_deductions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_recurring_deductions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payroll_advances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "remainingAmount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payroll_advances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_payroll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "baseSalary" REAL NOT NULL,
    "snapshotBaseSalary" REAL NOT NULL DEFAULT 0,
    "regularWorkDays" INTEGER NOT NULL DEFAULT 0,
    "presentDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "leaveDays" INTEGER NOT NULL DEFAULT 0,
    "lateDays" INTEGER NOT NULL DEFAULT 0,
    "regularHours" REAL NOT NULL DEFAULT 0,
    "actualHours" REAL NOT NULL DEFAULT 0,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "overtimeRate" REAL NOT NULL DEFAULT 0,
    "overtimeAmount" REAL NOT NULL DEFAULT 0,
    "totalBonus" REAL NOT NULL DEFAULT 0,
    "totalAllowances" REAL NOT NULL DEFAULT 0,
    "totalDeduction" REAL NOT NULL DEFAULT 0,
    "totalDeductions" REAL NOT NULL DEFAULT 0,
    "totalAdvances" REAL NOT NULL DEFAULT 0,
    "grossSalary" REAL NOT NULL DEFAULT 0,
    "netSalary" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "approvedById" INTEGER,
    "paidAt" DATETIME,
    "paidById" INTEGER,
    "paymentMethod" TEXT,
    "accountingPostedAt" DATETIME,
    "accountingTransactionId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_payroll" (
    "baseSalary",
    "snapshotBaseSalary",
    "createdAt",
    "employeeId",
    "id",
    "month",
    "netSalary",
    "notes",
    "paidAt",
    "status",
    "totalBonus",
    "totalAllowances",
    "totalDeduction",
    "totalDeductions",
    "grossSalary",
    "updatedAt",
    "year"
)
SELECT
    "baseSalary",
    "baseSalary",
    "createdAt",
    "employeeId",
    "id",
    "month",
    "netSalary",
    "notes",
    "paidAt",
    "status",
    "totalBonus",
    "totalBonus",
    "totalDeduction",
    "totalDeduction",
    "baseSalary" + "totalBonus",
    "updatedAt",
    "year"
FROM "payroll";
DROP TABLE "payroll";
ALTER TABLE "new_payroll" RENAME TO "payroll";
CREATE INDEX "payroll_year_month_idx" ON "payroll"("year", "month");
CREATE INDEX "payroll_employeeId_idx" ON "payroll"("employeeId");
CREATE INDEX "payroll_status_idx" ON "payroll"("status");
CREATE INDEX "payroll_accountingTransactionId_idx" ON "payroll"("accountingTransactionId");
CREATE UNIQUE INDEX "payroll_employeeId_month_year_key" ON "payroll"("employeeId", "month", "year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "payroll_lines_payrollId_idx" ON "payroll_lines"("payrollId");

-- CreateIndex
CREATE INDEX "payroll_lines_employeeId_idx" ON "payroll_lines"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_lines_type_idx" ON "payroll_lines"("type");

-- CreateIndex
CREATE INDEX "payroll_lines_sourceType_sourceId_idx" ON "payroll_lines"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "employee_allowances_employeeId_idx" ON "employee_allowances"("employeeId");

-- CreateIndex
CREATE INDEX "employee_allowances_isActive_idx" ON "employee_allowances"("isActive");

-- CreateIndex
CREATE INDEX "employee_recurring_deductions_employeeId_idx" ON "employee_recurring_deductions"("employeeId");

-- CreateIndex
CREATE INDEX "employee_recurring_deductions_isActive_idx" ON "employee_recurring_deductions"("isActive");

-- CreateIndex
CREATE INDEX "payroll_advances_employeeId_idx" ON "payroll_advances"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_advances_status_idx" ON "payroll_advances"("status");

-- CreateIndex
CREATE INDEX "payroll_advances_date_idx" ON "payroll_advances"("date");
