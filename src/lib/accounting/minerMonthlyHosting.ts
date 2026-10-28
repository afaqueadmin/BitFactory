/**
 * Monthly hosting price per miner: rate_per_kwh × hardware.powerUsage (kW) ×
 * 24 × 365/12, from each miner's latest MinerRateHistory row - the same
 * source the daily cost cron (cron_deduct_daily_cost) charges against.
 *
 * Used by the hosting invoice forms (/api/accounting/miners), the monthly
 * bill estimate (/api/accounting/customers/monthly-bill) and the guild
 * distribution's hosting invoice (src/lib/guilds/hostingInvoice.ts).
 */

import { prisma } from "@/lib/prisma";

export const HOURS_PER_DAY = 24;
export const AVG_DAYS_PER_MONTH = 365 / 12;

export function minerMonthlyHostingUsd(
  ratePerKwh: number,
  powerUsageKw: number,
): number {
  return ratePerKwh * powerUsageKw * HOURS_PER_DAY * AVG_DAYS_PER_MONTH;
}

/** Each miner's latest rate_per_kwh (missing = no rate recorded). */
export async function latestRateByMiner(
  minerIds: string[],
): Promise<Map<string, number>> {
  const rateHistories = await prisma.minerRateHistory.findMany({
    where: { minerId: { in: minerIds } },
    orderBy: { createdAt: "desc" },
    select: { minerId: true, rate_per_kwh: true },
  });
  const latest = new Map<string, number>();
  for (const rh of rateHistories) {
    if (!latest.has(rh.minerId)) {
      latest.set(rh.minerId, Number(rh.rate_per_kwh));
    }
  }
  return latest;
}

export interface SuggestedHostingLineItem {
  hardwareId: string;
  model: string;
  rate: number;
  quantity: number;
  suggestedUnitPrice: number;
  suggestedTotalPrice: number;
}

/**
 * A customer's AUTO miners and the hosting invoice line items they suggest:
 * one row per (hardware model, rate), so miners of the same model on a
 * different negotiated rate become separate rows. Unit prices are rounded to
 * whole dollars, as the invoice forms have always done.
 */
export async function loadSuggestedHostingLineItems(customerId: string) {
  const miners = await prisma.miner.findMany({
    where: { userId: customerId, status: "AUTO", isDeleted: false },
    select: {
      id: true,
      name: true,
      status: true,
      hardwareId: true,
      hardware: {
        select: { id: true, model: true, powerUsage: true },
      },
      space: {
        select: { id: true, name: true, location: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rates = await latestRateByMiner(miners.map((m) => m.id));

  const groups = new Map<
    string,
    {
      hardwareId: string;
      model: string;
      rate: number;
      powerUsage: number;
      quantity: number;
    }
  >();
  for (const miner of miners) {
    if (!miner.hardware) continue;
    const rate = rates.get(miner.id) || 0;
    const key = `${miner.hardwareId}:${rate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(key, {
        hardwareId: miner.hardwareId,
        model: miner.hardware.model,
        rate,
        powerUsage: miner.hardware.powerUsage,
        quantity: 1,
      });
    }
  }

  const lineItems: SuggestedHostingLineItem[] = Array.from(groups.values()).map(
    (group) => {
      const suggestedUnitPrice = Math.round(
        minerMonthlyHostingUsd(group.rate, group.powerUsage),
      );
      return {
        hardwareId: group.hardwareId,
        model: group.model,
        rate: group.rate,
        quantity: group.quantity,
        suggestedUnitPrice,
        suggestedTotalPrice: suggestedUnitPrice * group.quantity,
      };
    },
  );

  return { miners, totalActiveMiners: miners.length, lineItems };
}
