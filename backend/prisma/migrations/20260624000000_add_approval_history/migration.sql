-- CreateTable
CREATE TABLE "approval_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "userId" INTEGER,
    "comment" TEXT,
    "reason" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "approval_history_entityType_entityId_idx" ON "approval_history"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "approval_history_userId_idx" ON "approval_history"("userId");

-- CreateIndex
CREATE INDEX "approval_history_createdAt_idx" ON "approval_history"("createdAt");
