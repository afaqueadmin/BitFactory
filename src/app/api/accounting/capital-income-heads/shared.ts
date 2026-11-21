import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { incomeHeadCountInclude } from "@/lib/accounting/capitalIncomeRequest";

/**
 * Every head with its entry count and totals: Received = Σ its entries'
 * USD; Fees = Σ their bank fees in USD. Used by the Capital & Income Heads
 * list and its export.
 */
export async function incomeHeadsWithTotals() {
  const [heads, sums] = await Promise.all([
    prisma.accountingIncomeHead.findMany({
      include: incomeHeadCountInclude,
      orderBy: { name: "asc" },
    }),
    prisma.accountingIncome.groupBy({
      by: ["headId"],
      _sum: { amountUsd: true, feeUsd: true },
    }),
  ]);
  const byHead = new Map(sums.map((s) => [s.headId, s._sum]));
  return heads.map((h) => ({
    ...h,
    receivedUsd: (byHead.get(h.id)?.amountUsd ?? new Decimal(0)).toFixed(2),
    feesUsd: (byHead.get(h.id)?.feeUsd ?? new Decimal(0)).toFixed(2),
  }));
}
