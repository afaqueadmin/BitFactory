-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'USER',
ADD COLUMN     "streetAddress" TEXT;

-- CreateTable
CREATE TABLE "public"."miners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "powerUsage" DOUBLE PRECISION NOT NULL,
    "hashRate" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "powerCapacity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."miners" ADD CONSTRAINT "miners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."miners" ADD CONSTRAINT "miners_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
