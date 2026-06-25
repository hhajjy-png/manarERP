-- CreateTable: bank_statement_imports
CREATE TABLE "bank_statement_imports" (
    "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bankName"     TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "importedBy"   TEXT NOT NULL,
    "importedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromDate"     DATETIME,
    "toDate"       DATETIME,
    "totalRows"    INTEGER NOT NULL DEFAULT 0,
    "totalDebits"  REAL NOT NULL DEFAULT 0,
    "totalCredits" REAL NOT NULL DEFAULT 0,
    "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable: bank_statement_transactions
CREATE TABLE "bank_statement_transactions" (
    "id"              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId"        INTEGER NOT NULL,
    "transactionId"   TEXT,
    "bankName"        TEXT NOT NULL,
    "statementDate"   DATETIME,
    "postingDate"     DATETIME,
    "description"     TEXT NOT NULL DEFAULT '',
    "reference"       TEXT,
    "debit"           REAL NOT NULL DEFAULT 0,
    "credit"          REAL NOT NULL DEFAULT 0,
    "balance"         REAL,
    "currency"        TEXT NOT NULL DEFAULT 'KWD',
    "accountNumber"   TEXT,
    "iban"            TEXT,
    "chequeNumber"    TEXT,
    "rawRow"          TEXT NOT NULL DEFAULT '{}',
    "normalizedText"  TEXT NOT NULL DEFAULT '',
    "reconcileStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedType"     TEXT,
    "matchedId"       INTEGER,
    "matchedRef"      TEXT,
    "matchConfidence" INTEGER,
    "isDuplicate"     BOOLEAN NOT NULL DEFAULT 0,
    "isBankFee"       BOOLEAN NOT NULL DEFAULT 0,
    "bankFeeType"     TEXT,
    "errors"          TEXT NOT NULL DEFAULT '[]',
    "warnings"        TEXT NOT NULL DEFAULT '[]',
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_transactions_importId_fkey"
        FOREIGN KEY ("importId") REFERENCES "bank_statement_imports" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_statement_imports_bankName_idx"     ON "bank_statement_imports"("bankName");
CREATE INDEX "bank_statement_imports_status_idx"       ON "bank_statement_imports"("status");
CREATE INDEX "bank_statement_imports_importedAt_idx"   ON "bank_statement_imports"("importedAt");

CREATE INDEX "bank_statement_transactions_importId_idx"        ON "bank_statement_transactions"("importId");
CREATE INDEX "bank_statement_transactions_reconcileStatus_idx" ON "bank_statement_transactions"("reconcileStatus");
CREATE INDEX "bank_statement_transactions_transactionId_idx"   ON "bank_statement_transactions"("transactionId");
CREATE INDEX "bank_statement_transactions_chequeNumber_idx"    ON "bank_statement_transactions"("chequeNumber");
CREATE INDEX "bank_statement_transactions_statementDate_idx"   ON "bank_statement_transactions"("statementDate");
