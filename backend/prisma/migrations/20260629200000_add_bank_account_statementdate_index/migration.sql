-- CreateIndex: composite index on accountKey + statementDate for bank account explorer queries
CREATE INDEX "bank_statement_transactions_accountKey_statementDate_idx"
ON "bank_statement_transactions"("accountKey", "statementDate");
