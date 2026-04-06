-- AlterTable
ALTER TABLE "miners" ADD COLUMN     "poolId" TEXT;

-- CreateTable
CREATE TABLE "pools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_auths" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_auths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pools_name_key" ON "pools"("name");

-- CreateIndex
CREATE INDEX "pool_auths_userId_idx" ON "pool_auths"("userId");

-- CreateIndex
CREATE INDEX "pool_auths_poolId_idx" ON "pool_auths"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "pool_auths_poolId_userId_key" ON "pool_auths"("poolId", "userId");

-- CreateIndex
CREATE INDEX "miners_poolId_idx" ON "miners"("poolId");

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_auths" ADD CONSTRAINT "pool_auths_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_auths" ADD CONSTRAINT "pool_auths_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
