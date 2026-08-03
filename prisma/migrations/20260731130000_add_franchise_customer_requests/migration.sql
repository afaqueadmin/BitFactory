-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "franchise_customer_requests" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "luxorSubaccountName" TEXT NOT NULL,
    "initialDeposit" DECIMAL(12,2),
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "franchise_customer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "franchise_customer_requests_createdUserId_key" ON "franchise_customer_requests"("createdUserId");

-- CreateIndex
CREATE INDEX "franchise_customer_requests_franchiseId_idx" ON "franchise_customer_requests"("franchiseId");

-- CreateIndex
CREATE INDEX "franchise_customer_requests_status_idx" ON "franchise_customer_requests"("status");

-- CreateIndex
CREATE INDEX "franchise_customer_requests_requestedById_idx" ON "franchise_customer_requests"("requestedById");

-- AddForeignKey
ALTER TABLE "franchise_customer_requests" ADD CONSTRAINT "franchise_customer_requests_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_customer_requests" ADD CONSTRAINT "franchise_customer_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_customer_requests" ADD CONSTRAINT "franchise_customer_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_customer_requests" ADD CONSTRAINT "franchise_customer_requests_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

