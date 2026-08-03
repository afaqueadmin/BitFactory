/**
 * GET /api/franchise/incentives/summary
 *
 * Franchisee-facing incentive summary — scoped to the calling franchisee's
 * own franchise via getOwnFranchise (see src/lib/franchiseeScope.ts).
 * FRANCHISEE role only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { getOwnFranchise } from "@/lib/franchiseeScope";
import { IncentiveType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { error: "Only franchisees can access this summary" },
        { status: 403 },
      );
    }

    const franchise = await getOwnFranchise(decoded.userId);
    if (!franchise) {
      return NextResponse.json(
        { error: "No franchise found for this account" },
        { status: 404 },
      );
    }

    const entries = await prisma.incentiveEntry.findMany({
      where: { franchiseId: franchise.id, status: "ACCRUED" },
      select: {
        amount: true,
        incentiveType: true,
        accrualDate: true,
        payoutBatchId: true,
        clientUserId: true,
      },
    });

    let totalEarned = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let currentMonthTotal = 0;

    const byType: Record<IncentiveType, number> = {
      HARDWARE_SALE: 0,
      OWN_MACHINE_HOSTING_REBATE: 0,
      CLIENT_HOSTING_COMMISSION: 0,
    };

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyTrendMap = new Map<string, number>();
    const clientTotals = new Map<string, number>();

    for (const entry of entries) {
      const amount = Number(entry.amount);
      totalEarned += amount;
      byType[entry.incentiveType] += amount;

      if (entry.payoutBatchId) {
        totalPaid += amount;
      } else {
        totalUnpaid += amount;
      }

      if (entry.accrualDate >= currentMonthStart) {
        currentMonthTotal += amount;
      }

      const monthKey = `${entry.accrualDate.getFullYear()}-${String(
        entry.accrualDate.getMonth() + 1,
      ).padStart(2, "0")}`;
      monthlyTrendMap.set(
        monthKey,
        (monthlyTrendMap.get(monthKey) || 0) + amount,
      );

      if (
        entry.incentiveType === IncentiveType.CLIENT_HOSTING_COMMISSION &&
        entry.clientUserId
      ) {
        clientTotals.set(
          entry.clientUserId,
          (clientTotals.get(entry.clientUserId) || 0) + amount,
        );
      }
    }

    // Fixed, zero-filled 12-month trend, oldest to newest
    const monthlyTrend: { month: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyTrend.push({ month: key, amount: monthlyTrendMap.get(key) || 0 });
    }

    const topClientIds = [...clientTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const topClientUsers = topClientIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topClientIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const topClients = topClientIds.map((id) => ({
      client: topClientUsers.find((u) => u.id === id) || null,
      amount: clientTotals.get(id) || 0,
    }));

    return NextResponse.json({
      totalEarned,
      totalPaid,
      totalUnpaid,
      currentMonthTotal,
      byType,
      monthlyTrend,
      topClients,
    });
  } catch (error) {
    console.error("Get franchise incentive summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive summary" },
      { status: 500 },
    );
  }
}
