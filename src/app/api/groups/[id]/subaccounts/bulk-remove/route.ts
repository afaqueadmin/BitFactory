import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";

/**
 * POST /api/groups/[id]/subaccounts/bulk-remove
 * Remove multiple subaccounts from a group at once
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groupId } = await params;
    const { subaccountIds } = await request.json();

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "customer_groups.edit");
    if (denied) return denied;
    const user = { userId: ctx.userId, role: ctx.role };

    if (!Array.isArray(subaccountIds) || subaccountIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Subaccount IDs array is required" },
        { status: 400 },
      );
    }

    console.log(
      "[Groups API] Bulk removing",
      subaccountIds.length,
      "subaccounts from group",
      groupId,
    );

    // Check if group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Group not found" },
        { status: 404 },
      );
    }

    // Fetch the rows before deleting so each one can get its own audit entry
    const toRemove = await prisma.groupSubaccount.findMany({
      where: { id: { in: subaccountIds }, groupId },
      select: { id: true, subaccountName: true },
    });

    // Remove subaccounts from group
    const deleteResult = await prisma.groupSubaccount.deleteMany({
      where: {
        id: { in: subaccountIds },
        groupId,
      },
    });

    console.log(
      "[Groups API] Successfully removed",
      deleteResult.count,
      "subaccounts from group",
    );

    if (toRemove.length > 0) {
      await prisma.auditLog.createMany({
        data: toRemove.map((removed) => ({
          action: AuditAction.GROUP_SUBACCOUNT_REMOVED,
          entityType: "Group",
          entityId: groupId,
          userId: user.userId,
          description: `${removed.subaccountName || "Customer"} removed from group ${group.name}`,
        })),
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          count: deleteResult.count,
          message: `Removed ${deleteResult.count} subaccount(s) from the group`,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] Error bulk removing subaccounts:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
