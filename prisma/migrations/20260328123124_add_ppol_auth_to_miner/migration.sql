-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "billingMonth" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "miners" ADD COLUMN     "poolAuth" TEXT;
