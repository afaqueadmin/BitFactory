/**
 * POST /api/wallet/frequency-change-requests/[id]/reject
 *
 * Rejects a request that's still PENDING or CONFIRMED (not yet APPROVED).
 * Nothing is pushed to Luxor - the live schedule is left exactly as it was.
 * Requires the admin's own step-up re-authentication (password or 2FA),
 * same as confirm/approve.
 *
 * The status update is guarded by a status-conditioned updateMany, so two
 * concurrent reject/approve calls on the same request can't both succeed.
 *
 * Body: { rejectionReason: string, currentPassword?: string, twoFactorToken?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { sendPaymentFrequencyChangeRequestRejectedEmail } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["wallets.reject"]);
    if ("response" in auth) return auth.response;

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

    const changeRequest = await prisma.paymentFrequencyChangeRequest.findUnique(
      {
        where: { id },
        include: { user: { select: { email: true } } },
      },
    );
    if (!changeRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }
    if (
      changeRequest.status !== "PENDING" &&
      changeRequest.status !== "CONFIRMED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${changeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      { currentPassword, twoFactorToken },
      "reject a payment frequency change request",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const trimmedReason = rejectionReason.trim();
    const now = new Date();

    const claim = await prisma.paymentFrequencyChangeRequest.updateMany({
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
          error: `Request has already been ${changeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_FREQUENCY_CHANGE_REJECTED,
        entityType: "PaymentFrequencyChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Payment frequency change request rejected: ${trimmedReason}`,
      },
    });

    try {
      await sendPaymentFrequencyChangeRequestRejectedEmail(
        changeRequest.user.email,
        trimmedReason,
      );
    } catch (emailError) {
      console.error(
        "[Payment Frequency Change Requests API] Failed to send rejected email:",
        emailError,
      );
    }

    const updated = await prisma.paymentFrequencyChangeRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Payment frequency change request rejected",
    });
  } catch (error) {
    console.error(
      "[Payment Frequency Change Requests API] reject error:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reject payment frequency change request",
      },
      { status: 500 },
    );
  }
}
