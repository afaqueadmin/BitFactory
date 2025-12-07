-- CreateTable
CREATE TABLE "public"."miner_rate_history" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "rate_per_kwh" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miner_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_rate_history_minerId_idx" ON "public"."miner_rate_history"("minerId");

-- CreateIndex
CREATE INDEX "miner_rate_history_minerId_createdAt_idx" ON "public"."miner_rate_history"("minerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."miner_rate_history" ADD CONSTRAINT "miner_rate_history_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "public"."miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
