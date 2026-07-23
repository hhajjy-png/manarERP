-- AlterTable bank_statement_transactions: add statementSequence
-- 1-based position of a row among the data rows of its own import file (header
-- rows excluded), in original file order. Source of truth for display order and
-- "current balance" going forward — nullable so existing rows are unaffected
-- until backfilled below.
ALTER TABLE "bank_statement_transactions" ADD COLUMN "statementSequence" INTEGER;

-- CreateIndex
CREATE INDEX "bank_statement_transactions_importId_statementSequence_idx"
ON "bank_statement_transactions"("importId", "statementSequence");

-- Backfill existing rows (imported before this column existed) safely: within
-- each import batch, approximate original file order using "id ASC" — rows
-- were inserted via createMany in original file order (see
-- bankStatementImport/service.ts execute()), so autoincrement id order is the
-- best available reconstruction of file order for historical data.
-- WHERE statementSequence IS NULL makes this idempotent and leaves any row
-- that already has a value (set by the new import path) untouched.
UPDATE "bank_statement_transactions"
SET "statementSequence" = (
  SELECT "rn"
  FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "importId" ORDER BY "id" ASC) AS "rn"
    FROM "bank_statement_transactions"
  ) AS "ranked"
  WHERE "ranked"."id" = "bank_statement_transactions"."id"
)
WHERE "statementSequence" IS NULL;
