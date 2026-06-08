-- CreateTable
CREATE TABLE "cheques" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chequeNumber" TEXT NOT NULL,
    "chequeDate" DATETIME NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "description" TEXT,
    "bankName" TEXT NOT NULL,
    "templateName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "printedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "cheques_chequeNumber_key" ON "cheques"("chequeNumber");

-- CreateIndex
CREATE INDEX "cheques_status_idx" ON "cheques"("status");

-- CreateIndex
CREATE INDEX "cheques_chequeDate_idx" ON "cheques"("chequeDate");

-- CreateIndex
CREATE INDEX "cheques_beneficiaryName_idx" ON "cheques"("beneficiaryName");
