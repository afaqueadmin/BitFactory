import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { LuxorError } from "@/lib/luxor";
import { poolDataCache } from "@/lib/cache";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";
import { DATA_FLOOR, PERIODS, Period, pickTick } from "@/lib/hashrateWindows";
import {
  PoolSeries,
  cacheTtlForTick,
  fetchBraiinsSeries,
  fetchLuxorEarliestData,
  fetchLuxorSeries,
  fetchLuxorUptime,
} from "@/lib/hashrateHistory";

/**
 * GET /api/miners/hashrate-history
 *
 * Per-client hashrate (and, for Luxor, share efficiency) time series.
 *
 * Query params:
 *   start   ISO instant, required — window start
 *   end     ISO instant, required — window end
 *   period  1D|1W|1M|3M|1Y|ALL, optional. Only influences tick preference;
 *           omit it for a custom range and the tick is chosen from the span.
 *   userId  ADMIN/SUPER_ADMIN or the owning FRANCHISEE only
 *
 * The caller supplies absolute instants rather than a period+offset because
 * calendar buckets ("today", "this week") must be resolved in the VIEWER's
 * timezone — this route runs in UTC and would otherwise cut days at the wrong
 * moment for anyone not on UTC.
 *
 * Scoping: series come from the caller's own PoolAuth rows, so a CLIENT can
 * only ever read their own data. `userId` is privileged and checked first.
 */
export async function GET(request: NextRequest) {
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
      console.error("[Hashrate History API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // ── Window ───────────────────────────────────────────────────────────
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

    // Clamp to what the pools can actually serve.
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
    const { tick, downgradedFrom } = pickTick(window, period, now);

    // ── Resolve whose data is being requested ────────────────────────────
    const requestedUserId = searchParams.get("userId");
    let targetUserId = callerId;

    if (requestedUserId && requestedUserId !== callerId) {
      if (callerRole === "ADMIN" || callerRole === "SUPER_ADMIN") {
        targetUserId = requestedUserId;
      } else if (callerRole === "FRANCHISEE") {
        const owned = await assertFranchiseeOwnsCustomer(
          callerId,
          requestedUserId,
        );
        if (!owned) {
          return NextResponse.json(
            { success: false, error: "Forbidden" },
            { status: 403 },
          );
        }
        targetUserId = requestedUserId;
      } else {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    // Cache the built payload. The live window's `end` moves continuously, so
    // it is rounded down to the tick for the key — otherwise every poll would
    // miss, and Luxor rate-limits.
    const ttl = cacheTtlForTick(tick);
    const roundedEnd = Math.floor(end.getTime() / (ttl * 1000)) * (ttl * 1000);
    const cacheKey = `hashrate_history_${targetUserId}_${start.getTime()}_${roundedEnd}_${tick}`;
    const cached = poolDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId: targetUserId },
      include: { pool: { select: { id: true, name: true } } },
    });

    const luxorAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("luxor"),
    );
    const braiinsAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("braiins"),
    );

    const activePoolNames: string[] = [];
    if (luxorAuth) activePoolNames.push("Luxor");
    if (braiinsAuth) activePoolNames.push("Braiins");

    const emptySeries = (): PoolSeries => ({
      available: false,
      points: [],
      uptimePoints: [],
      granularity: tick,
      hasEfficiency: false,
      hasUptime: false,
    });

    /**
     * Luxor only serves uptime at a daily tick, so a window shorter than two
     * days would yield a single point — not a line. Those windows (the 1D
     * view, and any one-day custom range) skip the call and the UI explains
     * why instead.
     */
    const wantUptime =
      (end.getTime() - start.getTime()) / 86_400_000 >= 2 && !!luxorAuth;

    const luxor: PoolSeries = luxorAuth
      ? {
          ...emptySeries(),
          available: true,
          hasEfficiency: true,
          hasUptime: wantUptime,
        }
      : emptySeries();
    const braiins: PoolSeries = braiinsAuth
      ? {
          ...emptySeries(),
          available: true,
          granularity: "1d",
          note: "Braiins reports one hashrate point per day and does not publish share efficiency or uptime.",
        }
      : emptySeries();

    // Fetch both pools concurrently; one failing must not blank the other.
    const [luxorResult, braiinsResult, earliestLuxor, uptimeResult] =
      await Promise.all([
        luxorAuth
          ? fetchLuxorSeries(luxorAuth.authKey, window, tick).catch((error) => {
              console.error(
                "[Hashrate History API] Luxor fetch failed:",
                error,
              );
              return error instanceof Error
                ? error
                : new Error("Luxor fetch failed");
            })
          : Promise.resolve(null),
        braiinsAuth
          ? fetchBraiinsSeries(braiinsAuth.authKey, targetUserId, window).catch(
              (error) => {
                console.error(
                  "[Hashrate History API] Braiins fetch failed:",
                  error,
                );
                return error instanceof Error
                  ? error
                  : new Error("Braiins fetch failed");
              },
            )
          : Promise.resolve(null),
        luxorAuth
          ? fetchLuxorEarliestData(luxorAuth.authKey)
          : Promise.resolve(null),
        wantUptime && luxorAuth
          ? fetchLuxorUptime(luxorAuth.authKey, window).catch((error) => {
              // Uptime is supplementary: log and carry on with the other series.
              console.error(
                "[Hashrate History API] Uptime fetch failed:",
                error,
              );
              return [];
            })
          : Promise.resolve([]),
      ]);

    luxor.uptimePoints = uptimeResult;

    if (Array.isArray(luxorResult)) {
      luxor.points = luxorResult;
    } else if (luxorResult instanceof Error) {
      luxor.error = luxorResult.message;
    }

    if (Array.isArray(braiinsResult)) {
      braiins.points = braiinsResult;
    } else if (braiinsResult instanceof Error) {
      braiins.error = braiinsResult.message;
    }

    // Oldest point that can be paged back to, across both pools. Braiins'
    // window is a rolling ~188 days, so its own first point is its floor.
    const braiinsEarliest = braiins.points.length ? braiins.points[0].t : null;
    const earliestCandidates = [earliestLuxor, braiinsEarliest].filter(
      (t): t is number => typeof t === "number",
    );
    const earliestData = earliestCandidates.length
      ? Math.min(...earliestCandidates)
      : null;

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
        activePoolNames,
        pools: { luxor, braiins },
      },
      timestamp: new Date().toISOString(),
    };

    poolDataCache.set(cacheKey, payload, ttl);

    console.log(
      `[Hashrate History API] user=${targetUserId} period=${period ?? "custom"} tick=${tick} ` +
        `window=${start.toISOString()}→${end.toISOString()} ` +
        `luxor=${luxor.points.length}pts braiins=${braiins.points.length}pts`,
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof LuxorError) {
      console.error(
        `[Hashrate History API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        { success: false, error: error.message, details: error.errorDetails },
        { status: error.statusCode || 500 },
      );
    }

    console.error("[Hashrate History API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch hashrate history",
      },
      { status: 500 },
    );
  }
}
