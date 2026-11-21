-- RBAC Phase 1: custom staff roles (staff_roles, their permissions, and who
-- has which), the STAFF base role and five audit actions. Add-only: nothing
-- existing is changed, so the code running before this deploy keeps working.
-- Permission names are strings checked against src/lib/auth/permissions.ts.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'STAFF';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_UNASSIGNED';

-- CreateTable
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_role_permissions" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "staff_role_permissions_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "staff_role_assignments" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_assignments_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");

-- CreateIndex
CREATE INDEX "staff_role_assignments_roleId_idx" ON "staff_role_assignments"("roleId");

-- AddForeignKey
ALTER TABLE "staff_role_permissions" ADD CONSTRAINT "staff_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

