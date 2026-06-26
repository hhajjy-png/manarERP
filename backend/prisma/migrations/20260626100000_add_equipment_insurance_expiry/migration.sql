-- AlterTable
ALTER TABLE "equipment" ADD COLUMN "insuranceExpiry" DATETIME;

-- CreateIndex
CREATE INDEX "equipment_insuranceExpiry_idx" ON "equipment"("insuranceExpiry");
