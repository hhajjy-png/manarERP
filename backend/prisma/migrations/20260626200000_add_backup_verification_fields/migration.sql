-- AlterTable: add backup verification fields
ALTER TABLE "backups" ADD COLUMN "checksumSha256" TEXT;
ALTER TABLE "backups" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "backups" ADD COLUMN "verificationStatus" TEXT;
ALTER TABLE "backups" ADD COLUMN "verificationNote" TEXT;
