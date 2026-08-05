-- CreateEnum
CREATE TYPE "VendorName" AS ENUM ('HASHLABS_PTE_LTD', 'QRB_LABS', 'LUXOR_TECH');

-- AlterTable: map existing free-text values to the new enum
ALTER TABLE "hardware_purchase_invoices"
  ALTER COLUMN "vendorName" TYPE "VendorName"
  USING (
    CASE "vendorName"
      WHEN 'HashLabs Pte Ltd' THEN 'HASHLABS_PTE_LTD'
      WHEN 'QRB Labs' THEN 'QRB_LABS'
      WHEN 'Luxor Tech' THEN 'LUXOR_TECH'
    END
  )::"VendorName";
