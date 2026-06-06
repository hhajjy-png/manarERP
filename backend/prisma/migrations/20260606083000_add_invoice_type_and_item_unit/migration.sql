-- Add invoice business type and item unit fields.
ALTER TABLE "invoices" ADD COLUMN "invoiceType" TEXT NOT NULL DEFAULT 'نقل اسفلت';
ALTER TABLE "invoice_items" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'طن';
