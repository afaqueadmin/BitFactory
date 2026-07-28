-- CreateTable
CREATE TABLE "public"."invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "hardwareId" TEXT,
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "public"."invoice_line_items"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_line_items_hardwareId_idx" ON "public"."invoice_line_items"("hardwareId");

-- AddForeignKey
ALTER TABLE "public"."invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_line_items" ADD CONSTRAINT "invoice_line_items_hardwareId_fkey" FOREIGN KEY ("hardwareId") REFERENCES "public"."hardware"("id") ON DELETE SET NULL ON UPDATE CASCADE;
