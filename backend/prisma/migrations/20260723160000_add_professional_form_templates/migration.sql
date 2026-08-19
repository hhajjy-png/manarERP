-- CreateTable
CREATE TABLE "professional_form_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "backgroundImage" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "professional_form_templates_documentType_idx" ON "professional_form_templates"("documentType");
