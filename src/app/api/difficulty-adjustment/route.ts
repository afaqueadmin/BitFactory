import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { fetchFromMempool } from "@/lib/bitcoinNetwork";

interface MempoolDifficultyAdjustment {
  progressPercent: number;
  difficultyChange: number;
  estimatedRetargetDate: number;
  remainingBlocks: number;
  remainingTime: number;
  previousRetarget: number;
  previousTime: number;
  nextRetargetHeight: number;
  timeAvg: number;
  timeOffset: number;
}

/**
 * Difficulty only moves on Bitcoin's ~10 minute block cadence, so caching for
 * five minutes costs nothing in freshness. Without it every page load from
 * every user hits the upstream API through this server's single IP.
 */
const CACHE_SECONDS = 300;

/** Consensus clamps a retarget to a factor of 4 in either direction. */
const MAX_ABS_CHANGE_PERCENT = 300;

/**
 * Accepts a timestamp in either unit and returns milliseconds. Guards against a
 * mirror that reports seconds, which would otherwise render as a 1970 date.
 */
function toMilliseconds(value: number): number {
  return value < 1e12 ? value * 1000 : value;
}

function isUsable(data: MempoolDifficultyAdjustment): boolean {
  return (
    Number.isFinite(data?.difficultyChange) &&
    Math.abs(data.difficultyChange) <= MAX_ABS_CHANGE_PERCENT &&
    Number.isFinite(data?.estimatedRetargetDate) &&
    data.estimatedRetargetDate > 0
  );
}

/**
 * GET /api/difficulty-adjustment
 *
 * Fetches the current Bitcoin network difficulty adjustment estimate from the
 * mempool.space public API, falling back to a mirror. Luxor's pool API does not
 * expose network-wide difficulty data — /pool/pool-stats/:currency returns only
 * hashrate, hashprice, active workers and the payment threshold — so this is
 * sourced independently.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await verifyJwtToken(token);
    } catch (error) {
      console.error(
        "[Difficulty Adjustment API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data, source } =
      await fetchFromMempool<MempoolDifficultyAdjustment>(
        "/api/v1/difficulty-adjustment",
        isUsable,
        CACHE_SECONDS,
      );

    return NextResponse.json({
      success: true,
      data: {
        estimatedChangePercent: data.difficultyChange,
        estimatedRetargetDate: toMilliseconds(data.estimatedRetargetDate),
        progressPercent: data.progressPercent,
        remainingBlocks: data.remainingBlocks,
        nextRetargetHeight: data.nextRetargetHeight,
      },
      source,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Difficulty Adjustment API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch difficulty adjustment data",
      },
      { status: 500 },
    );
  }
}
