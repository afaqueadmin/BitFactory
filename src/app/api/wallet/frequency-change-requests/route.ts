/**
 * /api/wallet/frequency-change-requests
 *
 * GET: list payment frequency change requests visible to the caller.
 *   - CLIENT/FRANCHISEE: only requests they submitted. The admin-only review
 *     trail (confirmedById/confirmedAt/confirmationMethod/
 *     confirmationContact/confirmationNote/confirmedBy) is stripped, same as
 *     /api/wallet/change-requests.
 *   - ADMIN/SUPER_ADMIN: every request, optionally filtered by ?status=,
 *     including the full review trail.
 *
 * POST: submit a new payment frequency change request. CLIENT/FRANCHISEE
 * only. Requires step-up re-authentication (current password, or a 2FA
 * code/backup code for users with 2FA enabled - decided server-side from the
 * user's own record), matching the wallet change request flow. Body:
 * requestedFrequency (DAILY | WEEKLY | MONTHLY), requestedDayOfWeek (required
 * for WEEKLY, ignored otherwise), subaccountName (required when the caller
 * has more than one Luxor subaccount - validated against the caller's own
 * PoolAuth rows), optional reason.
 *
 * Snapshots the subaccount's live Luxor schedule into currentFrequency/
 * currentDayOfWeek, and rejects a request identical to it. If Luxor can't be
 * reached the snapshot is null and that check is skipped - a missing
 * snapshot shouldn't block a client from submitting. Only one request in
 * flight (PENDING or CONFIRMED) per subaccount at a time, independent of any
 * wallet change request. There's no payout freeze after approval, so an
 * APPROVED request doesn't block a new one.
 *
 * Braiins is out of scope - see src/lib/wallet.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { fetchPaymentScheduleForSubaccount } from "@/lib/wallet";
import { resolveLuxorSubaccounts } from "@/lib/luxorSubaccounts";
import {
  formatPaymentSchedule,
  isDayOfWeek,
  isPaymentFrequency,
} from "@/lib/constants/paymentFrequency";
import { sendPaymentFrequencyChangeRequestSubmittedEmail } from "@/lib/email";

const STATUSES = new Set(["PENDING", "CONFIRMED", "APPROVED", "REJECTED"]);

async function requireUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const statusParam = request.nextUrl.searchParams.get("status");
    const isAdmin =
      auth.decoded.role === "ADMIN" || auth.decoded.role === "SUPER_ADMIN";

    const where: Prisma.PaymentFrequencyChangeRequestWhereInput = {
      ...(isAdmin ? {} : { userId: auth.decoded.userId }),
      ...(statusParam && STATUSES.has(statusParam)
        ? {
            status: statusParam as
              "PENDING" | "CONFIRMED" | "APPROVED" | "REJECTED",
          }
        : {}),
    };

    const requests = await prisma.paymentFrequencyChangeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        confirmedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const data = isAdmin
      ? requests
      : requests.map((req) => ({
          id: req.id,
          userId: req.userId,
          currency: req.currency,
          subaccountName: req.subaccountName,
          currentFrequency: req.currentFrequency,
          currentDayOfWeek: req.currentDayOfWeek,
          requestedFrequency: req.requestedFrequency,
          requestedDayOfWeek: req.requestedDayOfWeek,
          reason: req.reason,
          status: req.status,
          rejectionReason: req.rejectionReason,
          reviewedById: req.reviewedById,
          reviewedAt: req.reviewedAt,
          createdAt: req.createdAt,
          updatedAt: req.updatedAt,
          user: req.user,
          reviewedBy: req.reviewedBy,
        }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Payment Frequency Change Requests API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch payment frequency change requests",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    if (auth.decoded.role !== "CLIENT" && auth.decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only clients or franchisees can request a payment frequency change",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      requestedFrequency,
      requestedDayOfWeek,
      reason,
      currentPassword,
      twoFactorToken,
      subaccountName: requestedSubaccountName,
    } = body as {
      requestedFrequency?: string;
      requestedDayOfWeek?: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
      subaccountName?: string;
    };

    if (!isPaymentFrequency(requestedFrequency)) {
      return NextResponse.json(
        {
          success: false,
          error: "requestedFrequency must be DAILY, WEEKLY or MONTHLY",
        },
        { status: 400 },
      );
    }
    // Day of week only applies to a weekly schedule - dropped for the others.
    let dayOfWeek: string | null = null;
    if (requestedFrequency === "WEEKLY") {
      if (!isDayOfWeek(requestedDayOfWeek)) {
        return NextResponse.json(
          {
            success: false,
            error: "Choose which day of the week you want to be paid",
          },
          { status: 400 },
        );
      }
      dayOfWeek = requestedDayOfWeek;
    }
    if (
      reason !== undefined &&
      typeof reason === "string" &&
      reason.length > 1000
    ) {
      return NextResponse.json(
        { success: false, error: "reason must not exceed 1000 characters" },
        { status: 400 },
      );
    }

    // Which Luxor subaccount this request is for - validated against the
    // caller's own subaccounts (never trust the submitted value blindly). A
    // caller with exactly one subaccount can omit it.
    const callerSubaccounts = await resolveLuxorSubaccounts(
      auth.decoded.userId,
    );
    if (callerSubaccounts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "You don't have a Luxor subaccount to change the schedule on",
        },
        { status: 400 },
      );
    }
    let subaccountName: string;
    if (requestedSubaccountName) {
      const match = callerSubaccounts.find(
        (s) => s.authKey === requestedSubaccountName,
      );
      if (!match) {
        return NextResponse.json(
          { success: false, error: "Unknown subaccount" },
          { status: 400 },
        );
      }
      subaccountName = match.authKey;
    } else if (callerSubaccounts.length === 1) {
      subaccountName = callerSubaccounts[0].authKey;
    } else {
      return NextResponse.json(
        { success: false, error: "subaccountName is required" },
        { status: 400 },
      );
    }

    // ── Step-up re-authentication ──────────────────────────────────────
    // Which method is required is decided from the user's own record, never
    // from what the client claims.
    const stepUp = await verifyStepUp(
      auth.decoded.userId,
      { currentPassword, twoFactorToken },
      "request a payment frequency change",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }
    const verifiedVia = stepUp.method;

    const authUser = await prisma.user.findUniqueOrThrow({
      where: { id: auth.decoded.userId },
      select: { email: true },
    });

    const existingActive = await prisma.paymentFrequencyChangeRequest.findFirst(
      {
        where: {
          userId: auth.decoded.userId,
          subaccountName,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { id: true },
      },
    );
    if (existingActive) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You already have a payment frequency change in review for this subaccount. Wait for it to be resolved before submitting another.",
        },
        { status: 400 },
      );
    }

    const current = await fetchPaymentScheduleForSubaccount(subaccountName);
    if (
      current &&
      current.frequency === requestedFrequency &&
      current.dayOfWeek === dayOfWeek
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "That's already your current payment schedule",
        },
        { status: 400 },
      );
    }

    const currentSchedule = current
      ? formatPaymentSchedule(current.frequency, current.dayOfWeek)
      : "(unknown)";
    const requestedSchedule = formatPaymentSchedule(
      requestedFrequency,
      dayOfWeek,
    );

    const created = await prisma.$transaction(async (tx) => {
      const changeRequest = await tx.paymentFrequencyChangeRequest.create({
        data: {
          userId: auth.decoded.userId,
          subaccountName,
          currentFrequency: current?.frequency ?? null,
          currentDayOfWeek: current?.dayOfWeek ?? null,
          requestedFrequency,
          requestedDayOfWeek: dayOfWeek,
          reason:
            reason && typeof reason === "string" ? reason.trim() || null : null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_FREQUENCY_CHANGE_REQUESTED,
          entityType: "PaymentFrequencyChangeRequest",
          entityId: changeRequest.id,
          userId: auth.decoded.userId,
          description: `Payment frequency change requested for subaccount ${subaccountName}: ${currentSchedule} -> ${requestedSchedule}`,
          changes: JSON.stringify({
            subaccountName,
            paymentFrequency: {
              from: current?.frequency ?? null,
              to: requestedFrequency,
            },
            dayOfWeek: { from: current?.dayOfWeek ?? null, to: dayOfWeek },
            verifiedVia,
          }),
        },
      });

      return changeRequest;
    });

    try {
      await sendPaymentFrequencyChangeRequestSubmittedEmail(
        authUser.email,
        subaccountName,
        requestedSchedule,
      );
    } catch (emailError) {
      console.error(
        "[Payment Frequency Change Requests API] Failed to send submitted email:",
        emailError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Payment frequency change request submitted",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Payment Frequency Change Requests API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to submit payment frequency change request",
      },
      { status: 500 },
    );
  }
}
