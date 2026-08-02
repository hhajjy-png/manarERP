-- Job & Commission Analysis (تحليل الشغل والعمولة) v1 — additive only.
--
-- Creates two new tables and NOTHING else. No existing table is altered, no column
-- is added, dropped, or retyped, no index on an existing table is touched, and no
-- row anywhere else is migrated or deleted. Running this migration on a populated
-- database leaves every existing record byte-identical.
--
-- ═══ Deliberate absence of foreign keys ═══
--
-- `customerId`, `contractId`, and `priceId` are plain INTEGER reference columns with
-- NO FOREIGN KEY constraint. This is intentional, not an oversight:
--
--   1. A FK would require a back-relation inside the Prisma models for Customer,
--      Contract, and ProjectPrice — i.e. editing the Price Agreements model, which
--      must remain untouched.
--   2. A RESTRICT FK would block archiving or deleting a price agreement merely
--      because an internal analysis referenced it, letting a read-only analysis tool
--      obstruct an operational module.
--   3. An analysis FREEZES its prices at the moment it is created. The snapshot
--      columns below are the authoritative values; the ids are breadcrumbs only.
--
-- This mirrors the existing `cheque_template_versions.createdById` /
-- `cheque_print_logs.printedById` pattern already established in this schema.
--
-- The ONLY foreign key introduced is work_analysis_lines.analysisId → work_analyses.id,
-- an internal parent/child link between the two brand-new tables.

-- CreateTable work_analyses
CREATE TABLE "work_analyses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "analysisDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "customerId" INTEGER,
    "customerName" TEXT NOT NULL,
    "contractId" INTEGER,
    "contractName" TEXT,
    "asphaltPlant" TEXT,
    "ownerName" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable work_analysis_lines
-- `priceAgreementName`, `itemLabel`, `unit`, and `customerPrice` are the frozen
-- snapshot: written once from the selected price agreement, never re-read from
-- project_prices afterwards. Editing a price agreement later cannot alter them.
CREATE TABLE "work_analysis_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "analysisId" INTEGER NOT NULL,
    "priceId" INTEGER,
    "priceAgreementName" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "customerPrice" REAL NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "ownerPrice" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "work_analysis_lines_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "work_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "work_analyses_status_idx" ON "work_analyses"("status");
CREATE INDEX "work_analyses_analysisDate_idx" ON "work_analyses"("analysisDate");
CREATE INDEX "work_analyses_customerId_idx" ON "work_analyses"("customerId");
CREATE INDEX "work_analyses_ownerName_idx" ON "work_analyses"("ownerName");
CREATE INDEX "work_analysis_lines_analysisId_idx" ON "work_analysis_lines"("analysisId");
