import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import { pendingSimulationRequests } from "@/lib/simulation/convert";
import { loadSimBalances } from "@/lib/simulation/ledgerStore";

export const runtime = "nodejs";

/**
 * GET /api/simulated-accounts  (ADMIN / SUPER_ADMIN / ACCOUNTING)
 *
 * Every simulated (SIMULATED) account - active and inactive - with the
 * contact details given at signup and its last login: the marketing lead
 * list. Inactive = soft-deleted (see ./[id]/status). Also returns the open
 * requests from Potential Customers who asked for one (see ./request).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "simulated_accounts.view");
    if (denied) return denied;

    const users = await prisma.user.findMany({
      where: { role: "SIMULATED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        createdAt: true,
        isDeleted: true,
      },
    });

    const requests = await pendingSimulationRequests();

    const lastLogins = users.length
      ? await prisma.userSession.groupBy({
          by: ["userId"],
          where: { userId: { in: users.map((u) => u.id) } },
          _max: { loginAt: true },
        })
      : [];
    const lastLoginById = new Map(
      lastLogins.map((l) => [l.userId, l._max.loginAt]),
    );
    const balanceById = await loadSimBalances(users.map((u) => u.id));

    return NextResponse.json({
      success: true,
      data: users.map(({ isDeleted, ...u }) => ({
        ...u,
        active: !isDeleted,
        lastLoginAt: lastLoginById.get(u.id) ?? null,
        balance: balanceById.get(u.id) ?? 0,
      })),
      requests,
    });
  } catch (error) {
    console.error("[Simulated Accounts API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load simulated accounts" },
      { status: 500 },
    );
  }
}
