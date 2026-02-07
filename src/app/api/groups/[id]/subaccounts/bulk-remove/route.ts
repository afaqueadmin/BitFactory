import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

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

    // Verify authentication
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
