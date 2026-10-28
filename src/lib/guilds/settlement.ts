/**
 * Paying out guild distributions, in two steps:
 *
 *   1. sendPayoutBatch - one or more ready distributions go out as a single
 *      transfer (a GuildPayoutBatch): the company's hosting share to the
 *      company wallet and each member's paid amount to their wallet.
 *   2. confirmPayoutBatch - once the transfer has enough confirmations, the
 *      hosting payments are recorded against the invoices, carried balances
 *      move on, the distributions are SETTLED and everyone is emailed.
 *
 * Who moves the BTC is the settlement provider. "MANUAL": an admin sent it
 * outside the app and records the reference, which counts as confirmed at
 * once. The multisig provider (Phase 2b) builds, signs and broadcasts a real
 * transaction and reports its confirmations - nothing else here changes. A
 * smart-contract provider could be added the same way.
 */

import {
  AuditAction,
  GuildPayoutMethod,
  InvoiceStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendGuildShareSentEmail } from "@/lib/email";
import { parseAllocations } from "./hostingInvoice";
import { formatRewardMonth } from "./runDistribution";
import { effectivePayoutMethod, getPayoutSettings } from "./payoutSettings";
import { payoutTxUrl } from "./walletNetworks";

export interface SettlementProvider {
  method: GuildPayoutMethod;
  /** Sends the batch; returns its transaction id (or recorded reference). */
  submit(batchId: string): Promise<{ txid: string; feeBtc: number }>;
  /** How many confirmations the sent batch has. */
  confirmations(txid: string): Promise<number>;
}

/** The admin already sent it; `reference` is what they recorded. */
export function manualSettlement(reference: string): SettlementProvider {
  return {
    method: "MANUAL",
    submit: async () => ({ txid: reference, feeBtc: 0 }),
    confirmations: async () => Number.MAX_SAFE_INTEGER,
  };
}

export class SettlementError extends Error {}

const dec = (n: number) => new Prisma.Decimal(n.toFixed(8));

export async function sendPayoutBatch(params: {
  distributionIds: string[];
  actorId: string;
  provider: SettlementProvider;
}) {
  const { distributionIds, actorId, provider } = params;
  if (distributionIds.length === 0) {
    throw new SettlementError("Choose at least one distribution");
  }

  const [settings, distributions] = await Promise.all([
    getPayoutSettings(),
    prisma.guildDistribution.findMany({
      where: { id: { in: distributionIds } },
      include: {
        guild: { select: { name: true, payoutMethod: true } },
        lines: { select: { paidBtc: true } },
      },
    }),
  ]);
  if (distributions.length !== distributionIds.length) {
    throw new SettlementError("Distribution not found");
  }
  for (const d of distributions) {
    if (d.status !== "CALCULATED") {
      throw new SettlementError(
        d.status === "HELD"
          ? `${d.guild.name} is on hold: ${d.holdReason ?? "recalculate it first"}`
          : `${d.guild.name}'s ${formatRewardMonth(d.rewardMonth)} distribution isn't ready to send`,
      );
    }
    if (effectivePayoutMethod(d.guild, settings) !== provider.method) {
      throw new SettlementError(
        `${d.guild.name} is set to be paid another way`,
      );
    }
  }

  const companyBtc = distributions.reduce(
    (s, d) => s + Number(d.companyBtc) - Number(d.networkFeeBtc),
    0,
  );
  const paidBtc = distributions.reduce(
    (s, d) => s + d.lines.reduce((x, l) => x + Number(l.paidBtc), 0),
    0,
  );

  const batch = await prisma.$transaction(async (tx) => {
    const batch = await tx.guildPayoutBatch.create({
      data: {
        method: provider.method,
        companyBtc: dec(Math.max(0, companyBtc)),
        paidBtc: dec(paidBtc),
        createdById: actorId,
      },
    });
    // Claim them, so two sends can't both take the same distribution.
    const claimed = await tx.guildDistribution.updateMany({
      where: { id: { in: distributionIds }, status: "CALCULATED" },
      data: { status: "QUEUED", payoutBatchId: batch.id },
    });
    if (claimed.count !== distributionIds.length) {
      throw new SettlementError("A distribution was sent or changed meanwhile");
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_BATCH_CREATED,
        entityType: "GuildPayoutBatch",
        entityId: batch.id,
        userId: actorId,
        description: `Payout batch (${provider.method}) for ${distributions
          .map((d) => `${d.guild.name} ${formatRewardMonth(d.rewardMonth)}`)
          .join(", ")}`,
        changes: JSON.stringify({ distributionIds, companyBtc, paidBtc }),
      },
    });
    return batch;
  });

  let sent: { txid: string; feeBtc: number };
  try {
    sent = await provider.submit(batch.id);
    await prisma.$transaction([
      prisma.guildPayoutBatch.update({
        where: { id: batch.id },
        data: {
          status: "BROADCAST",
          txid: sent.txid,
          feeBtc: dec(sent.feeBtc),
          broadcastAt: new Date(),
        },
      }),
      prisma.guildDistribution.updateMany({
        where: { payoutBatchId: batch.id },
        data: { status: "BROADCAST" },
      }),
    ]);
  } catch (error) {
    // Nothing went out: put the distributions back.
    await prisma.$transaction([
      prisma.guildPayoutBatch.update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        },
      }),
      prisma.guildDistribution.updateMany({
        where: { payoutBatchId: batch.id },
        data: { status: "CALCULATED", payoutBatchId: null },
      }),
    ]);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SettlementError("That reference is already recorded");
    }
    throw error;
  }

  await confirmPayoutBatch({ batchId: batch.id, provider, actorId });
  return batch.id;
}

