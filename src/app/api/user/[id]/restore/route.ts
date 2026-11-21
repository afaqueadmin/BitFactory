/**
 * POST /api/user/[id]/restore
 *
 * Admin action: undoes a soft delete (DELETE /api/user/[id]), so the account
 * shows up in the customer lists again and can sign in with its existing
 * logins. Sessions from before the delete stay revoked.
 *
 * Same tier rules as deletion: an ADMIN or ACCOUNTING user can restore CLIENT
 * and FRANCHISEE accounts, a SUPER_ADMIN also ADMIN and ACCOUNTING accounts.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { isReleasedEmail } from "@/lib/auth/emailIdentity";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["customers.restore"]);
    if ("response" in auth) return auth.response;
    const actorId = auth.userId;
    const actor = { id: auth.userId, role: auth.role };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, isDeleted: true, name: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!canManageAccount(actor.role, target.role)) {
      return NextResponse.json(
        { error: "You do not have permission to restore this user" },
        { status: 403 },
      );
    }

    if (!target.isDeleted) {
      return NextResponse.json(
        { error: "This user is not deleted" },
        { status: 400 },
      );
    }

    // Its email was taken over as another account's sign-in email.
    if (isReleasedEmail(target.email)) {
      return NextResponse.json(
        {
          error:
            "This account's email is now used by another account. A super admin must set a new email in Edit Customer before restoring.",
        },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { isDeleted: false },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.USER_UPDATED,
          entityType: "User",
          entityId: id,
          userId: actorId,
          description: `User ${target.name || target.email} restored`,
          changes: JSON.stringify({ isDeleted: false }),
        },
      }),
    ]);

    return NextResponse.json({ message: "User restored successfully" });
  } catch (error) {
    console.error("Error restoring user:", error);
    return NextResponse.json(
      { error: "Failed to restore user" },
      { status: 500 },
    );
  }
}
