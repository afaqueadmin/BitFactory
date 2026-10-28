import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { loadSuggestedHostingLineItems } from "@/lib/accounting/minerMonthlyHosting";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can access miners" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    // AUTO miners and their suggested hosting line items (shared with the
    // monthly bill estimate and the guild hosting invoice).
    return NextResponse.json(await loadSuggestedHostingLineItems(customerId));
  } catch (error) {
    console.error("Failed to fetch miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
