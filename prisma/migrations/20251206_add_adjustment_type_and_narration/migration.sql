-- Add ADJUSTMENT value to PaymentType enum
ALTER TYPE "PaymentType" ADD VALUE 'ADJUSTMENT';

-- Add narration column to cost_payments table
ALTER TABLE "cost_payments" ADD COLUMN "narration" TEXT;
