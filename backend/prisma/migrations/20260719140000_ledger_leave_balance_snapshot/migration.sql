-- AlterTable: informational-only leave-balance snapshot for Leave Allowance ledger rows
ALTER TABLE "employee_entitlement_ledger" ADD COLUMN "leaveBalanceSnapshot" REAL;
