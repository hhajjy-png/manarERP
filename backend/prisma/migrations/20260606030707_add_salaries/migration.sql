-- CreateTable
CREATE TABLE "salary_payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "paymentDate" DATETIME,
    "sourceMonth" TEXT,
    "transactionId" TEXT NOT NULL,
    "beneficiaryAccount" TEXT,
    "beneficiaryName" TEXT NOT NULL,
    "bankName" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "paymentType" TEXT,
    "status" TEXT,
    "errorDescription" TEXT,
    "civilId" TEXT,
    "duplicateFlag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_transactionId_key" ON "salary_payments"("transactionId");

-- CreateIndex
CREATE INDEX "salary_payments_paymentDate_idx" ON "salary_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "salary_payments_beneficiaryName_idx" ON "salary_payments"("beneficiaryName");

-- CreateIndex
CREATE INDEX "salary_payments_civilId_idx" ON "salary_payments"("civilId");

-- CreateIndex
CREATE INDEX "salary_payments_status_idx" ON "salary_payments"("status");
