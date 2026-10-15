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
 * admin can (LOGIN_MANAGER_ROLES). The primary login can't be removed here;
 * its email is changed with the account's email (PUT /api/user/[id]).
 */
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import { signPasswordResetToken, verifyJwtToken } from "@/lib/jwt";
import {
  canonicalEmail,
  findDeletedHolder,
  isEmailTaken,
  isEmailUniqueViolation,
  releaseEmailFromDeletedAccount,
} from "@/lib/auth/emailIdentity";
import {
  LOGIN_MANAGER_ROLES,
  MAX_LOGINS_PER_ACCOUNT,
  MULTI_LOGIN_ROLES,
} from "@/lib/auth/loginIdentity";
import { passwordFingerprint, resetLinkUrl } from "@/lib/auth/passwordReset";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import { sendLoginInviteEmail } from "@/lib/email";

export const runtime = "nodejs";

const INVITE_VALID_HOURS = 24;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Actor = { id: string; role: string; email: string };

/** The signed-in admin, with the role read from the database. */
async function getActor(
  request: NextRequest,
  allowedRoles: ReadonlySet<string>,
): Promise<Actor | NextResponse> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let actorId: string;
  try {
    actorId = (await verifyJwtToken(token)).userId;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const actor = await prisma.user.findFirst({
    where: { id: actorId, isDeleted: false },
    select: { id: true, role: true, email: true },
  });
  if (!actor || !allowedRoles.has(actor.role)) {
    return NextResponse.json(
      { error: "You do not have permission to manage sign-in emails" },
      { status: 403 },
    );
  }
  return actor;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(["ADMIN", "SUPER_ADMIN"]);

function requestMeta(request: NextRequest) {
  return {
    ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  };
}

/** Emails a secondary login a link to choose its password. */
async function sendInvite(
  login: { id: string; email: string; password: string },
  account: { id: string; role: string; name: string | null; email: string },
) {
  const token = await signPasswordResetToken(
    { userId: account.id, loginId: login.id, role: account.role },
    passwordFingerprint(login.password),
    "24h",
  );
  return sendLoginInviteEmail(login.email, {
    setPasswordUrl: resetLinkUrl(token),
    validHours: INVITE_VALID_HOURS,
    accountName: account.name || account.email,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await getActor(request, ADMIN_ROLES);
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
        LOGIN_MANAGER_ROLES.has(actor.role) &&
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
    const actor = await getActor(request, LOGIN_MANAGER_ROLES);
    if (actor instanceof NextResponse) return actor;

    const account = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, role: true, name: true, email: true },
    });
    if (!account) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!MULTI_LOGIN_ROLES.has(account.role)) {
      return NextResponse.json(
        { error: "Only client accounts can have a second sign-in email" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const email = canonicalEmail(body.email);
    if (!EMAIL_FORMAT.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    const loginCount = await prisma.userLogin.count({ where: { userId: id } });
    if (loginCount >= MAX_LOGINS_PER_ACCOUNT) {
      return NextResponse.json(
        {
          error:
            "This account already has a second sign-in email. Remove it first to add another.",
        },
        { status: 400 },
      );
    }

    // An email a deleted account still holds can be taken over here (and
    // only here), once the admin has confirmed it.
    const deletedHolder = await findDeletedHolder(email);
    if (deletedHolder && body.releaseFromDeleted !== true) {
      const holderName = deletedHolder.name || "without a name";
      return NextResponse.json(
        {
          code: "HELD_BY_DELETED_ACCOUNT",
          deletedAccountName: holderName,
          error: `This email belongs to deleted account ${holderName}.`,
        },
        { status: 409 },
      );
    }
    if (!deletedHolder && (await isEmailTaken(email))) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 409 },
      );
    }

    // No usable password until the invitee chooses one from the emailed
    // link: a hash of random bytes nobody ever sees.
    const placeholderPassword = await hash(randomBytes(32).toString("hex"), 12);

    let login;
    try {
      // If the invite below fails only the new login is removed again - the
      // deleted account doesn't get its email back.
      login = await prisma.$transaction(async (tx) => {
        if (deletedHolder) {
          await releaseEmailFromDeletedAccount(tx, deletedHolder, email, {
            actorId: actor.id,
            toUserId: id,
          });
        }
        return tx.userLogin.create({
          data: {
            userId: id,
            email,
            password: placeholderPassword,
            isPrimary: false,
            createdById: actor.id,
          },
          select: { id: true, email: true, password: true },
        });
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) {
        return NextResponse.json(
          { error: "Email is already in use" },
          { status: 409 },
        );
      }
      throw error;
    }

    // The invite is the only way in, so a login whose invite couldn't be
    // sent is removed again rather than left unusable.
    const sent = await sendInvite(login, account);
    if (!sent.success) {
      await prisma.userLogin.delete({ where: { id: login.id } });
      return NextResponse.json(
        {
          error:
            "Could not email the new address, so it was not added. Please try again.",
        },
        { status: 502 },
      );
    }

    const meta = requestMeta(request);
    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_LOGIN_ADDED,
        entityType: "User",
        entityId: id,
        userId: actor.id,
        changes: { loginId: login.id, email },
        description: `Sign-in email ${email} added to ${account.email} by ${
          actor.role === "SUPER_ADMIN" ? "super admin" : "admin"
        } ${actor.email}`,
        ...meta,
      },
    });

    // The account owner hears about it.
    await notifySecurityChange(
      account.email,
      { type: "LOGIN_ADDED", email },
      request.headers,
    );

    return NextResponse.json(
      {
        message: `${email} was added. A link to choose a password was sent to it.`,
        login: { id: login.id, email },
      },
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
    const actor = await getActor(request, LOGIN_MANAGER_ROLES);
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

    const sent = await sendInvite(login, login.user);
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
    const actor = await getActor(request, LOGIN_MANAGER_ROLES);
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
          description: `Sign-in email ${login.email} removed from ${login.user.email} by ${
            actor.role === "SUPER_ADMIN" ? "super admin" : "admin"
          } ${actor.email}`,
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
