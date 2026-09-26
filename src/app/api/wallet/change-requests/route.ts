/**
 * /api/wallet/change-requests
 *
 * GET: list wallet change requests visible to the caller.
 *   - CLIENT/FRANCHISEE: only requests they submitted (their own account -
 *     the wallet page never lets them view/request for someone else). The
 *     admin-only review trail (confirmedById/confirmedAt/confirmationMethod/
 *     confirmationContact/confirmationNote/confirmedBy) is stripped from the
 *     response for these callers - it can contain the client's own phone
 *     number/email plus internal notes, none of which the client needs to
 *     see back.
 *   - ADMIN/SUPER_ADMIN: every request, optionally filtered by ?status=,
 *     including the full review trail.
 *
 * POST: submit a new wallet change request. CLIENT/FRANCHISEE only. Requires
 * step-up re-authentication (current password, or a 2FA code/backup code for
 * users with 2FA enabled - server decides which based on the user's own
 * twoFactorEnabled flag, never the client) and a checksum-valid mainnet
 * Bitcoin address, on top of the session cookie - this redirects a client's
 * real payout destination, so a live session alone isn't enough, matching
 * the step-up already required by /api/user/change-password. Requires
 * subaccountName when the caller has more than one Luxor subaccount
 * (payment settings, including payout address, are configured per
 * subaccount in Luxor, not account-wide) - validated against the caller's
 * own PoolAuth rows, never trusted blindly. Snapshots that subaccount's
 * live address into currentAddress at submission time, so the request row
 * is itself a permanent before/after record. Only one request in flight per
 * user at a time (across all of that user's subaccounts): blocks a new
 * submission while a previous one is PENDING, CONFIRMED, or
 * APPROVED-and-still-within-its-24h payout freeze (reviewedAt + 24h) -
 * approval no longer pushes to Luxor immediately, so the freeze window is
 * the real "still settling" period.
 *
 * Braiins is out of scope - see src/lib/wallet.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { compare } from "bcrypt";
import speakeasy from "speakeasy";
import { validate, Network } from "bitcoin-address-validation";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { fetchAddressForSubaccount } from "@/lib/wallet";
import { resolveLuxorSubaccounts } from "@/lib/luxorSubaccounts";
import { sendWalletChangeRequestSubmittedEmail } from "@/lib/email";

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

    const where: Prisma.WalletChangeRequestWhereInput = {
      ...(isAdmin ? {} : { userId: auth.decoded.userId }),
      ...(statusParam && STATUSES.has(statusParam)
        ? {
            status: statusParam as
              | "PENDING"
              | "CONFIRMED"
              | "APPROVED"
              | "REJECTED",
          }
        : {}),
    };

    const requests = await prisma.walletChangeRequest.findMany({
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
          currentAddress: req.currentAddress,
          requestedAddress: req.requestedAddress,
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
    console.error("[Wallet Change Requests API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch wallet change requests" },
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
          error: "Only clients or franchisees can request a wallet change",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      requestedAddress,
      reason,
      currentPassword,
      twoFactorToken,
      subaccountName: requestedSubaccountName,
    } = body as {
      requestedAddress?: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
      subaccountName?: string;
    };

    if (
      !requestedAddress ||
      typeof requestedAddress !== "string" ||
      !requestedAddress.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "requestedAddress is required" },
        { status: 400 },
      );
    }
    const trimmedAddress = requestedAddress.trim();
    if (!validate(trimmedAddress, Network.mainnet)) {
      return NextResponse.json(
        {
          success: false,
          error: "That doesn't look like a valid Bitcoin address",
        },
        { status: 400 },
      );
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
    let subaccountName: string | null = null;
    if (callerSubaccounts.length > 0) {
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
    }

    // ── Step-up re-authentication ──────────────────────────────────────
    // Which method is required is decided from the user's own record, never
    // from what the client claims - so a caller can't dodge 2FA just by
    // sending currentPassword instead of twoFactorToken.
    const authUser = await prisma.user.findUnique({
      where: { id: auth.decoded.userId },
      select: {
        email: true,
        password: true,
        twoFactorAuth: {
          select: { enabled: true, secret: true, backupCodes: true },
        },
      },
    });
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    let verifiedVia: "2FA" | "PASSWORD";

    if (authUser.twoFactorAuth?.enabled) {
      const twoFactorAuth = authUser.twoFactorAuth;
      if (!twoFactorToken || typeof twoFactorToken !== "string") {
        return NextResponse.json(
          {
            success: false,
            error: "A 2FA code is required to request a wallet change",
            code: "TWO_FACTOR_REQUIRED",
          },
          { status: 400 },
        );
      }

      const isBackupCode = twoFactorAuth.backupCodes?.includes(twoFactorToken);
      if (isBackupCode) {
        await prisma.twoFactorAuth.update({
          where: { userId: auth.decoded.userId },
          data: {
            backupCodes: {
              set: twoFactorAuth.backupCodes.filter(
                (code) => code !== twoFactorToken,
              ),
            },
            lastUsedAt: new Date(),
          },
        });
      } else {
        const verified =
          !!twoFactorAuth.secret &&
          speakeasy.totp.verify({
            secret: twoFactorAuth.secret,
            encoding: "base32",
            token: twoFactorToken,
            window: 1,
          });
        if (!verified) {
          return NextResponse.json(
            { success: false, error: "Invalid authentication code" },
            { status: 400 },
          );
        }
        await prisma.twoFactorAuth.update({
          where: { userId: auth.decoded.userId },
          data: { lastUsedAt: new Date() },
        });
      }
      verifiedVia = "2FA";
    } else {
      if (!currentPassword || typeof currentPassword !== "string") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Your current password is required to request a wallet change",
            code: "PASSWORD_REQUIRED",
          },
          { status: 400 },
        );
      }
      const passwordValid = await compare(currentPassword, authUser.password);
      if (!passwordValid) {
        return NextResponse.json(
          { success: false, error: "Current password is incorrect" },
          { status: 400 },
        );
      }
      verifiedVia = "PASSWORD";
    }

    const freezeWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingActive = await prisma.walletChangeRequest.findFirst({
      where: {
        userId: auth.decoded.userId,
        OR: [
          { status: { in: ["PENDING", "CONFIRMED"] } },
          { status: "APPROVED", reviewedAt: { gt: freezeWindowStart } },
        ],
      },
      select: { id: true, status: true },
    });
    if (existingActive) {
      return NextResponse.json(
        {
          success: false,
          error:
            existingActive.status === "APPROVED"
              ? "Your last wallet change is still in its 24-hour security freeze. Wait for it to clear before submitting another."
              : "You already have a wallet change request in review. Wait for it to be resolved before submitting another.",
        },
        { status: 400 },
      );
    }

    const currentAddress = subaccountName
      ? await fetchAddressForSubaccount(subaccountName)
      : null;

    const created = await prisma.$transaction(async (tx) => {
      const walletChangeRequest = await tx.walletChangeRequest.create({
        data: {
          userId: auth.decoded.userId,
          subaccountName,
          currentAddress,
          requestedAddress: trimmedAddress,
          reason:
            reason && typeof reason === "string" ? reason.trim() || null : null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.WALLET_CHANGE_REQUESTED,
          entityType: "WalletChangeRequest",
          entityId: walletChangeRequest.id,
          userId: auth.decoded.userId,
          description: `Wallet change requested for subaccount ${subaccountName ?? "(unknown)"}: ${currentAddress ?? "(not configured)"} -> ${trimmedAddress}`,
          changes: JSON.stringify({
            subaccountName,
            requestedAddress: { from: currentAddress, to: trimmedAddress },
            verifiedVia,
          }),
        },
      });

      return walletChangeRequest;
    });

    try {
      await sendWalletChangeRequestSubmittedEmail(
        authUser.email,
        trimmedAddress,
      );
    } catch (emailError) {
      console.error(
        "[Wallet Change Requests API] Failed to send submitted email:",
        emailError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Wallet change request submitted",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Wallet Change Requests API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit wallet change request" },
      { status: 500 },
    );
  }
}
