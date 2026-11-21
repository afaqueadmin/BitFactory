/**
 * GET /api/admin/badge-counts
 *
 * Every count the admin sidebar and dashboard show as a badge, in one
 * request: COUNT queries instead of loading each list just to read its
 * length. A count the caller lacks the permission for is returned as 0,
 * the same as the per-list routes' 403s used to render.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  hasPermission,
} from "@/lib/auth/authorization";
import { isStaffRole } from "@/lib/auth/staffRoles";
import { pendingSimulationRequests } from "@/lib/simulation/convert";

export async function GET(request: NextRequest) {
  const ctx = await getAuthorizationContext(request);
  if ("response" in ctx) return ctx.response;
  if (!isStaffRole(ctx.role)) {
    return NextResponse.json(
      { error: "You don't have permission to do this" },
      { status: 403 },
    );
  }

  try {
    const can = (p: Parameters<typeof hasPermission>[1]) =>
      hasPermission(ctx, p);
    const zero = Promise.resolve(0);

    const [
      tickets,
      hashrateAlerts,
      walletRequests,
      frequencyRequests,
      walletMismatches,
      firmwareRequests,
      loginRequests,
      simulationRequests,
      staffTimeRequests,
    ] = await Promise.all([
      can("tickets.view")
        ? prisma.supportTicket.count({ where: { status: "OPEN" } })
        : zero,
      can("hashrate_alerts.view")
        ? prisma.minerHashrateAlertLog.count({
            where: { acknowledgedAt: null },
          })
        : zero,
      can("wallets.view")
        ? prisma.walletChangeRequest.count({ where: { status: "PENDING" } })
        : zero,
      can("wallets.view")
        ? prisma.paymentFrequencyChangeRequest.count({
            where: { status: "PENDING" },
          })
        : zero,
      can("wallets.view")
        ? prisma.clientWalletMismatch.count({ where: { status: "OPEN" } })
        : zero,
      can("firmware_requests.view")
        ? prisma.firmwareChangeRequest.count({ where: { status: "PENDING" } })
        : zero,
      can("signin_email_requests.view")
        ? prisma.secondaryLoginRequest.count({ where: { status: "PENDING" } })
        : zero,
      pendingSimulationRequests().then((r) => r.length),
      ctx.role === "SUPER_ADMIN"
        ? prisma.staffTimeRequest.count({ where: { status: "PENDING" } })
        : zero,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        hashrateAlerts,
        walletRequests,
        frequencyRequests,
        walletMismatches,
        firmwareRequests,
        loginRequests,
        simulationRequests,
        staffTimeRequests,
      },
    });
  } catch (error) {
    console.error("[Badge Counts API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load badge counts" },
      { status: 500 },
    );
  }
}
