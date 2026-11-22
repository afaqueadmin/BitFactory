/**
 * /api/admin/roles/[id]/assignments (roles.assign)
 * POST { userId }: give the role to an ADMIN, ACCOUNTING or STAFF account.
 * DELETE { userId }: take it away. Either applies on that person's next
 * request; no sign-out.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeStaff } from "@/lib/auth/authorization";
import { loadAssignee } from "@/lib/auth/customRoles";

type Params = { params: Promise<{ id: string }> };

async function load(request: NextRequest, { params }: Params) {
  const auth = await authorizeStaff(request, ["roles.assign"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
  } | null;
  const role = await prisma.staffRole.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!role)
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const user = await loadAssignee(body?.userId);
  if (user instanceof NextResponse) return user;
  return { actorId: auth.userId, role, user };
}

export async function POST(request: NextRequest, ctx: Params) {
  try {
    const l = await load(request, ctx);
    if (l instanceof NextResponse) return l;
    const exists = await prisma.staffRoleAssignment.findUnique({
      where: { userId_roleId: { userId: l.user.id, roleId: l.role.id } },
    });
    if (exists) return NextResponse.json({ success: true });
    await prisma.$transaction([
      prisma.staffRoleAssignment.create({
        data: { userId: l.user.id, roleId: l.role.id, assignedById: l.actorId },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ROLE_ASSIGNED,
          entityType: "StaffRole",
          entityId: l.role.id,
          userId: l.actorId,
          description: `Role "${l.role.name}" given to ${l.user.email}`,
          changes: { userId: l.user.id },
        },
      }),
    ]);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[Roles] assign error:", error);
    return NextResponse.json(
      { error: "Failed to give the role" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, ctx: Params) {
  try {
    const l = await load(request, ctx);
    if (l instanceof NextResponse) return l;
    const removed = await prisma.staffRoleAssignment.deleteMany({
      where: { userId: l.user.id, roleId: l.role.id },
    });
    if (removed.count) {
      await prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ROLE_UNASSIGNED,
          entityType: "StaffRole",
          entityId: l.role.id,
          userId: l.actorId,
          description: `Role "${l.role.name}" taken from ${l.user.email}`,
          changes: { userId: l.user.id },
        },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Roles] unassign error:", error);
    return NextResponse.json(
      { error: "Failed to take the role away" },
      { status: 500 },
    );
  }
}
