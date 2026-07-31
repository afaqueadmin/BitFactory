/**
 * /api/franchise/miners/[id]
 *
 * Franchisee-facing edit/delete of a single miner. Independent of the admin
 * /api/machine/[id] routes. Ownership (miner's owning customer belongs to
 * this franchisee) is checked before any mutation. Unlike the admin route,
 * this does NOT block deleting a miner owned by a franchise-linked customer
 * — every miner reachable here already belongs to the caller's own
 * franchise, so that admin-side protection doesn't apply.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertFranchiseeOwnsCustomer,
  assertFranchiseeOwnsMiner,
} from "@/lib/franchiseeScope";
import { verifyJwtToken } from "@/lib/jwt";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const owns = await assertFranchiseeOwnsMiner(auth.decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    const existingMiner = await prisma.miner.findUniqueOrThrow({
      where: { id },
    });

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

    let ratePerKwhValue: number | null = null;
    if (rate_per_kwh !== undefined && rate_per_kwh !== null) {
      const rateValue = Number(rate_per_kwh);
      if (isNaN(rateValue) || rateValue <= 0) {
        return NextResponse.json(
          { success: false, error: "rate_per_kwh must be a positive number" },
          { status: 400 },
        );
      }
      ratePerKwhValue = rateValue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json(
          { success: false, error: "name must be a string" },
          { status: 400 },
        );
      }
      const trimmedName = name.trim();
      if (trimmedName !== existingMiner.name) {
        const conflict = await prisma.miner.findUnique({
          where: {
            name_userId: { name: trimmedName, userId: existingMiner.userId },
          },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json(
            {
              success: false,
              error: "A miner with this name already exists for this user",
            },
            { status: 409 },
          );
        }
      }
      updateData.name = trimmedName;
    }

    if (hardwareId !== undefined) {
      if (typeof hardwareId !== "string") {
        return NextResponse.json(
          { success: false, error: "hardwareId must be a string" },
          { status: 400 },
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
      if (
        hardwareId !== existingMiner.hardwareId &&
        hardwareExists.quantity <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "No available hardware units of this model",
          },
          { status: 409 },
        );
      }
      updateData.hardwareId = hardwareId;
    }

    if (userId !== undefined) {
      if (typeof userId !== "string") {
        return NextResponse.json(
          { success: false, error: "userId must be a string" },
          { status: 400 },
        );
      }
      // Reassigning a miner is only allowed to another of THIS franchisee's
      // own customers — never to an arbitrary user in the system.
      const targetOwned = await assertFranchiseeOwnsCustomer(
        auth.decoded.userId,
        userId,
      );
      if (!targetOwned) {
        return NextResponse.json(
          { success: false, error: "Customer not found" },
          { status: 404 },
        );
      }
      if (userId !== existingMiner.userId) {
        const nameToCheck = updateData.name || existingMiner.name;
        const conflict = await prisma.miner.findUnique({
          where: { name_userId: { name: nameToCheck, userId } },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json(
            {
              success: false,
              error:
                "A miner with this name already exists for the target user",
            },
            { status: 409 },
          );
        }
      }
      updateData.userId = userId;
    }

    if (spaceId !== undefined) {
      if (typeof spaceId !== "string") {
        return NextResponse.json(
          { success: false, error: "spaceId must be a string" },
          { status: 400 },
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
      updateData.spaceId = spaceId;
    }

    if (status !== undefined) {
      if (
        !["AUTO", "DEPLOYMENT_IN_PROGRESS", "UNDER_MAINTENANCE"].includes(
          status,
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "status must be AUTO, DEPLOYMENT_IN_PROGRESS, or UNDER_MAINTENANCE",
          },
          { status: 400 },
        );
      }
      updateData.status = status;
    }

    if (serialNumber !== undefined) {
      updateData.serialNumber = serialNumber ? serialNumber.trim() : null;
    }
    if (macAddress !== undefined) {
      updateData.macAddress = macAddress ? macAddress.trim() : null;
    }

    if (poolId !== undefined) {
      if (poolId !== null) {
        if (typeof poolId !== "string") {
          return NextResponse.json(
            { success: false, error: "poolId must be a string or null" },
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
      updateData.poolId = poolId;
    }

    if (Object.keys(updateData).length === 0 && ratePerKwhValue === null) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    const updatedMiner = await prisma.$transaction(async (tx) => {
      if (
        updateData.hardwareId &&
        updateData.hardwareId !== existingMiner.hardwareId
      ) {
        await tx.hardware.update({
          where: { id: existingMiner.hardwareId },
          data: { quantity: { increment: 1 } },
        });
        await tx.hardware.update({
          where: { id: updateData.hardwareId },
          data: { quantity: { decrement: 1 } },
        });
      }

      if (ratePerKwhValue !== null) {
        const latestRate = await tx.minerRateHistory.findFirst({
          where: { minerId: id },
          orderBy: { createdAt: "desc" },
          select: { rate_per_kwh: true },
        });
        const currentRate =
          latestRate && parseFloat(latestRate.rate_per_kwh.toString());
        if (!latestRate || currentRate !== ratePerKwhValue) {
          await tx.minerRateHistory.create({
            data: { minerId: id, rate_per_kwh: ratePerKwhValue },
          });
        }
      }

      if (updateData.userId && updateData.userId !== existingMiner.userId) {
        await tx.minerOwnershipHistory.create({
          data: {
            minerId: id,
            ownerId: updateData.userId,
            createdById: auth.decoded.userId,
          },
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updateData, "poolId") &&
        updateData.poolId &&
        updateData.poolId !== existingMiner.poolId
      ) {
        await tx.minerPoolHistory.create({
          data: {
            minerId: id,
            poolId: updateData.poolId,
            createdById: auth.decoded.userId,
          },
        });
      }

      return tx.miner.update({
        where: { id },
        data: updateData,
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
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: updatedMiner,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Franchise Miners API] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update miner" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const owns = await assertFranchiseeOwnsMiner(auth.decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    const existingMiner = await prisma.miner.findUniqueOrThrow({
      where: { id },
      select: { id: true, hardwareId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.miner.update({
        where: { id },
        data: { isDeleted: true },
      });
      await tx.hardware.update({
        where: { id: existingMiner.hardwareId },
        data: { quantity: { increment: 1 } },
      });
    });

    return NextResponse.json({
      success: true,
      data: { id, message: "Miner deleted successfully" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Franchise Miners API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete miner" },
      { status: 500 },
    );
  }
}
