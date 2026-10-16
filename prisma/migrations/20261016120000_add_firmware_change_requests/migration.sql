-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_CHANGE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_CHANGE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_CHANGE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_CHANGE_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_OPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_OPTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FIRMWARE_OPTION_DELETED';

-- CreateTable
CREATE TABLE "firmware_options" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firmware_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmware_change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "minerName" TEXT NOT NULL,
    "subaccountName" TEXT,
    "requestedByEmail" TEXT,
    "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false,
    "currentFirmware" TEXT,
    "requestedFirmwareId" TEXT NOT NULL,
    "requestedFirmwareName" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" TEXT,
    "confirmationContact" TEXT,
    "confirmationNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firmware_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firmware_options_name_key" ON "firmware_options"("name");

-- CreateIndex
CREATE INDEX "firmware_change_requests_userId_idx" ON "firmware_change_requests"("userId");

-- CreateIndex
CREATE INDEX "firmware_change_requests_status_idx" ON "firmware_change_requests"("status");

-- CreateIndex
CREATE INDEX "firmware_change_requests_minerId_idx" ON "firmware_change_requests"("minerId");

-- CreateIndex
CREATE INDEX "firmware_change_requests_requestedFirmwareId_idx" ON "firmware_change_requests"("requestedFirmwareId");

-- AddForeignKey
ALTER TABLE "firmware_options" ADD CONSTRAINT "firmware_options_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmware_change_requests" ADD CONSTRAINT "firmware_change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmware_change_requests" ADD CONSTRAINT "firmware_change_requests_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmware_change_requests" ADD CONSTRAINT "firmware_change_requests_requestedFirmwareId_fkey" FOREIGN KEY ("requestedFirmwareId") REFERENCES "firmware_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmware_change_requests" ADD CONSTRAINT "firmware_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmware_change_requests" ADD CONSTRAINT "firmware_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed the initial firmware options, created by the oldest SUPER_ADMIN.
INSERT INTO "firmware_options" ("id", "name", "isActive", "createdById", "createdAt", "updatedAt") SELECT gen_random_uuid()::text, v.name, true, u.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM (VALUES ('Stock (manufacturer)'), ('LuxOS'), ('Braiins OS'), ('VNish')) AS v(name) CROSS JOIN (SELECT "id" FROM "users" WHERE "role" = 'SUPER_ADMIN' AND "isDeleted" = false ORDER BY "createdAt" ASC LIMIT 1) AS u;
