-- CreateTable
CREATE TABLE "wallet_payment_emails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payoutDate" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "payoutBtc" DECIMAL(20,8) NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentTo" TEXT,
    "ccEmails" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_payment_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_payment_emails_payoutDate_idx" ON "wallet_payment_emails"("payoutDate");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_payment_emails_userId_payoutDate_key" ON "wallet_payment_emails"("userId", "payoutDate");

-- AddForeignKey
ALTER TABLE "wallet_payment_emails" ADD CONSTRAINT "wallet_payment_emails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
