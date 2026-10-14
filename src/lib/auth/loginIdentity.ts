import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/auth/emailIdentity";

/**
 * Logins (UserLogin): the emails an account can be signed into with, each
 * with its own password, 2FA and passkeys. Every account has one primary
 * login, whose email is also User.email. A CLIENT account may have one more,
 * a secondary login added by an admin for a second person (an accountant, a
 * partner) - same account, same access, separate credentials.
 *
 * Credential checks (password, 2FA, passkeys, step-up) are per login; data
 * access stays per account (userId). Node runtime only.
 */

export const MAX_LOGINS_PER_ACCOUNT = 2;

/** Roles whose accounts may have a secondary login. */
export const MULTI_LOGIN_ROLES: ReadonlySet<string> = new Set(["CLIENT"]);

/**
 * Who may add or remove a secondary login.
 * TODO: ADMIN is allowed only while multi-login is being tested - restrict
 * to SUPER_ADMIN (like changing an account's email, N-6) once that's done.
 */
export const LOGIN_MANAGER_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
]);

/**
 * A secondary login only signs in while its account is a CLIENT one - if
 * the account's role changes, the secondary stops working until it's
 * changed back (or the login is removed).
 */
const USABLE_LOGIN = {
  user: { isDeleted: false },
  OR: [{ isPrimary: true }, { user: { role: "CLIENT" as const } }],
};

/**
 * The login an email signs into, with what sign-in needs, or null if the
 * email has no usable login (unknown, account deleted, or a secondary login
 * on an account that isn't a CLIENT). Same email rule as everywhere (M-4):
 * exact match on the canonical form.
 */
export function findLoginByEmail(email: string) {
  return prisma.userLogin.findFirst({
    where: { email: canonicalEmail(email), ...USABLE_LOGIN },
    select: LOGIN_FOR_SIGN_IN,
  });
}

/** Same as findLoginByEmail, by login id (from a token). */
export function findLoginById(loginId: string) {
  return prisma.userLogin.findFirst({
    where: { id: loginId, ...USABLE_LOGIN },
    select: LOGIN_FOR_SIGN_IN,
  });
}

const LOGIN_FOR_SIGN_IN = {
  id: true,
  userId: true,
  email: true,
  password: true,
  isPrimary: true,
  twoFactorAuth: {
    select: { enabled: true, secret: true, backupCodes: true },
  },
  user: { select: { id: true, email: true, name: true, role: true } },
} as const;

/**
 * Bookkeeping for a completed sign-in: the activity row (which login, so the
 * activity log can tell two people on one account apart), a session row and
 * the login's lastLoginAt. Never fails the sign-in; returns the session id,
 * or null if it couldn't be created.
 */
export async function recordLogin(
  loginId: string,
  userId: string,
  type: string,
  { ipAddress, userAgent }: { ipAddress: string; userAgent: string },
): Promise<string | null> {
  try {
    await prisma.$transaction([
      prisma.userActivity.create({
        data: { userId, loginId, type, ipAddress, userAgent },
      }),
      prisma.userLogin.update({
        where: { id: loginId },
        data: { lastLoginAt: new Date() },
      }),
    ]);
  } catch (e) {
    console.error("Failed to log login activity:", e);
  }
  try {
    const session = await prisma.userSession.create({
      data: { userId, loginId, ipAddress, userAgent },
    });
    return session.id;
  } catch (e) {
    console.error("Failed to create user session:", e);
    return null;
  }
}

/** The account's primary login id, or null if the account has none. */
export async function primaryLoginId(userId: string): Promise<string | null> {
  const login = await prisma.userLogin.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true },
  });
  return login?.id ?? null;
}

/**
 * Emails of the account's secondary logins - CC'd on billing emails, which
 * go to the primary (User.email). Empty unless the account is a CLIENT one,
 * the only kind that can have a secondary that signs in.
 */
export async function secondaryLoginEmails(userId: string): Promise<string[]> {
  const logins = await prisma.userLogin.findMany({
    where: { userId, isPrimary: false, user: { role: "CLIENT" } },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  return logins.map((login) => login.email);
}
