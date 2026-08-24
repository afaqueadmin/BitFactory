-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "onBehalfOfUserId" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_onBehalfOfUserId_idx" ON "support_tickets"("onBehalfOfUserId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_onBehalfOfUserId_fkey" FOREIGN KEY ("onBehalfOfUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
