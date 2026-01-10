import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/groups/[id]/subaccounts/[subaccountId]
 * Remove a subaccount from a group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subaccountId: string }> },
) {
  try {
    const { subaccountId } = await params;

    console.log("[Groups API] Removing subaccount:", subaccountId);

    const groupSubaccount = await prisma.groupSubaccount.delete({
      where: { id: subaccountId },
    });

    console.log("[Groups API] Subaccount removed successfully");

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
