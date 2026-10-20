/**
 * A simulated account's cost ledger, in the same shape as CostPayment rows:
 * the welcome bonus, one electricity charge per day and any admin payments or
 * adjustments. Stored in simulated_cost_payments (see ./ledgerStore), never in
 * cost_payments. The helpers here are pure.
 *
 * The daily charge mirrors cron_deduct_daily_cost: powerUsage kW x rate x 24,
 * posted at 00:00 UTC after the day while the mirrored miner is AUTO - here
 * at the simulated rate from simulation_settings.
 */

import { addDays, dayKey, utcDayStart } from "./dates";

export interface SimLedgerRow {
  id: string;
  createdAt: Date;
  /** USD; negative for a charge. */
  amount: number;
  /** kWh. */
  consumption: number;
  type: "PAYMENT" | "ELECTRICITY_CHARGES" | "ADJUSTMENT";
  narration: string | null;
}

export function ledgerBalance(rows: Pick<SimLedgerRow, "amount">[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

/** Total of the electricity charges, as a positive USD amount. */
export function ledgerElectricityTotal(rows: SimLedgerRow[]): number {
  return rows
    .filter((r) => r.type === "ELECTRICITY_CHARGES")
    .reduce((sum, r) => sum - r.amount, 0);
}

/**
 * The day a run at `now` charges: the UTC day that just ended, unless the
 * simulation only started after it. Null when there's nothing to charge.
 */
export function simChargeDay(since: Date, now: Date): string | null {
  const day = addDays(utcDayStart(now), -1);
  return day.getTime() < utcDayStart(since).getTime() ? null : dayKey(day);
}
