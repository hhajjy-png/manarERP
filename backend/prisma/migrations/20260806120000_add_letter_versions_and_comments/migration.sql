-- Professional Document Automation v1 — Version History and Comments.
--
-- ══════════════════════════════════════════════════════════════════════════
--  PURELY ADDITIVE. TWO NEW TABLES, NO EXISTING TABLE OR COLUMN IS TOUCHED.
-- ══════════════════════════════════════════════════════════════════════════
-- Nothing here alters, drops or rebuilds an existing object. The only writes are
-- CREATE TABLE and CREATE INDEX, so this migration is safe to apply to a live
-- database and there is nothing in it to roll back but two drops.
--
-- ── WHY THIS FILE IS HAND-WRITTEN RATHER THAN GENERATED ──────────────────
-- `prisma migrate diff` against the development database produced a script that ALSO
-- dropped `printed_cheques` and `professional_form_templates` and rebuilt eleven
-- unrelated tables. That is PRE-EXISTING DRIFT between the dev database and
-- `schema.prisma` — none of it belongs to this pack, and shipping it inside this
-- migration would destroy data nobody asked to touch. The two tables below are
-- transcribed from the generated script verbatim; everything else was discarded.
--
-- The drift itself is left exactly as it was found. It is real and worth resolving,
-- but resolving it is not this pack's work and would be a destructive change made
-- without anyone asking for it.

-- ── letter_versions ───────────────────────────────────────────────────────
-- A full snapshot of the document per row. It lives in its own table rather than in
-- a column on `letters` because a version is a copy of `contentJson`, and storing
-- copies inside the thing being copied blows the 2 MB field cap after a handful of
-- saves. A table also gives it an index, selective deletion and an enforceable cap.
CREATE TABLE "letter_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "letterId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AUTO',
    "name" TEXT,
    "note" TEXT,
    "contentJson" TEXT NOT NULL,
    "contentModelVersion" INTEGER NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "issueDate" DATETIME NOT NULL,
    "recipientName" TEXT,
    "recipientTitle" TEXT,
    "recipientOrganisation" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_versions_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "letters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── letter_comments ───────────────────────────────────────────────────────
-- Replies are comments: `parentId` points at the thread's opening comment, so a
-- thread is a one-level tree and needs no second table. The anchor is TEXT rather
-- than a foreign key so a comment survives the paragraph it was about — a comment
-- that vanishes with its target loses the most important thing about it, that it
-- was said.
CREATE TABLE "letter_comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "letterId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "anchorKind" TEXT NOT NULL DEFAULT 'document',
    "anchorId" TEXT,
    "body" TEXT NOT NULL,
    "mentions" TEXT NOT NULL DEFAULT '',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" INTEGER,
    "resolvedByName" TEXT,
    "resolvedAt" DATETIME,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "letter_comments_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "letters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "letter_comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────
-- `letter_versions_letterId_sequence_key` is UNIQUE deliberately: it is what stops
-- two concurrent save requests minting the same version number for one letter. The
-- allocator reads MAX(sequence) and inserts, so without this constraint the read
-- and the write are a race, and the loser silently overwrites a version.
CREATE UNIQUE INDEX "letter_versions_letterId_sequence_key" ON "letter_versions"("letterId", "sequence");
CREATE INDEX "letter_versions_letterId_createdAt_idx" ON "letter_versions"("letterId", "createdAt");

CREATE INDEX "letter_comments_letterId_idx" ON "letter_comments"("letterId");
CREATE INDEX "letter_comments_letterId_resolved_idx" ON "letter_comments"("letterId", "resolved");
CREATE INDEX "letter_comments_parentId_idx" ON "letter_comments"("parentId");
