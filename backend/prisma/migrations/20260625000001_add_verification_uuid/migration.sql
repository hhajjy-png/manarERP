-- AlterTable: add verificationUuid to invoices as nullable
ALTER TABLE "invoices" ADD COLUMN "verificationUuid" TEXT;

-- Backfill existing rows with unique hex identifiers (one-time safe backfill)
-- lower(hex(randomblob(16))) generates 32-character hex strings unique enough for backfill
UPDATE "invoices" SET "verificationUuid" = lower(hex(randomblob(16))) WHERE "verificationUuid" IS NULL;

-- CreateIndex: after backfill to prevent duplicate value conflicts
CREATE UNIQUE INDEX "invoices_verificationUuid_key" ON "invoices"("verificationUuid");
