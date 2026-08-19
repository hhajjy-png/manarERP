-- Vehicle Insurance Management v1 (تأمين المركبات) — additive only.
--
-- Creates TWO new tables and NOTHING else. No existing table is altered, no column is
-- added / dropped / retyped, no index on an existing table is touched, and no row
-- anywhere else is migrated or deleted. Running this migration on a populated database
-- leaves every existing record byte-identical.
--
-- In particular `equipment.insuranceExpiry` (read by the Document Expiration Center) is
-- NOT touched: this module neither writes to it nor reads from it, so that screen keeps
-- behaving exactly as before.
--
-- ═══ Foreign keys ═══
--
-- Both tables carry a real FK to `equipment(id)` with ON DELETE CASCADE, mirroring the
-- existing equipment children (maintenance_records / fuel_logs / breakdowns /
-- spare_part_usages): an insurance policy or an accident has no meaning without its
-- vehicle, and force-removing a vehicle must not leave orphan rows behind.
--
-- ═══ No delete path by design ═══
--
-- Renewal creates a NEW policy row instead of mutating the previous one, and accidents
-- are a permanent historical log. The service layer exposes no DELETE route for either
-- table; both stay append-mostly history.

-- CreateTable vehicle_insurance_policies
CREATE TABLE "vehicle_insurance_policies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "coverageType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vehicle_insurance_policies_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vehicle_insurance_policies_equipmentId_idx" ON "vehicle_insurance_policies"("equipmentId");
CREATE INDEX "vehicle_insurance_policies_endDate_idx" ON "vehicle_insurance_policies"("endDate");
CREATE INDEX "vehicle_insurance_policies_insurerName_idx" ON "vehicle_insurance_policies"("insurerName");

-- CreateTable vehicle_accidents
CREATE TABLE "vehicle_accidents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "equipmentId" INTEGER NOT NULL,
    "accidentDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "repairCost" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vehicle_accidents_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vehicle_accidents_equipmentId_idx" ON "vehicle_accidents"("equipmentId");
CREATE INDEX "vehicle_accidents_accidentDate_idx" ON "vehicle_accidents"("accidentDate");
