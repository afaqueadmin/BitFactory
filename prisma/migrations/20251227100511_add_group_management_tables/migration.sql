-- CreateTable
CREATE TABLE "public"."groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."group_subaccounts" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subaccountName" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "group_subaccounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_isActive_idx" ON "public"."groups"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "group_subaccounts_subaccountName_key" ON "public"."group_subaccounts"("subaccountName");

-- CreateIndex
CREATE INDEX "group_subaccounts_groupId_idx" ON "public"."group_subaccounts"("groupId");

-- CreateIndex
CREATE INDEX "group_subaccounts_subaccountName_idx" ON "public"."group_subaccounts"("subaccountName");

-- AddForeignKey
ALTER TABLE "public"."group_subaccounts" ADD CONSTRAINT "group_subaccounts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
