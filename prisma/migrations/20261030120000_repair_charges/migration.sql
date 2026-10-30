-- Repair price lists per hosting site (Brazil, Ethiopia), shown to clients at
-- /repair-charges and edited by admins at /admin/repair-charges. Seeds the
-- current price lists and the $45 hands & eyes fee for both sites.

-- CreateEnum
CREATE TYPE "RepairSite" AS ENUM ('BRAZIL', 'ETHIOPIA');

-- CreateEnum
CREATE TYPE "RepairPriceType" AS ENUM ('FIXED', 'RANGE', 'EXTERNAL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REPAIR_CHARGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REPAIR_CHARGE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'REPAIR_CHARGE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'REPAIR_SITE_SETTING_UPDATED';

-- CreateTable
CREATE TABLE "repair_charges" (
    "id" TEXT NOT NULL,
    "site" "RepairSite" NOT NULL,
    "repairType" TEXT NOT NULL,
    "priceType" "RepairPriceType" NOT NULL DEFAULT 'FIXED',
    "amount" DECIMAL(12,2),
    "amountMax" DECIMAL(12,2),
    "note" TEXT,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_site_settings" (
    "site" "RepairSite" NOT NULL,
    "handsAndEyesFee" DECIMAL(12,2) NOT NULL,
    "partsUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_site_settings_pkey" PRIMARY KEY ("site")
);

-- CreateIndex
CREATE INDEX "repair_charges_site_sortOrder_idx" ON "repair_charges"("site", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "repair_charges_site_repairType_key" ON "repair_charges"("site", "repairType");

-- Seed: site settings
INSERT INTO "repair_site_settings" ("site", "handsAndEyesFee", "partsUrl", "updatedAt") VALUES
    ('BRAZIL', 45, NULL, CURRENT_TIMESTAMP),
    ('ETHIOPIA', 45, 'https://shop.bitmain.com/en/product/parts', CURRENT_TIMESTAMP);

-- Seed: price lists
INSERT INTO "repair_charges" ("id", "site", "repairType", "priceType", "amount", "amountMax", "note", "linkUrl", "sortOrder", "updatedAt") VALUES
    (gen_random_uuid()::text, 'BRAZIL', 'Hashboard repair', 'FIXED', 120, NULL, 'Per board, flat at any chip count, maximum $199 per ASIC', NULL, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'PSU repair', 'FIXED', 120, NULL, 'Per unit', NULL, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'PSU replacement', 'RANGE', 150, 180, 'Part included; per unit, depends on model', NULL, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'TGR (thermal paste)', 'FIXED', 15, NULL, 'Includes open-device TGR, $15 per board', NULL, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'Control board reflash', 'FIXED', 10, NULL, NULL, NULL, 5, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'Control board replacement (S21 Pro/XP/+)', 'FIXED', 50, NULL, NULL, NULL, 6, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'Control board replacement (other models)', 'FIXED', 35, NULL, NULL, NULL, 7, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'Fan replacement', 'FIXED', 15, NULL, NULL, NULL, 8, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'BRAZIL', 'Diagnostics, no fault found', 'FIXED', 10, NULL, 'Not charged when the device is repaired', NULL, 9, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ETHIOPIA', 'Hashboard repair', 'FIXED', 200, NULL, NULL, NULL, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ETHIOPIA', 'PSU repair', 'FIXED', 150, NULL, NULL, NULL, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ETHIOPIA', 'Control board', 'EXTERNAL', NULL, NULL, 'According to the Bitmain official website', 'https://shop.bitmain.com/en/product/parts', 3, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ETHIOPIA', 'Return without defect', 'FIXED', 60, NULL, NULL, NULL, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ETHIOPIA', 'Fan', 'EXTERNAL', NULL, NULL, 'According to the official website fan price', 'https://shop.bitmain.com/en/product/parts', 5, CURRENT_TIMESTAMP);
