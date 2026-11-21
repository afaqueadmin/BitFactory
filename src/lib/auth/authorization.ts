import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { effectivePermissions, type Permission } from "@/lib/auth/permissions";

/**
 * RBAC: who is calling and what they may do, loaded once per request from the
 * database (never from the token), so role changes apply on the next request.
 *
 *   const ctx = await getAuthorizationContext(request);
 *   if ("response" in ctx) return ctx.response;              // 401 / 500
 *   const denied = requirePermission(ctx, "locations.delete");
 *   if (denied) return denied;                                // 403
 *
 * Ownership, canManageAccount, step-up and confirmBankEffect stay separate
 * checks in each route. Fails closed: no session, no user, or a load error
 * means no access.
 */
export interface AuthorizationContext {
  userId: string;
  role: string;
  permissions: ReadonlySet<Permission>;
}

/** The effective permissions of one account, read from the database. */
export async function loadPermissions(
  userId: string,
): Promise<{ role: string; permissions: Set<Permission> } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isDeleted: true,
      staffRoleAssignments: {
        select: { role: { select: { permissions: true } } },
      },
    },
  });
  if (!user || user.isDeleted) return null;
  const custom = user.staffRoleAssignments.flatMap((a) =>
    a.role.permissions.map((p) => p.permission),
  );
  return {
    role: user.role,
    permissions: effectivePermissions(user.role, custom),
  };
}

export async function getAuthorizationContext(
  request: NextRequest,
): Promise<AuthorizationContext | { response: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) return { response: unauthorized() };

  let userId: string;
  try {
    userId = (await verifyJwtToken(token)).userId;
  } catch {
    return { response: unauthorized() };
  }
  if (!userId) return { response: unauthorized() };

  try {
    const loaded = await loadPermissions(userId);
    if (!loaded) return { response: unauthorized() };
    return { userId, ...loaded };
  } catch (error) {
    console.error("Loading permissions failed:", error);
    return {
      response: NextResponse.json(
        { error: "Could not check your permissions. Try again." },
        { status: 500 },
      ),
    };
  }
}

export function hasPermission(
  ctx: Pick<AuthorizationContext, "permissions">,
  permission: Permission,
): boolean {
  return ctx.permissions.has(permission);
}

/** null when allowed, otherwise a ready 403 response. */
export function requirePermission(
  ctx: Pick<AuthorizationContext, "permissions">,
  permission: Permission,
): NextResponse | null {
  return hasPermission(ctx, permission) ? null : forbidden();
}

/** For shared lookup routes: allowed with any one of the permissions. */
export function requireAnyPermission(
  ctx: Pick<AuthorizationContext, "permissions">,
  permissions: readonly Permission[],
): NextResponse | null {
  return permissions.some((p) => ctx.permissions.has(p)) ? null : forbidden();
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json(
    { error: "You don't have permission to do this" },
    { status: 403 },
  );
}
