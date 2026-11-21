/**
 * POST /api/admin/hashrate-alerts/bulk-acknowledge
 *
 * Marks multiple below-benchmark hashrate alerts as acknowledged in one call.
 * ADMIN/SUPER_ADMIN/ACCOUNTING only. Ids that don't exist or are already
 * acknowledged are silently skipped (same acknowledgedAt: null guard as the
 * single acknowledge route) - the caller gets back how many were actually
 * claimed.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["hashrate_alerts.acknowledge"]);
    if ("response" in auth) return auth.response;

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
