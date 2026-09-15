import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
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

    // Verify authentication (this route previously had none - needed here
    // to attribute the removal for the audit log, same minimal check as
    // the sibling bulk-remove route)
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const user = await verifyJwtToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    console.log("[Groups API] Removing subaccount:", subaccountId);

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
