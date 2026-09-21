
-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_key_createdAt_idx" ON "auth_attempts"("key", "createdAt");

-- CreateIndex
CREATE INDEX "auth_attempts_createdAt_idx" ON "auth_attempts"("createdAt");

