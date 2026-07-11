import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";

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
 * GET /api/difficulty-adjustment
 *
 * Fetches the current Bitcoin network difficulty adjustment estimate from
 * mempool.space's public API (no key required). Luxor's pool API does not
 * expose network-wide difficulty data, so this is sourced independently.
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

    const response = await fetch(
      "https://mempool.space/api/v1/difficulty-adjustment",
      { next: { revalidate: 0 } },
    );

    if (!response.ok) {
      throw new Error(`mempool.space responded with status ${response.status}`);
    }

    const data: MempoolDifficultyAdjustment = await response.json();

    return NextResponse.json({
      success: true,
      data: {
        estimatedChangePercent: data.difficultyChange,
        estimatedRetargetDate: data.estimatedRetargetDate,
        progressPercent: data.progressPercent,
        remainingBlocks: data.remainingBlocks,
        nextRetargetHeight: data.nextRetargetHeight,
      },
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
