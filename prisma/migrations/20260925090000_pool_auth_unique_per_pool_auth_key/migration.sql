-- DropIndex
DROP INDEX "pool_auths_poolId_userId_authKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "pool_auths_poolId_authKey_key" ON "pool_auths"("poolId", "authKey");
