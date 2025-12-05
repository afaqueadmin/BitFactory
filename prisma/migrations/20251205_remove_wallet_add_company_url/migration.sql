-- Migration: Remove walletAddress and add companyUrl
-- Generated: 2025-12-05
-- Migration Lock: see migration_lock.toml

-- Remove walletAddress column
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "walletAddress";

-- Add companyUrl column (nullable TEXT)
ALTER TABLE "public"."users" ADD COLUMN "companyUrl" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "public"."users"."companyUrl" IS 'Company URL for user profile. Wallet addresses now managed via Luxor API only.';
