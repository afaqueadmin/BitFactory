/**
 * /api/secondary-login-requests
 *
 * A CLIENT asks for a second sign-in email on their account; an admin
 * approves it (which adds the login exactly like Edit Customer does - see
 * src/lib/auth/addSecondaryLogin.ts) or rejects it with a reason.
 *
 * GET: CLIENT - their own requests. ADMIN/SUPER_ADMIN - every request,
 *   optionally filtered by ?status=.
 *
 * POST { requestedEmail, reason?, currentPassword | twoFactorToken }: CLIENT
 *   only. Requires step-up re-authentication, like a wallet change request -
 *   it gives someone else access to the account. Refused while the account
 *   already has a second sign-in email or a pending request. Whether the
 *   email is used by another account is deliberately not checked here, so a
 *   client can't probe which emails have accounts; the admin sees that when
 *   approving.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import {
  MAX_LOGINS_PER_ACCOUNT,
  MULTI_LOGIN_ROLES,
} from "@/lib/auth/loginIdentity";
import { EMAIL_FORMAT } from "@/lib/auth/addSecondaryLogin";
import { sendSecondaryLoginRequestSubmittedEmail } from "@/lib/email";

export const runtime = "nodejs";

const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

async function requireUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    return { decoded: await verifyJwtToken(token) };
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

    const where: Prisma.SecondaryLoginRequestWhereInput = {
      ...(isAdmin ? {} : { userId: auth.decoded.userId }),
      ...(statusParam && STATUSES.has(statusParam)
        ? { status: statusParam as "PENDING" | "APPROVED" | "REJECTED" }
        : {}),
    };

    const requests = await prisma.secondaryLoginRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error) {
    console.error("[Secondary Login Requests API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sign-in email requests" },
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
    const userId = auth.decoded.userId;

    const account = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { role: true, email: true },
    });
    if (!account || !MULTI_LOGIN_ROLES.has(account.role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only client accounts can have a second sign-in email",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { requestedEmail, reason, currentPassword, twoFactorToken } =
      body as {
        requestedEmail?: string;
        reason?: string;
        currentPassword?: string;
        twoFactorToken?: string;
      };

    if (typeof requestedEmail !== "string" || !requestedEmail.trim()) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }
    const email = canonicalEmail(requestedEmail);
    if (!EMAIL_FORMAT.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }
    if (email === canonicalEmail(account.email)) {
      return NextResponse.json(
        {
          success: false,
          error: "That's already your account's email",
        },
        { status: 400 },
      );
    }
    if (
      reason !== undefined &&
      (typeof reason !== "string" || reason.length > 1000)
    ) {
      return NextResponse.json(
        { success: false, error: "reason must not exceed 1000 characters" },
        { status: 400 },
      );
    }

    const loginCount = await prisma.userLogin.count({ where: { userId } });
    if (loginCount >= MAX_LOGINS_PER_ACCOUNT) {
      return NextResponse.json(
        {
          success: false,
          error: "Your account already has a second sign-in email",
        },
        { status: 400 },
      );
    }
    const pending = await prisma.secondaryLoginRequest.findFirst({
      where: { userId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You already have a sign-in email request in review. Wait for it to be resolved before submitting another.",
        },
        { status: 400 },
      );
    }

    // Decided from the login's own record, never from what the client sends.
    const stepUp = await verifyStepUp(
      auth.decoded,
      { currentPassword, twoFactorToken },
      "request a second sign-in email",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const requester = await prisma.userLogin.findUnique({
      where: { id: auth.decoded.loginId },
      select: { email: true },
    });

    const created = await prisma.$transaction(async (tx) => {
      const secondaryLoginRequest = await tx.secondaryLoginRequest.create({
        data: {
          userId,
          requestedEmail: email,
          reason:
            reason && typeof reason === "string" ? reason.trim() || null : null,
          requestedByEmail: requester?.email ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.SECONDARY_LOGIN_REQUESTED,
          entityType: "SecondaryLoginRequest",
          entityId: secondaryLoginRequest.id,
          userId,
          description: `Second sign-in email ${email} requested for ${account.email}`,
          changes: JSON.stringify({
            requestedEmail: email,
            requestedBy: requester?.email ?? null,
            verifiedVia: stepUp.method,
          }),
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });

      return secondaryLoginRequest;
    });

    try {
      await sendSecondaryLoginRequestSubmittedEmail(account.email, email);
    } catch (emailError) {
      console.error(
        "[Secondary Login Requests API] Failed to send submitted email:",
        emailError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Sign-in email request submitted",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Secondary Login Requests API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit sign-in email request" },
      { status: 500 },
    );
  }
}
