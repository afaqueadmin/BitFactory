/**
 * Node runtime only - imports Prisma, which cannot run on the Edge runtime
 * that src/middleware.ts uses. Callers: verifyJwtToken() in src/lib/jwt.ts,
 * and /api/auth/2fa/validate (spent pending-2FA tokens, C-3). jwt.ts loads
 * this module dynamically and only when
 * process.env.NEXT_RUNTIME !== "edge", so middleware (which imports jwt.ts
 * directly) never pulls this in. Don't add a static top-level import of this
 * file from jwt.ts, or from anything middleware imports.
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
