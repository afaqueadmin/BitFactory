/**
 * Node runtime only. This imports Prisma, which cannot run on the Edge runtime
 * that src/middleware.ts uses - so never import it (directly or transitively)
 * from middleware, or from src/lib/jwt.ts, which middleware imports.
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
