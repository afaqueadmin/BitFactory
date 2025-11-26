-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "walletAddress" TEXT;

-- Add constraint: walletAddress must be between 26 and 35 characters (alphanumeric)
ALTER TABLE "public"."users" ADD CONSTRAINT "walletAddress_length_check"
  CHECK (
    "walletAddress" IS NULL OR
    (LENGTH("walletAddress") >= 26 AND LENGTH("walletAddress") <= 70)
  );

