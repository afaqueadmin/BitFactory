-- Add quantity column to hardware table with default value of 1
-- This preserves existing data without any breaking changes
ALTER TABLE "public"."hardware" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;