/**
 * The payout wallet as stored in GuildPayoutSettings: key A (encrypted), the
 * 2-of-3 descriptor, the network, and who may approve payouts.
 *
 * Setting up: generate key A here, read key B's public key from the Trezor
 * (or, on testnet, the software stand-in), add key C's public key, and save
 * the descriptor. Once any guild has an address from it, the descriptor is
 * locked - changing a key means a new wallet.
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayoutSettings } from "../payoutSettings";
import { appKeyPublic, generateAppKey } from "./appKey";
import {
  DescriptorError,
  RECEIVE,
  deriveAddress,
  parseDescriptor,
  type MultisigWallet,
} from "./descriptor";
import { isMultisigEnabled, payoutNetwork } from "./network";

export class WalletSetupError extends Error {}

type Settings = Awaited<ReturnType<typeof getPayoutSettings>>;

/** How many guilds have an address from the wallet (it's locked if any). */
export async function guildsOnWallet(): Promise<number> {
  return prisma.guild.count({ where: { payoutAddressIndex: { not: null } } });
}

/** The configured wallet, or null when it isn't set up (or is for another network). */
export function walletFromSettings(settings: Settings): MultisigWallet | null {
  const network = payoutNetwork();
  if (!settings.walletDescriptor || settings.network !== network.name) {
    return null;
  }
  return parseDescriptor(settings.walletDescriptor, network);
}

export async function requireWallet(): Promise<{
  settings: Settings;
  wallet: MultisigWallet;
}> {
  if (!isMultisigEnabled()) {
    throw new WalletSetupError("Multisig payouts aren't switched on here");
  }
  const settings = await getPayoutSettings();
  const wallet = walletFromSettings(settings);
  if (!wallet || !settings.appKeyEncrypted) {
    throw new WalletSetupError("The payout wallet isn't set up yet");
  }
  return { settings, wallet };
}

/** Which of the descriptor's keys is key A. */
export function appKeyFingerprint(settings: Settings): string | null {
  return settings.appKeyEncrypted
    ? appKeyPublic(settings.appKeyEncrypted).fingerprint
    : null;
}

