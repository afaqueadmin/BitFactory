-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" DROP DEFAULT;
ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" TYPE TEXT[] USING CASE WHEN "machineHostingLocation" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["machineHostingLocation"] END;
ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" SET NOT NULL;
