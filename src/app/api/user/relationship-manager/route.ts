import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/user/relationship-manager
 *
 * The signed-in customer's relationship manager, taken from the (active)
 * group they belong to - the same name/email the invoice emails CC.
 * Returns `{ rm: null }` when the customer isn't in a group or the group has
 * no RM set.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await verifyJwtToken(token);

    const group = await prisma.group.findFirst({
      where: {
        isActive: true,
        relationshipManager: { not: null },
        subaccounts: {
          some: { OR: [{ poolAuth: { userId } }, { userId }] },
        },
      },
      select: { relationshipManager: true, email: true },
    });

    const name = group?.relationshipManager?.trim();
    if (!name) {
      return NextResponse.json({ rm: null });
    }

    return NextResponse.json({
      rm: { name, email: group?.email?.trim() || null },
    });
  } catch (error) {
    console.error("Relationship manager lookup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
