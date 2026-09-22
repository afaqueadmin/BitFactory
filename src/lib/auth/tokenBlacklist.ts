/**
 * Node runtime only - imports Prisma, which cannot run on the Edge runtime
 * that src/middleware.ts uses. verifyJwtToken() in src/lib/jwt.ts is the only
 * caller; it loads this module dynamically and only when
 * process.env.NEXT_RUNTIME !== "edge", so middleware (which imports jwt.ts
 * directly) never pulls this in. Don't add a static top-level import of this
 * file from jwt.ts, or from anything middleware imports.
 */
import { prisma } from "@/lib/prisma";

/**
 * A row means the token was revoked (logged out). expiresAt is deliberately not
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
