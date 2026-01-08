import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/groups/[id]/subaccounts/add
 * Add a subaccount to a group
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groupId } = await params;
    const { subaccountName } = await request.json();

    if (!subaccountName?.trim()) {
      return NextResponse.json(
        { success: false, error: "Subaccount name is required" },
        { status: 400 },
      );
    }

    console.log(
      "[Groups API] Adding subaccount",
      subaccountName,
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

    // Check if subaccount already exists in any group
    const existingSubaccount = await prisma.groupSubaccount.findUnique({
      where: { subaccountName },
    });

    if (existingSubaccount) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Subaccount already belongs to another group. Remove it from the other group first.",
        },
        { status: 409 },
      );
    }

    // Add subaccount to group
    const groupSubaccount = await prisma.groupSubaccount.create({
      data: {
        groupId,
        subaccountName,
        addedBy: "system", // TODO: Get from auth context
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
