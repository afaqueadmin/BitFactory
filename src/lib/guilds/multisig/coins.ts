/**
 * Keeps guild_wallet_coins in step with the chain for one guild: every
 * unspent output at its receiving address (branch 0) and change address
 * (branch 1). A coin is AVAILABLE once it has enough confirmations -
 * GuildPayoutSettings.minConfirmations for money coming in, 1 for our own
 * change. A Luxor payout coin is linked to its Luxor "Payment" row by txid
 * (Luxor records the on-chain txid as externalTransactionId).
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYOUT_CATEGORIES } from "@/lib/simulation/payouts";
import { CHANGE, RECEIVE, deriveAddress, type Branch } from "./descriptor";
import { addressCoins, tipHeight } from "./mempool";
import { requireWallet } from "./wallet";

export interface CoinSyncResult {
  seen: number;
  available: number;
  unconfirmed: number;
  /** Gone from the chain's unspent set without one of our payouts spending it. */
  vanished: number;
}

export async function syncGuildCoins(guildId: string): Promise<CoinSyncResult> {
  const { settings, wallet } = await requireWallet();
  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: {
      payoutAddressIndex: true,
      poolAuth: { select: { authKey: true } },
    },
  });
  const index = guild.payoutAddressIndex;
  if (index === null) throw new Error("The guild has no multisig address");

  const height = await tipHeight(wallet.network);
  const onChain: {
    txid: string;
    vout: number;
    sats: number;
    address: string;
    branch: Branch;
    confirmations: number;
    blockHeight: number | null;
    blockTime: Date | null;
  }[] = [];
  for (const branch of [RECEIVE, CHANGE]) {
    const { address } = deriveAddress(wallet, branch, index);
    for (const c of await addressCoins(wallet.network, address)) {
      onChain.push({
        ...c,
        address,
        branch,
        confirmations:
          c.confirmed && c.blockHeight ? height - c.blockHeight + 1 : 0,
      });
    }
  }

  // Luxor payout rows these coins came from.
  const luxorRows = guild.poolAuth
    ? await prisma.poolTransaction.findMany({
        where: {
          category: DEFAULT_PAYOUT_CATEGORIES.payment,
          transactionType: "debit",
          pool: { name: "Luxor" },
          poolSubaccount: { subaccountName: guild.poolAuth.authKey },
          externalTransactionId: {
            in: [...new Set(onChain.map((c) => c.txid))],
          },
        },
        select: { id: true, externalTransactionId: true },
      })
    : [];
  const luxorByTxid = new Map(
    luxorRows.map((r) => [r.externalTransactionId!, r.id]),
  );

  const result: CoinSyncResult = {
    seen: onChain.length,
    available: 0,
    unconfirmed: 0,
    vanished: 0,
  };
  for (const c of onChain) {
    const needed = c.branch === CHANGE ? 1 : settings.minConfirmations;
    const status = c.confirmations >= needed ? "AVAILABLE" : "UNCONFIRMED";
    const luxorId = c.branch === RECEIVE ? luxorByTxid.get(c.txid) : undefined;
    const source = c.branch === CHANGE ? "CHANGE" : luxorId ? "LUXOR" : "OTHER";
    const existing = await prisma.guildWalletCoin.findUnique({
      where: { txid_vout: { txid: c.txid, vout: c.vout } },
      select: { status: true },
    });
    // A reserved coin belongs to a prepared payout; leave it be.
    const keepStatus = existing?.status === "RESERVED";
    await prisma.guildWalletCoin.upsert({
      where: { txid_vout: { txid: c.txid, vout: c.vout } },
      create: {
        guildId,
        txid: c.txid,
        vout: c.vout,
        sats: BigInt(c.sats),
        address: c.address,
        branch: c.branch,
        addressIndex: index,
        source,
        status,
        blockHeight: c.blockHeight,
        confirmedAt: c.blockTime,
        poolTransactionId: luxorId ?? null,
      },
      update: {
        ...(keepStatus ? {} : { status }),
        source,
        blockHeight: c.blockHeight,
        confirmedAt: c.blockTime,
        poolTransactionId: luxorId ?? null,
      },
    });
    if (status === "AVAILABLE") result.available++;
    else result.unconfirmed++;
  }

  // Coins we had as spendable that the chain no longer lists as unspent.
  const live = new Set(onChain.map((c) => `${c.txid}:${c.vout}`));
  const stale = await prisma.guildWalletCoin.findMany({
    where: { guildId, status: { in: ["UNCONFIRMED", "AVAILABLE"] } },
    select: { id: true, txid: true, vout: true },
  });
  for (const s of stale) {
    if (live.has(`${s.txid}:${s.vout}`)) continue;
    await prisma.guildWalletCoin.update({
      where: { id: s.id },
      data: { status: "SPENT" },
    });
    result.vanished++;
  }
  return result;
}
