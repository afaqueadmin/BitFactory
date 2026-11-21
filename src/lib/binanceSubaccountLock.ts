import { prisma } from "@/lib/prisma";

/** A payer can hold a subaccount's checkout lock for at most 5 minutes. */
export const LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Atomically takes the lock. Succeeds when the subaccount is free, the
 * existing lock has expired, or the caller already holds it (which restarts
 * the 5 minutes).
 */
export async function acquireLock(subaccountId: string, userId: string) {
  const now = new Date();
  const { count } = await prisma.binanceSubaccount.updateMany({
    where: {
      id: subaccountId,
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(now.getTime() - LOCK_TTL_MS) } },
        { lockedBy: userId },
      ],
    },
    data: { lockedAt: now, lockedBy: userId },
  });
  return count === 0
    ? { ok: false as const }
    : {
        ok: true as const,
        lockedAt: now,
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
      };
}

/** Releases the lock, only if `userId` holds it. */
export async function releaseLock(subaccountId: string, userId: string) {
  await prisma.binanceSubaccount.updateMany({
    where: { id: subaccountId, lockedBy: userId },
    data: { lockedAt: null, lockedBy: null },
  });
}

/** Clears the lock whoever holds it (deposit received). */
export async function clearLock(subaccountId: string) {
  await prisma.binanceSubaccount.updateMany({
    where: { id: subaccountId },
    data: { lockedAt: null, lockedBy: null },
  });
}

/** Clears every lock older than the TTL. Returns how many were cleared. */
export async function clearExpiredLocks() {
  const { count } = await prisma.binanceSubaccount.updateMany({
    where: { lockedAt: { lt: new Date(Date.now() - LOCK_TTL_MS) } },
    data: { lockedAt: null, lockedBy: null },
  });
  return count;
}
