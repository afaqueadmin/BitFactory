import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { customerBalanceTotals } from "@/lib/accounting/dashboardTotals";

/**
 * Balance totals of a franchisee's own customers (franchise dashboard).
 * Staff read the same totals from /api/admin/dashboard, per card permission.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Customer Balance GET] Token verification failed:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (userRole !== "FRANCHISEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await customerBalanceTotals({ id: userId, role: userRole });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("[Customer Balance GET] Error fetching balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer balance" },
      { status: 500 },
    );
  }
}
