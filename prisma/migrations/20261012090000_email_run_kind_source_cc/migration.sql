-- CreateEnum
CREATE TYPE "EmailRunKind" AS ENUM ('INVOICE', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "EmailRunSource" AS ENUM ('BULK', 'SINGLE');

-- AlterTable
ALTER TABLE "email_send_runs" ADD COLUMN     "kind" "EmailRunKind" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "source" "EmailRunSource" NOT NULL DEFAULT 'BULK';

-- AlterTable
ALTER TABLE "email_send_results" ADD COLUMN     "ccEmails" TEXT;

-- CreateIndex
CREATE INDEX "email_send_runs_type_idx" ON "email_send_runs"("type");

