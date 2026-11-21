import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeDeleted = searchParams.get("isDeleted") === "true";
  try {
    // Was open to anyone, staff names and emails included. Shared lookup: the
    // model picker on the miner form and on invoice create/edit pages.
    const ctx = await getAuthorizationContext(req);
    if ("response" in ctx) return ctx.response;
    const denied = requireAnyPermission(ctx, [
      "hardware_models.view",
      "miners.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if (denied) return denied;

    const hardware = await prisma.hardware.findMany({
      include: {
        procurementHistory: {
          select: {
            id: true,
            quantity: true,
            createdAt: true,
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            miners: { where: { isDeleted: false } },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      where: includeDeleted ? {} : { isDeleted: false },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: hardware,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch hardware" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "hardware_models.create");
    if (denied) return denied;
    const userId = ctx.userId;

    const body = await request.json();
    const { model, powerUsage, hashRate, quantity } = body;

    // Validation
    if (!model || model.trim() === "") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Model is required" },
        { status: 400 },
      );
    }

    if (powerUsage === undefined || powerUsage === null) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Power usage is required" },
        { status: 400 },
      );
    }

    if (typeof powerUsage !== "number" || powerUsage <= 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Power usage must be a positive number (in kW)",
        },
        { status: 400 },
      );
    }

    if (hashRate === undefined || hashRate === null) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hash rate is required" },
        { status: 400 },
      );
    }

    if (typeof hashRate !== "number" || hashRate <= 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Hash rate must be a positive number (in TH/s)",
        },
        { status: 400 },
      );
    }

    if (quantity !== undefined) {
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Quantity must be a positive integer" },
          { status: 400 },
        );
      }
    }

    // Check if hardware model already exists
    const existingHardware = await prisma.hardware.findUnique({
      where: { model },
    });

    if (existingHardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware model already exists" },
        { status: 400 },
      );
    }

    // Create hardware
    const hardware = await prisma.hardware.create({
      data: {
        model,
        powerUsage,
        hashRate,
        ...(quantity !== undefined && { quantity }),
        createdById: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.HARDWARE_CREATED,
        entityType: "Hardware",
        entityId: hardware.id,
        userId,
        description: `Hardware ${hardware.model} created`,
      },
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: hardware,
        timestamp: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to create hardware" },
      { status: 500 },
    );
  }
}
