-- Employee Compensation Debt & Advances Ledger v1 — additive only.
--
-- Creates TWO new tables and adds ONE nullable column (+ its index) to a table that
-- belongs to this module alone. Nothing else is touched: no existing financial table
-- is altered, rebuilt, or migrated, and no row anywhere is changed.
--
-- ═══ Why hand-written rather than `prisma migrate diff` output ═══
-- `migrate diff` against this repository emits a full RedefineTables rebuild of a
-- dozen UNRELATED tables (bank_statement_imports, bank_statement_transactions, …).
-- That is pre-existing drift between the migration history and the datamodel, and has
-- nothing to do with this pack. Executing it would rewrite operational banking tables
-- to ship a debt ledger. This migration is therefore scoped by hand to exactly the
-- three DDL statements this feature needs — the same approach the module's first
-- migration took.
--
-- ═══ Deliberate ON DELETE semantics ═══
--   debts        → payments        : RESTRICT — a debt carrying ledger movements can
--                                    never be deleted silently; the service rejects it
--                                    with an explicit message instead (requirement 11).
--   debts        → deduction lines : RESTRICT — same guarantee from the other side.
--   calculations → payments        : CASCADE  — deleting a month must retract its
--                                    repayment, so the outstanding balance rebounds on
--                                    its own. A surviving payment would keep charging an
--                                    employee for a month that no longer exists.
--   deduction ln → payments        : SET NULL — the line pointer is a breadcrumb, not
--                                    the identity. Lines are replaced wholesale on every
--                                    save; the movement itself survives, keyed by
--                                    (calculationId, debtId).
--
-- ═══ No stored balance ═══
-- There is deliberately NO `remainingBalance`, `paidAmount`, or `status` column. The
-- balance is always derived as `originalAmount − SUM(payments.amount)`. A stored copy
-- would become a second source of truth that silently drifts from the ledger the first
-- time a write path forgets to update it.

-- CreateTable employee_compensation_debts
CREATE TABLE "employee_compensation_debts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "originalAmount" REAL NOT NULL,
    "debtDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_compensation_debts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable employee_compensation_debt_payments
CREATE TABLE "employee_compensation_debt_payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "debtId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "calculationId" INTEGER,
    "deductionLineId" INTEGER,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employee_compensation_debt_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "employee_compensation_debts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_compensation_debt_payments_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "employee_compensation_calculations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_compensation_debt_payments_deductionLineId_fkey" FOREIGN KEY ("deductionLineId") REFERENCES "employee_compensation_deduction_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- AlterTable employee_compensation_deduction_lines — one nullable FK column.
-- SQLite permits ADD COLUMN with a REFERENCES clause when the default is NULL, so no
-- table rebuild and no data copy is required. Every existing row gets NULL, i.e. "this
-- deduction is not a debt repayment" — which is exactly what every existing row is.
ALTER TABLE "employee_compensation_deduction_lines" ADD COLUMN "debtId" INTEGER REFERENCES "employee_compensation_debts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "employee_compensation_debts_employeeId_idx" ON "employee_compensation_debts"("employeeId");
CREATE INDEX "employee_compensation_debts_employeeId_debtDate_idx" ON "employee_compensation_debts"("employeeId", "debtDate");
CREATE INDEX "employee_compensation_debt_payments_debtId_idx" ON "employee_compensation_debt_payments"("debtId");
CREATE INDEX "employee_compensation_debt_payments_calculationId_idx" ON "employee_compensation_debt_payments"("calculationId");
CREATE UNIQUE INDEX "employee_compensation_debt_payments_deductionLineId_key" ON "employee_compensation_debt_payments"("deductionLineId");
-- الهوية التي تجعل تعديل استقطاع شهري idempotent: صف واحد لكل (حسبة، مديونية).
-- SQLite تعدّ الـNULL قيمًا متمايزة، فلا يقيّد هذا الفهرس السدادات اليدوية.
CREATE UNIQUE INDEX "employee_compensation_debt_payments_calculationId_debtId_key" ON "employee_compensation_debt_payments"("calculationId", "debtId");
CREATE INDEX "employee_compensation_deduction_lines_debtId_idx" ON "employee_compensation_deduction_lines"("debtId");
