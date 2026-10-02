import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * GET /api/groups/[id]/subaccounts
 * Fetch all subaccounts in a group with user details. Admins only: it returns
 * customers' names, emails and Luxor subaccounts (previously open to anyone,
 * signed in or not - N-15).
 */
export async function GET(
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
    let role: string;
    try {
      ({ role } = await verifyJwtToken(token));
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

    const { id: groupId } = await params;

    console.log("[Groups API] Fetching subaccounts for group:", groupId);

    const groupSubaccounts = await prisma.groupSubaccount.findMany({
      where: { groupId },
      include: {
        group: true,
        poolAuth: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                poolAuths: {
                  where: { pool: { name: "Luxor" } },
                  orderBy: { createdAt: "asc" },
                  select: { authKey: true },
                },
                miners: {
                  where: { isDeleted: false },
                  select: { id: true },
                },
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            poolAuths: {
              where: { pool: { name: "Luxor" } },
              orderBy: { createdAt: "asc" },
              select: { authKey: true },
            },
            miners: {
              where: { isDeleted: false },
              select: { id: true },
            },
          },
        },
      },
    });

    const subaccountsWithDetails = groupSubaccounts.map((sa) => {
      const user = sa.poolAuth?.user || sa.user;

      return {
        id: sa.id,
        subaccountName: sa.subaccountName,
        poolAuthId: sa.poolAuthId || undefined,
        userId: sa.userId || undefined,
        addedAt: sa.addedAt,
        addedBy: sa.addedBy,
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              luxorSubaccounts: user.poolAuths.map((p) => p.authKey),
              minerCount: user.miners.length,
            }
          : null,
      };
    });

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
