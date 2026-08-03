-- Letter Engine — P1: document identity & lifecycle
--
-- Four new tables. ADDITIVE ONLY: nothing is dropped, altered, renamed or
-- back-filled, and no existing table is touched.
--
-- The two UNIQUE indexes on letter_references are the load-bearing lines of this
-- migration. They are what makes "a reference number is never reused" a property of
-- the database rather than a promise made by application code:
--
--   letter_references_reference_key                    → no two rows may carry the
--                                                        same reference string
--   letter_references_templateKey_year_sequence_key    → no two rows may claim the
--                                                        same slot in a sequence
--
-- letters.reference is UNIQUE and NULLABLE: SQLite permits many NULLs in a unique
-- index, which is exactly what "every draft is unnumbered, every issued letter is
-- uniquely numbered" requires from a single column.
--
-- letters.isArchived is a FLAG, not a status value. Archiving answers "is this still
-- active correspondence?", which is orthogonal to "what happened to this document?".
-- As a status it would be unreachable for a cancelled letter and would force a false
-- choice between PRINTED and ARCHIVED when both are true.
--
-- letter_references.letterId carries NO foreign key, deliberately: the register must
-- outlive the letter, so that a number stays accounted for even if a letter row is
-- lost to a partial restore. letter_timeline_events does the OPPOSITE and cascades,
-- because it is the letter's own history and the only deletable letter is a draft —
-- which never held a number and leaves no history worth keeping.

-- CreateTable
CREATE TABLE "letter_sequences" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "letter_references" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "letterId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
    "cancelReason" TEXT,
    "allocatedById" INTEGER,
    "allocatedByName" TEXT,
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME
);

-- CreateTable
CREATE TABLE "letters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "layoutVersion" INTEGER NOT NULL,
    "barcodeVersion" INTEGER NOT NULL,
    "printProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "issueDate" DATETIME NOT NULL,
    "recipientName" TEXT,
    "recipientTitle" TEXT,
    "recipientOrganisation" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "contentJson" TEXT NOT NULL DEFAULT '',
    "contentModelVersion" INTEGER NOT NULL,
    "registrationSnapshotJson" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "registeredById" INTEGER,
    "registeredByName" TEXT,
    "registeredAt" DATETIME,
    "archivedById" INTEGER,
    "archivedByName" TEXT,
    "archivedAt" DATETIME,
    "cancelledById" INTEGER,
    "cancelledByName" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "letter_timeline_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "letterId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "actorId" INTEGER,
    "actorName" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_timeline_events_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "letters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "letter_sequences_templateKey_year_key" ON "letter_sequences"("templateKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "letter_references_reference_key" ON "letter_references"("reference");

-- CreateIndex
CREATE INDEX "letter_references_letterId_idx" ON "letter_references"("letterId");

-- CreateIndex
CREATE INDEX "letter_references_templateKey_year_idx" ON "letter_references"("templateKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "letter_references_templateKey_year_sequence_key" ON "letter_references"("templateKey", "year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "letters_reference_key" ON "letters"("reference");

-- CreateIndex
CREATE INDEX "letters_status_idx" ON "letters"("status");

-- CreateIndex
CREATE INDEX "letters_templateKey_status_idx" ON "letters"("templateKey", "status");

-- CreateIndex
CREATE INDEX "letters_issueDate_idx" ON "letters"("issueDate");

-- CreateIndex
CREATE INDEX "letters_isArchived_idx" ON "letters"("isArchived");

-- CreateIndex
CREATE INDEX "letter_timeline_events_letterId_idx" ON "letter_timeline_events"("letterId");

-- CreateIndex
CREATE INDEX "letter_timeline_events_letterId_occurredAt_idx" ON "letter_timeline_events"("letterId", "occurredAt");
