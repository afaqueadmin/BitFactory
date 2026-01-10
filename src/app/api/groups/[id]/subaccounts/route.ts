import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/groups/[id]/subaccounts
 * Fetch all subaccounts in a group with user details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groupId } = await params;

    console.log("[Groups API] Fetching subaccounts for group:", groupId);

    const groupSubaccounts = await prisma.groupSubaccount.findMany({
      where: { groupId },
      include: {
        group: true,
      },
    });

    // Get user details for each subaccount
    const subaccountsWithDetails = await Promise.all(
      groupSubaccounts.map(async (sa) => {
        const user = await prisma.user.findFirst({
          where: { luxorSubaccountName: sa.subaccountName },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            luxorSubaccountName: true,
            miners: {
              where: { isDeleted: false },
              select: { id: true },
            },
          },
        });

        return {
          id: sa.id,
          subaccountName: sa.subaccountName,
          addedAt: sa.addedAt,
          addedBy: sa.addedBy,
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                luxorSubaccountName: user.luxorSubaccountName,
                minerCount: user.miners.length,
              }
            : null,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: subaccountsWithDetails,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] Error fetching subaccounts:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
