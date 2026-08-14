import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * POST /api/groups/[id]/subaccounts/add
 * Add a client's pool credential (PoolAuth) to a group. Admin/Super Admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let authenticatedUserId: string;
    let role: string;
    try {
      const decoded = await verifyJwtToken(token);
      authenticatedUserId = decoded.userId;
      role = decoded.role;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can manage groups",
        },
        { status: 403 },
      );
    }

    const { id: groupId } = await params;
    const { poolAuthId, userId } = await request.json();

    if (!poolAuthId?.trim() && !userId?.trim()) {
      return NextResponse.json(
        { success: false, error: "poolAuthId or userId is required" },
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

    let groupSubaccount;

    if (poolAuthId?.trim()) {
      console.log(
        "[Groups API] Adding poolAuthId",
        poolAuthId,
        "to group",
        groupId,
      );

      const poolAuth = await prisma.poolAuth.findUnique({
        where: { id: poolAuthId },
        select: { id: true, authKey: true },
      });

      if (!poolAuth) {
        return NextResponse.json(
          { success: false, error: "Pool credential not found" },
          { status: 404 },
        );
      }

      // Check if this credential already belongs to any group
      const existingSubaccount = await prisma.groupSubaccount.findFirst({
        where: { poolAuthId },
      });

      if (existingSubaccount) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This credential already belongs to another group. Remove it from the other group first.",
          },
          { status: 409 },
        );
      }

      groupSubaccount = await prisma.groupSubaccount.create({
        data: {
          groupId,
          subaccountName: poolAuth.authKey,
          poolAuthId: poolAuth.id,
          addedBy: authenticatedUserId,
          addedByUserId: authenticatedUserId,
        },
      });
    } else {
      // User with no Luxor subaccount - membership keyed directly on userId
      console.log("[Groups API] Adding userId", userId, "to group", groupId);

      const member = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isDeleted: true },
      });

      if (!member || member.isDeleted || member.role !== "CLIENT") {
        return NextResponse.json(
          { success: false, error: "Customer not found" },
          { status: 404 },
        );
      }

      const existingSubaccount = await prisma.groupSubaccount.findFirst({
        where: { userId },
      });

      if (existingSubaccount) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This customer already belongs to another group. Remove them from the other group first.",
          },
          { status: 409 },
        );
      }

      groupSubaccount = await prisma.groupSubaccount.create({
        data: {
          groupId,
          userId: member.id,
          addedBy: authenticatedUserId,
          addedByUserId: authenticatedUserId,
        },
      });
    }

    console.log("[Groups API] Subaccount added successfully:", groupSubaccount);

    return NextResponse.json({
      success: true,
      data: groupSubaccount,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] Error adding subaccount:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
