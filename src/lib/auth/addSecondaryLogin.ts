import { staffActorLabel } from "@/lib/auth/staffRoles";
import { randomBytes } from "node:crypto";
import { AuditAction } from "@prisma/client";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import { signPasswordResetToken } from "@/lib/jwt";
import {
  canonicalEmail,
  findDeletedHolder,
  isEmailTaken,
  isEmailUniqueViolation,
  releaseEmailFromDeletedAccount,
} from "@/lib/auth/emailIdentity";
import {
  MAX_LOGINS_PER_ACCOUNT,
  MULTI_LOGIN_ROLES,
} from "@/lib/auth/loginIdentity";
import { passwordFingerprint, resetLinkUrl } from "@/lib/auth/passwordReset";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import { sendLoginInviteEmail } from "@/lib/email";

/**
 * Adding a second sign-in email (UserLogin) to a CLIENT account - one path
 * for both ways it happens: an admin adding it from Edit Customer
 * (POST /api/user/[id]/logins) and an admin approving the client's own
 * request (POST /api/secondary-login-requests/[id]/approve).
 *
 * The new login has no usable password; it gets an emailed link to choose
 * one, and if that email can't be sent the login is removed again. Node
 * runtime only.
 */

const INVITE_VALID_HOURS = 24;
export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a secondary login a link to choose its password. */
export async function sendLoginInvite(
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

export type AddSecondaryLoginResult =
  | { ok: true; login: { id: string; email: string }; message: string }
  | {
      ok: false;
      status: number;
      error: string;
      code?: "HELD_BY_DELETED_ACCOUNT";
      deletedAccountName?: string;
    };

export async function addSecondaryLogin({
  accountId,
  email: rawEmail,
  actor,
  releaseFromDeleted,
  headers,
  meta,
  auditNote,
}: {
  accountId: string;
  email: unknown;
  actor: { id: string; role: string; email: string };
  /** The admin confirmed taking the email from a deleted account. */
  releaseFromDeleted: boolean;
  headers: Headers;
  meta: { ipAddress: string; userAgent: string };
  /** Appended to the audit description, e.g. "(client request)". */
  auditNote?: string;
}): Promise<AddSecondaryLoginResult> {
  const account = await prisma.user.findFirst({
    where: { id: accountId, isDeleted: false },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!account) {
    return { ok: false, status: 404, error: "User not found" };
  }
  if (!MULTI_LOGIN_ROLES.has(account.role)) {
    return {
      ok: false,
      status: 400,
      error: "Only client accounts can have a second sign-in email",
    };
  }

  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    return { ok: false, status: 400, error: "Email is required" };
  }
  const email = canonicalEmail(rawEmail);
  if (!EMAIL_FORMAT.test(email)) {
    return { ok: false, status: 400, error: "Invalid email format" };
  }

  const loginCount = await prisma.userLogin.count({
    where: { userId: accountId },
  });
  if (loginCount >= MAX_LOGINS_PER_ACCOUNT) {
    return {
      ok: false,
      status: 400,
      error:
        "This account already has a second sign-in email. Remove it first to add another.",
    };
  }

  // An email a deleted account still holds can be taken over here (and only
  // here), once the admin has confirmed it.
  const deletedHolder = await findDeletedHolder(email);
  if (deletedHolder && !releaseFromDeleted) {
    const holderName = deletedHolder.name || "without a name";
    return {
      ok: false,
      status: 409,
      code: "HELD_BY_DELETED_ACCOUNT",
      deletedAccountName: holderName,
      error: `This email belongs to deleted account ${holderName}.`,
    };
  }
  if (!deletedHolder && (await isEmailTaken(email))) {
    return { ok: false, status: 409, error: "Email is already in use" };
  }

  // No usable password until the invitee chooses one from the emailed link:
  // a hash of random bytes nobody ever sees.
  const placeholderPassword = await hash(randomBytes(32).toString("hex"), 12);

  let login;
  try {
    // If the invite below fails only the new login is removed again - the
    // deleted account doesn't get its email back.
    login = await prisma.$transaction(async (tx) => {
      if (deletedHolder) {
        await releaseEmailFromDeletedAccount(tx, deletedHolder, email, {
          actorId: actor.id,
          toUserId: accountId,
        });
      }
      return tx.userLogin.create({
        data: {
          userId: accountId,
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
      return { ok: false, status: 409, error: "Email is already in use" };
    }
    throw error;
  }

  // The invite is the only way in, so a login whose invite couldn't be sent
  // is removed again rather than left unusable.
  const sent = await sendLoginInvite(login, account);
  if (!sent.success) {
    await prisma.userLogin.delete({ where: { id: login.id } });
    return {
      ok: false,
      status: 502,
      error:
        "Could not email the new address, so it was not added. Please try again.",
    };
  }

  await prisma.auditLog.create({
    data: {
      action: AuditAction.USER_LOGIN_ADDED,
      entityType: "User",
      entityId: accountId,
      userId: actor.id,
      changes: { loginId: login.id, email },
      description: `Sign-in email ${email} added to ${account.email} by ${staffActorLabel(
        actor.role,
      )} ${actor.email}${auditNote ? ` ${auditNote}` : ""}`,
      ...meta,
    },
  });

  // The account owner hears about it.
  await notifySecurityChange(
    account.email,
    { type: "LOGIN_ADDED", email },
    headers,
  );

  return {
    ok: true,
    login: { id: login.id, email },
    message: `${email} was added. A link to choose a password was sent to it.`,
  };
}
