/**
 * Signing an account, or one login on it, out of every device (N-2).
 *
 * Each user, and each login, has a `sessionsValidAfter` cutoff;
 * verifyJwtToken rejects any token issued before either - access, refresh
 * and half-finished login tokens alike. Moving a cutoff to "now" therefore
 * ends every session it covers at once, without having to know which tokens
 * exist.
 *
 * Account-wide (User): an account is deleted, or the admin "Sign out all
 * devices" action. Per login (UserLogin): that login's own credential changes
 * (password, 2FA, passkeys, email) - so a second person on the account isn't
 * signed out when the first changes their password.
 * Logout is different: it only revokes that one device's tokens (see
 * /api/auth/signout).
 *
 * Node runtime only (Prisma).
 */
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTokens, verifyJwtToken } from "@/lib/jwt";
import { setSessionCookies } from "@/lib/auth/sessionCookies";

/**
 * The cutoff to store, rounded down to a whole second because token `iat`
 * is in whole seconds: a token issued right after this call, even in the
 * same second, must still count as newer.
 */
export function sessionCutoffNow(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/**
 * Ends every session of `userId`, on every device, for every login on the
 * account. Use when someone else made the change (an admin action, a
 * deletion). When the update to the user row is already being written, put
 * `sessionsValidAfter: sessionCutoffNow()` in that same update instead, so
 * both happen together.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionsValidAfter: sessionCutoffNow() },
  });
}

/**
 * Ends every session of one login, on every device; other logins on the
 * account stay signed in. Use when that login's credentials were changed by
 * someone else (an admin reset) or nobody is signed in (a forgotten-password
 * reset).
 */
export async function revokeLoginSessions(loginId: string): Promise<void> {
  await prisma.userLogin.update({
    where: { id: loginId },
    data: { sessionsValidAfter: sessionCutoffNow() },
  });
}

/**
 * For a change the signed-in person just made to their own login: ends every
 * other session of that login, and keeps the current device signed in by
 * putting fresh session cookies on `response`. Other logins on the account
 * are not affected.
 *
 * Call it after the change is saved and before returning. It reads the
 * current session from `request`, so it must run before anything else has
 * revoked that session. `mfa` marks the fresh session as 2FA-verified even if
 * the old one wasn't (e.g. a 2FA code was just entered).
 */
export async function signOutOtherDevices(
  request: NextRequest,
  response: NextResponse,
  loginId: string,
  { mfa = false }: { mfa?: boolean } = {},
): Promise<void> {
  // Only a valid session of this same login is carried over.
  let current: { mfa: boolean } | null = null;
  const token = request.cookies.get("token")?.value;
  if (token) {
    try {
      const payload = await verifyJwtToken(token);
      if (payload.loginId === loginId) current = { mfa: payload.mfa === true };
    } catch {
      // No usable session - just sign everything out below.
    }
  }

  const login = await prisma.userLogin.update({
    where: { id: loginId },
    data: { sessionsValidAfter: sessionCutoffNow() },
    select: { userId: true, user: { select: { role: true } } },
  });

  if (!current) return;
  const { accessToken, refreshToken } = await generateTokens(
    { userId: login.userId, loginId, role: login.user.role },
    { mfa: mfa || current.mfa },
  );
  setSessionCookies(response, accessToken, refreshToken);
}
