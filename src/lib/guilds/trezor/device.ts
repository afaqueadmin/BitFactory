/**
 * The payout Trezor as the app knows it (GuildPayoutSettings): which device
 * it is, the key wallet seals are checked against, the account number the
 * next guild gets, and who may approve payouts.
 *
 * Connecting: the browser reads, in one Trezor session, the master
 * fingerprint, the Native SegWit account keys 0 … n and the seal account's
 * key (see account.ts). The server checks which accounts have ever had a
 * transaction - Trezor Suite only creates an account once the one before it
 * has been used, so the first unused one ends the used run - and proposes
 * the first free number for guilds. The admin confirms it.
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayoutSettings } from "../payoutSettings";
import {
  MAX_GUILD_ACCOUNT,
  RECEIVE,
  deriveAddress,
  parseAccountXpub,
} from "./account";
import { addressTxCount } from "./mempool";
import {
  isTrezorPayoutEnabled,
  payoutNetwork,
  type PayoutNetwork,
} from "./network";

export class TrezorSetupError extends Error {}

type Tx = Prisma.TransactionClient;

/** Receiving addresses checked per account to tell whether it was used. */
const ADDRESSES_CHECKED = 5;

export interface AccountKey {
  account: number;
  xpub: string;
}

export interface ReadTrezor {
  /** Master fingerprint, 8 hex characters. */
  fingerprint: string;
  /** e.g. "Trezor Safe 5, firmware 2.12.3". */
  label: string;
  network: string;
  /** Accounts 0, 1, 2 … in order, as read from the device. */
  accounts: AccountKey[];
  /** The seal account's (100') key. */
  sealXpub: string;
}

