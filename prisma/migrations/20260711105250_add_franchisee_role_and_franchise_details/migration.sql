-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FRANCHISEE';

-- AlterTable
ALTER TABLE "franchises" DROP COLUMN "location",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "franchiseCode" TEXT NOT NULL,
ADD COLUMN     "postalCode" TEXT NOT NULL,
ADD COLUMN     "state" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "franchiseeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "franchises_franchiseCode_key" ON "franchises"("franchiseCode");

-- CreateIndex
CREATE INDEX "franchises_createdById_idx" ON "franchises"("createdById");

-- CreateIndex
CREATE INDEX "users_franchiseeId_idx" ON "users"("franchiseeId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_franchiseeId_fkey" FOREIGN KEY ("franchiseeId") REFERENCES "franchises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
