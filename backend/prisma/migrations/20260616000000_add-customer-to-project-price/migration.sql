-- AlterTable
ALTER TABLE "project_prices" ADD COLUMN "customer_id" INTEGER;

-- CreateIndex
CREATE INDEX "project_prices_customer_id_idx" ON "project_prices"("customer_id");
