-- AlterEnum
-- This migration adds a new enum value `SUPER_ADMIN` to the existing `Role` enum.
-- Since it's only adding a value (not removing), no data will be lost.
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
