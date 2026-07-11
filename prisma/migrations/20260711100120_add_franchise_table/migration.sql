-- CreateTable
CREATE TABLE "franchises" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "authorizedPersonName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "franchiseeId" TEXT NOT NULL,

    CONSTRAINT "franchises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "franchises_franchiseeId_idx" ON "franchises"("franchiseeId");

-- CreateIndex
CREATE INDEX "franchises_isActive_idx" ON "franchises"("isActive");

-- CreateIndex
CREATE INDEX "franchises_deletedAt_idx" ON "franchises"("deletedAt");

-- AddForeignKey
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_franchiseeId_fkey" FOREIGN KEY ("franchiseeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
