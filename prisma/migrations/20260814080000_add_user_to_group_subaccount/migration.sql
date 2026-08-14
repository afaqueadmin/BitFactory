-- AlterTable
ALTER TABLE "group_subaccounts" ALTER COLUMN "subaccountName" DROP NOT NULL;
ALTER TABLE "group_subaccounts" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "group_subaccounts_userId_idx" ON "group_subaccounts"("userId");

-- AddForeignKey
ALTER TABLE "group_subaccounts" ADD CONSTRAINT "group_subaccounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
