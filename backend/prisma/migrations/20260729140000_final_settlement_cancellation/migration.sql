-- Final Settlement Correction & Reversal v1 — additive and non-destructive.
--
-- Adds cancellation fields and replaces the "one settlement per employee" constraint with
-- "one ACTIVE settlement per employee". No row is deleted, no column is dropped or
-- retyped, and the previous migration is left untouched.

-- AddColumn: cancellation is a terminal lifecycle state, never a delete. The snapshot,
-- approval fields, and payment rows all survive cancellation untouched; these three
-- columns only record who cancelled, when, and why.
ALTER TABLE "employee_final_settlements" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "employee_final_settlements" ADD COLUMN "cancelledBy" INTEGER;
ALTER TABLE "employee_final_settlements" ADD COLUMN "cancellationReason" TEXT;

-- DropIndex: the original UNIQUE(employeeId) encoded "one settlement per employee, ever",
-- which makes historical cancelled settlements impossible. It is replaced below by a
-- narrower constraint. Dropping an index removes no data.
DROP INDEX "employee_final_settlements_employeeId_key";

-- CreateIndex: the invariant we actually want — at most one NON-CANCELLED settlement per
-- employee, with unlimited cancelled history alongside it.
--
-- Why raw SQL: this is a PARTIAL unique index. Prisma's schema language has no syntax for
-- an index with a WHERE clause, so it cannot be expressed in schema.prisma and must live
-- here. SQLite has supported partial indexes since 3.8.0, so no emulation is needed.
--
-- Consequence to be aware of: because Prisma does not know about this index, a future
-- `prisma migrate dev` may report drift and offer to drop it. Keep it — the application's
-- one-active-settlement guarantee depends on it, not just on service-layer checks. The
-- plain (non-unique) employeeId index below IS declared in schema.prisma, so Prisma's
-- model of the table stays consistent for everything else.
CREATE UNIQUE INDEX "employee_final_settlements_active_employee_key"
ON "employee_final_settlements"("employeeId")
WHERE "status" <> 'CANCELLED';

-- CreateIndex: ordinary lookup index for reading an employee's settlement history.
CREATE INDEX "employee_final_settlements_employeeId_idx" ON "employee_final_settlements"("employeeId");
