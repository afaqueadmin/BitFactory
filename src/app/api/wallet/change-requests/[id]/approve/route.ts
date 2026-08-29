/**
 * POST /api/wallet/change-requests/[id]/approve
 *
 * Approves a PENDING wallet change request and pushes the new address to
 * Luxor: fetches the subaccount's live payment settings, replaces the
 * external_address on the primary (highest revenue_allocation) entry with
 * the requested address - leaving address_id/address_name/revenue_allocation
 * and any other split-payout addresses untouched - then PUTs the full
 * addresses array back via updatePaymentSettings (Luxor's API is a full
 * array replace, not a single-field patch).
 *
 * The row is claimed via a status-guarded updateMany *before* calling Luxor,
 * so two concurrent approve calls on the same request can't both reach
 * Luxor: only the caller whose updateMany actually matched a PENDING row
 * proceeds, the other gets "already reviewed" immediately. If the Luxor
 * call then fails, the claim is reverted back to PENDING so the request
 * isn't left stuck APPROVED-but-not-applied. ADMIN/SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient, LuxorError } from "@/lib/luxor";
import { walletCache } from "@/lib/cache";
import { resolveLuxorIdentifier, selectPrimaryAddress } from "@/lib/wallet";
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

    const now = new Date();
    const claim = await prisma.walletChangeRequest.updateMany({
      where: { id, status: "PENDING" },
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

    const revertClaim = () =>
      prisma.walletChangeRequest.update({
        where: { id },
        data: { status: "PENDING", reviewedById: null, reviewedAt: null },
      });

    const luxorIdentifier = await resolveLuxorIdentifier(
      walletChangeRequest.userId,
    );
    if (!luxorIdentifier) {
      await revertClaim();
      return NextResponse.json(
        {
          success: false,
          error: "This user has no Luxor subaccount configured",
        },
        { status: 422 },
      );
    }

    const luxorClient = createLuxorClient(luxorIdentifier);

    try {
      const currentSettings = await luxorClient.getSubaccountPaymentSettings(
        walletChangeRequest.currency,
        luxorIdentifier,
      );

      const primary = selectPrimaryAddress(currentSettings.addresses);
      if (!primary) {
        await revertClaim();
        return NextResponse.json(
          {
            success: false,
            error:
              "This subaccount has no existing payout address on Luxor to update",
          },
          { status: 422 },
        );
      }

      const rebuiltAddresses = currentSettings.addresses.map((address) =>
        address.address_id === primary.address_id
          ? {
              ...address,
              external_address: walletChangeRequest.requestedAddress,
            }
          : address,
      );

      await luxorClient.updatePaymentSettings(
        walletChangeRequest.currency,
        luxorIdentifier,
        { addresses: rebuiltAddresses },
      );
    } catch (error) {
      console.error(
        "[Wallet Change Requests API] Luxor update failed:",
        error instanceof LuxorError ? error.message : error,
      );
      await revertClaim();
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof LuxorError
              ? `Luxor rejected the update: ${error.message}`
              : "Failed to push the new address to Luxor",
        },
        { status: 502 },
      );
    }

    walletCache.invalidate(
      `wallet_${walletChangeRequest.userId}_${walletChangeRequest.currency}`,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.walletChangeRequest.update({
        where: { id },
        data: { appliedAt: now },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.WALLET_CHANGE_APPROVED,
          entityType: "WalletChangeRequest",
          entityId: id,
          userId: auth.decoded.userId,
          description: `Wallet change approved and applied on Luxor: ${walletChangeRequest.currentAddress ?? "(not configured)"} -> ${walletChangeRequest.requestedAddress}`,
          changes: JSON.stringify({
            requestedAddress: {
              from: walletChangeRequest.currentAddress,
              to: walletChangeRequest.requestedAddress,
            },
          }),
        },
      });

      return result;
    });

    try {
      await sendWalletChangeRequestApprovedEmail(
        walletChangeRequest.user.email,
        walletChangeRequest.currentAddress,
        walletChangeRequest.requestedAddress,
      );
    } catch (emailError) {
      console.error(
        "[Wallet Change Requests API] Failed to send approved email:",
        emailError,
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Wallet change approved and applied on Luxor",
    });
  } catch (error) {
    console.error("[Wallet Change Requests API] approve error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve wallet change request" },
      { status: 500 },
    );
  }
}
