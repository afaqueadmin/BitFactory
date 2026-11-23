/**
 * Pool Auth API Routes
 *
 * Handles creation of a client's pool authentication credential
 * (e.g. Luxor subaccount name, Braiins API token). Admin/Super Admin only.
 *
 * Endpoints:
 * - GET /api/pool-auth?poolId=... - List client credentials for a pool
 * - POST /api/pool-auth - Create or update (upsert) a client's credential for a pool
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { logPoolCredentialChange } from "@/lib/audit/logPoolCredentialChange";
import { maskAuthKey } from "@/lib/poolAuthMask";
import {
  SUBACCOUNT_TX_OPTIONS,
  setLuxorSubaccounts,
} from "@/lib/luxorSubaccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * GET /api/pool-auth?poolId=... | ?userId=...
 *
 * List client credentials for a given pool, or all pool credentials for a
 * given client. Exactly one of poolId/userId must be provided.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requireAnyPermission(ctx, [
      "pools.view",
      "pools.manage_credentials",
      "pool_workers.view",
      "customers.view",
      "customers.edit",
      "franchisees.edit",
    ]);
    if (denied) return denied;

    const poolId = request.nextUrl.searchParams.get("poolId");
    const userId = request.nextUrl.searchParams.get("userId");

    if (!poolId && !userId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Either poolId or userId query parameter is required",
        },
        { status: 400 },
      );
    }

    const poolAuths = await prisma.poolAuth.findMany({
      where: poolId ? { poolId } : { userId: userId! },
      select: {
        id: true,
        poolId: true,
        userId: true,
        authKey: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        pool: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = poolAuths.map((pa) => ({
      ...pa,
      ...maskAuthKey(pa.pool.name, pa.authKey),
    }));

    return NextResponse.json<ApiResponse>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] GET: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pool-auth
 *
 * Add an authentication credential for a client on a pool. A client can hold
 * several per pool (multiple Luxor subaccounts); each belongs to one client.
 *
 * Request body: { poolId: string, userId: string, authKey: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "pools.manage_credentials");
    if (denied) return denied;
    const actorUserId = ctx.userId;

    const body = await request.json();
    const { poolId, userId, authKey } = body;

    if (!poolId || typeof poolId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "poolId is required" },
        { status: 400 },
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    if (!authKey || typeof authKey !== "string" || !authKey.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "authKey is required" },
        { status: 400 },
      );
    }

    const [pool, user] = await Promise.all([
      prisma.pool.findUnique({
        where: { id: poolId },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);

    if (!pool) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool not found" },
        { status: 404 },
      );
    }

    if (!user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    // A user can hold more than one PoolAuth row per pool (multiple Luxor
    // subaccounts), but each subaccount/token belongs to exactly one user
    // (@@unique([poolId, authKey])).
    const existingPoolAuth = await prisma.poolAuth.findUnique({
      where: { poolId_authKey: { poolId, authKey: authKey.trim() } },
      select: { userId: true },
    });

    if (existingPoolAuth) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            existingPoolAuth.userId === userId
              ? "This subaccount is already assigned to this user"
              : "This subaccount is already assigned to another user",
        },
        { status: 409 },
      );
    }

    const select = {
      id: true,
      poolId: true,
      userId: true,
      authKey: true,
      createdAt: true,
      updatedAt: true,
    };
    const poolAuth =
      pool.name === "Luxor"
        ? // Same path as the customer edit form, so the new subaccount joins
          // the client's group under the same rules.
          await prisma.$transaction(async (tx) => {
            const current = await tx.poolAuth.findMany({
              where: { poolId, userId },
              select: { authKey: true },
            });
            await setLuxorSubaccounts(tx, {
              userId,
              names: [...current.map((c) => c.authKey), authKey.trim()],
              actorId: actorUserId,
            });
            return tx.poolAuth.findUniqueOrThrow({
              where: { poolId_authKey: { poolId, authKey: authKey.trim() } },
              select,
            });
          }, SUBACCOUNT_TX_OPTIONS)
        : await prisma.$transaction(async (tx) => {
            const created = await tx.poolAuth.create({
              data: { poolId, userId, authKey: authKey.trim() },
              select,
            });
            await logPoolCredentialChange(tx, {
              action: AuditAction.POOL_CREDENTIAL_ADDED,
              userId,
              actorId: actorUserId,
              poolName: pool.name,
            });
            return created;
          });

    console.log(
      `[PoolAuth API] POST: Created PoolAuth (pool: ${poolId}, user: ${userId})`,
    );

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: { ...poolAuth, ...maskAuthKey(pool.name, poolAuth.authKey) },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] POST: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
