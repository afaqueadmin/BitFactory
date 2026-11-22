/**
 * /api/admin/roles/[id] (roles.manage)
 * PUT { name, description?, permissions[] }: replace a role's details and
 *   permissions. Applies to its members on their next request.
 * DELETE: refused while the role is given to anyone.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeStaff } from "@/lib/auth/authorization";
import {
  isUniqueNameError,
  parseRoleBody,
  roleInclude,
  roleJson,
} from "@/lib/auth/customRoles";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await authorizeStaff(request, ["roles.manage"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = parseRoleBody(await request.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;
  try {
    const before = await prisma.staffRole.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!before)
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    const role = await prisma.$transaction(async (tx) => {
      await tx.staffRolePermission.deleteMany({ where: { roleId: id } });
      const updated = await tx.staffRole.update({
        where: { id },
        data: {
          name: parsed.name,
          description: parsed.description,
          permissions: {
            create: parsed.permissions.map((permission) => ({ permission })),
          },
        },
        include: roleInclude,
      });
      const old = roleJson(before);
      await tx.auditLog.create({
        data: {
          action: AuditAction.STAFF_ROLE_UPDATED,
          entityType: "StaffRole",
          entityId: id,
          userId: auth.userId,
          description: `Role "${updated.name}" updated`,
          changes: {
            before: {
              name: old.name,
              description: old.description,
              permissions: old.permissions,
            },
            after: parsed,
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ role: roleJson(role) });
  } catch (error) {
    if (isUniqueNameError(error))
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 },
      );
    console.error("[Roles] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update the role" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authorizeStaff(request, ["roles.manage"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const role = await prisma.staffRole.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role)
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    if (role.assignments.length) {
      return NextResponse.json(
        {
          error: "Remove this role from everyone who has it first",
          members: roleJson(role).members,
        },
        { status: 409 },
      );
    }
    await prisma.$transaction([
      prisma.staffRole.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ROLE_DELETED,
          entityType: "StaffRole",
          entityId: id,
          userId: auth.userId,
          description: `Role "${role.name}" deleted`,
          changes: { before: roleJson(role) },
        },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Roles] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete the role" },
      { status: 500 },
    );
  }
}
