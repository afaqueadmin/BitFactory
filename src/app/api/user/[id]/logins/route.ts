/**
 * /api/user/[id]/logins - the sign-in emails (UserLogin) of one account.
 *
 *   GET                       list them (any admin)
 *   POST   { email }          add a secondary login and email it a link to
 *                             choose its password. An email a deleted
 *                             account holds gets a 409 HELD_BY_DELETED_ACCOUNT;
 *                             resent with releaseFromDeleted: true it is taken
 *                             from that account.
 *   PATCH  { loginId }        send a secondary login a fresh set-password link
 *   DELETE ?loginId=...       remove a secondary login
 *
 * A CLIENT account can have one secondary login, for a second person (an
 * accountant, a partner): same account and access, its own password, 2FA and
 * passkeys. Clients can't add one themselves - like changing an account's
 * email (N-6), nothing would prove the new address is theirs - so only an
 * admin can (LOGIN_MANAGER_ROLES), here or by approving the client's request
 * (/api/secondary-login-requests). The primary login can't be removed here;
 * its email is changed with the account's email (PUT /api/user/[id]).
 */
import { staffActorName } from "@/lib/auth/staffActorName";
import { authorizeStaff } from "@/lib/auth/authorization";
import type { Permission } from "@/lib/auth/permissions";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MAX_LOGINS_PER_ACCOUNT,
  MULTI_LOGIN_ROLES,
} from "@/lib/auth/loginIdentity";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import {
  addSecondaryLogin,
  sendLoginInvite,
} from "@/lib/auth/addSecondaryLogin";

export const runtime = "nodejs";

type Actor = {
  id: string;
  role: string;
  email: string;
  permissions: ReadonlySet<Permission>;
};

/** The signed-in staff member, with the role read from the database. */
async function getActor(
  request: NextRequest,
  permission: Permission,
): Promise<Actor | NextResponse> {
  const auth = await authorizeStaff(request, [permission]);
  if ("response" in auth) return auth.response;
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: auth.userId },
    select: { id: true, role: true, email: true },
  });
  return { ...actor, permissions: auth.permissions };
}

function requestMeta(request: NextRequest) {
  return {
    ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await getActor(request, "customers.view");
    if (actor instanceof NextResponse) return actor;

    const account = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!account) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const logins = await prisma.userLogin.findMany({
      where: { userId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        isPrimary: true,
        createdAt: true,
        lastLoginAt: true,
        twoFactorAuth: { select: { enabled: true } },
        _count: { select: { webauthnCredentials: true } },
      },
    });

    return NextResponse.json({
      logins: logins.map((login) => ({
        id: login.id,
        email: login.email,
        isPrimary: login.isPrimary,
        createdAt: login.createdAt,
        lastLoginAt: login.lastLoginAt,
        twoFactorEnabled: login.twoFactorAuth?.enabled ?? false,
        passkeyCount: login._count.webauthnCredentials,
      })),
      // What the signed-in admin may do here, so the UI can match it.
      canManage:
        actor.permissions.has("customers.manage_signin_emails") &&
        MULTI_LOGIN_ROLES.has(account.role),
      maxLogins: MAX_LOGINS_PER_ACCOUNT,
    });
  } catch (error) {
    console.error("List logins error:", error);
    return NextResponse.json(
      { error: "Failed to load sign-in emails" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await getActor(request, "customers.manage_signin_emails");
    if (actor instanceof NextResponse) return actor;

    const body = await request.json().catch(() => ({}));
    const result = await addSecondaryLogin({
      accountId: id,
      email: body.email,
      actor,
      releaseFromDeleted: body.releaseFromDeleted === true,
      headers: request.headers,
      meta: requestMeta(request),
    });
    if (!result.ok) {
      const { status, error, code, deletedAccountName } = result;
      return NextResponse.json({ error, code, deletedAccountName }, { status });
    }
    return NextResponse.json(
      { message: result.message, login: result.login },
      { status: 201 },
    );
  } catch (error) {
    console.error("Add login error:", error);
    return NextResponse.json(
      { error: "Failed to add the sign-in email" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await getActor(request, "customers.manage_signin_emails");
    if (actor instanceof NextResponse) return actor;

    const body = await request.json().catch(() => ({}));
    if (typeof body.loginId !== "string" || !body.loginId) {
      return NextResponse.json(
        { error: "loginId is required" },
        { status: 400 },
      );
    }

    const login = await prisma.userLogin.findFirst({
      where: {
        id: body.loginId,
        userId: id,
        isPrimary: false,
        user: { isDeleted: false },
      },
      select: {
        id: true,
        email: true,
        password: true,
        user: { select: { id: true, role: true, name: true, email: true } },
      },
    });
    if (!login) {
      return NextResponse.json({ error: "Login not found" }, { status: 404 });
    }

    const sent = await sendLoginInvite(login, login.user);
    if (!sent.success) {
      return NextResponse.json(
        { error: "Could not send the email. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: `A new link to choose a password was sent to ${login.email}.`,
    });
  } catch (error) {
    console.error("Resend login invite error:", error);
    return NextResponse.json(
      { error: "Failed to send the link" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await getActor(request, "customers.manage_signin_emails");
    if (actor instanceof NextResponse) return actor;

    const loginId = new URL(request.url).searchParams.get("loginId");
    if (!loginId) {
      return NextResponse.json(
        { error: "loginId is required" },
        { status: 400 },
      );
    }

    const login = await prisma.userLogin.findFirst({
      where: { id: loginId, userId: id },
      select: {
        id: true,
        email: true,
        isPrimary: true,
        user: { select: { email: true } },
      },
    });
    if (!login) {
      return NextResponse.json({ error: "Login not found" }, { status: 404 });
    }
    if (login.isPrimary) {
      return NextResponse.json(
        { error: "The account's primary email can't be removed" },
        { status: 400 },
      );
    }

    const meta = requestMeta(request);
    // Its 2FA and passkeys go with it (cascade), and its sessions stop
    // working at once: a token whose login no longer exists is rejected.
    await prisma.$transaction([
      prisma.userSession.updateMany({
        where: { loginId, logoutAt: null },
        data: { logoutAt: new Date() },
      }),
      prisma.userLogin.delete({ where: { id: loginId } }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.USER_LOGIN_REMOVED,
          entityType: "User",
          entityId: id,
          userId: actor.id,
          changes: { loginId, email: login.email },
          description: `Sign-in email ${login.email} removed from ${login.user.email} by ${await staffActorName(actor)} ${actor.email}`,
          ...meta,
        },
      }),
    ]);

    // Both people hear about it.
    for (const to of [login.user.email, login.email]) {
      await notifySecurityChange(
        to,
        { type: "LOGIN_REMOVED", email: login.email },
        request.headers,
      );
    }

    return NextResponse.json({
      message: `${login.email} can no longer sign in to this account.`,
    });
  } catch (error) {
    console.error("Remove login error:", error);
    return NextResponse.json(
      { error: "Failed to remove the sign-in email" },
      { status: 500 },
    );
  }
}
