-- Immutable journal ledger — Accounting Integrity Pack v1
-- Adds `revision` to journal_entries and switches the double-post unique key from
-- (referenceType, referenceId) to (referenceType, referenceId, revision).
--
-- Why: a posted journal must never be physically deleted. Corrections now REVERSE the
-- current revision and POST a new one (revision + 1). The unique key must include
-- `revision` so successive corrections coexist in the ledger while still blocking an
-- accidental duplicate post of the same (type, reference, revision).
--
-- Data-safe: rebuild preserves ids (INSERT ... SELECT), so all journal_entry_lines FKs
-- remain valid; every existing row gets revision = 1.
PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_journal_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryNumber" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_journal_entries" ("createdAt", "date", "description", "entryNumber", "id", "referenceId", "referenceType", "status", "updatedAt") SELECT "createdAt", "date", "description", "entryNumber", "id", "referenceId", "referenceType", "status", "updatedAt" FROM "journal_entries";
DROP TABLE "journal_entries";
ALTER TABLE "new_journal_entries" RENAME TO "journal_entries";
CREATE UNIQUE INDEX "journal_entries_entryNumber_key" ON "journal_entries"("entryNumber");
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");
CREATE INDEX "journal_entries_referenceType_referenceId_idx" ON "journal_entries"("referenceType", "referenceId");
CREATE UNIQUE INDEX "journal_entries_referenceType_referenceId_revision_key" ON "journal_entries"("referenceType", "referenceId", "revision");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
