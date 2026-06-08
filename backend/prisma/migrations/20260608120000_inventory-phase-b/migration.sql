-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseOrderId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_order_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "purchaseOrderId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "accountingPostedAt" DATETIME,
    "accountingTransactionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "goods_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "goodsReceiptId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "goods_receipt_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_date_idx" ON "purchase_orders"("date");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_materialId_idx" ON "purchase_order_items"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");

-- CreateIndex
CREATE INDEX "goods_receipts_supplierId_idx" ON "goods_receipts"("supplierId");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "goods_receipts_date_idx" ON "goods_receipts"("date");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipt_items_goodsReceiptId_idx" ON "goods_receipt_items"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_items_materialId_idx" ON "goods_receipt_items"("materialId");
