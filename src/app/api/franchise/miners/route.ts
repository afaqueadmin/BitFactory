/**
 * /api/franchise/miners
 *
 * Franchisee-facing miners list + create. Independent of the admin
 * /api/machine routes — no shared code, so admin behavior can't regress
 * from franchise-specific changes here. Ownership of the target customer
 * is verified server-side before any create/edit, never trusted from the
 * client.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  franchiseeMinerFilter,
  assertFranchiseeOwnsCustomer,
} from "@/lib/franchiseeScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

async function requireFranchisee(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };

  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }

  if (decoded.role !== "FRANCHISEE") {
    return { error: "Franchisee access required", status: 403 as const };
  }

  return { decoded };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const spaceId = searchParams.get("spaceId");
    const userId = searchParams.get("userId");
    const includeDeleted = searchParams.get("isDeleted") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = includeDeleted ? {} : { isDeleted: false };
    if (status) where.status = status;
    if (spaceId) where.spaceId = spaceId;
    if (userId) where.userId = userId;
    Object.assign(
      where,
      franchiseeMinerFilter({
        id: auth.decoded.userId,
        role: auth.decoded.role,
      }),
    );

    const miners = await prisma.miner.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            luxorSubaccountName: true,
            segment: true,
          },
        },
        space: { select: { id: true, name: true, location: true } },
        hardware: {
          select: { id: true, model: true, powerUsage: true, hashRate: true },
        },
        rateHistory: {
          select: { rate_per_kwh: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        pool: {
          select: { id: true, name: true, apiUrl: true, description: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transformed = miners.map((miner) => ({
      ...miner,
      rate_per_kwh:
        miner.rateHistory && miner.rateHistory.length > 0
          ? miner.rateHistory[0].rate_per_kwh
          : undefined,
    }));

    return NextResponse.json({
      success: true,
      data: transformed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Franchise Miners API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json();
    const {
      name,
      hardwareId,
      userId,
      spaceId,
      status,
      rate_per_kwh,
      poolId,
      serialNumber,
      macAddress,
    } = body;

    if (!name || !hardwareId || !userId || !spaceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: name, hardwareId, userId, spaceId",
        },
        { status: 400 },
      );
    }

    if (
      rate_per_kwh === null ||
      rate_per_kwh === undefined ||
      rate_per_kwh === ""
    ) {
      return NextResponse.json(
        { success: false, error: "rate_per_kwh is required" },
        { status: 400 },
      );
    }

    if (
      typeof name !== "string" ||
      typeof hardwareId !== "string" ||
      typeof userId !== "string" ||
      typeof spaceId !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "name, hardwareId, userId, and spaceId must be strings",
        },
        { status: 400 },
      );
    }

    const ratePerKwh = Number(rate_per_kwh);
    if (isNaN(ratePerKwh) || ratePerKwh <= 0) {
      return NextResponse.json(
        { success: false, error: "rate_per_kwh must be a positive number" },
        { status: 400 },
      );
    }

    // The target customer MUST belong to this franchisee — never trust the
    // client-supplied userId beyond this check.
    const owns = await assertFranchiseeOwnsCustomer(
      auth.decoded.userId,
      userId,
    );
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
      );
    }

    const existingMinerWithName = await prisma.miner.findUnique({
      where: { name_userId: { name: name.trim(), userId } },
      select: { id: true },
    });
    if (existingMinerWithName) {
      return NextResponse.json(
        {
          success: false,
          error: "A miner with this name already exists for this user",
        },
        { status: 409 },
      );
    }

    const spaceExists = await prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true },
    });
    if (!spaceExists) {
      return NextResponse.json(
        { success: false, error: "Space not found" },
        { status: 404 },
      );
    }

    const hardwareExists = await prisma.hardware.findUnique({
      where: { id: hardwareId },
      select: { id: true, quantity: true },
    });
    if (!hardwareExists) {
      return NextResponse.json(
        { success: false, error: "Hardware not found" },
        { status: 404 },
      );
    }
    if (hardwareExists.quantity <= 0) {
      return NextResponse.json(
        { success: false, error: "No available hardware units of this model" },
        { status: 409 },
      );
    }

    if (poolId) {
      if (typeof poolId !== "string") {
        return NextResponse.json(
          { success: false, error: "poolId must be a string" },
          { status: 400 },
        );
      }
      const poolExists = await prisma.pool.findUnique({
        where: { id: poolId },
        select: { id: true },
      });
      if (!poolExists) {
        return NextResponse.json(
          { success: false, error: "Pool not found" },
          { status: 404 },
        );
      }
    }

    const miner = await prisma.$transaction(async (tx) => {
      const newMiner = await tx.miner.create({
        data: {
          name: name.trim(),
          hardwareId,
          userId,
          spaceId,
          status: status || "DEPLOYMENT_IN_PROGRESS",
          ...(poolId && { poolId }),
          ...(serialNumber && { serialNumber: serialNumber.trim() }),
          ...(macAddress && { macAddress: macAddress.trim() }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              luxorSubaccountName: true,
              segment: true,
            },
          },
          space: { select: { id: true, name: true, location: true } },
        },
      });

      await tx.minerRateHistory.create({
        data: { minerId: newMiner.id, rate_per_kwh: ratePerKwh },
      });

      await tx.minerOwnershipHistory.create({
        data: {
          minerId: newMiner.id,
          ownerId: userId,
          createdById: auth.decoded.userId,
        },
      });

      if (poolId) {
        await tx.minerPoolHistory.create({
          data: {
            minerId: newMiner.id,
            poolId,
            createdById: auth.decoded.userId,
          },
        });
      }

      await tx.hardware.update({
        where: { id: hardwareId },
        data: { quantity: { decrement: 1 } },
      });

      return newMiner;
    });

    return NextResponse.json(
      { success: true, data: miner, timestamp: new Date().toISOString() },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Franchise Miners API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create miner" },
      { status: 500 },
    );
  }
}
