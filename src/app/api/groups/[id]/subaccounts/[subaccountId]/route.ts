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

    // Admins only (N-15: was any signed-in user, including customers).
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    let user;
    try {
      user = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

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
