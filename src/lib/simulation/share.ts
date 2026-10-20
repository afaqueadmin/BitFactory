/**
 * A simulated account's daily mining revenue: its miner's share of what the
 * owner's subaccount was really credited that day. Pure.
 *
 * Luxor credits a subaccount once a day ("Miner Revenue", mirrored into
 * PoolSubaccountDailySnapshot.miningRevenue for the same day), net of the
 * pool fee. The per-worker estRevenue is the gross estimate, so the miner's
 * share of the credit is its estRevenue over the subaccount's summed
 * estRevenue that day - which lands exactly on what a real client with that
 * one miner would be paid.
 *
 * A day whose worker metrics haven't arrived (or failed to) borrows the most
 * recent share from the previous SHARE_LOOKBACK_DAYS; a day with no credit
 * yet is left out until the snapshot lands, as on a real account.
 */

import type { SimDay } from "./payouts";

export const SHARE_LOOKBACK_DAYS = 7;

export interface WorkerDayRow {
  subaccountId: string;
  /** "YYYY-MM-DD" */
  date: string;
  estRevenue: number;
  hashrate: number;
}

export interface SubaccountDayTotal {
  subaccountId: string;
  date: string;
  /** Summed estRevenue of every worker in the subaccount that day. */
  estRevenue: number;
}

export interface SubaccountCredit {
  subaccountId: string;
  date: string;
  /** BTC the subaccount was credited for mining that day. */
  miningRevenue: number;
}

/** subaccountId -> the miner's fraction of that subaccount's revenue. */
type Shares = Map<string, number>;

export function simShareDays(input: {
  /** Day keys to produce, ascending (registration day to yesterday). */
  days: string[];
  worker: WorkerDayRow[];
  totals: SubaccountDayTotal[];
  credits: SubaccountCredit[];
}): SimDay[] {
  const totalByKey = new Map(
    input.totals.map((t) => [`${t.subaccountId}|${t.date}`, t.estRevenue]),
  );
  const creditByKey = new Map(
    input.credits.map((c) => [`${c.subaccountId}|${c.date}`, c.miningRevenue]),
  );

  const sharesByDay = new Map<string, Shares>();
  const hashrateByDay = new Map<string, number>();
  for (const w of input.worker) {
    hashrateByDay.set(w.date, (hashrateByDay.get(w.date) ?? 0) + w.hashrate);
    const total = totalByKey.get(`${w.subaccountId}|${w.date}`) ?? 0;
    if (!(w.estRevenue > 0) || !(total > 0)) continue;
    const shares = sharesByDay.get(w.date) ?? new Map<string, number>();
    shares.set(w.subaccountId, w.estRevenue / total);
    sharesByDay.set(w.date, shares);
  }

  const knownDays = Array.from(sharesByDay.keys()).sort();
  const sharesFor = (day: string): Shares | null => {
    const own = sharesByDay.get(day);
    if (own) return own;
    const floor = shiftDay(day, -SHARE_LOOKBACK_DAYS);
    for (let i = knownDays.length - 1; i >= 0; i--) {
      const d = knownDays[i];
      if (d >= day) continue;
      if (d < floor) break;
      return sharesByDay.get(d)!;
    }
    return null;
  };

  const out: SimDay[] = [];
  for (const day of input.days) {
    const shares = sharesFor(day);
    if (!shares) continue;
    let btc = 0;
    let credited = false;
    for (const [subaccountId, share] of shares) {
      const credit = creditByKey.get(`${subaccountId}|${day}`);
      if (credit === undefined) continue;
      credited = true;
      btc += credit * share;
    }
    if (!credited) continue;
    out.push({
      date: day,
      hashrate: hashrateByDay.get(day) ?? 0,
      btc: parseFloat(btc.toFixed(8)),
    });
  }
  return out;
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
