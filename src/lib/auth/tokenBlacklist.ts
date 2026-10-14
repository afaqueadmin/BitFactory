/**
 * Token revocation checks. Node runtime only - imports Prisma, which cannot
 * run on the Edge runtime that src/proxy.ts uses. Callers: verifyJwtToken()
 * and the login-step token checks in src/lib/jwt.ts, and
 * /api/auth/2fa/validate (spent pending-2FA tokens, C-3). jwt.ts loads
 * this module dynamically and only when
 * process.env.NEXT_RUNTIME !== "edge", so the proxy (which imports jwt.ts
 * directly) never pulls this in. Don't add a static top-level import of this
 * file from jwt.ts, or from anything the proxy imports.
 */
import { prisma } from "@/lib/prisma";

/**
 * A row means the token was revoked (logged out, or a pending-2FA token
 * already used). expiresAt is deliberately not
 * consulted: it only says when the row is safe to purge, and signout currently
 * sets it 15 minutes out - shorter than the token's real lifetime - so using it
 * to decide validity would let a logged-out token work again.
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const entry = await prisma.tokenBlacklist.findUnique({
    where: { token },
    select: { id: true },
  });
  return entry !== null;
}

/**
 * True if the account (User.sessionsValidAfter) or this login on it
 * (UserLogin.sessionsValidAfter) was signed out everywhere after this token
 * was issued - see sessionRevocation.ts - or if either no longer exists, or
 * the login has been moved off this account. `iat` is in whole seconds and
 * the cutoffs are stored rounded down to a whole second, so tokens issued
 * right after a revoke, in the same second, pass.
 */
export async function isTokenRevokedForUser(
  userId: string,
  loginId: string,
  issuedAt: number | undefined,
): Promise<boolean> {
  const login = await prisma.userLogin.findUnique({
    where: { id: loginId },
    select: {
      userId: true,
      sessionsValidAfter: true,
      user: { select: { sessionsValidAfter: true } },
    },
  });
  if (!login || login.userId !== userId) return true;
  return [login.user.sessionsValidAfter, login.sessionsValidAfter].some(
    (cutoff) =>
      cutoff !== null &&
      (typeof issuedAt !== "number" || issuedAt * 1000 < cutoff.getTime()),
  );
}
