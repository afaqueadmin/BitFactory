/**
 * Wallet seals (plan: "Stopping address swaps", layer 1). The payout
 * Trezor's seal key signs a short message naming a guild, a member and
 * their wallet, after the approver checked the address on the device
 * screen against what the Guildmaster confirmed. A Trezor payout pays only
 * sealed addresses, so someone who can change the database - but doesn't
 * have the Trezor - can't redirect a payout.
 *
 * The company wallet is sealed the same way, as "All guilds".
 */

import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPayoutSettings } from "../payoutSettings";
import { sealMessage, sealPath, sealedAddress, verifySeal } from "./account";
import { isApprover } from "./device";
import { GuildWalletError, requireConnectedTrezor } from "./guildWallet";
import type { PayoutNetwork } from "./network";

export const COMPANY = "company";
export const COMPANY_GUILD = "All guilds";
export const COMPANY_HOLDER = "Company wallet (hosting)";

type Settings = Awaited<ReturnType<typeof getPayoutSettings>>;

export function isSealValid(params: {
  message: string | null;
  signature: string | null;
  address: string | null;
  guildName: string;
  sealAddress: string | null;
  network: PayoutNetwork;
}): boolean {
  const { message, signature, address, sealAddress } = params;
  if (!message || !signature || !address || !sealAddress) return false;
  if (sealedAddress(message) !== address) return false;
  if (message.split("\n")[1] !== `Guild: ${params.guildName}`) return false;
  return verifySeal({
    message,
    signatureB64: signature,
    sealAddress,
    network: params.network,
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export interface SealTarget {
  /** A membership id, or "company". */
  key: string;
  holder: string;
  address: string;
  sealed: boolean;
  sealedAt: Date | null;
  /** What the Trezor signs, when it isn't sealed yet. */
  message: string | null;
}

/** Every wallet a guild's payouts can go to, and whether it's sealed. */
export async function sealTargets(guildId: string) {
  const settings = await getPayoutSettings();
  const { network, sealAddress } = requireConnectedTrezor(settings);
  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: {
      name: true,
      memberships: {
        where: { leftAt: null, walletAddress: { not: null } },
        orderBy: [{ isGuildmaster: "desc" }, { joinedAt: "asc" }],
        select: {
          id: true,
          walletAddress: true,
          walletSealMessage: true,
          walletSealSignature: true,
          walletSealedAt: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  const targets: SealTarget[] = guild.memberships.map((m) => {
    const sealed = isSealValid({
      message: m.walletSealMessage,
      signature: m.walletSealSignature,
      address: m.walletAddress,
      guildName: guild.name,
      sealAddress,
      network,
    });
    const holder = m.user.name || m.user.email;
    return {
      key: m.id,
      holder,
      address: m.walletAddress!,
      sealed,
      sealedAt: sealed ? m.walletSealedAt : null,
      message: sealed
        ? null
        : sealMessage({
            guildName: guild.name,
            holder,
            address: m.walletAddress!,
            approvedOn: today(),
          }),
    };
  });
  if (settings.companyWalletAddress) {
    const sealed = companySealed(settings, network, sealAddress);
    targets.unshift({
      key: COMPANY,
      holder: COMPANY_HOLDER,
      address: settings.companyWalletAddress,
      sealed,
      sealedAt: sealed ? settings.companyWalletSealedAt : null,
      message: sealed
        ? null
        : sealMessage({
            guildName: COMPANY_GUILD,
            holder: COMPANY_HOLDER,
            address: settings.companyWalletAddress,
            approvedOn: today(),
          }),
    });
  }
  return {
    network: network.name,
    coinType: network.coinType,
    sealPath: sealPath(network),
    sealAddress,
    targets,
  };
}

function companySealed(
  settings: Settings,
  network: PayoutNetwork,
  sealAddress: string,
) {
  return isSealValid({
    message: settings.companyWalletSealMessage,
    signature: settings.companyWalletSealSignature,
    address: settings.companyWalletAddress,
    guildName: COMPANY_GUILD,
    sealAddress,
    network,
  });
}

/** Saves seals signed on the Trezor; each is checked before it's kept. */
export async function saveSeals(params: {
  guildId: string;
  seals: { key: string; message: string; signature: string }[];
  actorId: string;
}) {
  const { guildId, seals, actorId } = params;
  if (!(await isApprover(actorId))) {
    throw new GuildWalletError(
      "Only the named payout approvers can seal wallets",
    );
  }
  if (seals.length === 0) throw new GuildWalletError("Nothing to seal");
  const settings = await getPayoutSettings();
  const { network, sealAddress } = requireConnectedTrezor(settings);
  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: {
      name: true,
      memberships: {
        where: { leftAt: null },
        select: {
          id: true,
          walletAddress: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  const now = new Date();
  const saved: { holder: string; address: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const seal of seals) {
      const company = seal.key === COMPANY;
      const member = company
        ? null
        : guild.memberships.find((m) => m.id === seal.key);
      if (!company && !member) {
        throw new GuildWalletError("That member isn't in this guild");
      }
      const address = company
        ? settings.companyWalletAddress
        : member!.walletAddress;
      const holder = company
        ? COMPANY_HOLDER
        : member!.user.name || member!.user.email;
      if (
        !isSealValid({
          message: seal.message,
          signature: seal.signature,
          address,
          guildName: company ? COMPANY_GUILD : guild.name,
          sealAddress,
          network,
        })
      ) {
        throw new GuildWalletError(
          `The seal for ${holder} doesn't check out against the payout Trezor's seal key and the current wallet - nothing was saved`,
        );
      }
      if (company) {
        await tx.guildPayoutSettings.update({
          where: { id: 1 },
          data: {
            companyWalletSealMessage: seal.message,
            companyWalletSealSignature: seal.signature,
            companyWalletSealedAt: now,
            companyWalletSealedById: actorId,
          },
        });
      } else {
        // Only if the wallet is still the one that was sealed.
        const updated = await tx.guildMembership.updateMany({
          where: { id: member!.id, walletAddress: address },
          data: {
            walletSealMessage: seal.message,
            walletSealSignature: seal.signature,
            walletSealedAt: now,
            walletSealedById: actorId,
          },
        });
        if (updated.count !== 1) {
          throw new GuildWalletError(
            `${holder}'s wallet changed meanwhile - seal it again`,
          );
        }
      }
      saved.push({ holder, address: address! });
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_WALLET_SEALED,
        entityType: "Guild",
        entityId: guildId,
        userId: actorId,
        description: `Sealed ${saved.length} wallet(s) for ${guild.name} with the payout Trezor: ${saved.map((s) => `${s.holder} ${s.address}`).join(", ")}`,
        changes: JSON.stringify({ sealed: saved, sealAddress }),
      },
    });
  });
  return { sealed: saved.length };
}

/**
 * Refuses a payout to any unsealed address: the company wallet (when it's
 * paid) and every member being paid. Run when preparing and again before
 * broadcasting.
 */
export async function assertPayeesSealed(params: {
  guildName: string;
  companyPaid: boolean;
  lines: {
    membershipId: string;
    walletSnapshot: string | null;
    nameSnapshot: string;
    paid: boolean;
  }[];
}) {
  const settings = await getPayoutSettings();
  const { network, sealAddress } = requireConnectedTrezor(settings);
  const unsealed: string[] = [];
  if (params.companyPaid && !companySealed(settings, network, sealAddress)) {
    unsealed.push(COMPANY_HOLDER);
  }
  const paid = params.lines.filter((l) => l.paid);
  const memberships = await prisma.guildMembership.findMany({
    where: { id: { in: paid.map((l) => l.membershipId) } },
    select: {
      id: true,
      walletAddress: true,
      walletSealMessage: true,
      walletSealSignature: true,
    },
  });
  for (const l of paid) {
    const m = memberships.find((x) => x.id === l.membershipId);
    const ok =
      !!m &&
      m.walletAddress === l.walletSnapshot &&
      isSealValid({
        message: m.walletSealMessage,
        signature: m.walletSealSignature,
        address: l.walletSnapshot,
        guildName: params.guildName,
        sealAddress,
        network,
      });
    if (!ok) unsealed.push(l.nameSnapshot);
  }
  if (unsealed.length > 0) {
    throw new GuildWalletError(
      `Not sealed by the payout Trezor: ${unsealed.join(", ")}. Seal the wallets on the guild page (Payout section → Seal wallets with Trezor), then prepare again`,
    );
  }
}
