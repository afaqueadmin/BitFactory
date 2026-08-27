/**
 * /api/wallet/change-requests
 *
 * GET: list wallet change requests visible to the caller.
 *   - CLIENT/FRANCHISEE: only requests they submitted (their own account -
 *     the wallet page never lets them view/request for someone else).
 *   - ADMIN/SUPER_ADMIN: every request, optionally filtered by ?status=.
 *
 * POST: submit a new wallet change request. CLIENT/FRANCHISEE only. Snapshots
 * the user's live primary Luxor address into currentAddress at submission
 * time, so the request row is itself a permanent before/after record. Only
 * one PENDING request per user at a time.
 *
 * Braiins is out of scope - see src/lib/wallet.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { fetchCurrentPrimaryAddress } from "@/lib/wallet";

const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

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
        ? { status: statusParam as "PENDING" | "APPROVED" | "REJECTED" }
        : {}),
    };

    const requests = await prisma.walletChangeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: requests });
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
    const { requestedAddress, reason } = body as {
      requestedAddress?: string;
      reason?: string;
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
    if (trimmedAddress.length < 26 || trimmedAddress.length > 70) {
      return NextResponse.json(
        {
          success: false,
          error: "requestedAddress must be between 26 and 70 characters",
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

    const existingPending = await prisma.walletChangeRequest.findFirst({
      where: { userId: auth.decoded.userId, status: "PENDING" },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You already have a pending wallet change request. Wait for it to be reviewed before submitting another.",
        },
        { status: 400 },
      );
    }

    const currentAddress = await fetchCurrentPrimaryAddress(
      auth.decoded.userId,
    );

    const created = await prisma.$transaction(async (tx) => {
      const walletChangeRequest = await tx.walletChangeRequest.create({
        data: {
          userId: auth.decoded.userId,
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
          description: `Wallet change requested: ${currentAddress ?? "(not configured)"} -> ${trimmedAddress}`,
          changes: JSON.stringify({
            requestedAddress: { from: currentAddress, to: trimmedAddress },
          }),
        },
      });

      return walletChangeRequest;
    });

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
