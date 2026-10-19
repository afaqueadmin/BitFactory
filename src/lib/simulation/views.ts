/**
 * Builds demo-account responses in the exact shapes the client pages
 * already read, so the pages need no simulation-specific code. Nothing that
 * identifies the real miner or its owner leaves through here: no serial,
 * MAC, pool credential, owner id, real name, wallet address or tx id.
 */

import { paymentTypeLabel } from "@/lib/accounting/paymentTypes";
import {
  fetchWorkerLuxorSeriesAcrossSubaccounts,
  resolveWorkerSubaccounts,
  type PoolSeries,
} from "@/lib/hashrateHistory";
import { pickWorkerTick, type Period } from "@/lib/hashrateWindows";
import type { SimContext } from "./context";
import { SIM_SUBACCOUNT_NAME } from "./config";
import { nextMonthStart, utcDayStart } from "./dates";
import type { SimLedgerRow } from "./ledger";

/** The demo miner as /api/miners/user returns a miner. */
export function simMinerView(ctx: SimContext) {
  const m = ctx.demoMiner;
  return {
    id: m.id,
    name: ctx.displayName,
    status: m.status,
    serialNumber: null,
    macAddress: null,
    warrantyExpiresAt: m.warrantyExpiresAt,
    poolId: m.poolId,
    poolAuth: null,
    createdAt: ctx.since,
    updatedAt: m.updatedAt,
    spaceId: m.spaceId,
    hardwareId: m.hardwareId,
    userId: ctx.userId,
    hardware: m.hardware,
    space: m.space,
    pool: m.pool,
  };
}

/** One page of the ledger in /api/cost-payments' format, newest first. */
export function simCostPaymentsPage(
  rows: SimLedgerRow[],
  page: number,
  pageSize: number,
) {
  const ascending = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const balanceById = new Map<string, number>();
  let running = 0;
  for (const r of ascending) {
    running += r.amount;
    balanceById.set(r.id, running);
  }

  const newestFirst = ascending.reverse();
  const slice = newestFirst.slice(page * pageSize, (page + 1) * pageSize);

  return {
    success: true,
    data: slice.map((r) => {
      const balance = balanceById.get(r.id) ?? 0;
      return {
        id: r.id,
        date: r.createdAt.toLocaleDateString("en-GB"),
        type: paymentTypeLabel(r.type),
        consumption:
          r.consumption > 0 ? `${r.consumption.toFixed(2)} kWh` : "N/A",
        amount:
          (r.type === "PAYMENT" ? (r.amount >= 0 ? "+ " : "- ") : "- ") +
          `${Math.abs(r.amount).toFixed(2)} $`,
        balance:
          (balance >= 0 ? "+ " : "- ") + `${Math.abs(balance).toFixed(2)} $`,
        rawBalance: balance,
        rawAmount: r.amount,
        narration: r.narration,
      };
    }),
    pagination: {
      page,
      pageSize,
      totalCount: rows.length,
      totalPages: Math.ceil(rows.length / pageSize),
    },
  };
}

/** /api/wallet/settings for a demo account: no address, monthly payouts. */
export function simWalletSettings(ctx: SimContext, pendingBtc: number) {
  const settings = {
    currency_type: "BTC",
    subaccount: { id: 0, name: SIM_SUBACCOUNT_NAME },
    balance: pendingBtc,
    status: "ACTIVE",
    wallet_id: 0,
    payment_frequency: "MONTHLY",
    day_of_week: "",
    addresses: [],
    next_payout_at: nextMonthStart(ctx.now).toISOString(),
    frozen_until: "",
    pool_discount_rate: 0,
  };
  return { success: true, data: settings, subaccounts: [settings] };
}

/**
 * /api/miners/hashrate-history and /api/miners/[id]/hashrate-history for a
 * demo account: the demo worker's own series, never before registration.
 */
export async function simHashrateHistoryPayload(
  ctx: SimContext,
  window: { start: Date; end: Date },
  period: Period | null,
) {
  const sinceDay = utcDayStart(ctx.since);
  const start = window.start < sinceDay ? sinceDay : window.start;
  const { tick, downgradedFrom } = pickWorkerTick(
    { start, end: window.end },
    period,
    ctx.now,
  );

  const emptySeries = (): PoolSeries => ({
    available: false,
    points: [],
    uptimePoints: [],
    granularity: tick,
    hasEfficiency: false,
    hasUptime: false,
  });

  let points: PoolSeries["points"] = [];
  if (start < window.end && ctx.ownerSubaccounts.length > 0) {
    const clamped = { start, end: window.end };
    const subaccounts = await resolveWorkerSubaccounts(
      ctx.ownerSubaccounts,
      ctx.demoMiner.workerName,
      clamped,
    );
    points = await fetchWorkerLuxorSeriesAcrossSubaccounts(
      subaccounts,
      ctx.demoMiner.workerName,
      clamped,
      tick,
    );
  }

  return {
    success: true,
    data: {
      period,
      tickSize: tick,
      downgradedFrom: downgradedFrom ?? null,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      earliestData: sinceDay.toISOString(),
      activePoolNames: ["Luxor"],
      pools: {
        luxor: {
          available: true,
          points,
          uptimePoints: [],
          granularity: tick,
          hasEfficiency: true,
          hasUptime: false,
        } satisfies PoolSeries,
        braiins: emptySeries(),
      },
    },
    timestamp: new Date().toISOString(),
  };
}
