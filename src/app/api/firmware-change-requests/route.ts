/**
 * /api/firmware-change-requests
 *
 * GET: list firmware change requests visible to the caller.
 *   - CLIENT/FRANCHISEE: only requests they submitted, with the admin-only
 *     review trail (confirmedById/confirmedAt/confirmationMethod/
 *     confirmationContact/confirmationNote/confirmedBy) stripped, same as
 *     /api/wallet/frequency-change-requests.
 *   - ADMIN/SUPER_ADMIN/ACCOUNTING: every request, optionally filtered by
 *     ?status=, including the full review trail.
 *
 * POST: submit a new firmware change request for one of the caller's own
 * miners. CLIENT/FRANCHISEE only. Requires step-up re-authentication (current
 * password, or a 2FA code/backup code for users with 2FA enabled - decided
 * server-side from the user's own record), matching the wallet and payment
 * frequency request flows. Body: minerId, requestedFirmwareId (an active
 * FirmwareOption), optional reason.
 *
 * Only Luxor miners that are live (not DEPLOYMENT_IN_PROGRESS or
 * UNDER_MAINTENANCE) qualify - Braiins doesn't report per-worker firmware.
 * Snapshots the miner's live Luxor firmware into currentFirmware (null if
 * Luxor can't be reached or the worker isn't found - that shouldn't block a
 * client from submitting). There's no "already on that firmware" check:
 * Luxor's firmware string is free text that can't be reliably matched to an
 * option name. Only one request in flight (PENDING or CONFIRMED) per miner.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { getLiveMinerTelemetry } from "@/lib/ticketTelemetry";
import { sendFirmwareChangeRequestSubmittedEmail } from "@/lib/email";

const STATUSES = new Set(["PENDING", "CONFIRMED", "APPROVED", "REJECTED"]);
const NOT_LIVE_STATUSES = new Set([
  "DEPLOYMENT_IN_PROGRESS",
  "UNDER_MAINTENANCE",
]);

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
    const isAdmin = isStaffRole(auth.decoded.role);

    const where: Prisma.FirmwareChangeRequestWhereInput = {
      ...(isAdmin ? {} : { userId: auth.decoded.userId }),
      ...(statusParam && STATUSES.has(statusParam)
        ? {
            status: statusParam as
              "PENDING" | "CONFIRMED" | "APPROVED" | "REJECTED",
          }
        : {}),
    };

    const requests = await prisma.firmwareChangeRequest.findMany({
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
          minerId: req.minerId,
          minerName: req.minerName,
          subaccountName: req.subaccountName,
          currentFirmware: req.currentFirmware,
          requestedFirmwareId: req.requestedFirmwareId,
          requestedFirmwareName: req.requestedFirmwareName,
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
    console.error("[Firmware Change Requests API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch firmware change requests" },
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

    if (
      auth.decoded.role !== "CLIENT" &&
      auth.decoded.role !== "FRANCHISEE" &&
      auth.decoded.role !== "GUILDMASTER"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Only clients or franchisees can request a firmware change",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      minerId,
      requestedFirmwareId,
      reason,
      currentPassword,
      twoFactorToken,
    } = body as {
      minerId?: string;
      requestedFirmwareId?: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    };

    if (!minerId || typeof minerId !== "string") {
      return NextResponse.json(
        { success: false, error: "minerId is required" },
        { status: 400 },
      );
    }
    if (!requestedFirmwareId || typeof requestedFirmwareId !== "string") {
      return NextResponse.json(
        { success: false, error: "Choose the firmware you want" },
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

    const option = await prisma.firmwareOption.findUnique({
      where: { id: requestedFirmwareId },
      select: { id: true, name: true, isActive: true },
    });
    if (!option || !option.isActive) {
      return NextResponse.json(
        { success: false, error: "That firmware option isn't available" },
        { status: 400 },
      );
    }

    // The miner must be the caller's own - never trust the submitted id.
    const miner = await prisma.miner.findFirst({
      where: { id: minerId, userId: auth.decoded.userId, isDeleted: false },
      select: {
        id: true,
        name: true,
        status: true,
        pool: { select: { name: true } },
      },
    });
    if (!miner) {
      return NextResponse.json(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }
    if (miner.pool?.name !== "Luxor") {
      return NextResponse.json(
        {
          success: false,
          error: "Firmware changes can only be requested for Luxor miners",
        },
        { status: 400 },
      );
    }
    if (NOT_LIVE_STATUSES.has(miner.status)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Firmware changes can't be requested while a miner is being deployed or is under maintenance",
        },
        { status: 400 },
      );
    }

    // ── Step-up re-authentication ──────────────────────────────────────
    // Which method is required is decided from the user's own record, never
    // from what the client claims.
    const stepUp = await verifyStepUp(
      auth.decoded,
      { currentPassword, twoFactorToken },
      "request a firmware change",
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
    // Which of the account's sign-in emails is asking (it can have a second).
    const requester = await prisma.userLogin.findUnique({
      where: { id: auth.decoded.loginId },
      select: { email: true, isPrimary: true },
    });
    const requestedBySecondary = requester ? !requester.isPrimary : false;

    const existingActive = await prisma.firmwareChangeRequest.findFirst({
      where: { minerId: miner.id, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { id: true },
    });
    if (existingActive) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You already have a firmware change in review for this miner. Wait for it to be resolved before submitting another.",
        },
        { status: 400 },
      );
    }

    // Best-effort - never throws, null if Luxor is down or the worker isn't
    // found on any of the owner's subaccounts.
    const telemetry = await getLiveMinerTelemetry(miner.id);
    const luxor = telemetry?.poolName === "Luxor" ? telemetry : null;
    const currentFirmware = luxor?.firmware ?? null;
    const subaccountName = luxor?.subaccountName ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const changeRequest = await tx.firmwareChangeRequest.create({
        data: {
          userId: auth.decoded.userId,
          minerId: miner.id,
          minerName: miner.name,
          subaccountName,
          requestedByEmail: requester?.email ?? null,
          requestedBySecondary,
          currentFirmware,
          requestedFirmwareId: option.id,
          requestedFirmwareName: option.name,
          reason:
            reason && typeof reason === "string" ? reason.trim() || null : null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.FIRMWARE_CHANGE_REQUESTED,
          entityType: "FirmwareChangeRequest",
          entityId: changeRequest.id,
          userId: auth.decoded.userId,
          description: `Firmware change requested for miner ${miner.name}${subaccountName ? ` (subaccount ${subaccountName})` : ""}: ${currentFirmware ?? "(unknown)"} -> ${option.name}`,
          changes: JSON.stringify({
            minerId: miner.id,
            minerName: miner.name,
            subaccountName,
            firmware: { from: currentFirmware, to: option.name },
            requestedFirmwareId: option.id,
            verifiedVia,
            requestedBy: requester?.email ?? null,
            requestedBySecondary,
          }),
        },
      });

      return changeRequest;
    });

    try {
      await sendFirmwareChangeRequestSubmittedEmail(
        authUser.email,
        miner.name,
        option.name,
      );
      // A second sign-in email that submitted it hears about it too.
      if (
        requestedBySecondary &&
        requester &&
        requester.email !== authUser.email
      ) {
        await sendFirmwareChangeRequestSubmittedEmail(
          requester.email,
          miner.name,
          option.name,
        );
      }
    } catch (emailError) {
      console.error(
        "[Firmware Change Requests API] Failed to send submitted email:",
        emailError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Firmware change request submitted",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Firmware Change Requests API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit firmware change request" },
      { status: 500 },
    );
  }
}
