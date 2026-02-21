-- CreateEnum for VendorPaymentStatus
CREATE TYPE "VendorPaymentStatus" AS ENUM ('Paid', 'Pending', 'Cancelled');

-- CreateTable vendor_invoices
CREATE TABLE "vendor_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" VARCHAR(50) NOT NULL,
    "billingDate" DATE NOT NULL,
    "paidDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalMiners" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10, 2) NOT NULL,
    "miscellaneousCharges" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(12, 2) NOT NULL,
    "paymentStatus" "VendorPaymentStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex vendor_invoices
CREATE UNIQUE INDEX "vendor_invoices_invoiceNumber_key" ON "vendor_invoices"("invoiceNumber");
CREATE INDEX "vendor_invoices_paymentStatus_idx" ON "vendor_invoices"("paymentStatus");
CREATE INDEX "vendor_invoices_billingDate_idx" ON "vendor_invoices"("billingDate");
CREATE INDEX "vendor_invoices_dueDate_idx" ON "vendor_invoices"("dueDate");
CREATE INDEX "vendor_invoices_createdAt_idx" ON "vendor_invoices"("createdAt");

-- AddForeignKey vendor_invoices
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

