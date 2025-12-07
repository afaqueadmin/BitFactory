/*
  Warnings:

  - A unique constraint covering the columns `[name,userId]` on the table `miners` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "miners_name_userId_key" ON "public"."miners"("name", "userId");
