-- Add InvoiceType enum
CREATE TYPE "InvoiceType" AS ENUM ('ELECTRICITY_CHARGES', 'HARDWARE_PURCHASE');

-- Add invoiceType column to invoices table with default value
ALTER TABLE "invoices" ADD COLUMN "invoiceType" "InvoiceType" NOT NULL DEFAULT 'ELECTRICITY_CHARGES';
