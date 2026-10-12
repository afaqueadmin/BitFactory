/**
 * POST /api/admin/hashrate-alerts/[id]/acknowledge
 *
 * Marks a below-benchmark hashrate alert as acknowledged. ADMIN/SUPER_ADMIN
 * only. Claimed via an updateMany guarded by acknowledgedAt: null so two
 * concurrent acknowledge calls on the same row can't both succeed - the same
 * pattern used by the wallet-change-request approve route.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;

    const claim = await prisma.minerHashrateAlertLog.updateMany({
      where: { id, acknowledgedAt: null },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: auth.decoded.userId,
      },
    });

    if (claim.count === 0) {
      const existing = await prisma.minerHashrateAlertLog.findUnique({
        where: { id },
        select: { id: true },
      });
      return NextResponse.json(
        {
          success: false,
          error: existing
            ? "Alert has already been acknowledged"
            : "Alert not found",
        },
        { status: existing ? 400 : 404 },
      );
    }

    const updated = await prisma.minerHashrateAlertLog.findUnique({
      where: { id },
      include: {
        miner: { select: { id: true, name: true } },
        acknowledgedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Admin Hashrate Alerts API] acknowledge error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to acknowledge alert" },
      { status: 500 },
    );
  }
}
