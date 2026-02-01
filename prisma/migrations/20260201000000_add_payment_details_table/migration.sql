-- CreateTable PaymentDetails
-- This table stores all configurable payment and company information for invoice PDFs
-- No existing data is affected - this is a new table
CREATE TABLE "public"."payment_details" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'BitFactory.AE',
    "companyLegalName" TEXT NOT NULL DEFAULT 'Higgs Computing Limited',
    "companyLocation" TEXT NOT NULL DEFAULT 'Ras Al Khaimah, UAE',
    "machineHostingLocation" TEXT NOT NULL DEFAULT 'Addis Ababa, Ethiopia',
    "logoBase64" TEXT,
    "paymentOption1Title" TEXT NOT NULL DEFAULT 'OPTION 1:',
    "paymentOption1Details" TEXT NOT NULL DEFAULT 'USDT (Tron): TLNjcYnokhA1UcVsYVKjdeh9HzMS6GQJNe',
    "paymentOption2Title" TEXT NOT NULL DEFAULT 'OPTION 2:',
    "paymentOption2Details" TEXT NOT NULL DEFAULT 'USDC (ETH): 0x722460E434013075E8cF8dd42c8854424aFa336E',
    "paymentOption3Title" TEXT NOT NULL DEFAULT 'OPTION 3:',
    "paymentOption3Details" TEXT NOT NULL,
    "billingInquiriesEmail" TEXT NOT NULL DEFAULT 'invoices@bitfactory.ae',
    "billingInquiriesWhatsApp" TEXT NOT NULL DEFAULT '+971-52-6062903',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@bitfactory.ae',
    "supportWhatsApp" TEXT NOT NULL DEFAULT '+971-52-6062903',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for performance
CREATE INDEX "payment_details_id_idx" ON "public"."payment_details"("id");
