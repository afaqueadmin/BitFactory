-- CreateEnum
CREATE TYPE "GuildWalletCoinSource" AS ENUM ('LUXOR', 'CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "GuildWalletCoinStatus" AS ENUM ('UNCONFIRMED', 'AVAILABLE', 'RESERVED', 'SPENT');

-- AlterEnum

ALTER TYPE "GuildPayoutBatchStatus" ADD VALUE 'AWAITING_SIGNATURE';
ALTER TYPE "GuildPayoutBatchStatus" ADD VALUE 'CANCELLED';

-- AlterEnum

ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_WALLET_CONFIGURED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_APPROVERS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_PREPARED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_BROADCAST';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_CANCELLED';

-- AlterTable
ALTER TABLE "guild_payout_settings" ADD COLUMN     "appKeyEncrypted" TEXT,
ADD COLUMN     "maxFeeRateSatVb" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "guild_payout_batches" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "psbt" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedById" TEXT,
ADD COLUMN     "signerDevice" TEXT;

-- CreateTable
CREATE TABLE "guild_wallet_coins" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "vout" INTEGER NOT NULL,
    "sats" BIGINT NOT NULL,
    "address" TEXT NOT NULL,
    "branch" INTEGER NOT NULL,
    "addressIndex" INTEGER NOT NULL,
    "source" "GuildWalletCoinSource" NOT NULL,
    "status" "GuildWalletCoinStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "blockHeight" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "poolTransactionId" TEXT,
    "reservedByBatchId" TEXT,
    "spentByBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_wallet_coins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_payout_approvers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_payout_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_wallet_coins_guildId_status_idx" ON "guild_wallet_coins"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guild_wallet_coins_txid_vout_key" ON "guild_wallet_coins"("txid", "vout");

-- CreateIndex
CREATE UNIQUE INDEX "guild_payout_approvers_userId_key" ON "guild_payout_approvers"("userId");

-- CreateIndex
CREATE INDEX "guild_payout_batches_guildId_idx" ON "guild_payout_batches"("guildId");

-- AddForeignKey
ALTER TABLE "guild_payout_batches" ADD CONSTRAINT "guild_payout_batches_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_batches" ADD CONSTRAINT "guild_payout_batches_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_batches" ADD CONSTRAINT "guild_payout_batches_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_coins" ADD CONSTRAINT "guild_wallet_coins_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_coins" ADD CONSTRAINT "guild_wallet_coins_poolTransactionId_fkey" FOREIGN KEY ("poolTransactionId") REFERENCES "pool_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_coins" ADD CONSTRAINT "guild_wallet_coins_reservedByBatchId_fkey" FOREIGN KEY ("reservedByBatchId") REFERENCES "guild_payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_coins" ADD CONSTRAINT "guild_wallet_coins_spentByBatchId_fkey" FOREIGN KEY ("spentByBatchId") REFERENCES "guild_payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_approvers" ADD CONSTRAINT "guild_payout_approvers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_approvers" ADD CONSTRAINT "guild_payout_approvers_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

