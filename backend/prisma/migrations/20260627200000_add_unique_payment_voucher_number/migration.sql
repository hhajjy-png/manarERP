-- CreateIndex
-- SQLite allows multiple NULL values in a UNIQUE index, so existing cheques
-- without a paymentVoucherNumber are unaffected.
CREATE UNIQUE INDEX "cheques_paymentVoucherNumber_key" ON "cheques"("paymentVoucherNumber");
