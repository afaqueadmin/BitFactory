/*
  Warnings:

  - Made the column `unitPrice` on table `recurring_invoices` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "recurring_invoices" ALTER COLUMN "unitPrice" SET NOT NULL;
