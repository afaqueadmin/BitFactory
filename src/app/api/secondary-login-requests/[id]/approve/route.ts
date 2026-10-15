/**
 * POST /api/secondary-login-requests/[id]/approve   { releaseFromDeleted? }
 *
 * Approves a client's request for a second sign-in email in one step: the
 * login is added exactly like an admin adding it from Edit Customer
 * (addSecondaryLogin) - it's emailed a link to choose its password, and the
 * account's primary email gets a security alert. Same roles as adding it
 * there (LOGIN_MANAGER_ROLES).
 *
 * The row is claimed PENDING -> APPROVED first (status-guarded updateMany),
 * so two approvals can't both add the login; if adding fails (email in use,
 * invite not sent, a deleted account holds it and that wasn't confirmed) the
 * request goes back to PENDING and the error is returned as-is - including
 * 409 HELD_BY_DELETED_ACCOUNT, which the admin can confirm and resend with
 * releaseFromDeleted: true.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { LOGIN_MANAGER_ROLES } from "@/lib/auth/loginIdentity";
import { addSecondaryLogin } from "@/lib/auth/addSecondaryLogin";

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
      select: { id: true, role: true, email: true },
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

    const secondaryLoginRequest = await prisma.secondaryLoginRequest.findUnique(
      { where: { id } },
    );
    if (!secondaryLoginRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    const now = new Date();
    const claim = await prisma.secondaryLoginRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: now },
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

    let result;
    try {
      result = await addSecondaryLogin({
        accountId: secondaryLoginRequest.userId,
        email: secondaryLoginRequest.requestedEmail,
        actor,
        releaseFromDeleted: body.releaseFromDeleted === true,
        headers: request.headers,
        meta: {
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
        auditNote: "(approved client request)",
      });
    } catch (error) {
      result = null;
      console.error("[Secondary Login Requests API] add login error:", error);
    }

    if (!result || !result.ok) {
      // Not added - the request stays open for another try or a rejection.
      await prisma.secondaryLoginRequest.update({
        where: { id },
        data: { status: "PENDING", reviewedById: null, reviewedAt: null },
      });
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Failed to add the sign-in email" },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
          deletedAccountName: result.deletedAccountName,
        },
        { status: result.status },
      );
    }

    const updated = await prisma.secondaryLoginRequest.update({
      where: { id },
      data: { createdLoginId: result.login.id },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: result.message,
    });
  } catch (error) {
    console.error("[Secondary Login Requests API] approve error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve sign-in email request" },
      { status: 500 },
    );
  }
}
