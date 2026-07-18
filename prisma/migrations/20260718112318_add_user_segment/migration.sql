-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('CORPORATE', 'SME', 'FRANCHISEE', 'RETAIL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "segment" "Segment";

-- CreateIndex
CREATE INDEX "users_segment_idx" ON "users"("segment");

-- Backfill segment for existing rows:
-- FRANCHISEE role -> FRANCHISEE segment
-- CLIENT assigned to a franchise -> RETAIL segment
-- CLIENT with no franchise (direct BitFactory customer) -> SME (default)
-- ADMIN / SUPER_ADMIN -> left NULL (segment not applicable)
UPDATE "users" SET "segment" = 'FRANCHISEE' WHERE "role" = 'FRANCHISEE';
UPDATE "users" SET "segment" = 'RETAIL' WHERE "role" = 'CLIENT' AND "franchiseeId" IS NOT NULL;
UPDATE "users" SET "segment" = 'SME' WHERE "role" = 'CLIENT' AND "franchiseeId" IS NULL;
