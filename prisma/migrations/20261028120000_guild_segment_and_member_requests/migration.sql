-- CreateEnum
CREATE TYPE "GuildMemberChangeAction" AS ENUM ('ADD', 'REMOVE');

-- AlterEnum
ALTER TYPE "Segment" ADD VALUE 'GUILDMASTER';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_ADD_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_ADD_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_ADD_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_ADD_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_REMOVE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_REMOVE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_REMOVE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'GUILD_MEMBER_REMOVE_REJECTED';

-- CreateTable
CREATE TABLE "guild_member_change_requests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "action" "GuildMemberChangeAction" NOT NULL,
    "newName" TEXT,
    "newEmail" TEXT,
    "newPhoneNumber" TEXT,
    "newPercent" DECIMAL(7,4),
    "newWalletAddress" TEXT,
    "newWalletNetwork" TEXT NOT NULL DEFAULT 'BTC',
    "createdMembershipId" TEXT,
    "membershipId" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByEmail" TEXT,
    "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false,
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

    CONSTRAINT "guild_member_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_member_change_request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "currentPercent" DECIMAL(7,4) NOT NULL,
    "requestedPercent" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "guild_member_change_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guild_member_change_requests_createdMembershipId_key" ON "guild_member_change_requests"("createdMembershipId");

-- CreateIndex
CREATE INDEX "guild_member_change_requests_guildId_idx" ON "guild_member_change_requests"("guildId");

-- CreateIndex
CREATE INDEX "guild_member_change_requests_membershipId_idx" ON "guild_member_change_requests"("membershipId");

-- CreateIndex
CREATE INDEX "guild_member_change_requests_status_idx" ON "guild_member_change_requests"("status");

-- CreateIndex
CREATE INDEX "guild_member_change_request_lines_membershipId_idx" ON "guild_member_change_request_lines"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_member_change_request_lines_requestId_membershipId_key" ON "guild_member_change_request_lines"("requestId", "membershipId");

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_createdMembershipId_fkey" FOREIGN KEY ("createdMembershipId") REFERENCES "guild_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "guild_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_requests" ADD CONSTRAINT "guild_member_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_request_lines" ADD CONSTRAINT "guild_member_change_request_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "guild_member_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member_change_request_lines" ADD CONSTRAINT "guild_member_change_request_lines_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "guild_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
