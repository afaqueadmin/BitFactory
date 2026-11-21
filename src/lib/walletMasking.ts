import { maskAddressesInText, maskWalletAddress } from "@/lib/walletCrypto";

/**
 * Response-side masking for non-staff callers (the customer, a franchisee, a
 * guild member, the PDF renderer): addresses leave the server already cut to
 * their first 6 and last 6 characters, so the full address never reaches
 * their browser. Staff responses are left untouched.
 */

interface AddressLike {
  external_address?: unknown;
  address_name?: unknown;
}

function maskAddressEntry<T extends AddressLike>(a: T): T {
  return {
    ...a,
    external_address:
      typeof a.external_address === "string"
        ? maskWalletAddress(a.external_address)
        : a.external_address,
    // Luxor's label for the address - can itself be the address.
    address_name:
      typeof a.address_name === "string"
        ? maskAddressesInText(a.address_name)
        : a.address_name,
  };
}

/**
 * Masks every Luxor payment-settings object in a /api/wallet/settings body
 * ({ data, subaccounts: [...] } or a bare settings object). Returns a copy.
 */
export function maskPaymentSettingsBody<T>(body: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(o)) {
        out[k] =
          k === "addresses" && Array.isArray(val)
            ? val.map((a) =>
                a && typeof a === "object"
                  ? maskAddressEntry(a as AddressLike)
                  : a,
              )
            : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(body) as T;
}

/** Masks the payout address on wallet transaction rows. */
export function maskTransactionAddresses<T extends { address_name?: string }>(
  rows: T[],
): T[] {
  return rows.map((r) =>
    typeof r.address_name === "string"
      ? { ...r, address_name: maskAddressesInText(r.address_name) }
      : r,
  );
}
