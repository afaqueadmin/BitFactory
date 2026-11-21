/**
 * GET /api/admin/hashrate-alerts
 *
 * Lists below-benchmark hashrate alerts written by cron_hashrate_benchmark_alert
 * (see MinerHashrateAlertLog / hashrateBenchmarkAlertService.ts).
 * ADMIN/SUPER_ADMIN/ACCOUNTING only. Optional ?acknowledged=true|false filter
 * (defaults to all).
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["hashrate_alerts.view"]);
    if ("response" in auth) return auth.response;

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
        // Latest restart recorded against this alert, if any
        restarts: {
          orderBy: { restartedAt: "desc" },
          take: 1,
          select: {
            id: true,
            restartedAt: true,
            note: true,
            createdAt: true,
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
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
