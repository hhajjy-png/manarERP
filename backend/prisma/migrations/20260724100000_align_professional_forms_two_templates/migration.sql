-- DropIndex
DROP INDEX "professional_form_templates_documentType_idx";

-- CreateTable
CREATE TABLE "printed_cheques" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chequeNumber" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "chequeDate" TEXT NOT NULL,
    "paymentReason" TEXT NOT NULL,
    "printedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedByUserId" INTEGER,
    "printedByName" TEXT,
    "paymentVoucherPrinted" BOOLEAN NOT NULL DEFAULT false,
    "paymentVoucherPrintedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "printed_cheques_paymentVoucherPrinted_idx" ON "printed_cheques"("paymentVoucherPrinted");

-- CreateIndex
CREATE UNIQUE INDEX "professional_form_templates_documentType_key" ON "professional_form_templates"("documentType");
