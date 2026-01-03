/**
 * src/app/api/luxor/route.ts
 * Luxor API V2 Proxy Route
 *
 * A secure Next.js server-side proxy for the Luxor mining API V2.
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
 * const response = await fetch('/api/luxor?endpoint=workers&currency=BTC&start_date=2025-01-01');
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
 * Maps user-facing endpoint names to actual Luxor API handler methods
 *
 * This prevents exposing internal Luxor endpoint structure to the client
 * and allows for future abstraction/renaming without breaking clients.
 *
 * V2 API Endpoints:
 * - Workspace & Sites: workspace, sites, site
 * - Subaccounts: subaccounts, subaccount
 * - Payments: payment-settings, transactions
 * - Workers: workers
 * - Analytics: revenue, active-workers, hashrate-efficiency, workers-hashrate-efficiency, pool-hashrate, uptime, pool-stats, dev-fee
 */
const endpointMap: Record<
  string,
  {
    method: "GET" | "POST" | "PUT" | "DELETE";
    requiresCurrency?: boolean;
    adminOnly?: boolean;
    description: string;
  }
> = {
  // Workspace & Sites
  workspace: {
    method: "GET",
    description: "Get workspace with sites list",
  },
  sites: {
    method: "GET",
    description: "List all sites in workspace",
  },
  site: {
    method: "GET",
    description: "Get single site by ID",
  },

  // Subaccounts
  subaccounts: {
    method: "GET",
    description: "List subaccounts",
  },
  subaccount: {
    method: "GET",
    description: "Get single subaccount",
  },

  // Payments
  "payment-settings": {
    method: "GET",
    description: "Get payment settings for currency",
  },
  transactions: {
    method: "GET",
    requiresCurrency: true,
    description: "Get transactions",
  },

  // Workers & Analytics
  workers: {
    method: "GET",
    requiresCurrency: true,
    description: "Get workers list",
  },
  revenue: {
    method: "GET",
    requiresCurrency: true,
    description: "Get revenue data",
  },
  "active-workers": {
    method: "GET",
    requiresCurrency: true,
    description: "Get active workers history",
  },
  "hashrate-efficiency": {
    method: "GET",
    requiresCurrency: true,
    description: "Get hashrate efficiency history",
  },
  "workers-hashrate-efficiency": {
    method: "GET",
    requiresCurrency: true,
    description: "Get workers hashrate efficiency history",
  },
  "pool-hashrate": {
    method: "GET",
    requiresCurrency: true,
    description: "Get pool hashrate",
  },
  uptime: {
    method: "GET",
    requiresCurrency: true,
    description: "Get uptime data",
  },
  "pool-stats": {
    method: "GET",
    requiresCurrency: true,
    description: "Get pool stats including hashprice",
  },
  summary: {
    method: "GET",
    requiresCurrency: true,
    description:
      "Get summary statistics for subaccounts (hashrate, uptime, efficiency, hashprice)",
  },
  "dev-fee": {
    method: "GET",
    description: "Get dev fee data",
  },
};

