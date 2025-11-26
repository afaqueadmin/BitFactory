/*
  Warnings:

  - You are about to drop the column `createdAt` on the `electricity_rates` table. All the data in the column will be lost.
  - You are about to drop the column `ratePerKwh` on the `electricity_rates` table. All the data in the column will be lost.
  - You are about to drop the column `validFrom` on the `electricity_rates` table. All the data in the column will be lost.
  - Made the column `consumption` on table `cost_payments` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `rate_per_kwh` to the `electricity_rates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `valid_from` to the `electricity_rates` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."electricity_rates_valid_from_idx";

-- AlterTable
ALTER TABLE "public"."cost_payments" ALTER COLUMN "consumption" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."electricity_rates" DROP COLUMN "createdAt",
DROP COLUMN "ratePerKwh",
DROP COLUMN "validFrom",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rate_per_kwh" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "valid_from" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "electricity_rates_valid_from_idx" ON "public"."electricity_rates"("valid_from");
