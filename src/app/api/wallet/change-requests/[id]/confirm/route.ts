/**
 * POST /api/wallet/change-requests/[id]/confirm
 *
 * First step of admin review, before Approve becomes available. The admin
 * verifies the change with the client themselves - by phone or email,
 * outside this app - then records that verification here: which method was
 * used, the specific contact point (phone number or email address) the
 * client was reached at, and a mandatory note describing the confirmation.
 * Requires the admin's own step-up re-authentication (password or 2FA,
 * matching /api/wallet/change-requests' POST), since this - like Approve -
 * moves a real payout-affecting request forward on a live session alone
 * otherwise. Only a PENDING request can be confirmed.
 *
 * Nothing is pushed to Luxor here or at Approve - the admin updates the
 * payout address on Luxor manually, the same way they verify with the
 * client: outside the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyStepUp } from "@/lib/auth/stepUp";

const CONFIRMATION_METHODS = new Set(["CALL", "EMAIL"]);

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
    const {
      confirmationMethod,
      confirmationContact,
      confirmationNote,
      currentPassword,
      twoFactorToken,
    } = body as {
      confirmationMethod?: string;
      confirmationContact?: string;
      confirmationNote?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    };

    if (!confirmationMethod || !CONFIRMATION_METHODS.has(confirmationMethod)) {
      return NextResponse.json(
        { success: false, error: "confirmationMethod must be CALL or EMAIL" },
        { status: 400 },
      );
    }
    if (
      !confirmationContact ||
      typeof confirmationContact !== "string" ||
      !confirmationContact.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            confirmationMethod === "EMAIL"
              ? "The email address the client confirmed through is required"
              : "The phone number the client confirmed on is required",
        },
        { status: 400 },
      );
    }
    if (
      !confirmationNote ||
      typeof confirmationNote !== "string" ||
      !confirmationNote.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "A note describing how the client confirmed is required",
        },
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

    const stepUp = await verifyStepUp(
      auth.decoded.userId,
      { currentPassword, twoFactorToken },
      "confirm a wallet change request with the client",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const now = new Date();
    const trimmedContact = confirmationContact.trim();
    const trimmedNote = confirmationNote.trim();

    const claim = await prisma.walletChangeRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "CONFIRMED",
        confirmedById: auth.decoded.userId,
        confirmedAt: now,
        confirmationMethod,
        confirmationContact: trimmedContact,
        confirmationNote: trimmedNote,
      },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Request has already been reviewed",
        },
        { status: 400 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.WALLET_CHANGE_CONFIRMED,
        entityType: "WalletChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Wallet change confirmed with client via ${confirmationMethod === "EMAIL" ? "email" : "phone call"} (${trimmedContact})`,
        changes: JSON.stringify({
          confirmationMethod,
          confirmationContact: trimmedContact,
          confirmationNote: trimmedNote,
        }),
      },
    });

    const updated = await prisma.walletChangeRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Confirmation recorded. You can now approve this request.",
    });
  } catch (error) {
    console.error("[Wallet Change Requests API] confirm error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm wallet change request" },
      { status: 500 },
    );
  }
}
