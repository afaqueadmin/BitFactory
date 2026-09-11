-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_DISABLED';

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "secret" TEXT,
    "backupCodes" TEXT[],
    "enrolledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_auth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_userId_key" ON "two_factor_auth"("userId");

-- AddForeignKey
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per user who has ever engaged with 2FA (has a secret on
-- record), copying their existing state as-is. Users who never touched 2FA
-- get no row here - one is created lazily on their first /2fa/setup call.
-- The legacy users.twoFactor* columns are left untouched by this migration -
-- nothing else in the database is affected, and they remain a fallback.
INSERT INTO "two_factor_auth" ("id", "userId", "enabled", "secret", "backupCodes", "enrolledAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "twoFactorEnabled",
    "twoFactorSecret",
    "twoFactorBackupCodes",
    CASE WHEN "twoFactorEnabled" THEN "updatedAt" ELSE NULL END,
    now(),
    now()
FROM "users"
WHERE "twoFactorSecret" IS NOT NULL;
