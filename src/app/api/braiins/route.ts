/**
 * src/app/api/braiins/route.ts
 * Braiins Pool API Proxy Route
 *
 * A secure Next.js server-side proxy for the Braiins Mining Pool API.
 *
 * This route:
 * 1. Verifies the user is authenticated (from JWT token)
 * 2. Fetches the requested miner and validates poolAuth
 * 3. Validates the requested endpoint against an allowed list
 * 4. Proxies the request to the Braiins API (server-side only)
 * 5. Returns data in a consistent JSON format
 *
 * The poolAuth (Braiins API token) is never exposed to the client - it only exists
 * on the server and is attached to requests here via BraiinsClient.
 *
 * Architecture:
 * - Each miner has its own poolAuth (Braiins API token)
 * - One token = one Braiins user account
 * - Cannot query multiple Braiins users in one API call
 *
 * Usage from client:
 * ```typescript
 * const response = await fetch('/api/braiins?endpoint=profile&minerId=m123');
 * const { success, data, error } = await response.json();
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createBraiinsClient, BraiinsClient, BraiinsError } from "@/lib/braiins";

// ✅ Ensure this runs on Node.js runtime (required for async operations)
export const runtime = "nodejs";

/**
 * Response format for all Braiins API proxy responses
 * Provides a consistent interface regardless of the underlying endpoint
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Maps user-facing endpoint names to actual Braiins API handler methods
 *
 * This prevents exposing internal Braiins endpoint structure to the client
 * and allows for future abstraction/renaming without breaking clients.
 *
 * Braiins Pool API Endpoints:
 * - pool-stats: Global pool statistics
 * - profile: User profile and summary
 * - daily-rewards: Rewards by date range
 * - daily-hashrate: Hashrate with optional grouping
 * - block-rewards: Block rewards by date
 * - workers: All workers for this user
 * - payouts: Payouts by date range
 */
const endpointMap: Record<
  string,
  {
    method: "GET" | "POST";
    requiresMiner?: boolean;
    description: string;
  }
> = {
  // Global Pool Stats (no auth required)
  "pool-stats": {
    method: "GET",
    requiresMiner: false,
    description: "Get global pool statistics",
  },

  // User Profile & Data
  profile: {
    method: "GET",
    requiresMiner: true,
    description: "Get user profile and summary",
  },
  "daily-rewards": {
    method: "GET",
    requiresMiner: true,
    description: "Get daily rewards data",
  },
  "daily-hashrate": {
    method: "GET",
    requiresMiner: true,
    description: "Get daily hashrate data",
  },
  "block-rewards": {
    method: "GET",
    requiresMiner: true,
    description: "Get block rewards data",
  },
  workers: {
    method: "GET",
    requiresMiner: false, // Changed: Can fetch workers from all miners or specific miner
    description: "Get all workers for this user (optionally filtered by minerId)",
  },
  payouts: {
    method: "GET",
    requiresMiner: true,
    description: "Get payouts for this user",
  },
};

/**
 * Helper: Extract and validate JWT token from request cookies
 *
 * Verifies the JWT and fetches the user's profile from the database.
 *
 * @param request - NextRequest object
 * @returns Object with userId and role if valid
 * @throws Error if token is invalid or user not found
 */
async function extractUserFromToken(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    throw new Error("Authentication required: No token found");
  }

  try {
    const decoded = await verifyJwtToken(token);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Authentication failed: Invalid or expired token");
  }
}

/**
 * Helper: Get miner details with poolAuth
 *
 * Fetches miner from database including relationship to space (pool name).
 * Validates that:
 * 1. Miner exists and belongs to authenticated user
 * 2. Miner's poolAuth is set (contains Braiins API token)
 * 3. Space.name indicates this is a Braiins pool
 *
 * @param minerId - ID of miner to fetch
 * @param userId - ID of authenticated user (for ownership check)
 * @returns Miner with space details
 * @throws Error if miner not found, doesn't belong to user, or poolAuth not set
 */