/**
 * Helper: Extract and validate JWT token from request cookies
 *
 * Verifies the JWT and fetches the user's full profile from the database
 * to get the subaccount name.
 *
 * @param request - NextRequest object
 * @returns Object with userId, role, and luxorSubaccountName if valid
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
  if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
    console.log(
      `[Luxor Proxy V2] Authorization denied: user role "${userRole}" is not ADMIN or SUPER_ADMIN`,
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
 * Proxies GET requests to the Luxor V2 API with server-side authentication.
 *
 * Query Parameters:
 * - endpoint (required): One of the mapped endpoint names
 * - currency: Mining currency (BTC, LTC, etc.) - required for some endpoints
 * - subaccount_names: Comma-separated subaccount names (use this for pool/workers endpoints)
 * - site_id: Site UUID (only for workspace/site endpoints, NOT for pool endpoints)
 * - start_date: ISO date string
 * - end_date: ISO date string
 * - tick_size: Granularity (5m, 1h, 1d, 1w, 1M)
 * - page_number: Pagination
 * - page_size: Pagination
 * - Any other Luxor API parameter
 *
 * ⚠️  IMPORTANT: Use EITHER subaccount_names OR site_id, not both
 * For pool endpoints (workers, hashrate-efficiency, revenue, etc): use subaccount_names
 * For workspace endpoints (workspace, sites, site): site_id may be used if needed
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
 * - 403: Forbidden (insufficient permissions)
 * - 404: Endpoint not found
 * - 500: Server error
 *
 * Examples:
 *
 * Get workspace with sites:
 * GET /api/luxor?endpoint=workspace
 *
 * Get workers for BTC (with subaccount_names):
 * GET /api/luxor?endpoint=workers&currency=BTC&subaccount_names=subaccount1,subaccount2&page_number=1&page_size=10
 *
 * Get active workers with filters (with subaccount_names):
 * GET /api/luxor?endpoint=active-workers&currency=BTC&subaccount_names=subaccount1&start_date=2025-01-01&tick_size=1d
 *
 * Get payment settings:
 * GET /api/luxor?endpoint=payment-settings&currency=BTC&subaccount_names=my_subaccount
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate the user
    console.log("[Luxor Proxy V2] GET: Authenticating user...");
    let user;
    try {
      user = await extractUserFromToken(request);
      console.log(`[Luxor Proxy V2] GET: User authenticated: ${user.userId}`);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Luxor Proxy V2] GET: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Validate endpoint parameter
    const { searchParams } = request.nextUrl;
    const endpoint = searchParams.get("endpoint");

    console.log(`[Luxor Proxy V2] GET: Requested endpoint: ${endpoint}`);

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

    // ✅ STEP 3: Build query parameters
    const queryParams = buildQueryParams(searchParams);
    const currency = searchParams.get("currency");
    const siteId =
      searchParams.get("site_id") || process.env.LUXOR_FIXED_SITE_ID;
    const subaccountName = searchParams.get("subaccount_name");

    console.log("[Luxor Proxy V2] GET: Built query params:", queryParams);

    // ✅ STEP 4: Initialize Luxor client
    let luxorClient;
    try {
      luxorClient = createLuxorClient(user.luxorSubaccountName || user.userId);
    } catch (clientError) {
      const errorMsg =
        clientError instanceof Error
          ? clientError.message
          : "Failed to initialize Luxor client";
      console.error(`[Luxor Proxy V2] GET: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        {
          success: false,
          error: "Service configuration error. Please contact support.",
        },
        { status: 500 },
      );
    }

    // ✅ STEP 5: Route to appropriate client method
    let data;
    try {
      switch (endpoint) {
        // Workspace & Sites
        case "workspace":
          console.log("[Luxor Proxy V2] GET: Getting workspace");
          data = await luxorClient.getWorkspace();
          break;

        case "sites":
          console.log("[Luxor Proxy V2] GET: Listing sites");
          data = await luxorClient.listSites();
          break;

        case "site":
          if (!siteId) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "site_id parameter is required for site endpoint",
              },
              { status: 400 },
            );
          }
          console.log(`[Luxor Proxy V2] GET: Getting site ${siteId}`);
          data = await luxorClient.getSite(siteId);
          break;

        // Subaccounts
        case "subaccounts":
          // Fetch all subaccounts across all sites (site_id is optional parameter)
          // Endpoint: GET /pool/subaccounts?page_number=1&page_size=10
          console.log(
            "[Luxor Proxy V2] GET: Listing all subaccounts (without site_id filter)",
          );
          try {
            // Fetch all subaccounts by paginating through results
            let allSubaccounts: import("@/lib/luxor").Subaccount[] = [];
            let pageNumber = 1;
            const pageSize = 100; // Fetch 100 items per page
            const luxorToken = process.env.LUXOR_API_KEY;

            if (!luxorToken) {
              throw new Error("LUXOR_API_KEY is not configured");
            }

            console.log(
              "[Luxor Proxy V2] Authorization header verified (using LUXOR_API_KEY)",
            );

            let hasMore = true;
            while (hasMore) {
              console.log(
                `[Luxor Proxy V2] Fetching page ${pageNumber} (page_size: ${pageSize})`,
              );

              // Build URL without site_id (fetch all subaccounts)
              const url = new URL(
                `https://app.luxor.tech/api/v2/pool/subaccounts`,
              );
              url.searchParams.append("page_number", String(pageNumber));
              url.searchParams.append("page_size", String(pageSize));

              console.log(`[Luxor Proxy V2] Requesting URL: ${url.toString()}`);

              // Get current page
              const response = await fetch(url.toString(), {
                headers: {
                  authorization: `Bearer ${luxorToken}`,
                },
              });

              if (!response.ok) {
                throw new Error(
                  `Luxor API returned ${response.status}: ${response.statusText}`,
                );
              }

              const pageData = (await response.json()) as {
                subaccounts: import("@/lib/luxor").Subaccount[];
                pagination?: { next_page_url?: string | null };
              };

              console.log(
                `[Luxor Proxy V2] Page ${pageNumber} response:`,
                JSON.stringify(pageData, null, 2),
              );

              allSubaccounts = allSubaccounts.concat(pageData.subaccounts);
              console.log(
                `[Luxor Proxy V2] Page ${pageNumber}: ${pageData.subaccounts.length} items, Total so far: ${allSubaccounts.length}`,
              );

              // Check if there are more pages
              hasMore = !!pageData.pagination?.next_page_url;
              pageNumber++;
            }

            console.log(
              `[Luxor Proxy V2] Total subaccounts fetched: ${allSubaccounts.length}`,
            );
            console.log(
              `[Luxor Proxy V2] All subaccount names:`,
              allSubaccounts.map((s) => s.name),
            );
            data = {
              subaccounts: allSubaccounts,
            };
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            console.warn(
              `[Luxor Proxy V2] Could not fetch subaccounts: ${errorMsg}`,
            );
            data = {
              subaccounts: [],
            };
          }
          break;

        case "subaccount":
          if (!subaccountName) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "subaccount_name parameter is required for subaccount endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting subaccount ${subaccountName}`,
          );
          data = await luxorClient.getSubaccount(subaccountName);
          break;

        // Payments
        case "payment-settings":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency parameter is required for payment-settings endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting payment settings for ${currency}`,
          );
          data = await luxorClient.getPaymentSettings(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        case "transactions":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency parameter is required for transactions endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting transactions for ${currency}`,
          );
          data = await luxorClient.getTransactions(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
            transaction_type: searchParams.get("transaction_type") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        // Workers & Analytics
        case "workers":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "currency parameter is required for workers endpoint",
              },
              { status: 400 },
            );
          }
          console.log(`[Luxor Proxy V2] GET: Getting workers for ${currency}`);
          data = await luxorClient.getWorkers(currency, {
            // subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId,
            status: searchParams.get("status") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        case "revenue":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "currency parameter is required for revenue endpoint",
              },
              { status: 400 },
            );
          }
          console.log(`[Luxor Proxy V2] GET: Getting revenue for ${currency}`);
          data = await luxorClient.getRevenue(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
          });
          break;

        case "active-workers":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency parameter is required for active-workers endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting active workers for ${currency}`,
          );
          data = await luxorClient.getActiveWorkers(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
            tick_size: searchParams.get("tick_size") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        case "hashrate-efficiency":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency parameter is required for hashrate-efficiency endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting hashrate efficiency for ${currency}`,
          );
          data = await luxorClient.getHashrateEfficiency(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
            tick_size: searchParams.get("tick_size") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        case "workers-hashrate-efficiency":
          if (!currency || !subaccountName) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency and subaccount_name parameters are required for workers-hashrate-efficiency endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting workers hashrate efficiency for ${currency}/${subaccountName}`,
          );
          data = await luxorClient.getWorkersHashrateEfficiency(
            currency,
            subaccountName,
            {
              worker_names: searchParams.get("worker_names") || undefined,
              tick_size: searchParams.get("tick_size") || undefined,
              start_date: searchParams.get("start_date") || undefined,
              end_date: searchParams.get("end_date") || undefined,
              page_number: searchParams.get("page_number")
                ? parseInt(searchParams.get("page_number")!)
                : undefined,
              page_size: searchParams.get("page_size")
                ? parseInt(searchParams.get("page_size")!)
                : undefined,
            },
          );
          break;

        case "pool-hashrate":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error:
                  "currency parameter is required for pool-hashrate endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting pool hashrate for ${currency}`,
          );
          data = await luxorClient.getPoolHashrate(currency);
          break;

        case "uptime":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "currency parameter is required for uptime endpoint",
              },
              { status: 400 },
            );
          }
          console.log(`[Luxor Proxy V2] GET: Getting uptime for ${currency}`);
          data = await luxorClient.getUptime(currency, {
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
            tick_size: searchParams.get("tick_size") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
          });
          break;

        case "pool-stats":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "currency parameter is required for pool-stats endpoint",
              },
              { status: 400 },
            );
          }
          console.log(
            `[Luxor Proxy V2] GET: Getting pool stats for ${currency}`,
          );
          data = await luxorClient.getPoolStats(currency);
          break;

        case "summary":
          if (!currency) {
            return NextResponse.json<ProxyResponse>(
              {
                success: false,
                error: "currency parameter is required for summary endpoint",
              },
              { status: 400 },
            );
          }
          console.log(`[Luxor Proxy V2] GET: Getting summary for ${currency}`);
          // NOTE: Luxor API requires exactly ONE of subaccount_names or site_id, not both
          // Prefer subaccount_names if provided, otherwise use site_id
          const subaccountNamesParam = searchParams.get("subaccount_names");
          data = await luxorClient.getSummary(currency, {
            subaccount_names: subaccountNamesParam || undefined,
            site_id: subaccountNamesParam ? undefined : siteId || undefined,
          });
          break;

        case "dev-fee":
          console.log("[Luxor Proxy V2] GET: Getting dev fee data");
          data = await luxorClient.getDevFee({
            subaccount_names: searchParams.get("subaccount_names") || undefined,
            site_id: siteId || undefined,
            start_date: searchParams.get("start_date") || undefined,
            end_date: searchParams.get("end_date") || undefined,
            page_number: searchParams.get("page_number")
              ? parseInt(searchParams.get("page_number")!)
              : undefined,
            page_size: searchParams.get("page_size")
              ? parseInt(searchParams.get("page_size")!)
              : undefined,
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
        `[Luxor Proxy V2] GET: Successfully retrieved data from Luxor API`,
      );
    } catch (luxorError) {
      if (luxorError instanceof LuxorError) {
        console.error(
          `[Luxor Proxy V2] GET: Luxor API error (${luxorError.statusCode}): ${luxorError.message}`,
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
      console.error(`[Luxor Proxy V2] GET: Error: ${errorMsg}`);
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
    console.error(`[Luxor Proxy V2] GET: Unhandled error: ${errorMsg}`);

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
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
