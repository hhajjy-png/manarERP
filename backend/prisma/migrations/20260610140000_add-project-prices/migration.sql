-- CreateTable
CREATE TABLE "project_prices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asphaltPlant" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contractLocation" TEXT NOT NULL,
    "contractUnit" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "project_prices_isArchived_idx" ON "project_prices"("isArchived");

-- CreateIndex
CREATE INDEX "project_prices_asphaltPlant_idx" ON "project_prices"("asphaltPlant");

-- CreateIndex
CREATE INDEX "project_prices_companyName_idx" ON "project_prices"("companyName");
