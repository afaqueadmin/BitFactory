/**
 * POST /api/wallet/change-requests/[id]/reject
 *
 * Rejects a PENDING wallet change request. Nothing is pushed to Luxor - the
 * live address is left exactly as it was. ADMIN/SUPER_ADMIN only.
 *
 * Body: { rejectionReason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return { error: "Admin access required", status: 403 as const };
    }
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { rejectionReason } = body as { rejectionReason?: string };

    if (
      !rejectionReason ||
      typeof rejectionReason !== "string" ||
      !rejectionReason.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "rejectionReason is required" },
        { status: 400 },
      );
    }

    const walletChangeRequest = await prisma.walletChangeRequest.findUnique({
      where: { id },
    });
    if (!walletChangeRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }
    if (walletChangeRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${walletChangeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.walletChangeRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: rejectionReason.trim(),
          reviewedById: auth.decoded.userId,
          reviewedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.WALLET_CHANGE_REJECTED,
          entityType: "WalletChangeRequest",
          entityId: id,
          userId: auth.decoded.userId,
          description: `Wallet change request rejected: ${rejectionReason.trim()}`,
        },
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Wallet change request rejected",
    });
  } catch (error) {
    console.error("[Wallet Change Requests API] reject error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reject wallet change request" },
      { status: 500 },
    );
  }
}
