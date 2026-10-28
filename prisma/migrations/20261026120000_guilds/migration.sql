-- CreateEnum
CREATE TYPE "GuildDistributionStatus" AS ENUM ('CALCULATED', 'HELD', 'QUEUED', 'BROADCAST', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "GuildPayoutMethod" AS ENUM ('MANUAL', 'MULTISIG_BTC');

-- CreateEnum
CREATE TYPE "GuildFeePayer" AS ENUM ('HIGGS', 'HOSTING_SHARE', 'GUILD_REWARD');

-- CreateEnum
CREATE TYPE "GuildPayoutBatchStatus" AS ENUM ('BUILDING', 'BROADCAST', 'CONFIRMED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'GUILDMASTER';
ALTER TYPE "Role" ADD VALUE 'GUILDMEMBER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'GUILD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_HANDOVER';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_WALLET_CHANGE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_WALLET_CHANGE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_WALLET_CHANGE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_WALLET_CHANGE_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_SPLIT_CHANGE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_SPLIT_CHANGE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_SPLIT_CHANGE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_SPLIT_CHANGE_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_DISTRIBUTION_CALCULATED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_DISTRIBUTION_SETTLED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_PAYOUT_BATCH_CREATED';

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guildmasterId" TEXT NOT NULL,
    "poolAuthId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "splitUpdatedAt" TIMESTAMP(3),
    "payoutAddress" TEXT,
    "payoutAddressIndex" INTEGER,
    "payoutMethod" "GuildPayoutMethod",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_memberships" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isGuildmaster" BOOLEAN NOT NULL DEFAULT false,
    "rewardPercent" DECIMAL(7,4) NOT NULL,
    "walletAddress" TEXT,
    "walletNetwork" TEXT NOT NULL DEFAULT 'BTC',
    "walletUpdatedAt" TIMESTAMP(3),
    "carriedBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "guild_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_wallet_change_requests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByEmail" TEXT,
    "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false,
    "network" TEXT NOT NULL DEFAULT 'BTC',
    "currentAddress" TEXT,
    "requestedAddress" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" TEXT,
    "confirmationContact" TEXT,
    "confirmationNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_wallet_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_split_change_requests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByEmail" TEXT,
    "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" TEXT,
    "confirmationContact" TEXT,
    "confirmationNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_split_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_split_change_request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "currentPercent" DECIMAL(7,4) NOT NULL,
    "requestedPercent" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "guild_split_change_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_payout_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "feePayer" "GuildFeePayer" NOT NULL DEFAULT 'HIGGS',
    "minPayoutSats" INTEGER NOT NULL DEFAULT 10000,
    "minConfirmations" INTEGER NOT NULL DEFAULT 3,
    "defaultPayoutMethod" "GuildPayoutMethod" NOT NULL DEFAULT 'MANUAL',
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "companyWalletAddress" TEXT,
    "walletDescriptor" TEXT,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "nextAddressIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_payout_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_payout_batches" (
    "id" TEXT NOT NULL,
    "method" "GuildPayoutMethod" NOT NULL,
    "status" "GuildPayoutBatchStatus" NOT NULL DEFAULT 'BUILDING',
    "txid" TEXT,
    "feeBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "feeRateSatVb" DECIMAL(10,2),
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "companyBtc" DECIMAL(20,8) NOT NULL,
    "paidBtc" DECIMAL(20,8) NOT NULL,
    "error" TEXT,
    "createdById" TEXT,
    "broadcastAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_distributions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "rewardMonth" DATE NOT NULL,
    "payoutTransactionId" TEXT,
    "payoutOccurredAt" TIMESTAMP(3) NOT NULL,
    "luxorPayoutBtc" DECIMAL(20,8) NOT NULL,
    "receivedTxid" TEXT,
    "receivedVout" INTEGER,
    "receivedBtc" DECIMAL(20,8),
    "btcUsdRate" DECIMAL(12,2) NOT NULL,
    "rateSource" TEXT NOT NULL,
    "hostingDueUsd" DECIMAL(12,2) NOT NULL,
    "companyBtc" DECIMAL(20,8) NOT NULL,
    "companyUsd" DECIMAL(12,2) NOT NULL,
    "netBtc" DECIMAL(20,8) NOT NULL,
    "networkFeeBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "shortfallUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hostingAllocations" JSONB NOT NULL,
    "status" "GuildDistributionStatus" NOT NULL DEFAULT 'CALCULATED',
    "holdReason" TEXT,
    "shortfallNotifiedAt" TIMESTAMP(3),
    "payoutBatchId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_distribution_lines" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "isGuildmaster" BOOLEAN NOT NULL,
    "percentSnapshot" DECIMAL(7,4) NOT NULL,
    "walletSnapshot" TEXT,
    "networkSnapshot" TEXT NOT NULL DEFAULT 'BTC',
    "btcAmount" DECIMAL(20,8) NOT NULL,
    "carriedInBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "paidBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "carriedOutBtc" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "carryReason" TEXT,
    "payoutVout" INTEGER,

    CONSTRAINT "guild_distribution_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guilds_guildmasterId_key" ON "guilds"("guildmasterId");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_poolAuthId_key" ON "guilds"("poolAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_payoutAddress_key" ON "guilds"("payoutAddress");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_payoutAddressIndex_key" ON "guilds"("payoutAddressIndex");

-- CreateIndex
CREATE INDEX "guilds_isActive_idx" ON "guilds"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "guild_memberships_userId_key" ON "guild_memberships"("userId");

-- CreateIndex
CREATE INDEX "guild_memberships_guildId_idx" ON "guild_memberships"("guildId");

-- CreateIndex
CREATE INDEX "guild_wallet_change_requests_guildId_idx" ON "guild_wallet_change_requests"("guildId");

-- CreateIndex
CREATE INDEX "guild_wallet_change_requests_membershipId_idx" ON "guild_wallet_change_requests"("membershipId");

-- CreateIndex
CREATE INDEX "guild_wallet_change_requests_status_idx" ON "guild_wallet_change_requests"("status");

-- CreateIndex
CREATE INDEX "guild_split_change_requests_guildId_idx" ON "guild_split_change_requests"("guildId");

-- CreateIndex
CREATE INDEX "guild_split_change_requests_status_idx" ON "guild_split_change_requests"("status");

-- CreateIndex
CREATE INDEX "guild_split_change_request_lines_membershipId_idx" ON "guild_split_change_request_lines"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_split_change_request_lines_requestId_membershipId_key" ON "guild_split_change_request_lines"("requestId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_payout_batches_txid_key" ON "guild_payout_batches"("txid");

-- CreateIndex
CREATE INDEX "guild_payout_batches_status_idx" ON "guild_payout_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "guild_distributions_payoutTransactionId_key" ON "guild_distributions"("payoutTransactionId");

-- CreateIndex
CREATE INDEX "guild_distributions_status_idx" ON "guild_distributions"("status");

-- CreateIndex
CREATE INDEX "guild_distributions_payoutBatchId_idx" ON "guild_distributions"("payoutBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_distributions_guildId_rewardMonth_key" ON "guild_distributions"("guildId", "rewardMonth");

-- CreateIndex
CREATE UNIQUE INDEX "guild_distributions_receivedTxid_receivedVout_key" ON "guild_distributions"("receivedTxid", "receivedVout");

-- CreateIndex
CREATE INDEX "guild_distribution_lines_userId_idx" ON "guild_distribution_lines"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_distribution_lines_distributionId_membershipId_key" ON "guild_distribution_lines"("distributionId", "membershipId");

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_guildmasterId_fkey" FOREIGN KEY ("guildmasterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_poolAuthId_fkey" FOREIGN KEY ("poolAuthId") REFERENCES "pool_auths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_change_requests" ADD CONSTRAINT "guild_wallet_change_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_change_requests" ADD CONSTRAINT "guild_wallet_change_requests_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "guild_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_change_requests" ADD CONSTRAINT "guild_wallet_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_change_requests" ADD CONSTRAINT "guild_wallet_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wallet_change_requests" ADD CONSTRAINT "guild_wallet_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_requests" ADD CONSTRAINT "guild_split_change_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_requests" ADD CONSTRAINT "guild_split_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_requests" ADD CONSTRAINT "guild_split_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_requests" ADD CONSTRAINT "guild_split_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_request_lines" ADD CONSTRAINT "guild_split_change_request_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "guild_split_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_split_change_request_lines" ADD CONSTRAINT "guild_split_change_request_lines_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "guild_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_settings" ADD CONSTRAINT "guild_payout_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_payout_batches" ADD CONSTRAINT "guild_payout_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distributions" ADD CONSTRAINT "guild_distributions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distributions" ADD CONSTRAINT "guild_distributions_payoutTransactionId_fkey" FOREIGN KEY ("payoutTransactionId") REFERENCES "pool_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distributions" ADD CONSTRAINT "guild_distributions_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "guild_payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distribution_lines" ADD CONSTRAINT "guild_distribution_lines_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "guild_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distribution_lines" ADD CONSTRAINT "guild_distribution_lines_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "guild_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_distribution_lines" ADD CONSTRAINT "guild_distribution_lines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

