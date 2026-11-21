import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";

/**
 * DELETE /api/groups/[id]/subaccounts/[subaccountId]
 * Remove a subaccount from a group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subaccountId: string }> },
) {
  try {
    const { id: groupId, subaccountId } = await params;

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "customer_groups.edit");
    if (denied) return denied;
    const user = { userId: ctx.userId, role: ctx.role };

    console.log("[Groups API] Removing subaccount:", subaccountId);

    // Only a member of the group named in the URL, so the audit entry below
    // is about the right group.
    const member = await prisma.groupSubaccount.findFirst({
      where: { id: subaccountId, groupId },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Subaccount not found in this group" },
        { status: 404 },
      );
    }

    const groupSubaccount = await prisma.groupSubaccount.delete({
      where: { id: subaccountId },
    });

    console.log("[Groups API] Subaccount removed successfully");

    await prisma.auditLog.create({
      data: {
        action: AuditAction.GROUP_SUBACCOUNT_REMOVED,
        entityType: "Group",
        entityId: groupId,
        userId: user.userId,
        description: `${groupSubaccount.subaccountName || "Customer"} removed from group`,
      },
    });

    return NextResponse.json({
      success: true,
      data: groupSubaccount,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] Error removing subaccount:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
