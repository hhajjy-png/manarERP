-- CreateTable
CREATE TABLE "cheque_designer_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "surfaceWidthCm" REAL NOT NULL,
    "surfaceHeightCm" REAL NOT NULL,
    "fields" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "cheque_designer_templates_isDefault_idx" ON "cheque_designer_templates"("isDefault");

-- CreateIndex
CREATE INDEX "cheque_designer_templates_updatedAt_idx" ON "cheque_designer_templates"("updatedAt");
