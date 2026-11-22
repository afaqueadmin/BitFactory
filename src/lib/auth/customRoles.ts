/**
 * Custom staff roles (RBAC stage 5): validation and the shape the /roles page
 * reads. Used by src/app/api/admin/roles/**. Node runtime only.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isGrantable, type Permission } from "@/lib/auth/permissions";
import { isStaffRole } from "@/lib/auth/staffRoles";

export const roleInclude = {
  permissions: { select: { permission: true } },
  assignments: {
    select: {
      assignedAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { assignedAt: "asc" },
  },
} satisfies Prisma.StaffRoleInclude;

type RoleRow = Prisma.StaffRoleGetPayload<{ include: typeof roleInclude }>;

export function roleJson(r: RoleRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // Rows for permissions since removed from the catalogue are ignored.
    permissions: r.permissions.map((p) => p.permission).filter(isGrantable),
    members: r.assignments.map((a) => ({
      ...a.user,
      assignedAt: a.assignedAt,
    })),
  };
}

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

/** A role's name, description and permissions from a request body, checked. */
export function parseRoleBody(
  body: unknown,
):
  | { name: string; description: string | null; permissions: Permission[] }
  | NextResponse {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return bad("A role name is required");
  if (name.length > 60) return bad("The name must be 60 characters or fewer");
  const description =
    typeof b.description === "string" && b.description.trim()
      ? b.description.trim().slice(0, 300)
      : null;
  if (!Array.isArray(b.permissions)) return bad("permissions must be a list");
  const permissions = [...new Set(b.permissions)];
  const refused = permissions.filter(
    (p) => typeof p !== "string" || !isGrantable(p),
  );
  // SA-only permissions are refused, so a custom role is never a way to
  // SUPER_ADMIN actions.
  if (refused.length)
    return bad(`These can't be given by a role: ${refused.join(", ")}`);
  return { name, description, permissions: permissions as Permission[] };
}

/** The staff account a role is given to: a non-deleted staff, not SUPER_ADMIN. */
export async function loadAssignee(
  userId: unknown,
): Promise<{ id: string; name: string | null; email: string } | NextResponse> {
  if (typeof userId !== "string" || !userId) return bad("userId is required");
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) return bad("Account not found", 404);
  // SUPER_ADMIN already has every permission.
  if (!isStaffRole(user.role) || user.role === "SUPER_ADMIN")
    return bad(
      "Roles can only be given to ADMIN, ACCOUNTING or STAFF accounts",
    );
  return user;
}

export const isUniqueNameError = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
