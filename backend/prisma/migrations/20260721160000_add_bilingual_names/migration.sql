-- Business Dictionary Expansion Pack v1: additive bilingual name columns.
-- Nullable, no default, no backfill — existing rows remain valid unchanged.
ALTER TABLE "accounts" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "customers" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "material_categories" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "materials" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "nameEn" TEXT;
