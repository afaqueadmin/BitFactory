-- AlterTable
ALTER TABLE "group_subaccounts" ADD COLUMN     "addedByUserId" TEXT,
ADD COLUMN     "poolAuthId" TEXT;

-- CreateIndex
CREATE INDEX "group_subaccounts_poolAuthId_idx" ON "group_subaccounts"("poolAuthId");

-- AddForeignKey
ALTER TABLE "group_subaccounts" ADD CONSTRAINT "group_subaccounts_poolAuthId_fkey" FOREIGN KEY ("poolAuthId") REFERENCES "pool_auths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_subaccounts" ADD CONSTRAINT "group_subaccounts_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

