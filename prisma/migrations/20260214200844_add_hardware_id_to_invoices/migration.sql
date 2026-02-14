-- Add hardwareId column to invoices table
ALTER TABLE "invoices" ADD COLUMN "hardwareId" TEXT;

-- Add foreign key constraint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hardwareId_fkey" FOREIGN KEY ("hardwareId") REFERENCES "hardware"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for hardwareId
CREATE INDEX "invoices_hardwareId_idx" ON "invoices"("hardwareId");
