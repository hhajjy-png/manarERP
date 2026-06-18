-- AlterTable: add bankAccount column to employees
ALTER TABLE "employees" ADD COLUMN "bankAccount" TEXT;

-- CreateIndex
CREATE INDEX "employees_bankAccount_idx" ON "employees"("bankAccount");
