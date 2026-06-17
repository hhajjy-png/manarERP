-- AddColumn: paymentMethod to Expense (default CASH — backward compatible)
ALTER TABLE "expenses" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH';
