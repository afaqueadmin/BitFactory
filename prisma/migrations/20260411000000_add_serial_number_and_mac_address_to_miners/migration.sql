-- AlterTable: Add serialNumber and macAddress columns to miners table
-- These columns are nullable so existing data is fully safe and unaffected.
ALTER TABLE "miners" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "miners" ADD COLUMN "macAddress" TEXT;
