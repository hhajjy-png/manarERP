-- CreateTable
CREATE TABLE "material_issues" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "contractId" INTEGER,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "accountingPostedAt" DATETIME,
    "accountingTransactionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "material_issues_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "material_issue_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialIssueId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCostSnapshot" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "material_issue_items_materialIssueId_fkey" FOREIGN KEY ("materialIssueId") REFERENCES "material_issues" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_issue_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "material_issues_number_key" ON "material_issues"("number");

-- CreateIndex
CREATE INDEX "material_issues_contractId_idx" ON "material_issues"("contractId");

-- CreateIndex
CREATE INDEX "material_issues_status_idx" ON "material_issues"("status");

-- CreateIndex
CREATE INDEX "material_issues_date_idx" ON "material_issues"("date");

-- CreateIndex
CREATE INDEX "material_issue_items_materialIssueId_idx" ON "material_issue_items"("materialIssueId");

-- CreateIndex
CREATE INDEX "material_issue_items_materialId_idx" ON "material_issue_items"("materialId");
