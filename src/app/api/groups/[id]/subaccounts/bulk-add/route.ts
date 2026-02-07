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
    const { subaccountNames } = await request.json();

    // Verify authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await verifyJwtToken(token);
    if (!user || typeof user !== "object" || !("id" in user)) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    const userId = (user as unknown as { id: string }).id;

    if (!Array.isArray(subaccountNames) || subaccountNames.length === 0) {
      return NextResponse.json(
        { success: false, error: "Subaccount names array is required" },
        { status: 400 },
      );
    }

    console.log(
      "[Groups API] Bulk adding",
      subaccountNames.length,
      "subaccounts to group",
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

    // Check which subaccounts are already in groups
    const existingSubaccounts = await prisma.groupSubaccount.findMany({
      where: { subaccountName: { in: subaccountNames } },
      select: { subaccountName: true },
    });

    const existingNames = existingSubaccounts.map((s) => s.subaccountName);
    const alreadyAssigned = subaccountNames.filter((name) =>
      existingNames.includes(name),
    );

    if (alreadyAssigned.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `The following subaccounts are already in groups: ${alreadyAssigned.join(", ")}`,
          alreadyAssigned,
        },
        { status: 400 },
      );
    }

    // Add all subaccounts to the group
    const toAdd = subaccountNames.map((subaccountName) => ({
      groupId,
      subaccountName: subaccountName.trim(),
      addedBy: userId,
    }));

    const createdSubaccounts = await prisma.groupSubaccount.createMany({
      data: toAdd,
      skipDuplicates: true,
    });

    console.log(
      "[Groups API] Successfully added",
      createdSubaccounts.count,
      "subaccounts to group",
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          count: createdSubaccounts.count,
          message: `Added ${createdSubaccounts.count} subaccount(s) to the group`,
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
