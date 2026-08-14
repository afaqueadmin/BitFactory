import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * POST /api/groups/[id]/subaccounts/bulk-add
 * Add multiple subaccounts to a group at once
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groupId } = await params;
    const { poolAuthIds, userIds } = await request.json();

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

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can manage groups",
        },
        { status: 403 },
      );
    }

    const userId = user.userId;

    const hasPoolAuthIds = Array.isArray(poolAuthIds) && poolAuthIds.length > 0;
    const hasUserIds = Array.isArray(userIds) && userIds.length > 0;

    if (!hasPoolAuthIds && !hasUserIds) {
      return NextResponse.json(
        { success: false, error: "poolAuthIds or userIds array is required" },
        { status: 400 },
      );
    }

    // Check if group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Group not found" },
        { status: 404 },
      );
    }

    let totalCount = 0;

    if (hasPoolAuthIds) {
      console.log(
        "[Groups API] Bulk adding",
        poolAuthIds.length,
        "credentials to group",
        groupId,
      );

      const poolAuths = await prisma.poolAuth.findMany({
        where: { id: { in: poolAuthIds } },
        select: { id: true, authKey: true },
      });

      // Check which credentials are already in groups
      const existingSubaccounts = await prisma.groupSubaccount.findMany({
        where: { poolAuthId: { in: poolAuthIds } },
        select: { poolAuthId: true },
      });

      const existingIds = new Set(existingSubaccounts.map((s) => s.poolAuthId));
      const alreadyAssigned = poolAuthIds.filter((id) => existingIds.has(id));

      if (alreadyAssigned.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${alreadyAssigned.length} of the selected credential(s) are already in groups`,
            alreadyAssigned,
          },
          { status: 400 },
        );
      }

      const toAdd = poolAuths.map((pa) => ({
        groupId,
        subaccountName: pa.authKey,
        poolAuthId: pa.id,
        addedBy: userId,
        addedByUserId: userId,
      }));

      const createdSubaccounts = await prisma.groupSubaccount.createMany({
        data: toAdd,
        skipDuplicates: true,
      });
      totalCount += createdSubaccounts.count;
    }

    if (hasUserIds) {
      console.log(
        "[Groups API] Bulk adding",
        userIds.length,
        "subaccount-less customers to group",
        groupId,
      );

      const members = await prisma.user.findMany({
        where: { id: { in: userIds }, role: "CLIENT", isDeleted: false },
        select: { id: true },
      });

      // Check which customers already belong to a group
      const existingSubaccounts = await prisma.groupSubaccount.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true },
      });

      const existingIds = new Set(existingSubaccounts.map((s) => s.userId));
      const alreadyAssigned = userIds.filter((id: string) =>
        existingIds.has(id),
      );

      if (alreadyAssigned.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${alreadyAssigned.length} of the selected customer(s) are already in groups`,
            alreadyAssigned,
          },
          { status: 400 },
        );
      }

      const toAdd = members.map((m) => ({
        groupId,
        userId: m.id,
        addedBy: userId,
        addedByUserId: userId,
      }));

      const createdMembers = await prisma.groupSubaccount.createMany({
        data: toAdd,
        skipDuplicates: true,
      });
      totalCount += createdMembers.count;
    }

    console.log(
      "[Groups API] Successfully added",
      totalCount,
      "subaccounts/customers to group",
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          count: totalCount,
          message: `Added ${totalCount} subaccount(s) to the group`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] Error bulk adding subaccounts:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
