-- Multi-currency vendor-side payments (Farm Tariff + Hardware Purchase).
--
-- A payment used to be one Entity -> Bank -> Currency, rate and amount
-- stored on the invoice row itself (vendor_invoices / hardware_purchase_
-- invoices: paymentEntityId, paymentBankId, paymentCurrencyId,
-- paymentAmount, paymentExchangeRate, paymentAmountUsd, transactionFee).
-- It is now one or more rows in vendor_payment_parts, each with its own
-- entity, bank, currency, rate, amount and fee, e.g. 5 USD + 10 AED at 2
-- for a 10 USD invoice.
--
-- Steps:
--   1. Create vendor_payment_parts with its indexes and foreign keys.
--   2. CHECK that every part belongs to exactly one invoice (Farm Tariff or
--      Hardware Purchase, never both or neither).
--   3. Backfill: copy each invoice's legacy payment columns into one part
--      (sortOrder 0), so the app reads payment details from the parts
--      only. Invoices with no recorded payment details (paid before
--      payment accounts existed, still Pending, or Cancelled) are skipped:
--      every one of entity, bank, currency, amount and rate must be set.
--      A missing paymentAmountUsd is recomputed as amount / rate; a
--      missing fee becomes 0.
--
-- The legacy columns are NOT dropped here. The app stops writing and
-- reading them, but they stay in place for 30 days as a fallback while
-- the new flow is in use.
-- TODO: drop the 7 legacy payment columns on both tables (and their
-- indexes and foreign keys) after 2026-11-19 if nothing breaks.
-- paymentReceiptKey stays: one receipt PDF covers every part.

-- CreateTable
CREATE TABLE "vendor_payment_parts" (
    "id" TEXT NOT NULL,
    "vendorInvoiceId" TEXT,
    "hardwarePurchaseId" TEXT,
    "entityId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "transactionFee" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payment_parts_pkey" PRIMARY KEY ("id"),
    -- Exactly one parent invoice per part.
    CONSTRAINT "vendor_payment_parts_one_parent_check" CHECK (
        ("vendorInvoiceId" IS NOT NULL) <> ("hardwarePurchaseId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "vendor_payment_parts_vendorInvoiceId_idx" ON "vendor_payment_parts"("vendorInvoiceId");

-- CreateIndex
CREATE INDEX "vendor_payment_parts_hardwarePurchaseId_idx" ON "vendor_payment_parts"("hardwarePurchaseId");

-- CreateIndex
CREATE INDEX "vendor_payment_parts_entityId_idx" ON "vendor_payment_parts"("entityId");

-- CreateIndex
CREATE INDEX "vendor_payment_parts_bankId_idx" ON "vendor_payment_parts"("bankId");

-- CreateIndex
CREATE INDEX "vendor_payment_parts_currencyId_idx" ON "vendor_payment_parts"("currencyId");

-- AddForeignKey
ALTER TABLE "vendor_payment_parts" ADD CONSTRAINT "vendor_payment_parts_vendorInvoiceId_fkey" FOREIGN KEY ("vendorInvoiceId") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_parts" ADD CONSTRAINT "vendor_payment_parts_hardwarePurchaseId_fkey" FOREIGN KEY ("hardwarePurchaseId") REFERENCES "hardware_purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_parts" ADD CONSTRAINT "vendor_payment_parts_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "accounting_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_parts" ADD CONSTRAINT "vendor_payment_parts_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "accounting_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_parts" ADD CONSTRAINT "vendor_payment_parts_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "accounting_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: Farm Tariff payments -> one part each.
-- ids are random UUIDs (Prisma's cuid() only runs in the client); any
-- unique text id works for this column.
INSERT INTO "vendor_payment_parts" (
    "id", "vendorInvoiceId", "entityId", "bankId", "currencyId",
    "amount", "exchangeRate", "amountUsd", "transactionFee",
    "sortOrder", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    v."id",
    v."paymentEntityId",
    v."paymentBankId",
    v."paymentCurrencyId",
    v."paymentAmount",
    v."paymentExchangeRate",
    COALESCE(v."paymentAmountUsd", ROUND(v."paymentAmount" / v."paymentExchangeRate", 2)),
    COALESCE(v."transactionFee", 0),
    0,
    COALESCE(v."paidDate", v."updatedAt")
FROM "vendor_invoices" v
WHERE v."paymentEntityId" IS NOT NULL
  AND v."paymentBankId" IS NOT NULL
  AND v."paymentCurrencyId" IS NOT NULL
  AND v."paymentAmount" IS NOT NULL
  AND v."paymentExchangeRate" IS NOT NULL
  AND v."paymentExchangeRate" > 0;

-- Backfill: Hardware Purchase payments -> one part each (same rules).
INSERT INTO "vendor_payment_parts" (
    "id", "hardwarePurchaseId", "entityId", "bankId", "currencyId",
    "amount", "exchangeRate", "amountUsd", "transactionFee",
    "sortOrder", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    h."id",
    h."paymentEntityId",
    h."paymentBankId",
    h."paymentCurrencyId",
    h."paymentAmount",
    h."paymentExchangeRate",
    COALESCE(h."paymentAmountUsd", ROUND(h."paymentAmount" / h."paymentExchangeRate", 2)),
    COALESCE(h."transactionFee", 0),
    0,
    COALESCE(h."paidDate", h."updatedAt")
FROM "hardware_purchase_invoices" h
WHERE h."paymentEntityId" IS NOT NULL
  AND h."paymentBankId" IS NOT NULL
  AND h."paymentCurrencyId" IS NOT NULL
  AND h."paymentAmount" IS NOT NULL
  AND h."paymentExchangeRate" IS NOT NULL
  AND h."paymentExchangeRate" > 0;
