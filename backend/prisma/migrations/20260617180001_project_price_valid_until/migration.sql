-- Add validUntil (agreement expiry) to ProjectPrice
ALTER TABLE "project_prices" ADD COLUMN "validUntil" DATETIME;
