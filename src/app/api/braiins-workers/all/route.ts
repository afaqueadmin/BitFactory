/**
 * src/app/api/braiins-workers/all/route.ts
 * Admin Endpoint: Fetch Braiins workers from multiple miners
 *
 * Fetches workers from all selected Braiins miners (admin-only)
 * and aggregates results with miner identification.
 *
 * Query Parameters:
 * - minerIds: Comma-separated miner IDs (URL encoded)
 *
 * Returns:
 * {
 *   success: boolean,
 *   data: {
 *     workers: Array<{
 *       name: string,
 *       minerName: string,
 *       minerId: string,
 *       state: string,
 *       hash_rate_24h: number,
 *       last_share: number,
 *       ...other fields
 *     }>
 *   },
 *   timestamp: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

interface BraiinsWorkerDetail {
  name: string;
  state: string;
  last_share: number;
  hash_rate_unit: string;
  hash_rate_5m: number;
  hash_rate_60m: number;
  hash_rate_24h: number;
  shares_5m: number;
  shares_60m: number;
  shares_24h: number;
}

interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

interface BraiinsWorkersResponse {
  workers: BraiinsWorkerDetail[];
}

interface WorkerWithMinerInfo extends BraiinsWorkerDetail {
  minerName: string;
  minerId: string;
}

async function extractUserFromToken(
  request: NextRequest,
): Promise<{ userId: string; role: string } | null> {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      console.log("[Braiins Workers All] GET: No authorization token provided");
      return null;
    }

    const decoded = await verifyJwtToken(token);
    if (!decoded || typeof decoded === "string") {
      console.log("[Braiins Workers All] GET: Invalid token");
      return null;
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
    };
  } catch (error) {
    console.error(
      "[Braiins Workers All] GET: Token verification failed:",
      error,
    );
    return null;
  }
}

export async function GET(request: NextRequest) {
  console.log("[Braiins Workers All] GET: Authenticating user...");

  const userInfo = await extractUserFromToken(request);

  if (!userInfo) {
    console.log("[Braiins Workers All] GET: Authentication failed");
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Verify admin role
  if (!["ADMIN", "SUPER_ADMIN"].includes(userInfo.role)) {
    console.log(
      `[Braiins Workers All] GET: User ${userInfo.userId} is not admin`,
    );
    return NextResponse.json(
      { success: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  console.log(
    `[Braiins Workers All] GET: Admin authenticated: ${userInfo.userId}`,
  );

  try {
    // Get minerIds from query params
    const minerIdsParam = request.nextUrl.searchParams.get("minerIds");

    if (!minerIdsParam) {
      console.log("[Braiins Workers All] GET: No minerIds provided");
      return NextResponse.json(
        {
          success: true,
          data: { workers: [] },
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    const minerIds = minerIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    console.log(
      `[Braiins Workers All] GET: Fetching workers for miners: ${minerIds.join(", ")}`,
    );

    // Fetch miners with their poolAuth tokens
    const miners = await prisma.miner.findMany({
      where: {
        id: { in: minerIds },
        pool: { name: "Braiins" },
        poolAuth: { not: null },
      },
    });

    if (miners.length === 0) {
      console.log(
        "[Braiins Workers All] GET: No Braiins miners found with poolAuth",
      );
      return NextResponse.json(
        {
          success: true,
          data: { workers: [] },
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    console.log(
      `[Braiins Workers All] GET: Found ${miners.length} miners with poolAuth`,
    );

    // Fetch workers from each miner
    const allWorkers: WorkerWithMinerInfo[] = [];

    for (const miner of miners) {
      if (!miner.poolAuth) {
        continue;
      }

      try {
        console.log(
          `[Braiins Workers All] GET: Fetching workers for miner ${miner.name} (${miner.id})`,
        );

        // Call Braiins API through proxy with minerId
        const apiUrl = new URL(
          "/api/braiins?endpoint=workers",
          request.url.split("/api/braiins-workers")[0],
        );

        // Add minerId to query params - let the proxy handle it
        apiUrl.searchParams.set("minerId", miner.id);

        const response = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: {
            Authorization: request.headers.get("Authorization") || "",
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.warn(
            `[Braiins Workers All] GET: Failed to fetch workers for miner ${miner.name}: ${response.status}`,
          );
          continue;
        }

        const data: ProxyResponse<BraiinsWorkersResponse> =
          await response.json();

        if (data.success && data.data?.workers) {
          const workersList = data.data.workers as BraiinsWorkerDetail[];

          // Add miner identification to each worker
          const workersWithMinerInfo: WorkerWithMinerInfo[] = workersList.map(
            (worker) => ({
              ...worker,
              minerName: miner.name,
              minerId: miner.id,
            }),
          );

          allWorkers.push(...workersWithMinerInfo);
          console.log(
            `[Braiins Workers All] GET: Added ${workersWithMinerInfo.length} workers from miner ${miner.name}`,
          );
        }
      } catch (error) {
        console.error(
          `[Braiins Workers All] GET: Error fetching workers for miner ${miner.name}:`,
          error,
        );
        continue;
      }
    }

    console.log(
      `[Braiins Workers All] GET: Successfully aggregated ${allWorkers.length} workers from ${miners.length} miners`,
    );

    return NextResponse.json(
      {
        success: true,
        data: { workers: allWorkers },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Braiins Workers All] GET: Server error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
