-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'CONFIRMED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'WALLET_CHANGE_CONFIRMED';

-- AlterTable
ALTER TABLE "wallet_change_requests" DROP COLUMN "appliedAt",
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationMethod" TEXT,
ADD COLUMN     "confirmationContact" TEXT,
ADD COLUMN     "confirmationNote" TEXT;

-- AddForeignKey
ALTER TABLE "wallet_change_requests" ADD CONSTRAINT "wallet_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
