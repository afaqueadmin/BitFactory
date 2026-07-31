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
    const { poolAuthId } = await request.json();

    if (!poolAuthId?.trim()) {
      return NextResponse.json(
        { success: false, error: "poolAuthId is required" },
        { status: 400 },
      );
    }

    console.log(
      "[Groups API] Adding poolAuthId",
      poolAuthId,
      "to group",
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

    // Add subaccount to group
    const groupSubaccount = await prisma.groupSubaccount.create({
      data: {
        groupId,
        subaccountName: poolAuth.authKey,
        poolAuthId: poolAuth.id,
        addedBy: authenticatedUserId,
        addedByUserId: authenticatedUserId,
      },
    });

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
