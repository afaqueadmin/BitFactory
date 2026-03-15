-- Add isDeleted column to vendor_invoices table
ALTER TABLE "public"."vendor_invoices" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for efficient soft delete queries
CREATE INDEX "vendor_invoices_isDeleted_idx" ON "public"."vendor_invoices"("isDeleted");

