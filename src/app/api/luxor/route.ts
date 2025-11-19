/**
 * Luxor API Proxy Route
 *
 * A secure Next.js server-side proxy for the Luxor mining API.
 *
 * This route:
 * 1. Verifies the user is authenticated (from JWT token)
 * 2. Validates the requested endpoint against an allowed list
 * 3. Builds a query string from request parameters
 * 4. Proxies the request to the Luxor API (server-side only)
 * 5. Returns data in a consistent JSON format
 *
 * The LUXOR_API_KEY is never exposed to the client - it only exists
 * on the server and is attached to requests here.
 *
 * Usage from client:
 * ```typescript
 * const response = await fetch('/api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01');
 * const { success, data, error } = await response.json();
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient, LuxorError } from "@/lib/luxor";
import { prisma } from "@/lib/prisma";

// ✅ Ensure this runs on Node.js runtime (required for async operations)
export const runtime = "nodejs";

/**
 * Response format for all Luxor API proxy responses
 * Provides a consistent interface regardless of the underlying endpoint
 */
interface ProxyResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp?: string;
}

/**
 * Maps user-facing endpoint names to actual Luxor API paths
 *
 * This prevents exposing internal Luxor endpoint structure to the client
 * and allows for future abstraction/renaming without breaking clients.
 *
 * IMPORTANT: active-workers and hashrate-history require currency as a path parameter
 * (e.g., /pool/active-workers/BTC)
 *
 * How to add new endpoints:
 * 1. Add mapping here (e.g., 'earnings': '/earnings')
 * 2. Add the response interface to luxor.ts
 * 3. Update documentation
 *
 * Supported endpoints:
 * - active-workers: Get active worker counts over time (requires currency)
 * - hashrate-history: Get hashrate and efficiency metrics (requires currency)
 * - workspace: Get workspace information
 */
const endpointMap: Record<string, { path: string; requiresCurrency: boolean }> =
  {
    "active-workers": { path: "/pool/active-workers", requiresCurrency: true },
    "hashrate-history": {
      path: "/pool/hashrate-efficiency",
      requiresCurrency: true,
    },
    workspace: { path: "/workspace", requiresCurrency: false },
    // ⬇️ ADD NEW ENDPOINTS HERE ⬇️
    // 'earnings': { path: '/earnings', requiresCurrency: false },
    // 'pool-stats': { path: '/pool/stats', requiresCurrency: false },
  };

/**
 * Helper: Extract and validate JWT token from request cookies
 *
 * Verifies the JWT and fetches the user's full profile from the database
 * to get the subaccount name.
 *
 * @param request - NextRequest object
 * @returns Object with userId, role, and name if valid
 * @throws Error if token is invalid or user not found
 */
async function extractUserFromToken(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    throw new Error("Authentication required: No token found");
  }

  try {
    const decoded = await verifyJwtToken(token);

    // Fetch user from database to get the name (subaccount name)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
      name: user.name,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Authentication failed: Invalid or expired token");
  }
}

/**
 * Helper: Build query string from request parameters
 *
 * Only includes parameters that:
 * - Exist in the request
 * - Have non-empty values
 * - Are not null or undefined
 *
 * This prevents sending empty parameters to the Luxor API.
 *
 * @param searchParams - URLSearchParams from request
 * @returns Object with query parameters
 */
function buildQueryParams(
  searchParams: URLSearchParams,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  searchParams.forEach((value, key) => {
    // Skip endpoint parameter (not sent to Luxor API)
    if (key === "endpoint") {
      return;
    }

    // Only include non-empty values
    if (value && value.trim()) {
      params[key] = value;
    }
  });

  return params;
}

/**
 * GET /api/luxor
 *
 * Proxies requests to the Luxor mining API with server-side authentication.
 *
 * Query Parameters:
 * - endpoint (required): One of the mapped endpoint names
 * - currency: Mining currency (BTC, LTC, etc.)
 * - start_date: ISO date string
 * - end_date: ISO date string
 * - tick_size: Granularity (5m, 1h, 1d, 1w, 1M)
 * - page_number: Pagination
 * - page_size: Pagination
 * - subaccount_names: Comma-separated subaccount names
 * - Any other Luxor API parameter
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: any,           // Response from Luxor API
 *   error?: string,       // Error message if failed
 *   timestamp?: string    // ISO timestamp
 * }
 *
 * Status Codes:
 * - 200: Success
 * - 400: Bad request (missing endpoint, invalid parameters)
 * - 401: Unauthorized (invalid/missing token)
 * - 500: Server error
 *
 * Examples:
 *
 * Get active workers for BTC:
 * GET /api/luxor?endpoint=active-workers&currency=BTC&start_date=2025-01-01&end_date=2025-01-31&tick_size=1d
 *
 * Get hashrate efficiency:
 * GET /api/luxor?endpoint=hashrate-history&currency=BTC&start_date=2025-01-01
 *
 * Get workspace info:
 * GET /api/luxor?endpoint=workspace
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy] Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy] User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy] ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Validate endpoint parameter
    const { searchParams } = request.nextUrl;
    const endpoint = searchParams.get("endpoint");

    console.log(`[Luxor Proxy] Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 3: Build query parameters
    const queryParams = buildQueryParams(searchParams);
    const currency = queryParams.currency as string | undefined;

    // ⚠️ IMPORTANT: Add subaccount filter for security
    // Always add the user's subaccount name to filter results to their own data
    // The user.name comes from the JWT token and is verified as authentic
    if (!queryParams.subaccount_names && user.name) {
      queryParams.subaccount_names = user.name;
      console.log(`[Luxor Proxy] Added subaccount filter: ${user.name}`);
    }

    console.log("[Luxor Proxy] Built query params:", queryParams);

    // ✅ STEP 4: Initialize Luxor client and make request
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.name || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy] ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // Make the request to Luxor API
    const endpointConfig = endpointMap[endpoint];

    // Build the final path: some endpoints require currency as a path parameter
    let luxorEndpoint = endpointConfig.path;
    if (endpointConfig.requiresCurrency) {
      if (!currency) {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `Endpoint "${endpoint}" requires a currency parameter`,
          },
          { status: 400 },
        );
      }
      luxorEndpoint = `${endpointConfig.path}/${currency}`;
    }

    console.log(`[Luxor Proxy] Calling Luxor endpoint: ${luxorEndpoint}`);

    let data;
    try {
      data = await luxorClient.request(luxorEndpoint, queryParams);
      console.log(
        `[Luxor Proxy] Successfully retrieved data from ${luxorEndpoint}`,
      );
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy] Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
        );
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: luxorError.message,
          },
          { status: luxorError.statusCode },
        );
      }

      const errorMsg =
        luxorError instanceof Error ? luxorError.message : "Unknown error";
      console.error(`[Luxor Proxy] Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Return successful response
    return NextResponse.json<ProxyResponse>(
      {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Luxor Proxy] Unhandled error: ${errorMsg}`);

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
 *
 * Allows the client to make cross-origin requests if needed.
 */
export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
