/*
  Warnings:

  - You are about to drop the column `vatNumber` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "vatNumber",
ADD COLUMN     "idNumber" TEXT;
