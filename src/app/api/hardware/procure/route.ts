/**
 * Hardware Procurement API
 *
 * POST /api/hardware/procure
 * Creates a hardware procurement history entry and updates hardware quantity
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Was open to any signed-in account, clients included.
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "hardware_models.procure");
    if (denied) return denied;
    const { userId, role: userRole } = ctx;

    const body = await request.json();
    const { hardwareId, quantity } = body;

    // Validate input
    if (!hardwareId || typeof hardwareId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware ID is required" },
        { status: 400 },
      );
    }

    const qty = parseInt(String(quantity));
    if (userRole !== "SUPER_ADMIN" && (isNaN(qty) || qty < 1)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Quantity must be at least 1" },
        { status: 400 },
      );
    }

    // Verify hardware exists
    const hardware = await prisma.hardware.findUnique({
      where: { id: hardwareId },
      select: { id: true },
    });

    if (!hardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware not found" },
        { status: 404 },
      );
    }

    // Create procurement history entry and update hardware quantity in transaction
    await prisma.$transaction(async (tx) => {
      // Create procurement history entry
      await tx.hardwareProcurementHistory.create({
        data: {
          hardwareId,
          quantity: qty,
          createdById: userId,
        },
      });

      // Update hardware quantity
      await tx.hardware.update({
        where: { id: hardwareId },
        data: {
          quantity: {
            increment: qty,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.HARDWARE_PROCUREMENT_RECORDED,
          entityType: "Hardware",
          entityId: hardwareId,
          userId,
          description: `Procured ${qty} unit${qty !== 1 ? "s" : ""} of hardware`,
        },
      });
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          message: `Successfully procured ${qty} unit${qty !== 1 ? "s" : ""} of hardware`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[Hardware Procure API] Error:", errorMsg);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
