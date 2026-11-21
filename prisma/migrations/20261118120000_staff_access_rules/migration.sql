-- Staff access rules: office hours and device-bound (office PC) passkeys for
-- ADMIN / ACCOUNTING accounts, set by a SUPER_ADMIN on /access-rules - see
-- src/lib/auth/staffAccess.ts. Four new tables, two enums, five audit actions,
-- and three nullable columns on webauthn_credentials. Add-only: nothing
-- existing is changed or dropped, so the code running before this deploy keeps
-- working.

-- CreateEnum
CREATE TYPE "StaffAccessWindowKind" AS ENUM ('ONE_OFF', 'EXTRA_TIME');

-- CreateEnum
CREATE TYPE "StaffTimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ACCESS_RULE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ACCESS_TIME_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ACCESS_EXCEPTION_SET';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ACCESS_PASSKEY_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_HOLIDAY_UPDATED';

-- AlterTable
ALTER TABLE "webauthn_credentials" ADD COLUMN     "attachment" TEXT,
ADD COLUMN     "backedUp" BOOLEAN,
ADD COLUMN     "deviceType" TEXT;

-- CreateTable
CREATE TABLE "staff_access_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "weeklyHours" JSONB NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "requireDeviceBoundPasskey" BOOLEAN NOT NULL DEFAULT false,
    "passkeyExemptUntil" TIMESTAMP(3),
    "passkeyExemptNote" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_access_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_access_windows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" "StaffAccessWindowKind" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_access_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutesRequested" INTEGER NOT NULL,
    "note" TEXT,
    "status" "StaffTimeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "minutesGranted" INTEGER,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "staff_time_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_access_rules_userId_key" ON "staff_access_rules"("userId");

-- CreateIndex
CREATE INDEX "staff_access_windows_userId_endsAt_idx" ON "staff_access_windows"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "staff_holidays_date_idx" ON "staff_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_holidays_date_userId_key" ON "staff_holidays"("date", "userId");

-- CreateIndex
CREATE INDEX "staff_time_requests_status_idx" ON "staff_time_requests"("status");

-- CreateIndex
CREATE INDEX "staff_time_requests_userId_idx" ON "staff_time_requests"("userId");

-- AddForeignKey
ALTER TABLE "staff_access_rules" ADD CONSTRAINT "staff_access_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_access_windows" ADD CONSTRAINT "staff_access_windows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_holidays" ADD CONSTRAINT "staff_holidays_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_requests" ADD CONSTRAINT "staff_time_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Office-wide holidays (userId NULL) must be unique per date too; Postgres
-- treats NULLs as distinct in "staff_holidays_date_userId_key".
CREATE UNIQUE INDEX "staff_holidays_office_date_key" ON "staff_holidays"("date") WHERE "userId" IS NULL;
