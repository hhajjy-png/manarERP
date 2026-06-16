-- AddColumn billingMonth/billingYear/notes to expenses (nullable, non-destructive)
ALTER TABLE "expenses" ADD COLUMN "billingMonth" INTEGER;
ALTER TABLE "expenses" ADD COLUMN "billingYear" INTEGER;
ALTER TABLE "expenses" ADD COLUMN "notes" TEXT;

-- Add indexes for the new filtering columns
CREATE INDEX "expenses_billingMonth_billingYear_idx" ON "expenses"("billingMonth", "billingYear");
CREATE INDEX "expenses_supplierId_idx" ON "expenses"("supplierId");
