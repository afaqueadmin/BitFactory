/**
 * src/app/api/luxor/route.ts
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
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Maps user-facing endpoint names to actual Luxor API paths
 *
 * This prevents exposing internal Luxor endpoint structure to the client
 * and allows for future abstraction/renaming without breaking clients.
 *
 * IMPORTANT: active-workers, hashrate-history, and workers require currency as a path parameter
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
 * - workers: Get detailed worker information and statistics (requires currency)
 * - workspace: Get workspace information
 * - group: Workspace group operations (create, update, delete, get via operation param)
 * - subaccount: Workspace subaccount operations (ADMIN only) (list, get, add, remove)
 */
const endpointMap: Record<
  string,
  { path: string; requiresCurrency: boolean; adminOnly?: boolean }
> = {
  "active-workers": { path: "/pool/active-workers", requiresCurrency: true },
  "hashrate-history": {
    path: "/pool/hashrate-efficiency",
    requiresCurrency: true,
  },
  workspace: { path: "/workspace", requiresCurrency: false },
  workers: { path: "/pool/workers", requiresCurrency: true },
  group: { path: "/workspace/groups", requiresCurrency: false },
  subaccount: {
    path: "/pool/groups",
    requiresCurrency: false,
    adminOnly: true,
  },
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

    // Fetch user from database to get the luxorSubaccountName
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        luxorSubaccountName: true,
        role: true,
      },
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
      luxorSubaccountName: user.luxorSubaccountName,
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
 * @param excludeParams - Optional array of parameter keys to exclude (used for path params)
 * @returns Object with query parameters
 */