/**
 * Settles a sent batch once it has enough confirmations; otherwise just
 * records how many it has. Safe to call repeatedly.
 */
export async function confirmPayoutBatch(params: {
  batchId: string;
  provider: SettlementProvider;
  actorId: string;
}) {
  const { batchId, provider, actorId } = params;
  const [settings, batch] = await Promise.all([
    getPayoutSettings(),
    prisma.guildPayoutBatch.findUniqueOrThrow({ where: { id: batchId } }),
  ]);
  if (batch.status !== "BROADCAST" || !batch.txid) return false;

  const confirmations = await provider.confirmations(batch.txid);
  if (confirmations < settings.minConfirmations) {
    await prisma.guildPayoutBatch.update({
      where: { id: batchId },
      data: { confirmations },
    });
    return false;
  }

  const distributions = await prisma.guildDistribution.findMany({
    where: { payoutBatchId: batchId },
    include: {
      guild: { select: { name: true } },
      lines: {
        include: {
          user: { select: { email: true, name: true } },
          membership: { select: { walletNetwork: true } },
        },
      },
    },
  });
  const settledAt = new Date();
  const txid = batch.txid;

  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.guildPayoutBatch.updateMany({
        where: { id: batchId, status: "BROADCAST" },
        data: {
          status: "CONFIRMED",
          confirmations: Math.min(confirmations, 2_147_483_647),
          confirmedAt: settledAt,
        },
      });
      if (claimed.count === 0) {
        throw new SettlementError("It was confirmed meanwhile");
      }

      for (const d of distributions) {
        const rate = Number(d.btcUsdRate);
        const month = formatRewardMonth(d.rewardMonth);

        // The company share pays the hosting invoices it was earmarked for -
        // capped at what each still owes now, in case one was paid meanwhile.
        for (const allocation of parseAllocations(d.hostingAllocations)) {
          const invoice = await tx.invoice.findUnique({
            where: { id: allocation.invoiceId },
            include: { costPayments: { where: { isDeleted: false } } },
          });
          if (!invoice || invoice.status === InvoiceStatus.CANCELLED) continue;
          const paid = invoice.costPayments.reduce((s, p) => s + p.amount, 0);
          const owed =
            Math.round((Number(invoice.totalAmount) - paid) * 100) / 100;
          const amount = Math.min(allocation.amountUsd, owed);
          if (amount <= 0) continue;
          await tx.costPayment.create({
            data: {
              userId: invoice.userId,
              invoiceId: invoice.id,
              amount,
              consumption: 0,
              type: "PAYMENT",
              paymentDate: settledAt,
              narration: `Paid from guild ${d.guild.name}'s ${month} reward: ${(amount / rate).toFixed(8)} BTC at $${rate.toFixed(2)} (${batch.method}: ${txid})`,
            },
          });
          if (amount >= owed) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: InvoiceStatus.PAID, paidDate: settledAt },
            });
          }
        }

        // What wasn't sent stays owed to the member.
        for (const line of d.lines) {
          await tx.guildMembership.update({
            where: { id: line.membershipId },
            data: { carriedBtc: line.carriedOutBtc },
          });
        }

        await tx.guildDistribution.update({
          where: { id: d.id },
          data: { status: "SETTLED", settledAt },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.GUILD_DISTRIBUTION_SETTLED,
            entityType: "GuildDistribution",
            entityId: d.id,
            userId: actorId,
            description: `Settled ${month} distribution for guild ${d.guild.name} (${batch.method}: ${txid})`,
            changes: JSON.stringify({
              companyBtc: d.companyBtc.toString(),
              companyUsd: d.companyUsd.toString(),
              paidBtc: d.lines
                .reduce((s, l) => s + Number(l.paidBtc), 0)
                .toFixed(8),
              txid,
            }),
          },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  for (const d of distributions) {
    for (const line of d.lines) {
      const paid = Number(line.paidBtc);
      const carried = Number(line.carriedOutBtc);
      if (paid <= 0 && carried <= 0) continue;
      await sendGuildShareSentEmail({
        email: line.user.email,
        name: line.user.name,
        guildName: d.guild.name,
        rewardMonth: formatRewardMonth(d.rewardMonth),
        percent: Number(line.percentSnapshot),
        shareBtc: Number(line.btcAmount),
        paidBtc: paid,
        carriedOutBtc: carried,
        carryReason: line.carryReason,
        walletAddress: line.walletSnapshot,
        txUrl:
          paid > 0 ? payoutTxUrl(txid, line.membership.walletNetwork) : null,
      });
    }
  }
  return true;
}
