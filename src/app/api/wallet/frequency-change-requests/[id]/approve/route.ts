/**
 * POST /api/wallet/frequency-change-requests/[id]/approve
 *
 * Final step of admin review - only available once the request is CONFIRMED
 * (see .../confirm). Marks the request APPROVED. Requires the admin's own
 * step-up re-authentication (password or 2FA), same as confirm.
 *
 * Unlike a wallet change there's no payout freeze afterwards - the payout
 * destination isn't changing. Deliberately does NOT push anything to Luxor:
 * the admin updates the payout schedule on Luxor manually, outside this app.
 *
 * The row is claimed via a status-guarded updateMany, so two concurrent
 * approve calls on the same request can't both succeed.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { formatPaymentSchedule } from "@/lib/constants/paymentFrequency";
import { sendPaymentFrequencyChangeRequestApprovedEmail } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["wallets.approve"]);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { currentPassword, twoFactorToken } = body as {
      currentPassword?: string;
      twoFactorToken?: string;
    };

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
    if (changeRequest.status !== "CONFIRMED") {
      return NextResponse.json(
        {
          success: false,
          error:
            changeRequest.status === "PENDING"
              ? "Confirm this request with the client before approving it"
              : `Request has already been ${changeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      { currentPassword, twoFactorToken },
      "approve a payment frequency change request",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const now = new Date();
    const claim = await prisma.paymentFrequencyChangeRequest.updateMany({
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
          error: `Request has already been ${changeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const previousSchedule = changeRequest.currentFrequency
      ? formatPaymentSchedule(
          changeRequest.currentFrequency,
          changeRequest.currentDayOfWeek,
        )
      : "(unknown)";
    const newSchedule = formatPaymentSchedule(
      changeRequest.requestedFrequency,
      changeRequest.requestedDayOfWeek,
    );

    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_FREQUENCY_CHANGE_APPROVED,
        entityType: "PaymentFrequencyChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Payment frequency change approved for subaccount ${changeRequest.subaccountName}: ${previousSchedule} -> ${newSchedule}. Admin must update the schedule on Luxor manually.`,
        changes: JSON.stringify({
          subaccountName: changeRequest.subaccountName,
          paymentFrequency: {
            from: changeRequest.currentFrequency,
            to: changeRequest.requestedFrequency,
          },
          dayOfWeek: {
            from: changeRequest.currentDayOfWeek,
            to: changeRequest.requestedDayOfWeek,
          },
        }),
      },
    });

    try {
      await sendPaymentFrequencyChangeRequestApprovedEmail(
        changeRequest.user.email,
        changeRequest.subaccountName,
        previousSchedule,
        newSchedule,
      );
    } catch (emailError) {
      console.error(
        "[Payment Frequency Change Requests API] Failed to send approved email:",
        emailError,
      );
    }

    const updated = await prisma.paymentFrequencyChangeRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Payment frequency change approved",
    });
  } catch (error) {
    console.error(
      "[Payment Frequency Change Requests API] approve error:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to approve payment frequency change request",
      },
      { status: 500 },
    );
  }
}
