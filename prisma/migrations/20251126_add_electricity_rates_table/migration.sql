-- CreateTable
CREATE TABLE "public"."electricity_rates" (
    "id" TEXT NOT NULL,
    "ratePerKwh" DOUBLE PRECISION NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electricity_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "electricity_rates_valid_from_idx" ON "public"."electricity_rates"("validFrom");

