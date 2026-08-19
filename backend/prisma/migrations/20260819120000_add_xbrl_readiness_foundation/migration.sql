-- XBRL Readiness Foundation v1 — طبقة جاهزية XBRL
--
-- ترحيل **إضافي بحت**: ست جداول جديدة كلها بالبادئة `xbrl_`، بلا ALTER واحد على أي
-- جدول قائم، وبلا سطر بيانات واحد يُقرأ أو يُعدَّل أو يُعاد تفسيره. دليل الحسابات
-- وقيود اليومية والأرصدة تخرج من هذا الترحيل كما دخلت بالضبط.
--
-- التراجع المنطقي: إسقاط الجداول الست بترتيب عكسي للاعتماديات
--   xbrl_snapshots → xbrl_reporting_contexts → xbrl_statement_mappings
--   → xbrl_account_mappings → xbrl_concepts → xbrl_taxonomies
-- يعيد قاعدة البيانات إلى حالتها قبل الحزمة تمامًا. لا يوجد ما يُستعاد من بيانات
-- محاسبية لأن الحزمة لم تكتب فيها شيئًا أصلًا.
--
-- ⚠ لا Taxonomy رسمية (QAYD) تُنشأ هنا: الجداول تُخلق فارغة، و`isOfficial` يبقى false.

-- CreateTable
CREATE TABLE "xbrl_taxonomies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "xbrl_concepts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taxonomyId" INTEGER NOT NULL,
    "conceptCode" TEXT NOT NULL,
    "namespace" TEXT,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'MONETARY',
    "balanceType" TEXT NOT NULL DEFAULT 'NONE',
    "periodType" TEXT NOT NULL DEFAULT 'DURATION',
    "statementType" TEXT NOT NULL DEFAULT 'NONE',
    "parentConceptId" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "xbrl_concepts_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "xbrl_concepts_parentConceptId_fkey" FOREIGN KEY ("parentConceptId") REFERENCES "xbrl_concepts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "xbrl_account_mappings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taxonomyId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MAPPED',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "xbrl_account_mappings_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "xbrl_account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "xbrl_account_mappings_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "xbrl_concepts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "xbrl_statement_mappings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taxonomyId" INTEGER NOT NULL,
    "statementType" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "lineLabelAr" TEXT NOT NULL,
    "lineLabelEn" TEXT,
    "parentLineCode" TEXT,
    "conceptId" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isTotal" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "accountFilterJson" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "xbrl_statement_mappings_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "xbrl_statement_mappings_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "xbrl_concepts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "xbrl_reporting_contexts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "taxonomyId" INTEGER,
    "entityName" TEXT NOT NULL,
    "entityNameEn" TEXT,
    "entityIdentifier" TEXT,
    "entityScheme" TEXT,
    "fiscalYear" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "instantDate" DATETIME,
    "comparativePeriodStart" DATETIME,
    "comparativePeriodEnd" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "decimals" INTEGER NOT NULL DEFAULT 3,
    "reportingLanguage" TEXT NOT NULL DEFAULT 'ar',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "xbrl_reporting_contexts_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "xbrl_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotNumber" TEXT NOT NULL,
    "taxonomyId" INTEGER,
    "taxonomyCode" TEXT,
    "taxonomyVersion" TEXT,
    "taxonomyIsOfficial" BOOLEAN NOT NULL DEFAULT false,
    "contextId" INTEGER,
    "fiscalYear" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "companyJson" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "trialBalanceJson" TEXT NOT NULL,
    "accountMappingsJson" TEXT NOT NULL,
    "statementMappingsJson" TEXT NOT NULL,
    "validationJson" TEXT NOT NULL,
    "readinessJson" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "xbrl_taxonomies_code_key" ON "xbrl_taxonomies"("code");

-- CreateIndex
CREATE INDEX "xbrl_taxonomies_status_idx" ON "xbrl_taxonomies"("status");

-- CreateIndex
CREATE INDEX "xbrl_taxonomies_jurisdiction_idx" ON "xbrl_taxonomies"("jurisdiction");

-- CreateIndex
CREATE INDEX "xbrl_taxonomies_isOfficial_idx" ON "xbrl_taxonomies"("isOfficial");

-- CreateIndex
CREATE INDEX "xbrl_concepts_taxonomyId_idx" ON "xbrl_concepts"("taxonomyId");

-- CreateIndex
CREATE INDEX "xbrl_concepts_statementType_idx" ON "xbrl_concepts"("statementType");

-- CreateIndex
CREATE INDEX "xbrl_concepts_parentConceptId_idx" ON "xbrl_concepts"("parentConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "xbrl_concepts_taxonomyId_conceptCode_key" ON "xbrl_concepts"("taxonomyId", "conceptCode");

-- CreateIndex
CREATE INDEX "xbrl_account_mappings_taxonomyId_idx" ON "xbrl_account_mappings"("taxonomyId");

-- CreateIndex
CREATE INDEX "xbrl_account_mappings_accountId_idx" ON "xbrl_account_mappings"("accountId");

-- CreateIndex
CREATE INDEX "xbrl_account_mappings_conceptId_idx" ON "xbrl_account_mappings"("conceptId");

-- CreateIndex
CREATE INDEX "xbrl_account_mappings_status_idx" ON "xbrl_account_mappings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "xbrl_account_mappings_taxonomyId_accountId_conceptId_key" ON "xbrl_account_mappings"("taxonomyId", "accountId", "conceptId");

-- CreateIndex
CREATE INDEX "xbrl_statement_mappings_taxonomyId_idx" ON "xbrl_statement_mappings"("taxonomyId");

-- CreateIndex
CREATE INDEX "xbrl_statement_mappings_statementType_idx" ON "xbrl_statement_mappings"("statementType");

-- CreateIndex
CREATE INDEX "xbrl_statement_mappings_conceptId_idx" ON "xbrl_statement_mappings"("conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "xbrl_statement_mappings_taxonomyId_statementType_lineCode_key" ON "xbrl_statement_mappings"("taxonomyId", "statementType", "lineCode");

-- CreateIndex
CREATE INDEX "xbrl_reporting_contexts_fiscalYear_idx" ON "xbrl_reporting_contexts"("fiscalYear");

-- CreateIndex
CREATE INDEX "xbrl_reporting_contexts_taxonomyId_idx" ON "xbrl_reporting_contexts"("taxonomyId");

-- CreateIndex
CREATE UNIQUE INDEX "xbrl_snapshots_snapshotNumber_key" ON "xbrl_snapshots"("snapshotNumber");

-- CreateIndex
CREATE INDEX "xbrl_snapshots_fiscalYear_idx" ON "xbrl_snapshots"("fiscalYear");

-- CreateIndex
CREATE INDEX "xbrl_snapshots_taxonomyId_idx" ON "xbrl_snapshots"("taxonomyId");

-- CreateIndex
CREATE INDEX "xbrl_snapshots_createdAt_idx" ON "xbrl_snapshots"("createdAt");

