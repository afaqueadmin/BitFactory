/**
 * Hashprice + balance — captured for TODAY, not "yesterday".
 *
 * Unlike hashrate/efficiency/uptime/revenue, Luxor has no historical
 * endpoint for either of these fields — getSummary()/getPoolStats() only
 * ever return the CURRENT value, with no date parameter at all (verified
 * against the actual SummaryParams type: only subaccount_names/site_id).
 * That means there is no "yesterday, now complete" to fetch the next day —
 * a day has to be captured while it's still today, or it's gone permanently,
 * with no retry-later path the way the main snapshot cron has one.
 *
 * Scoped to Luxor only, matching the sibling snapshot cron split: Braiins
 * has no hashprice concept at all, and its balance is currently a
 * zero-activity account not worth tracking daily until it has real miners.
 */

import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import {
  toUtcDateOnly,
  formatUtcDateKey,
} from "@/lib/services/paybackSnapshotService";

export { toUtcDateOnly, formatUtcDateKey };

export interface HashpriceBalanceResult {
  poolSubaccountId: string;
  subaccountName: string;
  status: "written" | "error";
  hashprice?: number | null;
  balance?: number | null;
  error?: string;
}

/**
 * Captures today's live hashprice + balance for every active Luxor
 * PoolSubaccount, upserting only those two fields — never touches
 * hashrate/efficiency/uptime/revenue, which belong to the other cron.
 */
export async function upsertTodayHashpriceAndBalance(
  now: Date = new Date(),
): Promise<HashpriceBalanceResult[]> {
  const today = toUtcDateOnly(now);
  const dateKey = formatUtcDateKey(today);

  const subaccounts = await prisma.poolSubaccount.findMany({
    where: { pool: { name: "Luxor" }, poolAuthId: { not: null } },
    include: { poolAuth: true },
  });

  const results: HashpriceBalanceResult[] = [];

  for (const sub of subaccounts) {
    if (!sub.poolAuth) continue;

    try {
      const client = createLuxorClient(sub.poolAuth.authKey);
      const summary = await client.getSummary("BTC", {
        subaccount_names: sub.poolAuth.authKey,
      });

      const hashprice = summary.hashprice?.[0]?.value ?? null;
      const balance = summary.balance?.[0]?.revenue ?? null;

      await prisma.poolSubaccountDailySnapshot.upsert({
        where: {
          poolSubaccountId_date: { poolSubaccountId: sub.id, date: today },
        },
        create: {
          poolSubaccountId: sub.id,
          date: today,
          hashprice,
          balance,
        },
        update: { hashprice, balance },
      });

      results.push({
        poolSubaccountId: sub.id,
        subaccountName: sub.subaccountName,
        status: "written",
        hashprice,
        balance,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Hashprice/Balance] ${sub.subaccountName} ${dateKey}: ${message}`,
      );
      results.push({
        poolSubaccountId: sub.id,
        subaccountName: sub.subaccountName,
        status: "error",
        error: message,
      });
    }
  }

  return results;
}
