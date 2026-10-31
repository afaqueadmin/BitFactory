/**
 * Works out (or re-works) a guild's distribution for one reward month and
 * saves it. The numbers come from calculateDistribution (./distribution);
 * this file gathers its inputs from the database and stores the result.
 *
 * Reward month M-1 is paid by Luxor early in month M, to a Higgs wallet. That
 * payout pays the month-M hosting invoice (prepaid) plus anything still owed.
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchLiveBtcPrice } from "@/lib/services/btcPriceService";
import { DEFAULT_PAYOUT_CATEGORIES } from "@/lib/simulation/payouts";
import { startOfBillingMonth } from "@/lib/accounting/hostingMonths";
import { sendGuildShortfallEmail } from "@/lib/email";
import { effectivePayoutMethod, getPayoutSettings } from "./payoutSettings";
import {
  calculateDistribution,
  type DistributionInput,
  type DistributionResult,
} from "./distribution";
import { syncGuildCoins } from "./multisig/coins";
import {
  ensureMonthHostingInvoice,
  loadUnpaidHostingInvoices,
} from "./hostingInvoice";

export type RunDistributionResult =
  | { outcome: "no-subaccount" }
  | { outcome: "no-payout" }
  | { outcome: "already-sent"; distributionId: string }
  | {
      outcome: "saved";
      distributionId: string;
      status: string;
      calculation: DistributionResult;
    };

const nextMonth = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

export const formatRewardMonth = (month: Date) =>
  month.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });

export async function runGuildDistribution(params: {
  guildId: string;
  /** Any date in the month the reward was earned. */
  rewardMonth: Date;
  /** Staff member running it; the cron passes none. */
  actorId?: string;
  now?: Date;
  /**
   * Preparing a multisig payout: keep the rate the month was calculated at,
   * and charge the transaction's real fee.
   */
  btcUsdRate?: number;
  networkFeeBtc?: number;
}): Promise<RunDistributionResult> {
  const now = params.now ?? new Date();
  const rewardMonth = startOfBillingMonth(params.rewardMonth);
  const payoutMonth = nextMonth(rewardMonth);

  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: params.guildId },
    include: {
      poolAuth: { select: { authKey: true } },
      guildmaster: { select: { id: true, email: true } },
      // Active members, plus former members still owed a carried balance.
      memberships: {
        where: { OR: [{ leftAt: null }, { carriedBtc: { gt: 0 } }] },
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ isGuildmaster: "desc" }, { joinedAt: "asc" }],
      },
    },
  });
  if (!guild.poolAuth) return { outcome: "no-subaccount" };

  // The month's Luxor payout(s) for the guild subaccount.
  const payouts = await prisma.poolTransaction.findMany({
    where: {
      category: DEFAULT_PAYOUT_CATEGORIES.payment,
      transactionType: "debit",
      pool: { name: "Luxor" },
      poolSubaccount: { subaccountName: guild.poolAuth.authKey },
      occurredAt: { gte: payoutMonth, lt: nextMonth(payoutMonth) },
    },
    orderBy: { occurredAt: "asc" },
  });
  if (payouts.length === 0) return { outcome: "no-payout" };
  const payoutBtc = payouts.reduce(
    (sum, p) => sum + Math.abs(Number(p.amount)),
    0,
  );

  const existing = await prisma.guildDistribution.findUnique({
    where: { guildId_rewardMonth: { guildId: guild.id, rewardMonth } },
  });
  if (existing && !["CALCULATED", "HELD"].includes(existing.status)) {
    return { outcome: "already-sent", distributionId: existing.id };
  }

  const actorId = params.actorId ?? guild.createdById;
  await ensureMonthHostingInvoice({
    guildmasterId: guild.guildmasterId,
    guildName: guild.name,
    billingMonth: payoutMonth,
    createdById: actorId,
  });
  const unpaidInvoices = await loadUnpaidHostingInvoices({
    guildId: guild.id,
    guildmasterId: guild.guildmasterId,
    excludeDistributionId: existing?.id,
  });

  // Carried balances are only final once earlier months are sent, so a
  // later month waits for them.
  const earlierUnsent = await prisma.guildDistribution.findFirst({
    where: {
      guildId: guild.id,
      rewardMonth: { lt: rewardMonth },
      status: { not: "SETTLED" },
    },
    orderBy: { rewardMonth: "asc" },
    select: { rewardMonth: true },
  });

  const settings = await getPayoutSettings();
  const btcUsdRate = params.btcUsdRate ?? (await fetchLiveBtcPrice()).price;
  const multisig = effectivePayoutMethod(guild, settings) === "MULTISIG_BTC";

  // Multisig: the month is paid from the coins Luxor's payouts left at the
  // guild's address, so they must be there and confirmed.
  let receivedBtc = existing?.receivedBtc ? Number(existing.receivedBtc) : null;
  let receivedCoin: { txid: string; vout: number } | null = null;
  const multisigHolds: string[] = [];
  if (multisig) {
    try {
      await syncGuildCoins(guild.id);
    } catch (error) {
      multisigHolds.push(
        `Couldn't check the guild's address: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const coins = await prisma.guildWalletCoin.findMany({
      where: {
        poolTransactionId: { in: payouts.map((p) => p.id) },
        status: { in: ["AVAILABLE", "RESERVED"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (
      multisigHolds.length === 0 &&
      payouts.some((p) => !coins.some((c) => c.poolTransactionId === p.id))
    ) {
      multisigHolds.push(
        "Waiting for Luxor's payment to confirm at the guild's address",
      );
    }
    receivedBtc = multisigHolds.length
      ? null
      : coins.reduce((s, c) => s + Number(c.sats), 0) / 100_000_000;
    receivedCoin = coins[0]
      ? { txid: coins[0].txid, vout: coins[0].vout }
      : null;
  }

  const input: DistributionInput = {
    payoutBtc,
    btcUsdRate,
    unpaidInvoices,
    members: guild.memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name || m.user.email,
      isGuildmaster: m.isGuildmaster,
      percent: m.leftAt ? 0 : Number(m.rewardPercent),
      active: !m.leftAt,
      walletAddress: m.walletAddress,
      walletUpdatedAt: m.walletUpdatedAt,
      carriedInBtc: Number(m.carriedBtc),
    })),
    splitUpdatedAt: guild.splitUpdatedAt,
    now,
    minPayoutSats: settings.minPayoutSats,
    feePayer: settings.feePayer,
    // Sent by hand there's no network fee to share out; preparing a
    // multisig payout recalculates with its real fee.
    networkFeeBtc: params.networkFeeBtc ?? 0,
    receivedBtc,
    externalHolds: [
      ...(earlierUnsent
        ? [
            `Waiting for the ${formatRewardMonth(earlierUnsent.rewardMonth)} distribution to be sent first`,
          ]
        : []),
      ...multisigHolds,
    ],
  };
  let result = calculateDistribution(input);
  // Multisig: the fee comes out of the company output; if that can't cover
  // it, hold rather than have Higgs top it up from elsewhere.
  if (multisig && result.feeTopUpBtc > 0 && result.holdReasons.length === 0) {
    result = calculateDistribution({
      ...input,
      externalHolds: [
        ...(input.externalHolds ?? []),
        `The network fee (${result.networkFeeBtc.toFixed(8)} BTC) is more than the hosting share can cover`,
      ],
    });
  }

  const status = result.holdReasons.length > 0 ? "HELD" : "CALCULATED";
  const data = {
    payoutTransactionId: payouts[0].id,
    payoutOccurredAt: payouts[0].occurredAt,
    luxorPayoutBtc: new Prisma.Decimal(payoutBtc.toFixed(8)),
    ...(multisig
      ? {
          receivedBtc:
            receivedBtc === null
              ? null
              : new Prisma.Decimal(receivedBtc.toFixed(8)),
          receivedTxid: receivedCoin?.txid ?? null,
          receivedVout: receivedCoin?.vout ?? null,
        }
      : {}),
    btcUsdRate: new Prisma.Decimal(btcUsdRate.toFixed(2)),
    rateSource:
      params.btcUsdRate !== undefined && existing
        ? existing.rateSource
        : "live BTCUSDT (btcPriceService)",
    hostingDueUsd: new Prisma.Decimal(result.hostingDueUsd.toFixed(2)),
    companyBtc: new Prisma.Decimal(result.companyBtc.toFixed(8)),
    companyUsd: new Prisma.Decimal(result.companyUsd.toFixed(2)),
    netBtc: new Prisma.Decimal(result.netBtc.toFixed(8)),
    networkFeeBtc: new Prisma.Decimal(result.networkFeeBtc.toFixed(8)),
    shortfallUsd: new Prisma.Decimal(result.shortfallUsd.toFixed(2)),
    hostingAllocations: result.allocations as unknown as Prisma.InputJsonValue,
    status: status as "HELD" | "CALCULATED",
    holdReason: result.holdReasons.join("; ") || null,
  };

  const distribution = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.guildDistribution.update({ where: { id: existing.id }, data })
      : await tx.guildDistribution.create({
          data: { ...data, guildId: guild.id, rewardMonth },
        });
    await tx.guildDistributionLine.deleteMany({
      where: { distributionId: saved.id },
    });
    await tx.guildDistributionLine.createMany({
      data: result.shares.map((share) => {
        const m = guild.memberships.find((x) => x.id === share.membershipId)!;
        return {
          distributionId: saved.id,
          membershipId: share.membershipId,
          userId: share.userId,
          nameSnapshot: share.name,
          isGuildmaster: share.isGuildmaster,
          percentSnapshot: new Prisma.Decimal(share.percent.toFixed(4)),
          walletSnapshot: share.walletAddress,
          networkSnapshot: m.walletNetwork,
          btcAmount: new Prisma.Decimal(share.btcAmount.toFixed(8)),
          carriedInBtc: new Prisma.Decimal(share.carriedInBtc.toFixed(8)),
          paidBtc: new Prisma.Decimal(share.paidBtc.toFixed(8)),
          carriedOutBtc: new Prisma.Decimal(share.carriedOutBtc.toFixed(8)),
          carryReason: share.carryReason,
        };
      }),
    });
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_DISTRIBUTION_CALCULATED,
        entityType: "GuildDistribution",
        entityId: saved.id,
        userId: actorId,
        description: `${existing ? "Recalculated" : "Calculated"} ${formatRewardMonth(rewardMonth)} distribution for guild ${guild.name}${params.actorId ? "" : " (cron)"}: ${payoutBtc.toFixed(8)} BTC, ${result.companyBtc.toFixed(8)} BTC to hosting, ${status}`,
        changes: JSON.stringify({
          payoutBtc,
          btcUsdRate,
          hostingDueUsd: result.hostingDueUsd,
          companyUsd: result.companyUsd,
          shortfallUsd: result.shortfallUsd,
          holdReasons: result.holdReasons,
        }),
      },
    });
    return saved;
  });

  // Tell the admins and the Guildmaster once per distribution.
  if (result.shortfallUsd > 0 && !existing?.shortfallNotifiedAt) {
    const notice = {
      guildName: guild.name,
      rewardMonth: formatRewardMonth(rewardMonth),
      hostingDueUsd: result.hostingDueUsd,
      paidUsd: result.companyUsd,
      shortfallUsd: result.shortfallUsd,
    };
    await sendGuildShortfallEmail(notice);
    await sendGuildShortfallEmail({
      ...notice,
      email: guild.guildmaster.email,
    });
    await prisma.guildDistribution.update({
      where: { id: distribution.id },
      data: { shortfallNotifiedAt: new Date() },
    });
  }

  return {
    outcome: "saved",
    distributionId: distribution.id,
    status,
    calculation: result,
  };
}