/** What the setup screen shows. */
export async function walletStatus() {
  const settings = await getPayoutSettings();
  const network = payoutNetwork();
  const appKey = settings.appKeyEncrypted
    ? appKeyPublic(settings.appKeyEncrypted)
    : null;
  let wallet: MultisigWallet | null = null;
  let error: string | null = null;
  try {
    wallet = walletFromSettings(settings);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const approvers = await prisma.guildPayoutApprover.findMany({
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return {
    enabled: isMultisigEnabled(),
    network: network.name,
    storedNetwork: settings.network,
    appKey:
      appKey && appKey.network === network.name
        ? {
            fingerprint: appKey.fingerprint,
            originPath: appKey.originPath,
            xpub: appKey.xpub,
          }
        : null,
    descriptor: wallet?.descriptor ?? settings.walletDescriptor,
    keys:
      wallet?.keys.map((k) => ({
        fingerprint: k.fingerprint,
        originPath: k.originPath,
        xpub: k.xpub,
        isAppKey: k.fingerprint === appKey?.fingerprint,
      })) ?? [],
    error,
    guildsOnWallet: await guildsOnWallet(),
    approvers: approvers.map((a) => a.user),
    maxFeeRateSatVb: settings.maxFeeRateSatVb,
  };
}

function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: AuditAction,
  description: string,
  changes: unknown,
) {
  return tx.auditLog.create({
    data: {
      action,
      entityType: "GuildPayoutSettings",
      entityId: "1",
      userId: actorId,
      description,
      changes: JSON.stringify(changes),
    },
  });
}

/** Makes key A. Refused once a guild uses the wallet. */
export async function createAppKey(actorId: string) {
  if (!isMultisigEnabled()) {
    throw new WalletSetupError("Multisig payouts aren't switched on here");
  }
  if ((await guildsOnWallet()) > 0) {
    throw new WalletSetupError(
      "A guild already uses the wallet, so its keys can't change",
    );
  }
  const network = payoutNetwork();
  const { sealed, key } = generateAppKey(network);
  await prisma.$transaction(async (tx) => {
    await tx.guildPayoutSettings.update({
      where: { id: 1 },
      data: {
        appKeyEncrypted: sealed,
        // A new key A makes any saved descriptor stale.
        walletDescriptor: null,
        network: network.name,
        updatedById: actorId,
      },
    });
    await audit(
      tx,
      actorId,
      AuditAction.GUILD_PAYOUT_WALLET_CONFIGURED,
      `Payout wallet: new app key (key A) on ${network.name}`,
      { appKey: key },
    );
  });
  return key;
}

/** Saves the 2-of-3 descriptor, which must include key A. */
export async function saveDescriptor(text: string, actorId: string) {
  if (!isMultisigEnabled()) {
    throw new WalletSetupError("Multisig payouts aren't switched on here");
  }
  const settings = await getPayoutSettings();
  if (!settings.appKeyEncrypted) {
    throw new WalletSetupError("Create the app key first");
  }
  if ((await guildsOnWallet()) > 0) {
    throw new WalletSetupError(
      "A guild already uses the wallet, so its keys can't change",
    );
  }
  const network = payoutNetwork();
  let wallet: MultisigWallet;
  try {
    wallet = parseDescriptor(text, network);
  } catch (e) {
    if (e instanceof DescriptorError) throw new WalletSetupError(e.message);
    throw e;
  }
  const appKey = appKeyPublic(settings.appKeyEncrypted);
  if (appKey.network !== network.name) {
    throw new WalletSetupError(
      "The app key is for another network - create a new one",
    );
  }
  const a = wallet.keys.find((k) => k.xpub === appKey.xpub);
  if (
    !a ||
    a.fingerprint !== appKey.fingerprint ||
    a.originPath !== appKey.originPath
  ) {
    throw new WalletSetupError(
      "The descriptor must include the app key exactly as shown",
    );
  }
  if (
    new Set(wallet.keys.map((k) => k.fingerprint)).size !== wallet.keys.length
  ) {
    throw new WalletSetupError(
      "Each key must come from a different device or seed",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.guildPayoutSettings.update({
      where: { id: 1 },
      data: {
        walletDescriptor: wallet.descriptor,
        network: network.name,
        updatedById: actorId,
      },
    });
    await audit(
      tx,
      actorId,
      AuditAction.GUILD_PAYOUT_WALLET_CONFIGURED,
      `Payout wallet descriptor saved (${network.name})`,
      {
        before: settings.walletDescriptor,
        after: wallet.descriptor,
        firstReceiveAddress: deriveAddress(wallet, RECEIVE, 0).address,
      },
    );
  });
  return wallet;
}

/** Replaces the list of people who may prepare and sign payouts. */
export async function setApprovers(userIds: string[], actorId: string) {
  const ids = [...new Set(userIds)];
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      isDeleted: false,
    },
    select: { id: true, email: true },
  });
  if (users.length !== ids.length) {
    throw new WalletSetupError("Approvers must be admins");
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.guildPayoutApprover.findMany({
      include: { user: { select: { email: true } } },
    });
    await tx.guildPayoutApprover.deleteMany({
      where: { userId: { notIn: ids } },
    });
    for (const id of ids) {
      await tx.guildPayoutApprover.upsert({
        where: { userId: id },
        create: { userId: id, addedById: actorId },
        update: {},
      });
    }
    await audit(
      tx,
      actorId,
      AuditAction.GUILD_PAYOUT_APPROVERS_UPDATED,
      "Guild payout approvers updated",
      {
        before: before.map((a) => a.user.email),
        after: users.map((u) => u.email),
      },
    );
  });
}

export async function isApprover(userId: string): Promise<boolean> {
  return !!(await prisma.guildPayoutApprover.findUnique({
    where: { userId },
    select: { id: true },
  }));
}

/**
 * Gives a guild its own receiving address from the wallet and switches it
 * to multisig payouts. Only with no unsent distributions, so a month is
 * never half one method and half the other. The admin then sets the
 * address as the guild's Luxor payout address.
 */
export async function assignGuildAddress(guildId: string, actorId: string) {
  const { wallet } = await requireWallet();
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guild.findUniqueOrThrow({
      where: { id: guildId },
      select: { name: true, payoutAddress: true, payoutAddressIndex: true },
    });
    const unsent = await tx.guildDistribution.count({
      where: { guildId, status: { not: "SETTLED" } },
    });
    if (unsent > 0) {
      throw new WalletSetupError(
        "Send or settle every distribution first, then switch the guild",
      );
    }
    let index = guild.payoutAddressIndex;
    if (index === null) {
      // Claim the next index; the row lock keeps two guilds apart.
      const s = await tx.guildPayoutSettings.update({
        where: { id: 1 },
        data: { nextAddressIndex: { increment: 1 } },
      });
      index = s.nextAddressIndex - 1;
    }
    const address = deriveAddress(wallet, RECEIVE, index).address;
    await tx.guild.update({
      where: { id: guildId },
      data: {
        payoutAddressIndex: index,
        payoutAddress: address,
        payoutMethod: "MULTISIG_BTC",
      },
    });
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_UPDATED,
        entityType: "Guild",
        entityId: guildId,
        userId: actorId,
        description: `Guild ${guild.name} switched to multisig payouts, receiving address ${address} (index ${index})`,
        changes: JSON.stringify({
          before: {
            payoutAddress: guild.payoutAddress,
            payoutAddressIndex: guild.payoutAddressIndex,
          },
          after: {
            payoutAddress: address,
            payoutAddressIndex: index,
            payoutMethod: "MULTISIG_BTC",
          },
        }),
      },
    });
    return { index, address };
  });
}
