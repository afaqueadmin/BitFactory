/**
 * A guild's own account on the payout Trezor: setting it up, and loading it
 * for coin tracking and payouts.
 *
 * Set up Trezor wallet (guild page, Trezor plugged in): the browser reads
 * the next free account's public key and has the Trezor show its receiving
 * address (0/0) on its own screen. The server checks the device is the
 * connected payout Trezor, that it works out the same address from the key,
 * and that the account has never been used, then switches the guild to
 * TREZOR_BTC with that address as its Luxor payout address.
 */

import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayoutSettings } from "../payoutSettings";
import {
  MAX_GUILD_ACCOUNT,
  RECEIVE,
  accountPath,
  deriveAddress,
  receivingAddress,
} from "./account";
import { addressTxCount } from "./mempool";
import { isTrezorPayoutEnabled, payoutNetwork } from "./network";
import type { GuildAccount } from "./psbt";
import { isApprover } from "./device";

export class GuildWalletError extends Error {}

type Settings = Awaited<ReturnType<typeof getPayoutSettings>>;

/** The payout Trezor as connected, or an error saying what's missing. */
export function requireConnectedTrezor(settings: Settings) {
  const network = payoutNetwork();
  if (!isTrezorPayoutEnabled()) {
    throw new GuildWalletError("Trezor payouts aren't switched on here");
  }
  if (!settings.deviceFingerprint || !settings.sealAddress) {
    throw new GuildWalletError(
      "Connect the payout Trezor first (Guilds page → Payout Trezor)",
    );
  }
  if (settings.deviceNetwork !== network.name) {
    throw new GuildWalletError(
      `The payout Trezor was connected for ${settings.deviceNetwork}; connect it again for ${network.name}`,
    );
  }
  return {
    network,
    fingerprint: settings.deviceFingerprint,
    sealAddress: settings.sealAddress,
  };
}

/** A guild's account, for building and checking its payouts. */
export function guildAccountOf(
  guild: { trezorAccount: number | null; accountXpub: string | null },
  settings: Settings,
): GuildAccount {
  const { network, fingerprint } = requireConnectedTrezor(settings);
  if (guild.trezorAccount === null || !guild.accountXpub) {
    throw new GuildWalletError("This guild has no Trezor wallet");
  }
  return {
    network,
    account: guild.trezorAccount,
    xpub: guild.accountXpub,
    fingerprint,
  };
}

/** What the browser needs to set up the next guild wallet. */
export async function nextGuildAccount() {
  const settings = await getPayoutSettings();
  const { network, fingerprint } = requireConnectedTrezor(settings);
  return {
    network: network.name,
    coinType: network.coinType,
    account: settings.nextTrezorAccount,
    path: accountPath(network, settings.nextTrezorAccount),
    fingerprint,
  };
}

export async function setUpGuildWallet(params: {
  guildId: string;
  account: number;
  xpub: string;
  /** Master fingerprint read in the same session. */
  fingerprint: string;
  /** The receiving address the Trezor showed on its screen. */
  shownAddress: string;
  deviceLabel: string;
  actorId: string;
}) {
  const { guildId, account, xpub, fingerprint, shownAddress, actorId } = params;
  if (!(await isApprover(actorId))) {
    throw new GuildWalletError(
      "Only the named payout approvers can set up guild wallets",
    );
  }
  const settings = await getPayoutSettings();
  const trezor = requireConnectedTrezor(settings);
  const network = trezor.network;
  if (fingerprint !== trezor.fingerprint) {
    throw new GuildWalletError(
      `This Trezor (${fingerprint}) isn't the payout Trezor (${trezor.fingerprint}) - or a passphrase wallet is open`,
    );
  }
  if (account !== settings.nextTrezorAccount) {
    throw new GuildWalletError(
      `The next guild account is ${settings.nextTrezorAccount}; read it again`,
    );
  }
  if (account > MAX_GUILD_ACCOUNT) {
    throw new GuildWalletError("No account numbers are left for guilds");
  }
  const address = receivingAddress(xpub, network);
  if (address !== shownAddress) {
    throw new GuildWalletError(
      `The Trezor showed ${shownAddress}, but its key gives ${address} - don't use either`,
    );
  }
  // A fresh account only: nothing may have been paid to or from it yet.
  for (let i = 0; i < 5; i++) {
    if (
      (await addressTxCount(
        network,
        deriveAddress(xpub, network, RECEIVE, i),
      )) > 0
    ) {
      throw new GuildWalletError(
        `Account ${account} already has transactions - connect the payout Trezor again to pick a free number`,
      );
    }
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      trezorAccount: true,
      payoutAddress: true,
      payoutMethod: true,
      distributions: {
        where: {
          status: { in: ["CALCULATED", "HELD", "QUEUED", "BROADCAST"] },
        },
        select: { rewardMonth: true },
      },
    },
  });
  if (!guild) throw new GuildWalletError("Guild not found");
  if (guild.trezorAccount !== null) {
    throw new GuildWalletError("This guild already has a Trezor wallet");
  }
  if (guild.distributions.length > 0) {
    throw new GuildWalletError(
      `Send ${guild.distributions.map((d) => d.rewardMonth.toISOString().slice(0, 7)).join(", ")} first: a month is paid one way from start to finish`,
    );
  }
  const taken = await prisma.guild.findFirst({
    where: { payoutAddress: address, id: { not: guildId } },
    select: { name: true },
  });
  if (taken) {
    throw new GuildWalletError(`${taken.name} already uses ${address}`);
  }

  await prisma.$transaction(async (tx) => {
    // Claim the number, so two set-ups can't both take it.
    const claimed = await tx.guildPayoutSettings.updateMany({
      where: { id: 1, nextTrezorAccount: account },
      data: { nextTrezorAccount: account + 1, updatedById: actorId },
    });
    if (claimed.count !== 1) {
      throw new GuildWalletError("Another guild took that account meanwhile");
    }
    await tx.guild.update({
      where: { id: guildId },
      data: {
        trezorAccount: account,
        accountXpub: xpub,
        nextChangeIndex: 0,
        payoutAddress: address,
        payoutMethod: "TREZOR_BTC",
        walletSetUpAt: new Date(),
        walletSetUpById: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_TREZOR_WALLET_SET_UP,
        entityType: "Guild",
        entityId: guildId,
        userId: actorId,
        description: `Set up ${guild.name}'s Trezor wallet: account ${account} (${accountPath(network, account)}), receiving address ${address}, checked on ${params.deviceLabel}`,
        changes: JSON.stringify({
          before: {
            payoutAddress: guild.payoutAddress,
            payoutMethod: guild.payoutMethod,
          },
          after: {
            trezorAccount: account,
            accountXpub: xpub,
            payoutAddress: address,
            payoutMethod: "TREZOR_BTC",
          },
        }),
      },
    });
  });
  return { account, address };
}
