-- Equipment Owner Default Price — Enhancement Pack v1. Additive only.
--
-- Adds ONE nullable-safe column to an existing table. No table is created,
-- dropped, renamed, or rebuilt; no index is added or removed; no other column is
-- touched; no row is migrated or deleted.
--
-- `NOT NULL DEFAULT 0` is safe on a populated table in SQLite: the engine
-- back-fills every existing row with 0 in place, without a table rewrite. Existing
-- price agreements therefore stay valid and simply report "no default owner price
-- recorded yet" until someone fills one in.
--
-- Scope note: this column is read by the Job & Commission Analysis module only, to
-- pre-fill its editable owner-price field. Invoicing, accounting, and reporting do
-- not read it, so adding it changes no monetary calculation anywhere in the system.

-- AlterTable
ALTER TABLE "project_prices" ADD COLUMN "equipmentOwnerPrice" REAL NOT NULL DEFAULT 0;
