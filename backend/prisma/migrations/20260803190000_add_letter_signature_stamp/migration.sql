-- Letter Engine — P7: signature and stamp selection
--
-- ADDITIVE ONLY. Two nullable columns on an existing table. Nothing is dropped,
-- altered, renamed or back-filled, and no other table is touched.
--
-- These hold an ASSET ID from the existing branding registry (`print.signatures` /
-- `print.stamps` in the Setting table), never an image and never a copy of one. The
-- reasons are worth stating because the alternative is tempting:
--
--   · An image column would duplicate branding infrastructure the ERP already has,
--     which INV/P7 both forbid.
--   · An id keeps one source of truth: re-uploading the General Manager's signature in
--     Settings updates every draft that references it, with no migration and no stale
--     copies scattered across letters.
--   · What was actually PRINTED is preserved separately, frozen into the registration
--     snapshot at the moment of registration. So a later change to the asset cannot
--     rewrite history, and a draft still tracks the current asset. Both properties are
--     required, and only this split delivers both.
--
-- NULL means "none selected", which is a legitimate and common state: a letter may be
-- issued with no signature, with a signature, or with a signature and a stamp.

-- AlterTable
ALTER TABLE "letters" ADD COLUMN "signatureAssetId" TEXT;

-- AlterTable
ALTER TABLE "letters" ADD COLUMN "stampAssetId" TEXT;
