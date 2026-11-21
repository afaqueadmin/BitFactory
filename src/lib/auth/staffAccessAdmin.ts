/**
 * Shared pieces for the staff access routes
 * (src/app/api/admin/staff-access/**). Node runtime only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { RESTRICTABLE_ROLES } from "@/lib/auth/staffAccessServer";

export type StaffAccessActor = { id: string; email: string; role: string };

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

/**
 * The signed-in staff member, after the route has checked access_rules.*
 * (authorizeStaff), with the role read from the database.
 */
export async function staffAccessActor(
  userId: string,
): Promise<StaffAccessActor> {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
}

export type StaffAccessTarget = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

/**
 * The account a rule is being set on: an active ADMIN or ACCOUNTING account
 * the actor may manage, never the actor themselves.
 */
export async function loadTarget(
  actor: StaffAccessActor,
  userId: string,
): Promise<StaffAccessTarget | NextResponse> {
  if (userId === actor.id) {
    return fail("You can't set access rules on your own account", 403);
  }
  const target = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) return fail("User not found", 404);
  if (
    !RESTRICTABLE_ROLES.has(target.role) ||
    !canManageAccount(actor.role, target.role)
  ) {
    return fail(
      "Access rules can only be set on admin and accounting accounts",
      403,
    );
  }
  return target;
}

export function requestMeta(request: NextRequest) {
  return {
    ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  };
}

/** How an account is named in audit entries. */
export const label = (t: { name: string | null; email: string }) =>
  t.name ? `${t.name} (${t.email})` : t.email;
