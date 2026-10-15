-- AlterTable
ALTER TABLE "wallet_change_requests" ADD COLUMN     "requestedByEmail" TEXT,
ADD COLUMN     "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payment_frequency_change_requests" ADD COLUMN     "requestedByEmail" TEXT,
ADD COLUMN     "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false;
