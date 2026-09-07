/**
 * POST /api/admin/hashrate-alerts/bulk-acknowledge
 *
 * Marks multiple below-benchmark hashrate alerts as acknowledged in one call.
 * ADMIN/SUPER_ADMIN only. Ids that don't exist or are already acknowledged
 * are silently skipped (same acknowledgedAt: null guard as the single
 * acknowledge route) - the caller gets back how many were actually claimed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return { error: "Admin access required", status: 403 as const };
    }
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json();
    const ids = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "ids must be a non-empty array" },
        { status: 400 },
      );
    }
    if (!ids.every((id) => typeof id === "string")) {
      return NextResponse.json(
        { success: false, error: "ids must be an array of strings" },
        { status: 400 },
      );
    }

    const claim = await prisma.minerHashrateAlertLog.updateMany({
      where: { id: { in: ids }, acknowledgedAt: null },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: auth.decoded.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { acknowledgedCount: claim.count },
    });
  } catch (error) {
    console.error("[Admin Hashrate Alerts API] bulk-acknowledge error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to acknowledge alerts" },
      { status: 500 },
    );
  }
}
