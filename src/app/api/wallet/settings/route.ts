import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient, LuxorError } from "@/lib/luxor";
import { walletCache } from "@/lib/cache";
import { WalletFetchResponse, WalletErrorResponse } from "@/lib/types/wallet";

// Route segment config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

/**
 * GET /api/wallet/settings?currency=BTC
 *
 * Fetch payment settings for a user's Luxor subaccount.
 * Results are cached server-side with 10-minute TTL.
 *
 * Query parameters:
 * - currency: Mining currency (default: BTC). Currently supported: BTC, DOGE, etc.
 *
 * Returns:
 * - 200: Payment settings with addresses array
 * - 401: Unauthorized (no/invalid token)
 * - 404: User not found
 * - 422: User has no luxorSubaccountName configured
 * - 429: Luxor rate limit (include Retry-After header)
 * - 503: Luxor service unavailable or network error
 *
 * Cache behavior:
 * - First call: Fetches from Luxor, caches result
 * - Subsequent calls within 10 min: Returns cached data
 * - After 10 min: Cache expires, next call fetches fresh data
 *
 * Example:
 * curl -X GET http://localhost:3000/api/wallet/settings?currency=BTC \
 *   -H "Cookie: token=<JWT>" \
 *   -H "Cache-Control: no-cache"
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // 1. Extract currency from query (default: BTC)
    const currency = request.nextUrl.searchParams.get("currency") || "BTC";
    const customerId = request.nextUrl.searchParams.get("customerId");
    console.log(
      `[Wallet API] GET /wallet/settings?currency=${currency}${customerId ? `&customerId=${customerId}` : ""}`,
    );

    // 2. Verify authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.warn("[Wallet API] No token provided");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          code: "UNAUTHORIZED",
          timestamp: new Date().toISOString(),
        } as WalletErrorResponse,
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Wallet API] Token verification failed:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid token",
          code: "UNAUTHORIZED",
          timestamp: new Date().toISOString(),
        } as WalletErrorResponse,
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // 2.5. Handle customerId parameter (admin only)
    if (customerId) {
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        console.warn(
          `[Wallet API] Non-admin user ${userId} attempted to access customerId ${customerId}`,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Only administrators can access other users' wallet settings",
            code: "FORBIDDEN",
            timestamp: new Date().toISOString(),
          } as WalletErrorResponse,
          {
            status: 403,
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          },
        );
      }
      userId = customerId;
      console.log(
        `[Wallet API] Admin ${userRole} accessing wallet settings for user: ${customerId}`,
      );
    }

    // 3. Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        luxorSubaccountName: true,
      },
    });

    if (!user) {
      console.error("[Wallet API] User not found:", userId);
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
          code: "USER_NOT_FOUND",
          timestamp: new Date().toISOString(),
        } as WalletErrorResponse,
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // 4. Check if user has Luxor subaccount configured
    if (!user.luxorSubaccountName) {
      console.warn(
        "[Wallet API] User has no luxorSubaccountName configured:",
        userId,
      );
      return NextResponse.json(
        {
          success: false,
          error: "User does not have Luxor subaccount configured",
          code: "NO_LUXOR_CONFIG",
          timestamp: new Date().toISOString(),
        } as WalletErrorResponse,
        {
          status: 422,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // 5. Check server-side cache
    const cacheKey = `wallet_${userId}_${currency}`;
    const cachedData = walletCache.get(cacheKey);

    if (cachedData) {
      console.log(
        `[Wallet API] Returning cached data for ${cacheKey} (${Date.now() - startTime}ms)`,
      );
      return NextResponse.json(
        {
          success: true,
          data: cachedData,
          timestamp: new Date().toISOString(),
        } as WalletFetchResponse,
        {
          status: 200,
          headers: {
            "Cache-Control": "max-age=600, private",
          },
        },
      );
    }

    // 6. Fetch from Luxor API
    console.log(`[Wallet API] Cache miss, fetching from Luxor for ${cacheKey}`);
    const luxorClient = createLuxorClient(user.luxorSubaccountName);

    let paymentSettings;
    try {
      paymentSettings = await luxorClient.getSubaccountPaymentSettings(
        currency,
        user.luxorSubaccountName,
      );
      console.log(
        `[Wallet API] Successfully fetched from Luxor (${Date.now() - startTime}ms)`,
      );
    } catch (error) {
      // Handle Luxor API errors
      if (error instanceof LuxorError) {
        console.error(
          `[Wallet API] Luxor API error: ${error.statusCode} - ${error.message}`,
        );

        // Rate limit
        if (error.statusCode === 429) {
          console.warn("[Wallet API] Luxor rate limit hit");
          // Try to return cached data if available (fallback)
          const staleData = walletCache.get(cacheKey);
          if (staleData) {
            console.log("[Wallet API] Returning stale cache on 429");
            return NextResponse.json(
              {
                success: true,
                data: staleData,
                timestamp: new Date().toISOString(),
              } as WalletFetchResponse,
              {
                status: 200,
                headers: {
                  "Cache-Control": "max-age=60, private",
                  "Retry-After": "60",
                },
              },
            );
          }
          return NextResponse.json(
            {
              success: false,
              error: "Rate limit exceeded. Please try again later.",
              code: "LUXOR_RATE_LIMIT",
              timestamp: new Date().toISOString(),
              retryAfter: 60,
            } as WalletErrorResponse,
            {
              status: 429,
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Retry-After": "60",
              },
            },
          );
        }

        // Forbidden
        if (error.statusCode === 403) {
          console.error("[Wallet API] Luxor permission denied");
          return NextResponse.json(
            {
              success: false,
              error: "Luxor permission denied. Contact administrator.",
              code: "LUXOR_FORBIDDEN",
              timestamp: new Date().toISOString(),
            } as WalletErrorResponse,
            {
              status: 403,
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
            },
          );
        }

        // Server error
        if (error.statusCode >= 500) {
          console.error("[Wallet API] Luxor service unavailable");
          return NextResponse.json(
            {
              success: false,
              error: "Luxor service unavailable. Please try again later.",
              code: "LUXOR_UNAVAILABLE",
              timestamp: new Date().toISOString(),
            } as WalletErrorResponse,
            {
              status: 503,
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
            },
          );
        }

        // Other errors
        return NextResponse.json(
          {
            success: false,
            error: error.message || "Failed to fetch wallet settings",
            code: "LUXOR_ERROR",
            timestamp: new Date().toISOString(),
          } as WalletErrorResponse,
          {
            status: error.statusCode || 500,
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          },
        );
      }

      // Network timeout or other errors
      console.error("[Wallet API] Unexpected error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Request timeout or network error",
          code: "NETWORK_TIMEOUT",
          timestamp: new Date().toISOString(),
        } as WalletErrorResponse,
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // 7. Cache the result
    walletCache.set(cacheKey, paymentSettings);

    // 8. Return success response with cache headers
    return NextResponse.json(
      {
        success: true,
        data: paymentSettings,
        timestamp: new Date().toISOString(),
      } as WalletFetchResponse,
      {
        status: 200,
        headers: {
          "Cache-Control": "max-age=600, private",
        },
      },
    );
  } catch (error) {
    console.error("[Wallet API] Unexpected error:", error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error("[Wallet API] Error name:", error.name);
      console.error("[Wallet API] Error message:", error.message);
      console.error("[Wallet API] Error stack:", error.stack);
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        code: "UNKNOWN_ERROR",
        timestamp: new Date().toISOString(),
      } as WalletErrorResponse,
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}

/**
 * POST /api/wallet/settings/invalidate
 *
 * Admin endpoint to manually invalidate wallet cache.
 * Used when admin updates wallet settings via Luxor UI.
 *
 * Body: { userId: string, currency: string }
 *
 * Example:
 * curl -X POST http://localhost:3000/api/wallet/settings/invalidate \
 *   -H "Cookie: token=<ADMIN-JWT>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"userId":"<user-id>","currency":"BTC"}'
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify admin authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user is admin
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      console.warn(
        "[Wallet API] Non-admin attempted cache invalidation:",
        userId,
      );
      return NextResponse.json(
        { error: "Only admins can invalidate cache" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { userId: targetUserId, currency } = body;

    if (!targetUserId || !currency) {
      return NextResponse.json(
        { error: "userId and currency required" },
        { status: 400 },
      );
    }

    const cacheKey = `wallet_${targetUserId}_${currency}`;
    walletCache.invalidate(cacheKey);

    console.log(
      `[Wallet API] Admin ${userId} invalidated cache for ${cacheKey}`,
    );

    return NextResponse.json(
      {
        success: true,
        message: `Cache invalidated for ${cacheKey}`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Wallet API] POST error:", error);
    if (error instanceof Error) {
      console.error(
        "[Wallet API] POST Error details:",
        error.message,
        error.stack,
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        success: false,
      },
      { status: 500 },
    );
  }
}
