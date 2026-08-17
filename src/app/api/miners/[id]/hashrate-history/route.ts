import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { LuxorError } from "@/lib/luxor";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";
import {
  DATA_FLOOR,
  PERIODS,
  Period,
  pickWorkerTick,
} from "@/lib/hashrateWindows";
import {
  PoolSeries,
  fetchWorkerEarliestData,
  fetchWorkerLuxorSeries,
} from "@/lib/hashrateHistory";

/**
 * GET /api/miners/[id]/hashrate-history
 *
 * Same shape and window/tick contract as /api/miners/hashrate-history, but
 * scoped to a single miner's worker-level series instead of the whole
 * subaccount. Reuses the same HashrateHistoryChart component client-side.
 *
 * Only Luxor has any worker-level history at all — Braiins has no
 * historical worker endpoint at any granularity (verified separately) — so
 * a Braiins miner (or one with no pool) always gets an empty response, not
 * an error; the chart renders its normal "no data" state for that.
 *
 * No uptime here: Luxor's uptime endpoint is subaccount-scoped only, there
 * is no per-worker equivalent.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let callerId: string;
    let callerRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      callerId = decoded.userId;
      callerRole = decoded.role;
    } catch (error) {
      console.error(
        "[Miner Hashrate History API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id: minerId } = await context.params;

    const miner = await prisma.miner.findUnique({
      where: { id: minerId },
      select: {
        id: true,
        name: true,
        userId: true,
        pool: { select: { name: true } },
      },
    });

    if (!miner) {
      return NextResponse.json(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    if (miner.userId !== callerId) {
      if (callerRole === "FRANCHISEE") {
        const owned = await assertFranchiseeOwnsCustomer(
          callerId,
          miner.userId,
        );
        if (!owned) {
          return NextResponse.json(
            { success: false, error: "Forbidden" },
            { status: 403 },
          );
        }
      } else if (callerRole !== "ADMIN" && callerRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    // ── Window (identical parsing to /api/miners/hashrate-history) ────────
    const searchParams = request.nextUrl.searchParams;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (!startParam || !endParam) {
      return NextResponse.json(
        { success: false, error: "start and end are required ISO instants" },
        { status: 400 },
      );
    }

    const now = new Date();
    let start = new Date(startParam);
    let end = new Date(endParam);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return NextResponse.json(
        { success: false, error: "start and end must be valid ISO instants" },
        { status: 400 },
      );
    }
    if (start >= end) {
      return NextResponse.json(
        { success: false, error: "start must be before end" },
        { status: 400 },
      );
    }

    if (start < DATA_FLOOR) start = new Date(DATA_FLOOR);
    if (end > now) end = now;
    if (start >= end) {
      return NextResponse.json(
        { success: false, error: "Requested window is entirely in the future" },
        { status: 400 },
      );
    }

    const periodParam = searchParams.get("period");
    const period: Period | null =
      periodParam && (PERIODS as readonly string[]).includes(periodParam)
        ? (periodParam as Period)
        : null;
    if (periodParam && !period) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid period. Expected one of: ${PERIODS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const window = { start, end };
    const { tick, downgradedFrom } = pickWorkerTick(window, period, now);

    const emptySeries = (): PoolSeries => ({
      available: false,
      points: [],
      uptimePoints: [],
      granularity: tick,
      hasEfficiency: false,
      hasUptime: false,
    });

    // Only Luxor ever has worker-level history.
    if (miner.pool?.name !== "Luxor") {
      return NextResponse.json({
        success: true,
        data: {
          period,
          tickSize: tick,
          downgradedFrom: downgradedFrom ?? null,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          earliestData: null,
          activePoolNames: miner.pool?.name ? [miner.pool.name] : [],
          pools: { luxor: emptySeries(), braiins: emptySeries() },
        },
        timestamp: new Date().toISOString(),
      });
    }

    const poolSubaccount = await prisma.poolSubaccount.findFirst({
      where: { userId: miner.userId, pool: { name: "Luxor" } },
      include: { poolAuth: true },
    });

    if (!poolSubaccount || !poolSubaccount.poolAuth) {
      return NextResponse.json({
        success: true,
        data: {
          period,
          tickSize: tick,
          downgradedFrom: downgradedFrom ?? null,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          earliestData: null,
          activePoolNames: [],
          pools: { luxor: emptySeries(), braiins: emptySeries() },
        },
        timestamp: new Date().toISOString(),
      });
    }

    const [points, earliestData] = await Promise.all([
      fetchWorkerLuxorSeries(
        poolSubaccount.poolAuth.authKey,
        miner.name,
        window,
        tick,
        poolSubaccount.id,
      ),
      fetchWorkerEarliestData(poolSubaccount.id, miner.name),
    ]);

    const luxor: PoolSeries = {
      available: true,
      points,
      uptimePoints: [],
      granularity: tick,
      hasEfficiency: true,
      hasUptime: false,
    };

    const payload = {
      success: true,
      data: {
        period,
        tickSize: tick,
        downgradedFrom: downgradedFrom ?? null,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        earliestData: earliestData
          ? new Date(earliestData).toISOString()
          : null,
        activePoolNames: ["Luxor"],
        pools: { luxor, braiins: emptySeries() },
      },
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Miner Hashrate History API] miner=${miner.id} worker=${miner.name} tick=${tick} ` +
        `window=${start.toISOString()}→${end.toISOString()} points=${points.length}`,
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof LuxorError) {
      console.error(
        `[Miner Hashrate History API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        { success: false, error: error.message, details: error.errorDetails },
        { status: error.statusCode || 500 },
      );
    }

    console.error("[Miner Hashrate History API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch miner hashrate history",
      },
      { status: 500 },
    );
  }
}
