-- Optional Excel/CSV sheet alongside the vendor invoice PDF, and the original
-- filenames of both uploads. Add-column only; existing rows stay null.

-- AlterTable
ALTER TABLE "vendor_invoices" ADD COLUMN     "invoicePdfName" TEXT,
ADD COLUMN     "invoiceSheetKey" TEXT,
ADD COLUMN     "invoiceSheetName" TEXT;

-- AlterTable
ALTER TABLE "hardware_purchase_invoices" ADD COLUMN     "invoicePdfName" TEXT,
ADD COLUMN     "invoiceSheetKey" TEXT,
ADD COLUMN     "invoiceSheetName" TEXT;
