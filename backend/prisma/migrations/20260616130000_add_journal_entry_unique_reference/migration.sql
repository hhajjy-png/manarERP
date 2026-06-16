-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_referenceType_referenceId_key" ON "journal_entries"("referenceType", "referenceId");
