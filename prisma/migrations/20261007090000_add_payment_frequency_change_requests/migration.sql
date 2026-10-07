-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FREQUENCY_CHANGE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FREQUENCY_CHANGE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FREQUENCY_CHANGE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FREQUENCY_CHANGE_REJECTED';

-- CreateTable
CREATE TABLE "payment_frequency_change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BTC',
    "subaccountName" TEXT NOT NULL,
    "currentFrequency" TEXT,
    "currentDayOfWeek" TEXT,
    "requestedFrequency" TEXT NOT NULL,
    "requestedDayOfWeek" TEXT,
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

    CONSTRAINT "payment_frequency_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_frequency_change_requests_userId_idx" ON "payment_frequency_change_requests"("userId");

-- CreateIndex
CREATE INDEX "payment_frequency_change_requests_status_idx" ON "payment_frequency_change_requests"("status");

-- CreateIndex
CREATE INDEX "payment_frequency_change_requests_subaccountName_idx" ON "payment_frequency_change_requests"("subaccountName");

-- AddForeignKey
ALTER TABLE "payment_frequency_change_requests" ADD CONSTRAINT "payment_frequency_change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_frequency_change_requests" ADD CONSTRAINT "payment_frequency_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_frequency_change_requests" ADD CONSTRAINT "payment_frequency_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

