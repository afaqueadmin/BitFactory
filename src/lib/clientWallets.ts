import { AuditAction, ClientWalletSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import { selectPrimaryAddress } from "@/lib/wallet";
import { maskWalletAddress, walletAddressHash } from "@/lib/walletCrypto";

/**
 * Our record of each Luxor subaccount's payout address (ClientWallet), its
 * history (ClientWalletHistory) and Luxor mismatches (ClientWalletMismatch).
 * Luxor stays where payouts are configured - an admin edits it by hand; this
 * app never writes to Luxor. Addresses are encrypted at rest by the Prisma
 * extension (src/lib/walletFieldEncryption.ts): code here works with plain
 * addresses and compares them via walletAddressHash().
 */

type Tx = Prisma.TransactionClient;

export const sameAddress = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => {
  if (!a || !b) return !a && !b;
  return walletAddressHash(a) === walletAddressHash(b);
};

/**
 * Luxor's current primary payout address for one subaccount (highest
 * revenue_allocation), or null if none is configured. Throws if Luxor can't
 * be reached - unlike fetchAddressForSubaccount in src/lib/wallet.ts, which
 * swallows errors - so a check never mistakes an outage for "no address".
 */
export async function fetchLuxorPrimaryAddress(
  subaccountName: string,
): Promise<string | null> {
  const settings = await createLuxorClient(
    subaccountName,
  ).getSubaccountPaymentSettings("BTC", subaccountName);
  return selectPrimaryAddress(settings.addresses)?.external_address ?? null;
}

/** The Luxor PoolSubaccount row for a subaccount name, if we have one. */
export function findLuxorPoolSubaccount(
  subaccountName: string,
  tx: Tx = prisma,
) {
  return tx.poolSubaccount.findFirst({
    where: { subaccountName, pool: { name: "Luxor" } },
    select: { id: true, subaccountName: true, userId: true },
  });
}

/**
 * Makes `address` our record for a subaccount: closes the open history row
 * at `at`, opens a new one, and upserts ClientWallet. A no-op on history if
 * the address is unchanged (the record's source/link still update).
 */
export async function setClientWalletAddress(
  tx: Tx,
  params: {
    poolSubaccountId: string;
    address: string | null;
    source: ClientWalletSource;
    at: Date;
    walletChangeRequestId?: string | null;
    mismatchId?: string | null;
    note?: string | null;
    actorId?: string | null;
  },
): Promise<{ changed: boolean; previous: string | null }> {
  const current = await tx.clientWallet.findUnique({
    where: { poolSubaccountId: params.poolSubaccountId },
    select: { address: true },
  });
  const previous = current?.address ?? null;
  const changed = !current || !sameAddress(previous, params.address);

  if (changed) {
    await tx.clientWalletHistory.updateMany({
      where: { poolSubaccountId: params.poolSubaccountId, validTo: null },
      data: { validTo: params.at },
    });
    if (params.address) {
      await tx.clientWalletHistory.create({
        data: {
          poolSubaccountId: params.poolSubaccountId,
          address: params.address,
          source: params.source,
          validFrom: params.at,
          walletChangeRequestId: params.walletChangeRequestId ?? null,
          mismatchId: params.mismatchId ?? null,
          note: params.note ?? null,
          actorId: params.actorId ?? null,
        },
      });
    }
  }

  await tx.clientWallet.upsert({
    where: { poolSubaccountId: params.poolSubaccountId },
    create: {
      poolSubaccountId: params.poolSubaccountId,
      address: params.address,
      source: params.source,
      effectiveFrom: params.at,
      walletChangeRequestId: params.walletChangeRequestId ?? null,
    },
    update: changed
      ? {
          address: params.address,
          source: params.source,
          effectiveFrom: params.at,
          walletChangeRequestId: params.walletChangeRequestId ?? null,
        }
      : {},
  });

  return { changed, previous };
}

/** Plain-language label for a history/record source. */
export const SOURCE_LABELS: Record<ClientWalletSource, string> = {
  INITIAL_SYNC: "First read from Luxor",
  PAYOUT_HISTORY: "Seen on past payouts",
  CHANGE_REQUEST: "Approved change request",
  LUXOR_ACCEPTED: "Accepted from Luxor",
};

/** Writes a ClientWallet audit row. Addresses are masked by the extension. */
export function auditClientWallet(
  tx: Tx,
  params: {
    action: AuditAction;
    poolSubaccountId: string;
    userId: string;
    description: string;
    changes?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
) {
  return tx.auditLog.create({
    data: {
      action: params.action,
      entityType: "ClientWallet",
      entityId: params.poolSubaccountId,
      userId: params.userId,
      description: params.description,
      changes: params.changes ? JSON.stringify(params.changes) : undefined,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export const masked = (a: string | null | undefined) =>
  maskWalletAddress(a ?? null) ?? "(none)";