async function audit(
  tx: Tx,
  actorId: string,
  action: AuditAction,
  description: string,
  changes: unknown,
) {
  await tx.auditLog.create({
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

function checkRead(read: ReadTrezor): PayoutNetwork {
  const network = payoutNetwork();
  if (read.network !== network.name) {
    throw new TrezorSetupError(
      `The Trezor was read for ${read.network}, but payouts here are on ${network.name}`,
    );
  }
  if (!/^[0-9a-f]{8}$/.test(read.fingerprint)) {
    throw new TrezorSetupError("The Trezor's fingerprint wasn't read");
  }
  if (read.accounts.length === 0) {
    throw new TrezorSetupError("No accounts were read from the Trezor");
  }
  read.accounts.forEach((a, i) => {
    if (a.account !== i) {
      throw new TrezorSetupError("The accounts must be read from 0 in order");
    }
    parseAccountXpub(a.xpub, network);
  });
  parseAccountXpub(read.sealXpub, network);
  return network;
}

async function accountUsed(
  network: PayoutNetwork,
  xpub: string,
): Promise<boolean> {
  const counts = await Promise.all(
    Array.from({ length: ADDRESSES_CHECKED }, (_, i) =>
      addressTxCount(network, deriveAddress(xpub, network, RECEIVE, i)),
    ),
  );
  return counts.some((n) => n > 0);
}

/** The highest account number a guild already has, or -1. */
async function highestGuildAccount(): Promise<number> {
  const top = await prisma.guild.findFirst({
    where: { trezorAccount: { not: null } },
    orderBy: { trezorAccount: "desc" },
    select: { trezorAccount: true },
  });
  return top?.trezorAccount ?? -1;
}

/**
 * Which of the read accounts were used, and the first number free for
 * guilds: after the used run, and after any guild's account.
 */
export async function inspectAccounts(read: ReadTrezor) {
  const network = checkRead(read);
  const used: number[] = [];
  let firstUnused: number | null = null;
  for (const a of read.accounts) {
    if (await accountUsed(network, a.xpub)) {
      used.push(a.account);
    } else {
      firstUnused = a.account;
      break;
    }
  }
  if (firstUnused === null) {
    throw new TrezorSetupError(
      `All ${read.accounts.length} accounts read have transactions - read more`,
    );
  }
  const proposed = Math.max(firstUnused, (await highestGuildAccount()) + 1);
  if (proposed > MAX_GUILD_ACCOUNT) {
    throw new TrezorSetupError("No account numbers are left for guilds");
  }
  return { used, firstUnused, proposed };
}

/**
 * Saves the payout Trezor. Once a guild has an account on it, only the
 * same device can be connected again (to record a firmware update).
 */
export async function connectPayoutTrezor(params: {
  read: ReadTrezor;
  nextTrezorAccount: number;
  actorId: string;
}) {
  const { read, nextTrezorAccount, actorId } = params;
  if (!isTrezorPayoutEnabled()) {
    throw new TrezorSetupError("Trezor payouts aren't switched on here");
  }
  const network = checkRead(read);
  const { proposed, used } = await inspectAccounts(read);
  if (
    !Number.isInteger(nextTrezorAccount) ||
    nextTrezorAccount < proposed ||
    nextTrezorAccount > MAX_GUILD_ACCOUNT
  ) {
    throw new TrezorSetupError(
      `Choose an account number from ${proposed} to ${MAX_GUILD_ACCOUNT}`,
    );
  }
  const sealAddress = deriveAddress(read.sealXpub, network, RECEIVE, 0);

  const settings = await getPayoutSettings();
  const guildsOnTrezor = await prisma.guild.count({
    where: { trezorAccount: { not: null } },
  });
  if (guildsOnTrezor > 0 && settings.deviceFingerprint) {
    if (settings.deviceFingerprint !== read.fingerprint) {
      throw new TrezorSetupError(
        `${guildsOnTrezor} guild(s) already have accounts on Trezor ${settings.deviceFingerprint} - connect that device`,
      );
    }
    if (settings.sealAddress !== sealAddress) {
      throw new TrezorSetupError(
        "This Trezor's seal key differs from the one saved - is a passphrase wallet open?",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.guildPayoutSettings.update({
      where: { id: 1 },
      data: {
        deviceFingerprint: read.fingerprint,
        deviceLabel: read.label.slice(0, 120),
        deviceNetwork: network.name,
        deviceConnectedAt: new Date(),
        deviceConnectedById: actorId,
        sealAddress,
        nextTrezorAccount,
        updatedById: actorId,
      },
    });
    await audit(
      tx,
      actorId,
      AuditAction.GUILD_PAYOUT_TREZOR_CONNECTED,
      `Payout Trezor ${read.fingerprint} connected (${read.label}, ${network.name}); guild accounts start at ${nextTrezorAccount}`,
      {
        before: {
          deviceFingerprint: settings.deviceFingerprint,
          sealAddress: settings.sealAddress,
          nextTrezorAccount: settings.nextTrezorAccount,
        },
        after: {
          deviceFingerprint: read.fingerprint,
          deviceLabel: read.label,
          sealAddress,
          nextTrezorAccount,
          usedAccounts: used,
        },
      },
    );
  });
  return { sealAddress, nextTrezorAccount };
}

/** Replaces the list of people who may prepare, sign and cancel payouts. */
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
    throw new TrezorSetupError("Approvers must be admins");
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

export async function setMaxFeeRate(rate: number, actorId: string) {
  if (!Number.isInteger(rate) || rate < 1 || rate > 1000) {
    throw new TrezorSetupError(
      "The fee cap must be a whole number from 1 to 1000 sat/vB",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.guildPayoutSettings.update({
      where: { id: 1 },
      data: { maxFeeRateSatVb: rate, updatedById: actorId },
    });
    await audit(
      tx,
      actorId,
      AuditAction.GUILD_PAYOUT_SETTINGS_UPDATED,
      `Guild payout fee cap set to ${rate} sat/vB`,
      { maxFeeRateSatVb: rate },
    );
  });
}

/** Everything the Payout Trezor card shows. */
export async function trezorStatus() {
  const network = payoutNetwork();
  const settings = await getPayoutSettings();
  const [approvers, guildsOnTrezor, connectedBy] = await Promise.all([
    prisma.guildPayoutApprover.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.guild.count({ where: { trezorAccount: { not: null } } }),
    settings.deviceConnectedById
      ? prisma.user.findUnique({
          where: { id: settings.deviceConnectedById },
          select: { name: true, email: true },
        })
      : null,
  ]);
  return {
    enabled: isTrezorPayoutEnabled(),
    network: network.name,
    coinType: network.coinType,
    maxGuildAccount: MAX_GUILD_ACCOUNT,
    device: settings.deviceFingerprint
      ? {
          fingerprint: settings.deviceFingerprint,
          label: settings.deviceLabel,
          network: settings.deviceNetwork,
          connectedAt: settings.deviceConnectedAt,
          connectedBy,
          sealAddress: settings.sealAddress,
        }
      : null,
    /** Connected for another network than this site runs on. */
    networkMismatch:
      !!settings.deviceNetwork && settings.deviceNetwork !== network.name,
    nextTrezorAccount: settings.nextTrezorAccount,
    guildsOnTrezor,
    approvers: approvers.map((a) => a.user),
    maxFeeRateSatVb: settings.maxFeeRateSatVb,
  };
}
