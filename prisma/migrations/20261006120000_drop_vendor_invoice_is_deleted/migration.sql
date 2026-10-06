-- DropIndex
DROP INDEX "vendor_invoices_isDeleted_idx";

-- DropIndex
DROP INDEX "hardware_purchase_invoices_isDeleted_idx";

-- AlterTable
ALTER TABLE "vendor_invoices" DROP COLUMN "isDeleted";

-- AlterTable
ALTER TABLE "hardware_purchase_invoices" DROP COLUMN "isDeleted";

