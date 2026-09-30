/**
 * Signing an account out of every device (N-2).
 *
 * Each user has a `sessionsValidAfter` cutoff; verifyJwtToken rejects any
 * token issued before it - access, refresh and half-finished login tokens
 * alike. Moving the cutoff to "now" therefore ends every session at once,
 * without having to know which tokens exist.
 *
 * Used when a credential changes (password, 2FA, passkeys, email), when an
 * account is deleted, and by the admin "Sign out all devices" action.
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
 * Ends every session of `userId`, on every device. Use when someone else
 * made the change (an admin reset, a deletion) or nobody is signed in (a
 * forgotten-password reset). When the update to the user row is already
 * being written, put `sessionsValidAfter: sessionCutoffNow()` in that same
 * update instead, so both happen together.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionsValidAfter: sessionCutoffNow() },
  });
}

/**
 * For a change the signed-in user just made to their own account: ends every
 * other session, and keeps the current device signed in by putting fresh
 * session cookies on `response`.
 *
 * Call it after the change is saved and before returning. It reads the
 * current session from `request`, so it must run before anything else has
 * revoked that session. `mfa` marks the fresh session as 2FA-verified even if
 * the old one wasn't (e.g. a 2FA code was just entered).
 */
export async function signOutOtherDevices(
  request: NextRequest,
  response: NextResponse,
  userId: string,
  { mfa = false }: { mfa?: boolean } = {},
): Promise<void> {
  // Only a valid session of this same user is carried over.
  let current: { mfa: boolean } | null = null;
  const token = request.cookies.get("token")?.value;
  if (token) {
    try {
      const payload = await verifyJwtToken(token);
      if (payload.userId === userId) current = { mfa: payload.mfa === true };
    } catch {
      // No usable session - just sign everything out below.
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { sessionsValidAfter: sessionCutoffNow() },
    select: { role: true },
  });

  if (!current) return;
  const { accessToken, refreshToken } = await generateTokens(
    userId,
    user.role,
    { mfa: mfa || current.mfa },
  );
  setSessionCookies(response, accessToken, refreshToken);
}
