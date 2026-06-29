-- AlterTable bank_statement_imports: add incremental import session report fields
ALTER TABLE "bank_statement_imports" ADD COLUMN "accountKey" TEXT;
ALTER TABLE "bank_statement_imports" ADD COLUMN "insertedNewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bank_statement_imports" ADD COLUMN "skippedDuplicateCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bank_statement_imports" ADD COLUMN "potentialDuplicateCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable bank_statement_transactions: add fingerprint fields
ALTER TABLE "bank_statement_transactions" ADD COLUMN "accountKey" TEXT;
ALTER TABLE "bank_statement_transactions" ADD COLUMN "transactionFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "bank_statement_imports_accountKey_idx" ON "bank_statement_imports"("accountKey");
CREATE INDEX "bank_statement_transactions_accountKey_idx" ON "bank_statement_transactions"("accountKey");
CREATE INDEX "bank_statement_transactions_accountKey_transactionFingerprint_idx" ON "bank_statement_transactions"("accountKey", "transactionFingerprint");

-- CreateUniqueIndex (partial) — composite uniqueness per account, only when both fields are set
CREATE UNIQUE INDEX "idx_bst_account_fingerprint_unique"
ON "bank_statement_transactions"("accountKey", "transactionFingerprint")
WHERE "transactionFingerprint" IS NOT NULL
AND "accountKey" IS NOT NULL;
