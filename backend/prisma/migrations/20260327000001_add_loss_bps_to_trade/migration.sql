-- Add buyerLossBps and sellerLossBps columns to Trade table.
-- These store the agreed loss-sharing basis points (0–10000) for each party,
-- defaulting to 5000 (50/50) for existing rows.
ALTER TABLE "Trade"
  ADD COLUMN "buyerLossBps"  INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "sellerLossBps" INTEGER NOT NULL DEFAULT 5000;

-- Issue #370: rename amountUsdc to an asset-agnostic amount + assetCode.
-- Step 1 of a zero-downtime two-step migration: add the new columns
-- alongside the legacy "amountUsdc" column (dropped in a follow-up
-- migration once all readers/writers have switched over).
ALTER TABLE "Trade"
  ADD COLUMN "amount"    DECIMAL(20, 7),
  ADD COLUMN "assetCode" TEXT;

-- Backfill the asset-agnostic amount from the legacy column.
UPDATE "Trade"
  SET "amount" = "amountUsdc"
  WHERE "amount" IS NULL;

-- Backfill assetCode from the configured settlement asset (cNGN).
UPDATE "Trade"
  SET "assetCode" = 'cNGN'
  WHERE "assetCode" IS NULL;

-- Enforce NOT NULL now that every row has been backfilled.
ALTER TABLE "Trade"
  ALTER COLUMN "amount"    SET NOT NULL,
  ALTER COLUMN "assetCode" SET NOT NULL;
