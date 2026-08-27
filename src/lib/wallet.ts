/// <filename>src/lib/wallet.ts</filename>
/**
 * Shared helpers for the client-facing wallet address, used by both the
 * read-only wallet settings endpoint/page and the wallet change request
 * flow so "primary address" is computed one way everywhere.
 */

import { prisma } from "@/lib/prisma";
import { createLuxorClient, LuxorError } from "@/lib/luxor";
import type { PaymentAddress } from "@/lib/types/wallet";

/**
 * Picks the "primary" address out of a Luxor subaccount's addresses array -
 * the one with the highest revenue_allocation. Mirrors the selection used on
 * the client wallet page.
 *
 * Braiins is intentionally not handled here: braiins.ts has no equivalent to
 * Luxor's payment-settings endpoints (only historical payout `destination`s
 * via getPayouts()), so there is no "currently configured payout address" to
 * select a primary from.
 */
export function selectPrimaryAddress(
  addresses: PaymentAddress[] | undefined | null,
): PaymentAddress | null {
  if (!addresses || addresses.length === 0) return null;
  return addresses.reduce((prev, current) =>
    current.revenue_allocation > prev.revenue_allocation ? current : prev,
  );
}

/**
 * Resolves the Luxor identifier for a user the same way
 * /api/wallet/settings does: prefer the PoolAuth authKey, fall back to the
 * legacy luxorSubaccountName column.
 */
export async function resolveLuxorIdentifier(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      luxorSubaccountName: true,
      poolAuths: {
        where: { pool: { name: "Luxor" } },
        select: { authKey: true },
      },
    },
  });

  return user?.poolAuths[0]?.authKey || user?.luxorSubaccountName || null;
}

/**
 * Fetches the user's live primary Luxor address, for snapshotting into
 * currentAddress on a new WalletChangeRequest. Returns null if the user has
 * no Luxor identifier configured or Luxor has no addresses on file -
 * best-effort snapshot, never throws (a missing snapshot shouldn't block a
 * client from submitting a request).
 */
export async function fetchCurrentPrimaryAddress(
  userId: string,
  currency: string = "BTC",
): Promise<string | null> {
  const luxorIdentifier = await resolveLuxorIdentifier(userId);
  if (!luxorIdentifier) return null;

  try {
    const settings = await createLuxorClient(
      luxorIdentifier,
    ).getSubaccountPaymentSettings(currency, luxorIdentifier);
    return selectPrimaryAddress(settings.addresses)?.external_address ?? null;
  } catch (error) {
    console.error(
      `[Wallet] Could not fetch current Luxor address for user ${userId}:`,
      error instanceof LuxorError ? error.message : error,
    );
    return null;
  }
}
