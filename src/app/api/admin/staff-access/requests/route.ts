/**
 * GET /api/admin/staff-access/requests
 *
 * How many requests for more working time are waiting (SUPER_ADMIN only) -
 * the sidebar badge on Access Rules. Polled, so it stays a single count.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, ["access_rules.view"]);
  if ("response" in auth) return auth.response;
  try {
    const count = await prisma.staffTimeRequest.count({
      where: { status: "PENDING" },
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Staff time request count error:", error);
    return NextResponse.json(
      { error: "Failed to count requests" },
      { status: 500 },
    );
  }
}
