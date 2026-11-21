import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";

/**
 * GET /api/braiins-customers
 *
 * Fetches all Braiins customers from the database (PoolAuth table)
 * Admin-only endpoint
 *
 * Returns list of customers with their details and authKey status
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "pool_workers.view");
    if (denied) return denied;

    // Get Braiins pool
    const braiinsPool = await prisma.pool.findUnique({
      where: { name: "Braiins" },
      select: { id: true },
    });

    if (!braiinsPool) {
      console.log("[Braiins Customers] Braiins pool not found");
      return NextResponse.json({
        success: true,
        data: { customers: [] },
        message: "Braiins pool not configured",
      });
    }

    // Fetch all Braiins customers from PoolAuth
    const braiinsCustomers = await prisma.poolAuth.findMany({
      where: {
        poolId: braiinsPool.id,
      },
      select: {
        id: true,
        userId: true,
        authKey: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(
      `[Braiins Customers] Found ${braiinsCustomers.length} Braiins customers`,
    );

    // Transform to customer list format
    const customers = braiinsCustomers.map((auth) => ({
      id: auth.id,
      poolAuthId: auth.id,
      userId: auth.userId,
      name: auth.user?.name || "Unknown Customer",
      email: auth.user?.email || "N/A",
      hasAuthKey: !!auth.authKey,
      createdAt: auth.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: { customers },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Braiins Customers] Error fetching customers:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Braiins customers",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
