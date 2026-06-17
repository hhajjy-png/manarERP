-- AddColumn: paymentMethod to Invoice (GL routing for purchase invoices)
-- Default NULL — existing invoices have no GL payment method preference
-- For purchase invoices: CASH | BANK | ACCOUNTS_PAYABLE (GL routing)
-- Sales invoices ignore this field (GL routing handled separately via AR/Revenue accounts)
ALTER TABLE "invoices" ADD COLUMN "paymentMethod" TEXT;
