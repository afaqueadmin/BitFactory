-- CreateTable
CREATE TABLE "miner_repair_notes" (
    "id" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "dateOfEntry" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miner_repair_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miner_repair_notes_minerId_idx" ON "miner_repair_notes"("minerId");

-- CreateIndex
CREATE INDEX "miner_repair_notes_createdById_idx" ON "miner_repair_notes"("createdById");

-- AddForeignKey
ALTER TABLE "miner_repair_notes" ADD CONSTRAINT "miner_repair_notes_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "miners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_repair_notes" ADD CONSTRAINT "miner_repair_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