function buildQueryParams(
  searchParams: URLSearchParams,
  excludeParams: string[] = [],
): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  // Always exclude endpoint parameter (not sent to Luxor API)
  const defaultExclude = ["endpoint", ...excludeParams];

  searchParams.forEach((value, key) => {
    // Skip excluded parameters
    if (defaultExclude.includes(key)) {
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
 * Helper: Check if user has ADMIN access for protected endpoints
 *
 * Some endpoints (like subaccount operations) require ADMIN role.
 * This helper validates authorization and returns 403 Forbidden if needed.
 *
 * @param userRole - The user's role from JWT
 * @returns ProxyResponse with 403 status if not authorized, null if authorized
 */
function checkAdminAccess(
  userRole: string,
): NextResponse<ProxyResponse> | null {
  if (userRole !== "ADMIN") {
    console.log(
      `[Luxor Proxy] Authorization denied: user role "${userRole}" is not ADMIN`,
    );
    return NextResponse.json<ProxyResponse>(
      {
        success: false,
        error: "ADMIN access required for this endpoint",
      },
      { status: 403 },
    );
  }
  return null;
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
 * Get workers data:
 * GET /api/luxor?endpoint=workers&currency=BTC&page_number=1&page_size=10&status=ACTIVE
 *
 * Get workspace info:
 * GET /api/luxor?endpoint=workspace
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
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

    // ✅ STEP 2.5: Check admin access for protected endpoints
    const endpointConfig = endpointMap[endpoint];
    if (endpointConfig.adminOnly) {
      const authError = checkAdminAccess(user.role);
      if (authError) {
        return authError;
      }
    }

    // ✅ STEP 3: Build query parameters
    const queryParams = buildQueryParams(searchParams);
    const currency = queryParams.currency as string | undefined;

    // ⚠️ IMPORTANT: Add subaccount filter for security
    // Always add the user's subaccount name to filter results to their own data
    // The user.luxorSubaccountName comes from the database and is verified as authentic
    if (
      !queryParams.subaccount_names &&
      user.luxorSubaccountName &&
      endpoint !== "subaccount"
    ) {
      queryParams.subaccount_names = user.luxorSubaccountName;
      console.log(
        `[Luxor Proxy] Added subaccount filter: ${user.luxorSubaccountName}`,
      );
    }

    console.log("[Luxor Proxy] Built query params:", queryParams);

    // ✅ STEP 4: Initialize Luxor client and make request
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
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
    let data;
    try {
      // Handle subaccount-specific logic with dedicated methods
      if (endpoint === "subaccount") {
        const groupId = searchParams.get("groupId");
        const subaccountName = searchParams.get("name");

        if (!groupId) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        console.log(
          `[Luxor Proxy] Subaccount request - groupId: ${groupId}, name: ${subaccountName}`,
        );

        // Use dedicated client methods for subaccounts
        if (subaccountName) {
          // Get specific subaccount
          console.log(
            `[Luxor Proxy] Getting specific subaccount: ${subaccountName} in group: ${groupId}`,
          );
          data = await luxorClient.getSubaccount(groupId, subaccountName);
        } else {
          // List all subaccounts for the group by fetching the group
          // (Luxor API doesn't have a dedicated list endpoint, subaccounts come with group data)
          console.log(
            `[Luxor Proxy] Listing subaccounts for group: ${groupId}`,
          );
          try {
            const group = await luxorClient.getGroup(groupId);
            data = {
              subaccounts: group.subaccounts || [],
            };
          } catch (groupError) {
            // If group is not accessible (403), return empty subaccounts
            if (
              groupError instanceof LuxorError &&
              groupError.statusCode === 403
            ) {
              console.warn(
                `[Luxor Proxy] Access denied to group ${groupId}, returning empty subaccounts`,
              );
              data = {
                subaccounts: [],
              };
            } else {
              // Re-throw other errors
              throw groupError;
            }
          }
        }
      } else {
        // Handle other endpoints with generic request method
        let luxorEndpoint = endpointConfig.path;
        const queryParamsToUse = queryParams;

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
        data = await luxorClient.request(luxorEndpoint, queryParamsToUse);
      }

      console.log(`[Luxor Proxy] Successfully retrieved data from Luxor API`);
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
 * POST /api/luxor
 *
 * Creates a new workspace group via the Luxor API.
 *
 * Request Body:
 * {
 *   endpoint: "group",
 *   name: string  // Group name
 * }
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: CreateGroupResponse,
 *   error?: string,
 *   timestamp?: string
 * }
 *
 * Example:
 * POST /api/luxor
 * Content-Type: application/json
 * { "endpoint": "group", "name": "My New Group" }
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy] POST: Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy] POST: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy] POST: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ProxyResponse>(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // ✅ STEP 3: Validate endpoint parameter
    const endpoint = body.endpoint as string | undefined;

    console.log(`[Luxor Proxy] POST: Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 3.5: Check admin access for protected endpoints
    const endpointConfig = endpointMap[endpoint];
    if (endpointConfig.adminOnly) {
      const authError = checkAdminAccess(user.role);
      if (authError) {
        return authError;
      }
    }

    // ✅ STEP 4: Initialize Luxor client
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy] POST: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Handle endpoint-specific logic
    let data;
    try {
      if (endpoint === "group") {
        const groupName = body.name as string | undefined;
        if (!groupName || !groupName.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group name is required" },
            { status: 400 },
          );
        }

        console.log(`[Luxor Proxy] POST: Creating group: ${groupName}`);
        data = await luxorClient.createGroup(groupName);
      } else if (endpoint === "subaccount") {
        const groupId = body.groupId as string | undefined;
        const subaccountName = body.name as string | undefined;

        if (!groupId || !groupId.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        if (!subaccountName || !subaccountName.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Subaccount name is required" },
            { status: 400 },
          );
        }

        console.log(
          `[Luxor Proxy] POST: Adding subaccount: ${subaccountName} to group: ${groupId}`,
        );
        data = await luxorClient.addSubaccount(groupId, subaccountName);
      } else {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `Endpoint "${endpoint}" does not support POST requests`,
          },
          { status: 405 },
        );
      }
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy] POST: Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
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
      console.error(`[Luxor Proxy] POST: Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 6: Return successful response
    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
      {
        success: true,
        data: data as unknown as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Luxor Proxy] POST: Unhandled error: ${errorMsg}`);

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
 * PUT /api/luxor
 *
 * Updates a workspace group via the Luxor API.
 *
 * Request Body:
 * {
 *   endpoint: "group",
 *   id: string,      // Group ID to update
 *   name: string     // New group name
 * }
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: UpdateGroupResponse,
 *   error?: string,
 *   timestamp?: string
 * }
 *
 * Example:
 * PUT /api/luxor
 * Content-Type: application/json
 * { "endpoint": "group", "id": "123", "name": "Updated Group Name" }
 */
export async function PUT(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy] PUT: Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy] PUT: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy] PUT: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ProxyResponse>(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // ✅ STEP 3: Validate endpoint parameter
    const endpoint = body.endpoint as string | undefined;

    console.log(`[Luxor Proxy] PUT: Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 4: Initialize Luxor client
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy] PUT: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Handle endpoint-specific logic
    let data;
    try {
      if (endpoint === "group") {
        const groupId = body.id as string | undefined;
        const groupName = body.name as string | undefined;

        if (!groupId || !groupId.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        if (!groupName || !groupName.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group name is required" },
            { status: 400 },
          );
        }

        console.log(
          `[Luxor Proxy] PUT: Updating group ${groupId} with name: ${groupName}`,
        );
        data = await luxorClient.updateGroup(groupId, groupName);
      } else {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `Endpoint "${endpoint}" does not support PUT requests`,
          },
          { status: 405 },
        );
      }
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy] PUT: Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
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
      console.error(`[Luxor Proxy] PUT: Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 6: Return successful response
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
    console.error(`[Luxor Proxy] PUT: Unhandled error: ${errorMsg}`);

    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/luxor
 *
 * Updates a workspace group via the Luxor API (alternative to PUT).
 *
 * Request Body:
 * {
 *   endpoint: "group",
 *   id: string,      // Group ID to update
 *   name: string     // New group name
 * }
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: UpdateGroupResponse,
 *   error?: string,
 *   timestamp?: string
 * }
 *
 * Example:
 * PATCH /api/luxor
 * Content-Type: application/json
 * { "endpoint": "group", "id": "123", "name": "Updated Group Name" }
 */
export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy] PATCH: Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy] PATCH: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy] PATCH: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ProxyResponse>(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // ✅ STEP 3: Validate endpoint parameter
    const endpoint = body.endpoint as string | undefined;

    console.log(`[Luxor Proxy] PATCH: Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 4: Initialize Luxor client
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy] PATCH: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Handle endpoint-specific logic
    let data;
    try {
      if (endpoint === "group") {
        const groupId = body.id as string | undefined;
        const groupName = body.name as string | undefined;

        if (!groupId || !groupId.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        if (!groupName || !groupName.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group name is required" },
            { status: 400 },
          );
        }

        console.log(
          `[Luxor Proxy] PATCH: Updating group ${groupId} with name: ${groupName}`,
        );
        data = await luxorClient.updateGroup(groupId, groupName);
      } else {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `Endpoint "${endpoint}" does not support PATCH requests`,
          },
          { status: 405 },
        );
      }
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy] PATCH: Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
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
      console.error(`[Luxor Proxy] PATCH: Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 6: Return successful response
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
    console.error(`[Luxor Proxy] PATCH: Unhandled error: ${errorMsg}`);

    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/luxor
 *
 * Deletes a workspace group via the Luxor API.
 *
 * Request Body:
 * {
 *   endpoint: "group",
 *   id: string  // Group ID to delete
 * }
 *
 * Response Format:
 * {
 *   success: boolean,
 *   data?: DeleteGroupResponse,
 *   error?: string,
 *   timestamp?: string
 * }
 *
 * Example:
 * DELETE /api/luxor
 * Content-Type: application/json
 * { "endpoint": "group", "id": "123" }
 */
export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy] DELETE: Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy] DELETE: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy] DELETE: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ProxyResponse>(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // ✅ STEP 3: Validate endpoint parameter
    const endpoint = body.endpoint as string | undefined;

    console.log(`[Luxor Proxy] DELETE: Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 3.5: Check admin access for protected endpoints
    const endpointConfig = endpointMap[endpoint];
    if (endpointConfig.adminOnly) {
      const authError = checkAdminAccess(user.role);
      if (authError) {
        return authError;
      }
    }

    // ✅ STEP 4: Initialize Luxor client
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy] DELETE: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Handle endpoint-specific logic
    let data;
    try {
      if (endpoint === "group") {
        const groupId = body.id as string | undefined;

        if (!groupId || !groupId.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        console.log(`[Luxor Proxy] DELETE: Deleting group: ${groupId}`);
        data = await luxorClient.deleteGroup(groupId);
      } else if (endpoint === "subaccount") {
        const groupId = body.groupId as string | undefined;
        const subaccountName = body.name as string | undefined;

        if (!groupId || !groupId.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Group ID is required" },
            { status: 400 },
          );
        }

        if (!subaccountName || !subaccountName.trim()) {
          return NextResponse.json<ProxyResponse>(
            { success: false, error: "Subaccount name is required" },
            { status: 400 },
          );
        }

        console.log(
          `[Luxor Proxy] DELETE: Removing subaccount: ${subaccountName} from group: ${groupId}`,
        );
        data = await luxorClient.removeSubaccount(groupId, subaccountName);
      } else {
        return NextResponse.json<ProxyResponse>(
          {
            success: false,
            error: `Endpoint "${endpoint}" does not support DELETE requests`,
          },
          { status: 405 },
        );
      }
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy] DELETE: Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
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
      console.error(`[Luxor Proxy] DELETE: Error: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 },
      );
    }

    // ✅ STEP 6: Return successful response
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
    console.error(`[Luxor Proxy] DELETE: Unhandled error: ${errorMsg}`);

    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
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
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
