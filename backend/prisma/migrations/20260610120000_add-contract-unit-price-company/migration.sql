-- AlterTable: add unitName, price, companyName to contracts
ALTER TABLE "contracts" ADD COLUMN "unitName" TEXT;
ALTER TABLE "contracts" ADD COLUMN "price" REAL;
ALTER TABLE "contracts" ADD COLUMN "companyName" TEXT;
