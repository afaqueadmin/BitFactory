-- CreateTable hardware_purchase_invoices
CREATE TABLE "hardware_purchase_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "hardwareDescription" TEXT NOT NULL,
    "billingDate" DATE NOT NULL,
    "paidDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "unitPrice" DECIMAL(10, 2) NOT NULL,
    "miscellaneousCharges" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(12, 2) NOT NULL,
    "paymentStatus" "VendorPaymentStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hardware_purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex hardware_purchase_invoices
CREATE UNIQUE INDEX "hardware_purchase_invoices_invoiceNumber_key" ON "hardware_purchase_invoices"("invoiceNumber");
CREATE INDEX "hardware_purchase_invoices_paymentStatus_idx" ON "hardware_purchase_invoices"("paymentStatus");
CREATE INDEX "hardware_purchase_invoices_billingDate_idx" ON "hardware_purchase_invoices"("billingDate");
CREATE INDEX "hardware_purchase_invoices_dueDate_idx" ON "hardware_purchase_invoices"("dueDate");
CREATE INDEX "hardware_purchase_invoices_createdAt_idx" ON "hardware_purchase_invoices"("createdAt");
CREATE INDEX "hardware_purchase_invoices_isDeleted_idx" ON "hardware_purchase_invoices"("isDeleted");

-- AddForeignKey hardware_purchase_invoices
ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hardware_purchase_invoices" ADD CONSTRAINT "hardware_purchase_invoices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
