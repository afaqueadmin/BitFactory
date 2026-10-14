-- Multi-login accounts: each account (User) can be signed into by more than
-- one email, each with its own password, 2FA and passkeys. Credentials move
-- from the user to a new user_logins row; account data stays on users.
--
-- Backfill: every existing user gets one primary login carrying its current
-- email, password and sign-out cutoff, and its 2FA row and passkeys are
-- attached to that login. Nothing about how anyone signs in changes.

ALTER TYPE "AuditAction" ADD VALUE 'USER_LOGIN_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_LOGIN_REMOVED';

-- CreateTable
CREATE TABLE "user_logins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sessionsValidAfter" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_logins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_logins_email_key" ON "user_logins"("email");
CREATE INDEX "user_logins_userId_idx" ON "user_logins"("userId");

-- Same rule as users.email (M-4): one email, one login, case-insensitively.
-- Covers primary and secondary emails alike, so an address can never be one
-- account's primary and another's secondary. Expression/partial indexes
-- Prisma can't model - if `prisma migrate dev` proposes dropping them,
-- that's drift; don't accept it.
CREATE UNIQUE INDEX "user_logins_email_lower_key" ON "user_logins" (lower("email"));
CREATE UNIQUE INDEX "user_logins_one_primary_key" ON "user_logins" ("userId") WHERE "isPrimary";

ALTER TABLE "user_logins" ADD CONSTRAINT "user_logins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_logins" ADD CONSTRAINT "user_logins_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one primary login per existing user (soft-deleted ones too, so
-- their email stays reserved exactly as it is on users today).
INSERT INTO "user_logins" ("id", "userId", "email", "password", "isPrimary", "sessionsValidAfter", "createdAt", "updatedAt")
SELECT 'l' || substr(md5('primary-login:' || "id"), 1, 24), "id", "email", "password", true, "sessionsValidAfter", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

-- 2FA: per login now. Attach each existing row to its user's primary login.
DROP INDEX "two_factor_auth_userId_key";
ALTER TABLE "two_factor_auth" ADD COLUMN "loginId" TEXT;
UPDATE "two_factor_auth" t SET "loginId" = l."id"
FROM "user_logins" l WHERE l."userId" = t."userId" AND l."isPrimary";
ALTER TABLE "two_factor_auth" ALTER COLUMN "loginId" SET NOT NULL;
CREATE UNIQUE INDEX "two_factor_auth_loginId_key" ON "two_factor_auth"("loginId");
CREATE INDEX "two_factor_auth_userId_idx" ON "two_factor_auth"("userId");
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "user_logins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Passkeys: per login now.
ALTER TABLE "webauthn_credentials" ADD COLUMN "loginId" TEXT;
UPDATE "webauthn_credentials" w SET "loginId" = l."id"
FROM "user_logins" l WHERE l."userId" = w."userId" AND l."isPrimary";
ALTER TABLE "webauthn_credentials" ALTER COLUMN "loginId" SET NOT NULL;
CREATE INDEX "webauthn_credentials_loginId_idx" ON "webauthn_credentials"("loginId");
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "user_logins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which login did it. Existing rows stay null (from before multi-login).
ALTER TABLE "user_activities" ADD COLUMN "loginId" TEXT;
CREATE INDEX "user_activities_loginId_idx" ON "user_activities"("loginId");
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "user_logins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_sessions" ADD COLUMN "loginId" TEXT;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "user_logins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
