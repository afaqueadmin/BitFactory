-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('HARDWARE_SALE', 'OWN_MACHINE_HOSTING_REBATE', 'CLIENT_HOSTING_COMMISSION');

-- CreateEnum
CREATE TYPE "IncentiveRateBasis" AS ENUM ('FLAT_PER_UNIT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "IncentiveEntryStatus" AS ENUM ('ACCRUED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_RATE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_RATE_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_ACCRUED';
ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_CLAWBACK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INCENTIVE_PAYOUT_CREATED';

-- CreateTable
CREATE TABLE "franchise_incentive_rates" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "incentiveType" "IncentiveType" NOT NULL,
    "rateBasis" "IncentiveRateBasis",
    "flatAmount" DECIMAL(12,2),
    "percentage" DECIMAL(5,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "franchise_incentive_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incentive_entries" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "incentiveType" "IncentiveType" NOT NULL,
    "rateId" TEXT,
    "sourceInvoiceId" TEXT,
    "sourceInvoiceNumber" TEXT NOT NULL,
    "clientUserId" TEXT,
    "basisAmount" DECIMAL(12,2) NOT NULL,
    "rateApplied" DECIMAL(12,4) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "IncentiveEntryStatus" NOT NULL DEFAULT 'ACCRUED',
    "accrualDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingPeriod" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "adjustsEntryId" TEXT,
    "payoutBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incentive_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incentive_payout_batches" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incentive_payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "franchise_incentive_rates_franchiseId_idx" ON "franchise_incentive_rates"("franchiseId");

-- CreateIndex
CREATE INDEX "franchise_incentive_rates_incentiveType_idx" ON "franchise_incentive_rates"("incentiveType");

-- CreateIndex
CREATE INDEX "franchise_incentive_rates_effectiveTo_idx" ON "franchise_incentive_rates"("effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "franchise_incentive_rates_franchiseId_incentiveType_effecti_key" ON "franchise_incentive_rates"("franchiseId", "incentiveType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "incentive_entries_franchiseId_idx" ON "incentive_entries"("franchiseId");

-- CreateIndex
CREATE INDEX "incentive_entries_status_idx" ON "incentive_entries"("status");

-- CreateIndex
CREATE INDEX "incentive_entries_payoutBatchId_idx" ON "incentive_entries"("payoutBatchId");

-- CreateIndex
CREATE INDEX "incentive_entries_incentiveType_idx" ON "incentive_entries"("incentiveType");

-- CreateIndex
CREATE INDEX "incentive_entries_accrualDate_idx" ON "incentive_entries"("accrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "incentive_entries_sourceInvoiceId_incentiveType_key" ON "incentive_entries"("sourceInvoiceId", "incentiveType");

-- CreateIndex
CREATE INDEX "incentive_payout_batches_franchiseId_idx" ON "incentive_payout_batches"("franchiseId");

-- CreateIndex
CREATE INDEX "incentive_payout_batches_paidDate_idx" ON "incentive_payout_batches"("paidDate");

-- AddForeignKey
ALTER TABLE "franchise_incentive_rates" ADD CONSTRAINT "franchise_incentive_rates_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_incentive_rates" ADD CONSTRAINT "franchise_incentive_rates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_incentive_rates" ADD CONSTRAINT "franchise_incentive_rates_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "franchise_incentive_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_adjustsEntryId_fkey" FOREIGN KEY ("adjustsEntryId") REFERENCES "incentive_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_entries" ADD CONSTRAINT "incentive_entries_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "incentive_payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_payout_batches" ADD CONSTRAINT "incentive_payout_batches_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incentive_payout_batches" ADD CONSTRAINT "incentive_payout_batches_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
