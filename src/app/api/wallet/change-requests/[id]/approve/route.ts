/**
 * POST /api/wallet/change-requests/[id]/approve
 *
 * Final step of admin review - only available once the request is CONFIRMED
 * (see .../confirm). Marks the request APPROVED and starts the client's
 * 24-hour payout freeze window (anchored to reviewedAt). Requires the
 * admin's own step-up re-authentication (password or 2FA), same as confirm.
 *
 * Deliberately does NOT push anything to Luxor - the admin updates the
 * payout address on Luxor manually, outside this app, the same way they
 * verify with the client at the confirm step. This app only tracks the
 * request's review state and the resulting freeze window.
 *
 * The row is claimed via a status-guarded updateMany, so two concurrent
 * approve calls on the same request can't both succeed: only the caller
 * whose updateMany actually matched a CONFIRMED row proceeds.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { sendWalletChangeRequestApprovedEmail } from "@/lib/email";

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
    const { currentPassword, twoFactorToken } = body as {
      currentPassword?: string;
      twoFactorToken?: string;
    };

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
    if (walletChangeRequest.status !== "CONFIRMED") {
      return NextResponse.json(
        {
          success: false,
          error:
            walletChangeRequest.status === "PENDING"
              ? "Confirm this request with the client before approving it"
              : `Request has already been ${walletChangeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      auth.decoded.userId,
      { currentPassword, twoFactorToken },
      "approve a wallet change request",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const now = new Date();
    const claim = await prisma.walletChangeRequest.updateMany({
      where: { id, status: "CONFIRMED" },
      data: {
        status: "APPROVED",
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
        action: AuditAction.WALLET_CHANGE_APPROVED,
        entityType: "WalletChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Wallet change approved: ${walletChangeRequest.currentAddress ?? "(not configured)"} -> ${walletChangeRequest.requestedAddress}. Admin must update the address on Luxor manually.`,
        changes: JSON.stringify({
          requestedAddress: {
            from: walletChangeRequest.currentAddress,
            to: walletChangeRequest.requestedAddress,
          },
        }),
      },
    });

    try {
      await sendWalletChangeRequestApprovedEmail(
        walletChangeRequest.user.email,
        walletChangeRequest.currentAddress,
        walletChangeRequest.requestedAddress,
        now,
      );
    } catch (emailError) {
      console.error(
        "[Wallet Change Requests API] Failed to send approved email:",
        emailError,
      );
    }

    const updated = await prisma.walletChangeRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Wallet change approved",
    });
  } catch (error) {
    console.error("[Wallet Change Requests API] approve error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve wallet change request" },
      { status: 500 },
    );
  }
}
