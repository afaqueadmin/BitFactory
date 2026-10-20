-- CreateTable
CREATE TABLE "simulation_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sourceMinerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT 'Simulated Miner',
    "welcomeBonusUsd" DECIMAL(12,2) NOT NULL,
    "ratePerKwh" DECIMAL(10,6) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulated_cost_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "PaymentType" NOT NULL,
    "narration" TEXT,
    "chargeDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "simulated_cost_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulated_cost_payments_userId_idx" ON "simulated_cost_payments"("userId");

-- CreateIndex
CREATE INDEX "simulated_cost_payments_createdAt_idx" ON "simulated_cost_payments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "simulated_cost_payments_userId_chargeDate_key" ON "simulated_cost_payments"("userId", "chargeDate");

-- AddForeignKey
ALTER TABLE "simulation_settings" ADD CONSTRAINT "simulation_settings_sourceMinerId_fkey" FOREIGN KEY ("sourceMinerId") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_settings" ADD CONSTRAINT "simulation_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_cost_payments" ADD CONSTRAINT "simulated_cost_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_cost_payments" ADD CONSTRAINT "simulated_cost_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed the settings from the values the env vars held (SIM_DEMO_MINER_ID,
-- SIM_BONUS_USD) and the mirrored miner's current rate. Skipped if that
-- miner doesn't exist in this database.
INSERT INTO "simulation_settings" ("id", "sourceMinerId", "displayName", "welcomeBonusUsd", "ratePerKwh", "updatedAt")
SELECT 1, m."id", 'Simulated Miner', 500, 0.056, CURRENT_TIMESTAMP
FROM "miners" m
WHERE m."id" = 'cmuglfigl001pl804mxlr9o2u'
ON CONFLICT ("id") DO NOTHING;
