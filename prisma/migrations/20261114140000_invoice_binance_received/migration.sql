-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "binanceReceivedAmount" DECIMAL(18,8),
ADD COLUMN     "binanceReceivedAt" TIMESTAMP(3);

