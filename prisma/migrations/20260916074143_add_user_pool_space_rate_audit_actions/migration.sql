-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MINER_RATE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'POOL_CREDENTIAL_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'POOL_CREDENTIAL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'POOL_CREDENTIAL_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'SPACE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SPACE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SPACE_DELETED';

-- AlterTable
ALTER TABLE "miner_rate_history" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "miner_rate_history_createdById_idx" ON "miner_rate_history"("createdById");

-- AddForeignKey
ALTER TABLE "miner_rate_history" ADD CONSTRAINT "miner_rate_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
