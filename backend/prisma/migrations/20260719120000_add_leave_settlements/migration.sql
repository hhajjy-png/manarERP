-- CreateTable
CREATE TABLE "leave_settlements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "settlementDate" DATETIME NOT NULL,
    "leaveDaysSettled" REAL NOT NULL DEFAULT 0,
    "settlementAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    CONSTRAINT "leave_settlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "leave_settlements_employeeId_idx" ON "leave_settlements"("employeeId");

-- CreateIndex
CREATE INDEX "leave_settlements_settlementDate_idx" ON "leave_settlements"("settlementDate");
