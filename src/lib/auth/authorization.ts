import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken, type JwtPayload } from "@/lib/jwt";
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
  return contextFor(userId);
}

async function contextFor(
  userId: string,
): Promise<AuthorizationContext | { response: NextResponse }> {
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

/**
 * For shared routes (they also serve client-side accounts): the check for the
 * staff branch only, after the route's own session and ownership logic has
 * decided the caller is staff. Allowed with any one of the permissions.
 */
export async function requireStaffPermission(
  request: NextRequest,
  permissions: readonly Permission[],
): Promise<NextResponse | null> {
  const ctx = await getAuthorizationContext(request);
  if ("response" in ctx) return ctx.response;
  return requireAnyPermission(ctx, permissions);
}

/**
 * For staff-only routes that also need the session claims (step-up reads
 * loginId): one token check, then the permission check from the database.
 */
export async function authorizeStaff(
  request: NextRequest,
  permissions: readonly Permission[],
): Promise<
  | {
      decoded: JwtPayload;
      userId: string;
      role: string;
      permissions: ReadonlySet<Permission>;
    }
  | { response: NextResponse }
> {
  const token = request.cookies.get("token")?.value;
  if (!token) return { response: unauthorized() };
  let decoded: JwtPayload;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return { response: unauthorized() };
  }
  if (!decoded.userId) return { response: unauthorized() };
  const ctx = await contextFor(decoded.userId);
  if ("response" in ctx) return ctx;
  const denied = requireAnyPermission(ctx, permissions);
  return denied
    ? { response: denied }
    : {
        decoded,
        userId: decoded.userId,
        role: ctx.role,
        permissions: ctx.permissions,
      };
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
