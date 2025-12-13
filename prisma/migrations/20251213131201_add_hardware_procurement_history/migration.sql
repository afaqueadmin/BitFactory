-- CreateTable
CREATE TABLE "public"."hardware_procurement_history" (
    "id" TEXT NOT NULL,
    "hardwareId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hardware_procurement_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hardware_procurement_history_hardwareId_idx" ON "public"."hardware_procurement_history"("hardwareId");

-- CreateIndex
CREATE INDEX "hardware_procurement_history_createdById_idx" ON "public"."hardware_procurement_history"("createdById");

-- AddForeignKey
ALTER TABLE "public"."hardware_procurement_history" ADD CONSTRAINT "hardware_procurement_history_hardwareId_fkey" FOREIGN KEY ("hardwareId") REFERENCES "public"."hardware"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hardware_procurement_history" ADD CONSTRAINT "hardware_procurement_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
