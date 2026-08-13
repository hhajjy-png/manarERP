-- Invoice Items Foreign Key Reconciliation Pack v1
--
-- الغرض: إضافة المفتاح الأجنبي invoice_items.priceId → project_prices.id
-- (ON DELETE RESTRICT / ON UPDATE CASCADE) الذي يعلنه schema.prisma منذ إضافة
-- العلاقة `price ProjectPrice?` ولم تُنشئه أي مهاجرة قط.
--
-- السبب الجذري: المهاجرة اليدوية 20260617130000_add_price_id_to_invoice_items
-- استخدمت `ALTER TABLE invoice_items ADD COLUMN "priceId" INTEGER` — وSQLite
-- **لا يستطيع** إضافة قيد مفتاح أجنبي عبر ALTER TABLE (يتطلب إعادة بناء الجدول).
-- فأُنشئ العمود والفهرس دون القيد، وظل `migrate diff` يقترح إعادة البناء إلى الأبد.
--
-- لماذا إعادة بناء الجدول آمنة هنا (مُتحقَّق منه قبل التنفيذ، لا افتراضًا):
--   • 159 صفًا، جميعها priceId = NULL — والقيم الفارغة لا تُخالف أي مفتاح أجنبي.
--   • 0 صفوف يتيمة على priceId و0 على invoiceId (فحص LEFT JOIN).
--   • integrity_check = ok و foreign_key_check فارغ قبل التنفيذ.
--   • لا جدول آخر يشير إلى invoice_items، ولا triggers ولا views عليه.
--   • الفهرسان الموجودان (invoiceId, priceId) يُعاد إنشاؤهما أدناه حرفيًا.
--   • تسلسل AUTOINCREMENT يُحفَظ: الإدراج يمرّر المعرّفات صراحةً (12…218).
--
-- SQL أدناه مُولَّد حرفيًا بـ `prisma migrate diff --from-migrations
-- --to-schema-datamodel --script` ولم يُعدَّل منه حرف واحد.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_invoice_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'طن',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "priceId" INTEGER,
    CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoice_items_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "project_prices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_invoice_items" ("description", "id", "invoiceId", "priceId", "quantity", "total", "unit", "unitPrice") SELECT "description", "id", "invoiceId", "priceId", "quantity", "total", "unit", "unitPrice" FROM "invoice_items";
DROP TABLE "invoice_items";
ALTER TABLE "new_invoice_items" RENAME TO "invoice_items";
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");
CREATE INDEX "invoice_items_priceId_idx" ON "invoice_items"("priceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

