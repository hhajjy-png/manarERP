-- AlterTable: reprint counter on cheques (additive, default 0 — existing rows unaffected)
ALTER TABLE "cheques" ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: cheque template version history (additive)
CREATE TABLE "cheque_template_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bankName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable: cheque print/reprint log (additive)
CREATE TABLE "cheque_print_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chequeId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "printedById" INTEGER,
    "printedByName" TEXT,
    "printedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cheque_print_logs_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "cheques" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cheque_template_versions_bankName_idx" ON "cheque_template_versions"("bankName");

-- CreateIndex
CREATE UNIQUE INDEX "cheque_template_versions_bankName_version_key" ON "cheque_template_versions"("bankName", "version");

-- CreateIndex
CREATE INDEX "cheque_print_logs_chequeId_idx" ON "cheque_print_logs"("chequeId");
