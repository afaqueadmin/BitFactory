-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('PAYMENT', 'ELECTRICITY_CHARGES');

-- CreateTable
CREATE TABLE "public"."cost_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "consumption" DOUBLE PRECISION,
    "type" "public"."PaymentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_payments_userId_idx" ON "public"."cost_payments"("userId");

-- AddForeignKey
ALTER TABLE "public"."cost_payments" ADD CONSTRAINT "cost_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
