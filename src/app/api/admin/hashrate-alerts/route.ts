/**
 * GET /api/admin/hashrate-alerts
 *
 * Lists below-benchmark hashrate alerts written by cron_hashrate_benchmark_alert
 * (see MinerHashrateAlertLog / hashrateBenchmarkAlertService.ts). ADMIN/SUPER_ADMIN
 * only. Optional ?acknowledged=true|false filter (defaults to all).
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const acknowledgedParam = request.nextUrl.searchParams.get("acknowledged");
    const where =
      acknowledgedParam === "true"
        ? { acknowledgedAt: { not: null } }
        : acknowledgedParam === "false"
          ? { acknowledgedAt: null }
          : {};

    const alerts = await prisma.minerHashrateAlertLog.findMany({
      where,
      orderBy: [{ date: "desc" }, { notifiedAt: "desc" }],
      include: {
        miner: {
          select: {
            id: true,
            name: true,
            user: { select: { name: true, companyName: true } },
          },
        },
        acknowledgedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    console.error("[Admin Hashrate Alerts API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch hashrate alerts" },
      { status: 500 },
    );
  }
}
