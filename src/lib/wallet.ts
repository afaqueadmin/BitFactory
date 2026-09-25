/// <filename>src/lib/wallet.ts</filename>
/**
 * Shared helpers for the client-facing wallet address, used by both the
 * read-only wallet settings endpoint/page and the wallet change request
 * flow so "primary address" is computed one way everywhere.
 */

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
 * Fetches the live primary Luxor address for one specific subaccount, for
 * snapshotting into currentAddress on a new WalletChangeRequest - payment
 * settings (including payout addresses) are configured per subaccount in
 * Luxor, not account-wide, so a user with multiple Luxor subaccounts can have
 * a genuinely different address on each one. Returns null if Luxor has no
 * addresses on file; best-effort, never throws (a missing snapshot shouldn't
 * block a client from submitting a request).
 */
export async function fetchAddressForSubaccount(
  subaccountName: string,
  currency: string = "BTC",
): Promise<string | null> {
  try {
    const settings = await createLuxorClient(
      subaccountName,
    ).getSubaccountPaymentSettings(currency, subaccountName);
    return selectPrimaryAddress(settings.addresses)?.external_address ?? null;
  } catch (error) {
    console.error(
      `[Wallet] Could not fetch current Luxor address for subaccount ${subaccountName}:`,
      error instanceof LuxorError ? error.message : error,
    );
    return null;
  }
}
