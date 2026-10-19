/**
 * A demo account's cost ledger: the welcome bonus plus one electricity
 * charge per day, in the same shape as CostPayment rows. Pure - computed on
 * every request from the demo miner's data, never written to cost_payments.
 *
 * The charge is the cron_deduct_daily_cost formula (powerUsage kW x rate x
 * 24), posted at 00:00 UTC after the day like the cron. There is no miner
 * status history to replay the cron's "AUTO only" rule, so a day is charged
 * when the demo worker actually hashed that day (hashrate > 0) - which keeps
 * past days fixed whatever happens to the miner later.
 */

import { addDays, dayKeysBetween, parseDayKey, utcDayStart } from "./dates";

export interface RatePoint {
  /** When the rate was set (MinerRateHistory.createdAt). */
  effectiveFrom: Date;
  ratePerKwh: number;
}

export interface SimLedgerRow {
  id: string;
  createdAt: Date;
  /** USD; negative for a charge. */
  amount: number;
  /** kWh. */
  consumption: number;
  type: "PAYMENT" | "ELECTRICITY_CHARGES";
  narration: string | null;
}

/** The rate the cron would have used for a charge posted at `at`. */
export function rateAt(rates: RatePoint[], at: Date): number {
  let rate = 0;
  let latest = -Infinity;
  for (const r of rates) {
    const t = r.effectiveFrom.getTime();
    if (t <= at.getTime() && t > latest) {
      latest = t;
      rate = r.ratePerKwh;
    }
  }
  return rate;
}

export function simCostLedger(input: {
  since: Date;
  now: Date;
  bonusUsd: number;
  powerUsageKw: number;
  rates: RatePoint[];
  /** Hashrate per day key; a day missing or at 0 isn't charged. */
  hashrateByDay: Map<string, number>;
}): SimLedgerRow[] {
  const { since, now, bonusUsd, powerUsageKw, rates, hashrateByDay } = input;
  const rows: SimLedgerRow[] = [];

  if (bonusUsd > 0) {
    rows.push({
      id: "sim-bonus",
      createdAt: since,
      amount: bonusUsd,
      consumption: 0,
      type: "PAYMENT",
      narration: "Welcome bonus",
    });
  }

  // Completed days only: the charge for a day is posted at the next 00:00.
  const lastCompleted = addDays(utcDayStart(now), -1);
  if (lastCompleted.getTime() < utcDayStart(since).getTime()) return rows;

  for (const key of dayKeysBetween(since, lastCompleted)) {
    if (!((hashrateByDay.get(key) ?? 0) > 0)) continue;

    const postedAt = addDays(parseDayKey(key), 1);
    const rate = rateAt(rates, postedAt);
    const amount = Math.round(powerUsageKw * rate * 24 * 100) / 100;
    // The cron skips a user whose day costs nothing (no rate set).
    if (!(amount > 0)) continue;

    rows.push({
      id: `sim-charge-${key}`,
      createdAt: postedAt,
      amount: -amount,
      consumption: powerUsageKw * 24,
      type: "ELECTRICITY_CHARGES",
      narration: null,
    });
  }

  return rows;
}

export function ledgerBalance(rows: SimLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}
