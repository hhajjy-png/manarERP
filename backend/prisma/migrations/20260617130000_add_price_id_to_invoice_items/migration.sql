-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN "priceId" INTEGER;

-- CreateIndex
CREATE INDEX "invoice_items_priceId_idx" ON "invoice_items"("priceId");
