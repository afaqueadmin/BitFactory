-- Add isDeleted column to users table
ALTER TABLE "public"."users" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Add isDeleted column to hardware table
ALTER TABLE "public"."hardware" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Add isDeleted column to miners table
ALTER TABLE "public"."miners" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for efficient soft delete queries
CREATE INDEX "users_isDeleted_idx" ON "public"."users"("isDeleted");
CREATE INDEX "hardware_isDeleted_idx" ON "public"."hardware"("isDeleted");
CREATE INDEX "miners_isDeleted_idx" ON "public"."miners"("isDeleted");

