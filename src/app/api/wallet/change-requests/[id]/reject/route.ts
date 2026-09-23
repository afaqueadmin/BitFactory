/**
 * POST /api/wallet/change-requests/[id]/reject
 *
 * Rejects a request that's still PENDING or CONFIRMED (not yet APPROVED).
 * Nothing is pushed to Luxor - the live address is left exactly as it was.
 * Requires the admin's own step-up re-authentication (password or 2FA),
 * same as confirm/approve, for consistency across every admin action on a
 * wallet change request.
 *
 * The status update is guarded by a status-conditioned updateMany (not a
 * separate check-then-write), so two concurrent reject/approve calls on the
 * same request can't both succeed.
 *
 * Body: { rejectionReason: string, currentPassword?: string, twoFactorToken?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { sendWalletChangeRequestRejectedEmail } from "@/lib/email";

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
    const { rejectionReason, currentPassword, twoFactorToken } = body as {
      rejectionReason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    };

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
      include: { user: { select: { email: true } } },
    });
    if (!walletChangeRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }
    if (
      walletChangeRequest.status !== "PENDING" &&
      walletChangeRequest.status !== "CONFIRMED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${walletChangeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      auth.decoded.userId,
      { currentPassword, twoFactorToken },
      "reject a wallet change request",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const trimmedReason = rejectionReason.trim();
    const now = new Date();

    const claim = await prisma.walletChangeRequest.updateMany({
      where: { id, status: { in: ["PENDING", "CONFIRMED"] } },
      data: {
        status: "REJECTED",
        rejectionReason: trimmedReason,
        reviewedById: auth.decoded.userId,
        reviewedAt: now,
      },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${walletChangeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.WALLET_CHANGE_REJECTED,
        entityType: "WalletChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Wallet change request rejected: ${trimmedReason}`,
      },
    });

    try {
      await sendWalletChangeRequestRejectedEmail(
        walletChangeRequest.user.email,
        trimmedReason,
      );
    } catch (emailError) {
      console.error(
        "[Wallet Change Requests API] Failed to send rejected email:",
        emailError,
      );
    }

    const updated = await prisma.walletChangeRequest.findUnique({
      where: { id },
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
