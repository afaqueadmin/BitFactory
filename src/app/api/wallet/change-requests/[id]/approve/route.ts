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
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { sendWalletChangeRequestApprovedEmail } from "@/lib/email";
import {
  auditClientWallet,
  findLuxorPoolSubaccount,
  masked,
  setClientWalletAddress,
} from "@/lib/clientWallets";
import { requestMeta } from "@/lib/guilds/audit";

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
      auth.decoded,
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
    // Claim, our wallet record and the audit trail change together: the
    // approved address becomes what we expect Luxor to hold, so the daily
    // check (cron_wallet_address_check) flags Luxor until an admin updates it.
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.walletChangeRequest.updateMany({
        where: { id, status: "CONFIRMED" },
        data: {
          status: "APPROVED",
          reviewedById: auth.decoded.userId,
          reviewedAt: now,
        },
      });
      if (claim.count === 0) return false;

      await tx.auditLog.create({
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
          ...requestMeta(request),
        },
      });

      // Rows from before multi-subaccount support have no subaccount, so
      // there's no record to update for them.
      const sub = walletChangeRequest.subaccountName
        ? await findLuxorPoolSubaccount(walletChangeRequest.subaccountName, tx)
        : null;
      if (sub) {
        const { changed, previous } = await setClientWalletAddress(tx, {
          poolSubaccountId: sub.id,
          address: walletChangeRequest.requestedAddress,
          source: "CHANGE_REQUEST",
          at: now,
          walletChangeRequestId: id,
          actorId: auth.decoded.userId,
        });
        await auditClientWallet(tx, {
          action: AuditAction.CLIENT_WALLET_UPDATED,
          poolSubaccountId: sub.id,
          userId: auth.decoded.userId,
          description: `Wallet record for ${sub.subaccountName} ${changed ? `changed ${masked(previous)} -> ${masked(walletChangeRequest.requestedAddress)}` : "unchanged (already this address)"} by approved change request ${id}. Luxor must now be updated by hand.`,
          changes: {
            subaccountName: sub.subaccountName,
            walletChangeRequestId: id,
            address: {
              from: masked(previous),
              to: masked(walletChangeRequest.requestedAddress),
            },
          },
          ...requestMeta(request),
        });
      }
      return true;
    });
    if (!claimed) {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${walletChangeRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

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
