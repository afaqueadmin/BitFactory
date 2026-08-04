-- CreateEnum
CREATE TYPE "InvoiceLineItemType" AS ENUM ('HARDWARE', 'HOSTING_COLOCATION');

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "lineItemType" "InvoiceLineItemType" NOT NULL DEFAULT 'HARDWARE';
