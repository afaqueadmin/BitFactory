/**
 * POST /api/secondary-login-requests/[id]/reject   { rejectionReason }
 *
 * Rejects a pending request for a second sign-in email. The reason is shown
 * to the client and emailed to the account's primary email. Same roles as
 * approving (LOGIN_MANAGER_ROLES).
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { LOGIN_MANAGER_ROLES } from "@/lib/auth/loginIdentity";
import { sendSecondaryLoginRequestRejectedEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    let actorId: string;
    try {
      actorId = (await verifyJwtToken(token)).userId;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }
    // Role from the database, not the token.
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isDeleted: false },
      select: { id: true, role: true },
    });
    if (!actor || !LOGIN_MANAGER_ROLES.has(actor.role)) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have permission to manage sign-in emails",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const rejectionReason =
      typeof body.rejectionReason === "string"
        ? body.rejectionReason.trim()
        : "";
    if (!rejectionReason) {
      return NextResponse.json(
        { success: false, error: "A rejection reason is required" },
        { status: 400 },
      );
    }
    if (rejectionReason.length > 1000) {
      return NextResponse.json(
        {
          success: false,
          error: "rejectionReason must not exceed 1000 characters",
        },
        { status: 400 },
      );
    }

    const secondaryLoginRequest = await prisma.secondaryLoginRequest.findUnique(
      {
        where: { id },
        include: { user: { select: { email: true } } },
      },
    );
    if (!secondaryLoginRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    const claim = await prisma.secondaryLoginRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${secondaryLoginRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.SECONDARY_LOGIN_REQUEST_REJECTED,
        entityType: "SecondaryLoginRequest",
        entityId: id,
        userId: actor.id,
        description: `Second sign-in email ${secondaryLoginRequest.requestedEmail} for ${secondaryLoginRequest.user.email} rejected`,
        changes: JSON.stringify({
          requestedEmail: secondaryLoginRequest.requestedEmail,
          rejectionReason,
        }),
      },
    });

    try {
      await sendSecondaryLoginRequestRejectedEmail(
        secondaryLoginRequest.user.email,
        secondaryLoginRequest.requestedEmail,
        rejectionReason,
      );
    } catch (emailError) {
      console.error(
        "[Secondary Login Requests API] Failed to send rejected email:",
        emailError,
      );
    }

    const updated = await prisma.secondaryLoginRequest.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Request rejected",
    });
  } catch (error) {
    console.error("[Secondary Login Requests API] reject error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reject sign-in email request" },
      { status: 500 },
    );
  }
}
