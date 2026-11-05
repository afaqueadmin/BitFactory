/**
 * Keeps guild_wallet_coins in step with the chain for one guild: every
 * unspent output at its receiving address (0/0) and the change addresses
 * its payouts used (1/0 … 1/nextChangeIndex-1). A coin is AVAILABLE once it
 * has enough confirmations - GuildPayoutSettings.minConfirmations for money
 * coming in, 1 for our own change. A Luxor payout coin is linked to its
 * Luxor "Payment" row by txid (Luxor records the on-chain txid as
 * externalTransactionId).
 *
 * The guild's account is an ordinary Trezor account, so anyone with the
 * device can also send from it in Trezor Suite. A coin that disappears
 * without one of the app's payouts spending it is recorded as an
 * unexpected spend in the audit log.
 */

import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendGuildPayoutAlertEmail } from "@/lib/email";
import { DEFAULT_PAYOUT_CATEGORIES } from "@/lib/simulation/payouts";
import { getPayoutSettings } from "../payoutSettings";
import { CHANGE, RECEIVE, deriveAddress } from "./account";
import { addressCoins, tipHeight } from "./mempool";
import { guildAccountOf } from "./guildWallet";

export interface CoinSyncResult {
  seen: number;
  available: number;
  unconfirmed: number;
  /** Gone from the chain's unspent set without one of our payouts spending it. */
  vanished: number;
}

export async function syncGuildCoins(guildId: string): Promise<CoinSyncResult> {
  const settings = await getPayoutSettings();
  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: {
      name: true,
      trezorAccount: true,
      accountXpub: true,
      nextChangeIndex: true,
      createdById: true,
      poolAuth: { select: { authKey: true } },
    },
  });
  const acct = guildAccountOf(guild, settings);
  const network = acct.network;

  const addresses: { branch: number; index: number; address: string }[] = [
    {
      branch: RECEIVE,
      index: 0,
      address: deriveAddress(acct.xpub, network, RECEIVE, 0),
    },
  ];
  for (let k = 0; k < guild.nextChangeIndex; k++) {
    addresses.push({
      branch: CHANGE,
      index: k,
      address: deriveAddress(acct.xpub, network, CHANGE, k),
    });
  }

  const height = await tipHeight(network);
  const onChain: {
    txid: string;
    vout: number;
    sats: number;
    address: string;
    branch: number;
    index: number;
    confirmations: number;
    blockHeight: number | null;
    blockTime: Date | null;
  }[] = [];
  for (const a of addresses) {
    for (const c of await addressCoins(network, a.address)) {
      onChain.push({
        ...c,
        address: a.address,
        branch: a.branch,
        index: a.index,
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
        addressIndex: c.index,
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

  // Coins the chain no longer lists as unspent, that no payout of ours has
  // sent: spendable ones, and reserved ones whose payout isn't signed yet.
  const live = new Set(onChain.map((c) => `${c.txid}:${c.vout}`));
  const ours = await prisma.guildWalletCoin.findMany({
    where: {
      guildId,
      OR: [
        { status: { in: ["UNCONFIRMED", "AVAILABLE"] } },
        { status: "RESERVED", reservedByBatch: { txid: null } },
      ],
    },
    select: { id: true, txid: true, vout: true, sats: true, status: true },
  });
  const gone = ours.filter((s) => !live.has(`${s.txid}:${s.vout}`));
  if (gone.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const s of gone) {
        await tx.guildWalletCoin.update({
          where: { id: s.id },
          data: { status: "SPENT" },
        });
      }
      await tx.auditLog.create({
        data: {
          action: AuditAction.GUILD_PAYOUT_UNEXPECTED_SPEND,
          entityType: "Guild",
          entityId: guildId,
          userId: guild.createdById,
          description: `${gone.length} coin(s) left ${guild.name}'s Trezor account without a payout from the app (${(gone.reduce((s, c) => s + Number(c.sats), 0) / 1e8).toFixed(8)} BTC) - check Trezor Suite`,
          changes: JSON.stringify({
            coins: gone.map((c) => ({
              coin: `${c.txid}:${c.vout}`,
              sats: Number(c.sats),
              was: c.status,
            })),
          }),
        },
      });
    });
    result.vanished = gone.length;
    await sendGuildPayoutAlertEmail({
      title: `Coins left ${guild.name}'s Trezor account`,
      details: [
        `${gone.length} coin(s), ${(gone.reduce((s, c) => s + Number(c.sats), 0) / 1e8).toFixed(8)} BTC, were spent without a payout from the app.`,
        ...gone.map(
          (c) =>
            `${c.txid}:${c.vout} (${Number(c.sats)} sats, was ${c.status})`,
        ),
        "If nobody sent them from Trezor Suite on purpose, treat the Trezor or its recovery words as compromised.",
      ],
    }).catch(() => {});
  }
  return result;
}
