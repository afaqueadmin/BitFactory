import { prisma } from "@/lib/prisma";
import { walletAddressHash } from "@/lib/walletCrypto";
import { EXCLUDED_SUBACCOUNTS } from "@/lib/services/cronRetry";

/** Shared reads for the admin Wallets module (/wallets). Staff only. */

export interface PayoutStats {
  count: number;
  btc: number;
  first: string | null;
  last: string | null;
}

/**
 * Luxor "Payment" totals per subaccount and address (keyed by
 * walletAddressHash). Grouped here rather than on the addressHash column so
 * it's right whether or not old rows have been hashed yet.
 */
export async function payoutStatsBySubaccount(
  poolSubaccountIds: string[],
): Promise<Map<string, Map<string, PayoutStats>>> {
  const rows = poolSubaccountIds.length
    ? await prisma.poolTransaction.findMany({
        where: {
          poolSubaccountId: { in: poolSubaccountIds },
          category: "Payment",
          addressName: { not: null },
        },
        select: {
          poolSubaccountId: true,
          addressName: true,
          amount: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
      })
    : [];
  const out = new Map<string, Map<string, PayoutStats>>();
  for (const r of rows) {
    if (!r.addressName) continue;
    const hash = walletAddressHash(r.addressName);
    const bySub = out.get(r.poolSubaccountId) ?? new Map<string, PayoutStats>();
    out.set(r.poolSubaccountId, bySub);
    const s = bySub.get(hash) ?? { count: 0, btc: 0, first: null, last: null };
    s.count += 1;
    s.btc += Number(r.amount);
    const at = r.occurredAt.toISOString();
    s.first = s.first ?? at;
    s.last = at;
    bySub.set(hash, s);
  }
  return out;
}

/** Every Luxor subaccount the module tracks, with owner and record. */
export function listTrackedSubaccounts() {
  return prisma.poolSubaccount.findMany({
    where: {
      pool: { name: "Luxor" },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    orderBy: { subaccountName: "asc" },
    select: {
      id: true,
      subaccountName: true,
      user: { select: { id: true, name: true, email: true, isDeleted: true } },
      clientWallet: true,
      walletMismatches: {
        where: { status: "OPEN" },
        select: {
          id: true,
          detectedAt: true,
          lastSeenAt: true,
          luxorAddress: true,
        },
        take: 1,
      },
    },
  });
}

export const roundBtc = (n: number) => Number(n.toFixed(8));
