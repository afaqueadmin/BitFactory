-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'WALLET_CHANGE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'WALLET_CHANGE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'WALLET_CHANGE_REJECTED';

-- CreateTable
CREATE TABLE "wallet_change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BTC',
    "currentAddress" TEXT,
    "requestedAddress" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_change_requests_userId_idx" ON "wallet_change_requests"("userId");

-- CreateIndex
CREATE INDEX "wallet_change_requests_status_idx" ON "wallet_change_requests"("status");

-- AddForeignKey
ALTER TABLE "wallet_change_requests" ADD CONSTRAINT "wallet_change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_change_requests" ADD CONSTRAINT "wallet_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
