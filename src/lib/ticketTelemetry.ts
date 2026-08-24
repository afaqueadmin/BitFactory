/**
 * src/lib/ticketTelemetry.ts
 *
 * Live (not cron-fed) pool telemetry snapshot for a single miner, used to
 * auto-attach a system note to a HARDWARE_MINER / POOL_HASHRATE support
 * ticket at creation time. Deliberately calls Luxor/Braiins directly instead
 * of reading PoolWorkerDailyMetric (which is a once-a-day cron rollup) so
 * the snapshot reflects the pool's current state, not yesterday's.
 *
 * Matching a Miner to a pool worker is done by name against whichever pool
 * (Luxor or Braiins) the miner's owner has a PoolSubaccount for - the same
 * userId+pool.name lookup used by /api/miners/[id]/hashrate-history. Luxor's
 * worker.name is confirmed elsewhere (fetchWorkerLuxorSeries) to equal
 * Miner.name directly. Braiins has no such precedent in this codebase and
 * its raw worker.name is "subaccount.workerName" - so we try an exact match
 * first, then fall back to matching the suffix after the last ".", and
 * report no match rather than guessing wrong.
 */

import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";

export interface MinerTelemetrySnapshot {
  poolName: "Luxor" | "Braiins";
  workerName: string;
  status: string;
  hashrateThs: number | null;
  efficiency: number | null;
  staleShares: number | null;
  rejectedShares: number | null;
  firmware: string | null;
  lastShareAt: string | null;
  fetchedAt: string;
}

async function fetchLiveLuxorSnapshot(
  userId: string,
  minerName: string,
): Promise<MinerTelemetrySnapshot | null> {
  const poolSubaccount = await prisma.poolSubaccount.findFirst({
    where: { userId, pool: { name: "Luxor" } },
    include: { poolAuth: true },
  });
  if (!poolSubaccount?.poolAuth) return null;

  const client = createLuxorClient("ticket-telemetry");
  const response = await client.getWorkers("BTC", {
    subaccount_names: poolSubaccount.poolAuth.authKey,
  });

  const worker = response.workers.find((w) => w.name === minerName);
  if (!worker) return null;

  return {
    poolName: "Luxor",
    workerName: worker.name,
    status: worker.status,
    hashrateThs: worker.hashrate / 1_000_000_000_000,
    // Luxor reports efficiency as a 0-1 ratio, not a percentage - same
    // convention as every other efficiency reader in this codebase (see
    // hashrateHistory.ts, workers/page.tsx, clientworkers/page.tsx).
    efficiency:
      typeof worker.efficiency === "number" ? worker.efficiency * 100 : null,
    staleShares: worker.stale_shares ?? null,
    rejectedShares: worker.rejected_shares ?? null,
    firmware: worker.firmware || null,
    lastShareAt: worker.last_share_time || null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchLiveBraiinsSnapshot(
  userId: string,
  minerName: string,
): Promise<MinerTelemetrySnapshot | null> {
  const poolSubaccount = await prisma.poolSubaccount.findFirst({
    where: { userId, pool: { name: "Braiins" } },
    include: { poolAuth: true },
  });
  if (!poolSubaccount?.poolAuth) return null;

  const client = createBraiinsClient(
    poolSubaccount.poolAuth.authKey,
    "ticket-telemetry",
  );
  const workers = await client.getWorkers();

  const worker =
    workers.find((w) => w.name === minerName) ||
    workers.find((w) => w.name.split(".").slice(1).join(".") === minerName);
  if (!worker) return null;

  return {
    poolName: "Braiins",
    workerName: worker.name,
    status: worker.state,
    // hash_rate_5m is in Gh/s (same convention as /api/braiins-workers)
    hashrateThs: worker.hash_rate_5m / 1000,
    efficiency: null, // Braiins worker endpoint has no efficiency field
    staleShares: null, // Braiins has no stale/rejected share split, only aggregate shares
    rejectedShares: null,
    firmware: null, // Braiins doesn't report per-worker firmware
    lastShareAt: worker.last_share
      ? new Date(worker.last_share * 1000).toISOString()
      : null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Best-effort live snapshot for the given miner. Returns null (never
 * throws) if the miner has no linked pool account or the live fetch fails -
 * ticket creation must never be blocked by a pool API being down.
 */
export async function getLiveMinerTelemetry(
  minerId: string,
): Promise<MinerTelemetrySnapshot | null> {
  try {
    const miner = await prisma.miner.findUnique({
      where: { id: minerId },
      select: { id: true, name: true, userId: true },
    });
    if (!miner) return null;

    const [luxorSnapshot, braiinsSnapshot] = await Promise.all([
      fetchLiveLuxorSnapshot(miner.userId, miner.name).catch((error) => {
        console.error("[TicketTelemetry] Luxor fetch failed:", error);
        return null;
      }),
      fetchLiveBraiinsSnapshot(miner.userId, miner.name).catch((error) => {
        console.error("[TicketTelemetry] Braiins fetch failed:", error);
        return null;
      }),
    ]);

    return luxorSnapshot || braiinsSnapshot || null;
  } catch (error) {
    console.error("[TicketTelemetry] getLiveMinerTelemetry failed:", error);
    return null;
  }
}
