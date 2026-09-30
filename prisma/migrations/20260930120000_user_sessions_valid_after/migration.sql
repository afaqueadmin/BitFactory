-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_SESSIONS_REVOKED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3);
