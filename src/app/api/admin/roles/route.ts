/**
 * /api/admin/roles - custom staff roles (RBAC stage 5).
 * GET: every role with its permissions and members, plus the staff accounts
 *   a role can be given to (roles.view).
 * POST { name, description?, permissions[] }: create a role (roles.manage).
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

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, ["roles.view"]);
  if ("response" in auth) return auth.response;
  try {
    const [roles, staff] = await Promise.all([
      prisma.staffRole.findMany({
        include: roleInclude,
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: {
          isDeleted: false,
          role: { in: ["ADMIN", "ACCOUNTING", "STAFF"] },
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      }),
    ]);
    return NextResponse.json({ roles: roles.map(roleJson), staff });
  } catch (error) {
    console.error("[Roles] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load roles" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, ["roles.manage"]);
  if ("response" in auth) return auth.response;
  const parsed = parseRoleBody(await request.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;
  try {
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.staffRole.create({
        data: {
          name: parsed.name,
          description: parsed.description,
          createdById: auth.userId,
          permissions: {
            create: parsed.permissions.map((permission) => ({ permission })),
          },
        },
        include: roleInclude,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.STAFF_ROLE_CREATED,
          entityType: "StaffRole",
          entityId: created.id,
          userId: auth.userId,
          description: `Role "${created.name}" created with ${parsed.permissions.length} permissions`,
          changes: { after: parsed },
        },
      });
      return created;
    });
    return NextResponse.json({ role: roleJson(role) }, { status: 201 });
  } catch (error) {
    if (isUniqueNameError(error))
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 },
      );
    console.error("[Roles] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create the role" },
      { status: 500 },
    );
  }
}
