/**
 * A demo account's pool ledger in the WalletTransaction shape the wallet
 * routes return: a daily mining-revenue credit per day the demo worker
 * earned, and on each 1st of the month (UTC) a payment debit plus a
 * transaction-fee debit that empty the pending balance - a monthly payout,
 * like a real client's. Pure; addresses and transaction ids are always blank.
 */

import { SIM_SUBACCOUNT_NAME } from "./config";
import { nextMonthStart, parseDayKey } from "./dates";

export interface SimDay {
  /** "YYYY-MM-DD" (UTC). */
  date: string;
  /** H/s, daily average. */
  hashrate: number;
  /** BTC the demo worker earned that day. */
  btc: number;
}

export interface SimWalletTransaction {
  pool: "Luxor";
  currency_type: string;
  date_time: string;
  address_name: string;
  subaccount_name: string;
  transaction_category: string;
  currency_amount: number;
  usd_equivalent: number;
  transaction_id: string;
  transaction_type: "credit" | "debit";
}

export interface PayoutCategories {
  credit: string;
  payment: string;
  fee: string;
}

/** Luxor's category names; context.ts swaps in what the DB actually holds. */
export const DEFAULT_PAYOUT_CATEGORIES: PayoutCategories = {
  credit: "Miner Revenue",
  payment: "Payment",
  fee: "Transaction Fee",
};

const round8 = (n: number) => parseFloat(n.toFixed(8));
const round2 = (n: number) => parseFloat(n.toFixed(2));

export interface SimPoolLedger {
  /** Newest first, like the real routes. */
  transactions: SimWalletTransaction[];
  totalEarnedBtc: number;
  /** Earned since the last payout. */
  pendingBtc: number;
  lastPayoutAt: Date | null;
}

export function simPoolLedger(input: {
  days: SimDay[];
  now: Date;
  /** BTC per payout; a month earning no more than this carries over. */
  feeBtc: number;
  priceByDay: Map<string, number>;
  categories?: PayoutCategories;
}): SimPoolLedger {
  const { now, feeBtc, priceByDay } = input;
  const categories = input.categories ?? DEFAULT_PAYOUT_CATEGORIES;
  const days = [...input.days]
    .filter((d) => d.btc > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const usd = (btc: number, dayKeyStr: string) =>
    round2(btc * (priceByDay.get(dayKeyStr) ?? 0));

  const row = (
    dateTime: Date,
    category: string,
    btc: number,
    type: "credit" | "debit",
  ): SimWalletTransaction => {
    const key = dateTime.toISOString().slice(0, 10);
    return {
      pool: "Luxor",
      currency_type: "BTC",
      date_time: dateTime.toISOString(),
      address_name: "",
      subaccount_name: SIM_SUBACCOUNT_NAME,
      transaction_category: category,
      currency_amount: round8(btc),
      usd_equivalent: usd(btc, key),
      transaction_id: "",
      transaction_type: type,
    };
  };

  const txs: SimWalletTransaction[] = [];
  let pending = 0;
  let total = 0;
  let lastPayoutAt: Date | null = null;
  let nextPayout = days.length
    ? nextMonthStart(parseDayKey(days[0].date))
    : null;

  const payOutIfDue = (until: Date) => {
    while (nextPayout && nextPayout.getTime() <= until.getTime()) {
      if (pending > feeBtc) {
        txs.push(
          row(nextPayout, categories.payment, pending - feeBtc, "debit"),
        );
        if (feeBtc > 0)
          txs.push(row(nextPayout, categories.fee, feeBtc, "debit"));
        pending = 0;
        lastPayoutAt = nextPayout;
      }
      nextPayout = nextMonthStart(nextPayout);
    }
  };

  for (const day of days) {
    const at = parseDayKey(day.date);
    payOutIfDue(at);
    txs.push(row(at, categories.credit, day.btc, "credit"));
    pending += day.btc;
    total += day.btc;
  }
  payOutIfDue(now);

  txs.sort(
    (a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime(),
  );

  return {
    transactions: txs,
    totalEarnedBtc: round8(total),
    pendingBtc: round8(pending),
    lastPayoutAt,
  };
}
