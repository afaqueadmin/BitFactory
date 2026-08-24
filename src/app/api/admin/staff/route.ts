/**
 * GET /api/admin/staff
 *
 * Lists ADMIN/SUPER_ADMIN users, for the ticket-assignment dropdown.
 * SUPER_ADMIN only, matching /api/tickets/[id]/assign's restriction.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only a super admin can view staff list" },
        { status: 403 },
      );
    }

    const staff = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("[Admin Staff API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}
