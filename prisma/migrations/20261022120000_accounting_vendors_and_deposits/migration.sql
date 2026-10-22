-- Vendors as a table, Hardware Purchase security deposits, and deposit
-- returns / adjustments.
--
-- Steps:
--   1. accounting_vendors (Finance Settings -> Vendors). Each vendor is
--      tagged for Hardware Purchases and/or Farm Tariffs.
--   2. Seed one vendor per VendorName enum value that is actually used by a
--      hardware purchase invoice, under the label the app showed for it,
--      tagged for Hardware Purchases. createdBy is the creator of that
--      vendor's earliest invoice, so no user id is hardcoded. A database
--      with no hardware purchases seeds nothing.
--   3. hardware_purchase_invoices.vendorId: added nullable, backfilled from
--      the enum, then made NOT NULL (fails, and rolls back, if any row was
--      left unmapped).
--   4. hardware_purchase_invoices.vendorName becomes nullable. It is no
--      longer written or read.
--      TODO: drop it and the "VendorName" enum after 2026-11-21.
--   5. hardware_purchase_invoices.securityDeposit (part of totalAmount, not
--      a cost), 0 on existing rows.
--   6. vendor_invoices.vendorId (Farm Tariff), optional, empty on existing
--      rows.
--   7. vendor_deposit_movements: RETURN (cash back, one receiving account)
--      or ADJUSTMENT (applied to exactly one invoice), with CHECKs.
--   8. New AuditAction values.

-- CreateEnum
CREATE TYPE "VendorDepositMovementType" AS ENUM ('RETURN', 'ADJUSTMENT');

-- AlterEnum (the new values aren't used in this migration)
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_VENDOR_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_VENDOR_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNTING_VENDOR_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_DEPOSIT_RETURN_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_DEPOSIT_ADJUSTMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_DEPOSIT_MOVEMENT_DELETED';

-- 1. CreateTable
CREATE TABLE "accounting_vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "forHardwarePurchases" BOOLEAN NOT NULL DEFAULT false,
    "forFarmTariffs" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_vendors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_vendors_name_key" ON "accounting_vendors"("name");
CREATE INDEX "accounting_vendors_createdBy_idx" ON "accounting_vendors"("createdBy");

ALTER TABLE "accounting_vendors" ADD CONSTRAINT "accounting_vendors_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Seed vendors from the enum values in use.
WITH labels("enumValue", "name") AS (
    VALUES
        ('HASHLABS_PTE_LTD'::"VendorName", 'HashLabs Pte Ltd'),
        ('QRB_LABS'::"VendorName", 'QRB Labs'),
        ('LUXOR_TECH'::"VendorName", 'Luxor Tech')
),
firstInvoice AS (
    SELECT DISTINCT ON ("vendorName") "vendorName", "createdBy"
    FROM "hardware_purchase_invoices"
    ORDER BY "vendorName", "createdAt", "id"
)
INSERT INTO "accounting_vendors" ("id", "name", "forHardwarePurchases", "createdBy", "updatedAt")
SELECT gen_random_uuid()::text, l."name", true, f."createdBy", CURRENT_TIMESTAMP
FROM labels l
JOIN firstInvoice f ON f."vendorName" = l."enumValue";

-- 3. Hardware purchase vendorId, backfilled from the enum.
ALTER TABLE "hardware_purchase_invoices" ADD COLUMN "vendorId" TEXT;

UPDATE "hardware_purchase_invoices" h
SET "vendorId" = v."id"
FROM "accounting_vendors" v
WHERE v."name" = CASE h."vendorName"
    WHEN 'HASHLABS_PTE_LTD' THEN 'HashLabs Pte Ltd'
    WHEN 'QRB_LABS' THEN 'QRB Labs'
    WHEN 'LUXOR_TECH' THEN 'Luxor Tech'
END;

ALTER TABLE "hardware_purchase_invoices" ALTER COLUMN "vendorId" SET NOT NULL;

CREATE INDEX "hardware_purchase_invoices_vendorId_idx" ON "hardware_purchase_invoices"("vendorId");

ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "accounting_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. The enum column stays for now, unused.
ALTER TABLE "hardware_purchase_invoices" ALTER COLUMN "vendorName" DROP NOT NULL;

-- 5. Security deposit.
ALTER TABLE "hardware_purchase_invoices" ADD COLUMN "securityDeposit" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- 6. Farm Tariff vendor (optional).
ALTER TABLE "vendor_invoices" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "vendor_invoices_vendorId_idx" ON "vendor_invoices"("vendorId");

ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "accounting_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Deposit returns and adjustments.
CREATE TABLE "vendor_deposit_movements" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "VendorDepositMovementType" NOT NULL,
    "date" DATE NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "entityId" TEXT,
    "bankId" TEXT,
    "currencyId" TEXT,
    "amount" DECIMAL(18,2),
    "exchangeRate" DECIMAL(18,8),
    "transactionFee" DECIMAL(18,2),
    "receiptKey" TEXT,
    "vendorInvoiceId" TEXT,
    "hardwarePurchaseId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_deposit_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_deposit_movements_amount_check" CHECK ("amountUsd" > 0),
    -- RETURN: one receiving account and a receipt, no invoice.
    -- ADJUSTMENT: exactly one invoice, no account fields.
    CONSTRAINT "vendor_deposit_movements_type_check" CHECK (
        (
            "type" = 'RETURN'
            AND "entityId" IS NOT NULL AND "bankId" IS NOT NULL
            AND "currencyId" IS NOT NULL AND "amount" IS NOT NULL
            AND "exchangeRate" IS NOT NULL AND "transactionFee" IS NOT NULL
            AND "receiptKey" IS NOT NULL
            AND "vendorInvoiceId" IS NULL AND "hardwarePurchaseId" IS NULL
        )
        OR (
            "type" = 'ADJUSTMENT'
            AND ("vendorInvoiceId" IS NOT NULL) <> ("hardwarePurchaseId" IS NOT NULL)
            AND "entityId" IS NULL AND "bankId" IS NULL AND "currencyId" IS NULL
            AND "amount" IS NULL AND "exchangeRate" IS NULL
            AND "transactionFee" IS NULL AND "receiptKey" IS NULL
        )
    )
);

CREATE INDEX "vendor_deposit_movements_vendorId_idx" ON "vendor_deposit_movements"("vendorId");
CREATE INDEX "vendor_deposit_movements_vendorInvoiceId_idx" ON "vendor_deposit_movements"("vendorInvoiceId");
CREATE INDEX "vendor_deposit_movements_hardwarePurchaseId_idx" ON "vendor_deposit_movements"("hardwarePurchaseId");
CREATE INDEX "vendor_deposit_movements_entityId_idx" ON "vendor_deposit_movements"("entityId");
CREATE INDEX "vendor_deposit_movements_bankId_idx" ON "vendor_deposit_movements"("bankId");
CREATE INDEX "vendor_deposit_movements_currencyId_idx" ON "vendor_deposit_movements"("currencyId");

ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "accounting_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_vendorInvoiceId_fkey" FOREIGN KEY ("vendorInvoiceId") REFERENCES "vendor_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_hardwarePurchaseId_fkey" FOREIGN KEY ("hardwarePurchaseId") REFERENCES "hardware_purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_deposit_movements" ADD CONSTRAINT "vendor_deposit_movements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
