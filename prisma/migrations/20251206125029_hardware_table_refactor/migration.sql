/*
  Warnings:

  - You are about to drop the column `hashRate` on the `miners` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `miners` table. All the data in the column will be lost.
  - You are about to drop the column `powerUsage` on the `miners` table. All the data in the column will be lost.
  - Added the required column `hardwareId` to the `miners` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Create the hardware table
CREATE TABLE "public"."hardware" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "powerUsage" DOUBLE PRECISION NOT NULL,
    "hashRate" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hardware_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create unique index on model
CREATE UNIQUE INDEX "hardware_model_key" ON "public"."hardware"("model");

-- Step 3: Insert hardware entries from existing miner data (create one entry per unique model)
INSERT INTO "public"."hardware" ("id", "model", "powerUsage", "hashRate", "createdAt", "updatedAt")
SELECT DISTINCT 
  gen_random_uuid()::text,
  "model",
  "powerUsage",
  "hashRate",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "public"."miners"
ON CONFLICT DO NOTHING;

-- Step 4: Add hardwareId column temporarily as nullable
ALTER TABLE "public"."miners" ADD COLUMN "hardwareId" TEXT;

-- Step 5: Update hardwareId for each miner to match its model's hardware
UPDATE "public"."miners" m
SET "hardwareId" = h."id"
FROM "public"."hardware" h
WHERE h."model" = m."model";

-- Step 6: Make hardwareId NOT NULL
ALTER TABLE "public"."miners" ALTER COLUMN "hardwareId" SET NOT NULL;

-- Step 7: Create index and foreign key
CREATE INDEX "miners_hardwareId_idx" ON "public"."miners"("hardwareId");

ALTER TABLE "public"."miners" ADD CONSTRAINT "miners_hardwareId_fkey" FOREIGN KEY ("hardwareId") REFERENCES "public"."hardware"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8: Drop old columns
ALTER TABLE "public"."miners" DROP COLUMN "hashRate";
ALTER TABLE "public"."miners" DROP COLUMN "model";
ALTER TABLE "public"."miners" DROP COLUMN "powerUsage";
