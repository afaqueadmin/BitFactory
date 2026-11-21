-- Client wallets: our own record of each Luxor subaccount's payout address,
-- its history and Luxor mismatch alerts; plus lookup-hash columns next to
-- every wallet address column (addresses get encrypted - see
-- src/lib/walletCrypto.ts and scripts/encrypt-wallet-addresses.js).
-- Add-only: nothing existing is changed or dropped.

-- CreateEnum
CREATE TYPE "ClientWalletSource" AS ENUM ('INITIAL_SYNC', 'PAYOUT_HISTORY', 'CHANGE_REQUEST', 'LUXOR_ACCEPTED');

-- CreateEnum
CREATE TYPE "ClientWalletCheckStatus" AS ENUM ('MATCH', 'MISMATCH', 'LUXOR_EMPTY', 'ERROR');

-- CreateEnum
CREATE TYPE "ClientWalletMismatchStatus" AS ENUM ('OPEN', 'RESOLVED_FIXED', 'RESOLVED_ACCEPTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_SYNCED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_MISMATCH_DETECTED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_MISMATCH_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_MISMATCH_FIXED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_RECHECKED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_WALLET_HISTORY_VIEWED';

-- AlterTable
ALTER TABLE "wallet_change_requests" ADD COLUMN     "currentAddressHash" TEXT,
ADD COLUMN     "requestedAddressHash" TEXT;

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "payoutAddressHash" TEXT;

-- AlterTable
ALTER TABLE "guild_memberships" ADD COLUMN     "walletAddressHash" TEXT;

-- AlterTable
ALTER TABLE "guild_wallet_change_requests" ADD COLUMN     "currentAddressHash" TEXT,
ADD COLUMN     "requestedAddressHash" TEXT;

-- AlterTable
ALTER TABLE "guild_member_change_requests" ADD COLUMN     "newWalletAddressHash" TEXT;

-- AlterTable
ALTER TABLE "guild_distribution_lines" ADD COLUMN     "walletSnapshotHash" TEXT;

-- AlterTable
ALTER TABLE "pool_transactions" ADD COLUMN     "addressHash" TEXT;

-- CreateTable
CREATE TABLE "client_wallets" (
    "id" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "address" TEXT,
    "addressHash" TEXT,
    "source" "ClientWalletSource" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "walletChangeRequestId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckStatus" "ClientWalletCheckStatus",
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_wallet_history" (
    "id" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "address" TEXT,
    "addressHash" TEXT,
    "source" "ClientWalletSource" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "walletChangeRequestId" TEXT,
    "mismatchId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_wallet_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_wallet_mismatches" (
    "id" TEXT NOT NULL,
    "poolSubaccountId" TEXT NOT NULL,
    "expectedAddress" TEXT,
    "expectedAddressHash" TEXT,
    "luxorAddress" TEXT,
    "luxorAddressHash" TEXT,
    "status" "ClientWalletMismatchStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_wallet_mismatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_wallets_poolSubaccountId_key" ON "client_wallets"("poolSubaccountId");

-- CreateIndex
CREATE INDEX "client_wallets_addressHash_idx" ON "client_wallets"("addressHash");

-- CreateIndex
CREATE INDEX "client_wallet_history_poolSubaccountId_validFrom_idx" ON "client_wallet_history"("poolSubaccountId", "validFrom");

-- CreateIndex
CREATE INDEX "client_wallet_history_addressHash_idx" ON "client_wallet_history"("addressHash");

-- CreateIndex
CREATE INDEX "client_wallet_mismatches_status_idx" ON "client_wallet_mismatches"("status");

-- CreateIndex
CREATE INDEX "client_wallet_mismatches_poolSubaccountId_idx" ON "client_wallet_mismatches"("poolSubaccountId");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_payoutAddressHash_key" ON "guilds"("payoutAddressHash");

-- CreateIndex
CREATE INDEX "pool_transactions_addressHash_idx" ON "pool_transactions"("addressHash");

-- AddForeignKey
ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wallet_history" ADD CONSTRAINT "client_wallet_history_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wallet_history" ADD CONSTRAINT "client_wallet_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wallet_mismatches" ADD CONSTRAINT "client_wallet_mismatches_poolSubaccountId_fkey" FOREIGN KEY ("poolSubaccountId") REFERENCES "pool_subaccounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wallet_mismatches" ADD CONSTRAINT "client_wallet_mismatches_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one OPEN mismatch per subaccount (Prisma can't model a partial index).
CREATE UNIQUE INDEX "client_wallet_mismatches_open_key" ON "client_wallet_mismatches"("poolSubaccountId") WHERE "status" = 'OPEN';
