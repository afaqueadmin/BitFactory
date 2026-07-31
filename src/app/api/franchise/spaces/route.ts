/**
 * GET /api/franchise/spaces
 *
 * Read-only list of physical hosting spaces for the miner filter/assignment
 * dropdowns. Spaces are global infrastructure (not owned per-franchise), so
 * no ownership scoping is needed here — only that the caller is a
 * FRANCHISEE. Independent of the admin /api/spaces route (which is
 * ADMIN/SUPER_ADMIN only and includes management-only capacity analytics
 * this page doesn't need).
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

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisee access required" },
        { status: 403 },
      );
    }

    const spaces = await prisma.space.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, location: true, status: true },
    });

    return NextResponse.json({ success: true, data: spaces });
  } catch (error) {
    console.error("[Franchise Spaces API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch spaces" },
      { status: 500 },
    );
  }
}
