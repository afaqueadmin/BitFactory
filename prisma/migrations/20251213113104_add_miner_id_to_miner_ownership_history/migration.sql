/*
  Warnings:

  - Added the required column `minerId` to the `miner_ownership_history` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- First add minerId as nullable
ALTER TABLE "public"."miner_ownership_history" ADD COLUMN "minerId" TEXT;

-- CreateIndex
CREATE INDEX "miner_ownership_history_minerId_idx" ON "public"."miner_ownership_history"("minerId");

-- AddForeignKey
ALTER TABLE "public"."miner_ownership_history" ADD CONSTRAINT "miner_ownership_history_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "public"."miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;