async function getMinerWithPoolAuth(minerId: string, userId: string) {
  const miner = await prisma.miner.findUnique({
    where: { id: minerId },
    include: {
      space: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!miner) {
    throw new Error(`Miner not found: ${minerId}`);
  }

  if (miner.userId !== userId) {
    throw new Error("Unauthorized: Miner does not belong to authenticated user");
  }

  if (!miner.poolAuth) {
    throw new Error(
      `Braiins pool authentication not configured for miner: ${miner.name}. Please add Braiins API token.`,
    );
  }

  // Verify this is a Braiins pool (space.name should indicate pool type)
  // Note: space.name format could be "Braiins", "braiins", etc. - be flexible
  if (!miner.space.name.toLowerCase().includes("braiins")) {
    throw new Error(
      `Miner is not configured for Braiins pool. Current pool: ${miner.space.name}`,
    );
  }

  return miner;
}

/**
 * GET /api/braiins
 *
 * Proxies GET requests to the Braiins Pool API with server-side authentication.
 *
 * Query Parameters:
 * - endpoint (required): One of the mapped endpoint names
 * - minerId (required for most endpoints): ID of the miner/user to query
 *   - For pool-stats: optional (public endpoint)
 *   - For others: required (needs user's poolAuth token)
 * - from: Unix timestamp for date range queries (seconds)
 * - to: Unix timestamp for date range queries (seconds)
 * - group: Boolean for hashrate grouping (aggregates this user's workers)
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: any,           // Response from Braiins API
 *   error?: string,       // Error message if failed
 *   timestamp?: string    // ISO timestamp
 * }
 *
 * Status Codes:
 * - 200: Success
 * - 400: Bad request (missing endpoint, invalid parameters)
 * - 401: Unauthorized (invalid/missing token)
 * - 403: Forbidden (miner doesn't belong to user, insufficient permissions)
 * - 404: Endpoint not found
 * - 500: Server error
 *
 * Examples:
 *
 * Get pool stats (public):
 * GET /api/braiins?endpoint=pool-stats
 *
 * Get user profile:
 * GET /api/braiins?endpoint=profile&minerId=m123
 *
 * Get daily rewards for date range:
 * GET /api/braiins?endpoint=daily-rewards&minerId=m123&from=1704067200&to=1704153600
 *
 * Get daily hashrate with grouping:
 * GET /api/braiins?endpoint=daily-hashrate&minerId=m123&group=true
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Braiins Proxy] GET: Authenticating user...");
    let user: {
      userId: string;
      role: string;
    };
    try {
      user = await extractUserFromToken(request);
      console.log(`[Braiins Proxy] GET: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Braiins Proxy] GET: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Validate endpoint parameter
    const { searchParams } = request.nextUrl;
    const endpoint = searchParams.get("endpoint");

    console.log(`[Braiins Proxy] GET: Requested endpoint: ${endpoint}`);

    if (!endpoint) {
      return NextResponse.json<ProxyResponse>(
        { success: false, error: "Endpoint parameter is required" },
        { status: 400 },
      );
    }

    if (!(endpoint in endpointMap)) {
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: `Unsupported endpoint: "${endpoint}". Supported endpoints: ${Object.keys(endpointMap).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const endpointConfig = endpointMap[endpoint];

    // ✅ STEP 3: Validate and fetch miner (if required for this endpoint)
    let braiinsClient: BraiinsClient | undefined;
    let braiinsClients: Array<{ client: BraiinsClient; miner: any }> = []; // For workers endpoint without minerId

    // Special case: workers endpoint without minerId - fetch from all Braiins miners
    if (endpoint === "workers" && !searchParams.get("minerId")) {
      console.log(
        "[Braiins Proxy] GET: Workers endpoint without minerId - fetching from all miners"
      );
      try {
        // Fetch all Braiins miners for this user
        const miners = await prisma.miner.findMany({
          where: { userId: user.userId },
          include: { pool: { select: { name: true } } },
        });

        const braiinsMinersList = miners.filter(
          (m) => m.pool?.name === "Braiins" && m.poolAuth
        );

        if (braiinsMinersList.length === 0) {
          console.log(
            "[Braiins Proxy] GET: No Braiins miners with auth configured"
          );
          return NextResponse.json<ProxyResponse>(
            {
              success: true,
              data: { workers: [] },
              timestamp: new Date().toISOString(),
            },
            { status: 200 }
          );
        }

        console.log(
          `[Braiins Proxy] GET: Found ${braiinsMinersList.length} Braiins miners`
        );

        // Initialize clients for all miners
        for (const miner of braiinsMinersList) {
          try {
            const client = createBraiinsClient(miner.poolAuth!, user.userId);
            braiinsClients.push({ client, miner });
          } catch (e) {
            console.warn(
              `[Braiins Proxy] GET: Failed to initialize client for miner ${miner.name}`
            );
          }
        }

        if (braiinsClients.length === 0) {
          return NextResponse.json<ProxyResponse>(
            {
              success: false,
              error:
                "Failed to initialize Braiins clients for any miner. Please contact support.",
            },
            { status: 500 }
          );
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Failed to fetch Braiins miners";
        console.error(`[Braiins Proxy] GET: ${errorMsg}`);
        return NextResponse.json<ProxyResponse>(
          { success: false, error: errorMsg },
          { status: 500 }
        );
      }
    } else if (endpointConfig.requiresMiner) {
      // Original logic for other endpoints requiring minerId
      const minerId = searchParams.get("minerId");
      if (!minerId) {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `minerId parameter is required for ${endpoint} endpoint`,
          },
          { status: 400 }
        );
      }

      let miner;
      try {
        miner = await getMinerWithPoolAuth(minerId, user.userId);
        console.log(
          `[Braiins Proxy] GET: Miner validated: ${miner.name} (${minerId})`
        );
      } catch (minerError) {
        const errorMsg =
          minerError instanceof Error
            ? minerError.message
            : "Failed to fetch miner";
        console.error(`[Braiins Proxy] GET: ${errorMsg}`);
        return NextResponse.json<ProxyResponse>(
          { success: false, error: errorMsg },
          { status: 403 }
        );
      }

      // Verify poolAuth is set
      if (!miner.poolAuth) {
        console.error(
          `[Braiins Proxy] GET: Miner ${minerId} has no poolAuth configured`
        );
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: "Miner does not have Braiins API credentials configured",
          },
          { status: 400 }
        );
      }

      // Initialize Braiins client with miner's token
      try {
        braiinsClient = createBraiinsClient(miner.poolAuth, user.userId);
      } catch (clientError) {
        const errorMsg =
          clientError instanceof Error
            ? clientError.message
            : "Failed to initialize Braiins client";
        console.error(`[Braiins Proxy] GET: ${errorMsg}`);
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: "Service configuration error. Please contact support.",
          },
          { status: 500 }
        );
      }
    } else {
      // For public endpoints like pool-stats, create client without auth
      try {
        braiinsClient = createBraiinsClient("public-token", "system");
      } catch (clientError) {
        const errorMsg =
          clientError instanceof Error
            ? clientError.message
            : "Failed to initialize Braiins client";
        console.error(`[Braiins Proxy] GET: ${errorMsg}`);
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: "Service configuration error. Please contact support.",
          },
          { status: 500 }
        );
      }
    }

    // ✅ STEP 4: Route to appropriate client method and execute
    let data;
    try {
      // Helper to convert Unix timestamp (seconds) to ISO date string (YYYY-MM-DD)
      const unixToISODate = (unixSeconds?: number): string | undefined => {
        if (!unixSeconds) return undefined;
        const date = new Date(unixSeconds * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      // For non-workers endpoints, ensure braiinsClient is initialized
      if (endpoint !== "workers" && !braiinsClient) {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: "Service configuration error. Please contact support.",
          },
          { status: 500 }
        );
      }

      switch (endpoint) {
        case "pool-stats":
          console.log("[Braiins Proxy] GET: Getting pool stats");
          data = await braiinsClient!.getPoolStats();
          break;

        case "profile":
          console.log("[Braiins Proxy] GET: Getting user profile");
          data = await braiinsClient!.getUserProfile();
          break;

        case "daily-rewards":
          console.log("[Braiins Proxy] GET: Getting daily rewards");
          const rewardsFrom = searchParams.get("from")
            ? parseInt(searchParams.get("from")!)
            : undefined;
          const rewardsTo = searchParams.get("to")
            ? parseInt(searchParams.get("to")!)
            : undefined;
          data = await braiinsClient!.getDailyRewards({
            from: unixToISODate(rewardsFrom),
            to: unixToISODate(rewardsTo),
          });
          break;

        case "daily-hashrate":
          console.log("[Braiins Proxy] GET: Getting daily hashrate");
          const hashrateFrom = searchParams.get("from")
            ? parseInt(searchParams.get("from")!)
            : undefined;
          const hashrateTo = searchParams.get("to")
            ? parseInt(searchParams.get("to")!)
            : undefined;
          const group = searchParams.get("group") === "true";
          data = await braiinsClient!.getDailyHashrate({
            from: unixToISODate(hashrateFrom),
            to: unixToISODate(hashrateTo),
            group: group || undefined,
          });
          break;

        case "block-rewards":
          console.log("[Braiins Proxy] GET: Getting block rewards");
          const blockFrom = searchParams.get("from")
            ? parseInt(searchParams.get("from")!)
            : undefined;
          const blockTo = searchParams.get("to")
            ? parseInt(searchParams.get("to")!)
            : undefined;
          data = await braiinsClient!.getBlockRewards({
            from: unixToISODate(blockFrom),
            to: unixToISODate(blockTo),
          });
          break;

        case "workers":
          console.log("[Braiins Proxy] GET: Getting workers");
          // Handle both single-miner and multi-miner cases
          if (braiinsClients && braiinsClients.length > 0) {
            // Multi-miner case: aggregate workers from all clients
            console.log(
              `[Braiins Proxy] GET: Aggregating workers from ${braiinsClients.length} miners`
            );
            const allWorkers: any[] = [];
            for (const { client, miner } of braiinsClients) {
              try {
                const workers = await client.getWorkers();
                if (Array.isArray(workers)) {
                  // Tag workers with miner name for reference
                  workers.forEach((w: any) => {
                    w.minerName = miner.name;
                  });
                  allWorkers.push(...workers);
                  console.log(
                    `[Braiins Proxy] GET: Got ${workers.length} workers from ${miner.name}`
                  );
                }
              } catch (e) {
                console.warn(
                  `[Braiins Proxy] GET: Failed to get workers from ${miner.name}: ${
                    e instanceof Error ? e.message : String(e)
                  }`
                );
              }
            }
            data = { workers: allWorkers };
          } else {
            // Single-miner case - wrap in object for consistent format
            const workers = await braiinsClient!.getWorkers();
            data = { workers };
          }
          break;

        case "payouts":
          console.log("[Braiins Proxy] GET: Getting payouts");
          const payoutFrom = searchParams.get("from")
            ? parseInt(searchParams.get("from")!)
            : undefined;
          const payoutTo = searchParams.get("to")
            ? parseInt(searchParams.get("to")!)
            : undefined;
          data = await braiinsClient!.getPayouts({
            from: unixToISODate(payoutFrom),
            to: unixToISODate(payoutTo),
          });
          break;

        default:
          return NextResponse.json<ProxyResponse>(
            {
              success: false,
              error: `Endpoint handler not implemented: ${endpoint}`,
            },
            { status: 501 },
          );
      }

      console.log(
        `[Braiins Proxy] GET: Successfully retrieved data from Braiins API`,
      );
    } catch (braiinsError) {
      if (braiinsError instanceof BraiinsError) {
        console.error(
          `[Braiins Proxy] GET: Braiins API Error (${braiinsError.statusCode}): ${braiinsError.message}`,
        );
        const httpStatus =
          braiinsError.statusCode === 401
            ? 401
            : braiinsError.statusCode === 403
              ? 403
              : 500;
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: braiinsError.message,
          },
          { status: httpStatus },
        );
      }

      const errorMsg =
        braiinsError instanceof Error ? braiinsError.message : "Unknown error";
      console.error(`[Braiins Proxy] GET: Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Return successful response
    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
      {
        success: true,
        data: data as unknown as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Braiins Proxy] GET: Unhandled error: ${errorMsg}`);

    return NextResponse.json<ProxyResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
