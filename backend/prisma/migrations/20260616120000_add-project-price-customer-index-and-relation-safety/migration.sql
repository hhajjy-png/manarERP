-- Fix column name from customer_id to customerId, add FK constraint with onDelete: Restrict
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_project_prices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asphaltPlant" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contractLocation" TEXT NOT NULL,
    "contractUnit" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "customerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "project_prices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_project_prices" ("id", "asphaltPlant", "companyName", "contractLocation", "contractUnit", "unitPrice", "isArchived", "customerId", "createdAt", "updatedAt")
SELECT "id", "asphaltPlant", "companyName", "contractLocation", "contractUnit", "unitPrice", "isArchived", "customer_id", "createdAt", "updatedAt"
FROM "project_prices";

DROP TABLE "project_prices";
ALTER TABLE "new_project_prices" RENAME TO "project_prices";

CREATE INDEX "project_prices_isArchived_idx" ON "project_prices"("isArchived");
CREATE INDEX "project_prices_asphaltPlant_idx" ON "project_prices"("asphaltPlant");
CREATE INDEX "project_prices_companyName_idx" ON "project_prices"("companyName");
CREATE INDEX "project_prices_customerId_idx" ON "project_prices"("customerId");

PRAGMA foreign_keys=ON;
