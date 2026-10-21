/**
 * POST /api/firmware-change-requests/[id]/approve
 *
 * Final step of admin review - only available once the request is CONFIRMED
 * (see .../confirm). Marks the request APPROVED. Requires the admin's own
 * step-up re-authentication (password or 2FA), same as confirm.
 *
 * Deliberately does NOT change anything on the miner: the admin flashes the
 * firmware manually, outside this app.
 *
 * The row is claimed via a status-guarded updateMany, so two concurrent
 * approve calls on the same request can't both succeed.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { sendFirmwareChangeRequestApprovedEmail } from "@/lib/email";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (!isStaffRole(decoded.role)) {
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

    const changeRequest = await prisma.firmwareChangeRequest.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
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
      "approve a firmware change request",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const now = new Date();
    const claim = await prisma.firmwareChangeRequest.updateMany({
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

    const previousFirmware = changeRequest.currentFirmware ?? "(unknown)";

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FIRMWARE_CHANGE_APPROVED,
        entityType: "FirmwareChangeRequest",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Firmware change approved for miner ${changeRequest.minerName}${changeRequest.subaccountName ? ` (subaccount ${changeRequest.subaccountName})` : ""}: ${previousFirmware} -> ${changeRequest.requestedFirmwareName}. Admin must change the firmware on the miner manually.`,
        changes: JSON.stringify({
          minerId: changeRequest.minerId,
          minerName: changeRequest.minerName,
          subaccountName: changeRequest.subaccountName,
          firmware: {
            from: changeRequest.currentFirmware,
            to: changeRequest.requestedFirmwareName,
          },
        }),
      },
    });

    try {
      await sendFirmwareChangeRequestApprovedEmail(
        changeRequest.user.email,
        changeRequest.minerName,
        previousFirmware,
        changeRequest.requestedFirmwareName,
      );
    } catch (emailError) {
      console.error(
        "[Firmware Change Requests API] Failed to send approved email:",
        emailError,
      );
    }

    const updated = await prisma.firmwareChangeRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Firmware change approved",
    });
  } catch (error) {
    console.error("[Firmware Change Requests API] approve error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve firmware change request" },
      { status: 500 },
    );
  }
}
