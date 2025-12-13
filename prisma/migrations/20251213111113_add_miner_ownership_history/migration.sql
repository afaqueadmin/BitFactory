-- AlterTable
ALTER TABLE "public"."miners" ALTER COLUMN "status" SET DEFAULT 'DEPLOYMENT_IN_PROGRESS';

-- CreateTable
CREATE TABLE "public"."miner_ownership_history" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miner_ownership_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_ownership_history_ownerId_idx" ON "public"."miner_ownership_history"("ownerId");

-- CreateIndex
CREATE INDEX "miner_ownership_history_createdById_idx" ON "public"."miner_ownership_history"("createdById");

-- AddForeignKey
ALTER TABLE "public"."miner_ownership_history" ADD CONSTRAINT "miner_ownership_history_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."miner_ownership_history" ADD CONSTRAINT "miner_ownership_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
