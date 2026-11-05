/**
 * Paying a guild's month from its own Trezor account, one transaction per
 * guild. The app never signs:
 *
 *   1. prepareTrezorPayout - recalculate the month with the transaction's
 *      real fee (keeping the rate it was calculated at), check every payee's
 *      wallet is sealed, and build the unsigned transaction from the guild's
 *      coins. It's parked as AWAITING_SIGNATURE (the payout request); the
 *      month is QUEUED and its coins RESERVED.
 *   2. submitTrezorSignatures - the Trezor's signatures from the browser go
 *      into the server's own copy of the transaction, which is checked again
 *      against the database (coins, payments, change back to the guild's
 *      account, seals) before it's broadcast. Any mismatch: nothing is sent,
 *      admins are alerted.
 *   3. checkTrezorConfirmations - once it has enough confirmations, the
 *      unchanged confirmPayoutBatch settles it (invoices, carried balances,
 *      emails).
 *
 * cancelTrezorPayout undoes step 1 while nothing is signed.
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendGuildPayoutAlertEmail } from "@/lib/email";
import { formatRewardMonth, runGuildDistribution } from "../runDistribution";
import { confirmPayoutBatch, type SettlementProvider } from "../settlement";
import { getPayoutSettings } from "../payoutSettings";
import { toSats } from "../distribution";
import { CHANGE } from "./account";
import { syncGuildCoins } from "./coins";
import { isApprover } from "./device";
import { guildAccountOf } from "./guildWallet";
import {
  broadcast,
  halfHourFeeRate,
  rawTransaction,
  txConfirmations,
} from "./mempool";
import { payoutNetwork } from "./network";
import {
  DUST_SATS,
  PayoutTxError,
  applySignatures,
  assertMatches,
  buildPayoutPsbt,
  changeAddress,
  estimateFeeSats,
  finalizePayout,
  psbtFromBase64,
  type PayoutOutput,
  type WalletCoin,
} from "./psbt";
import { assertPayeesSealed } from "./seals";

export class TrezorPayoutError extends Error {}

const btc = (sats: number) => new Prisma.Decimal((sats / 1e8).toFixed(8));
const OPEN_BATCH = ["AWAITING_SIGNATURE", "BROADCAST"] as const;

export function trezorSettlement(): SettlementProvider {
  const network = payoutNetwork();
  return {
    method: "TREZOR_BTC",
    submit: async () => {
      throw new TrezorPayoutError("Trezor payouts are sent by signing");
    },
    confirmations: async (txid) => (await txConfirmations(network, txid)) ?? 0,
  };
}

async function requireApprover(userId: string) {
  if (!(await isApprover(userId))) {
    throw new TrezorPayoutError(
      "Only the named payout approvers can prepare, sign or cancel payouts",
    );
  }
}

/**
 * The outputs a payout must have, in order: the company wallet, then each
 * member being paid. Used to build the transaction and to check it again
 * before broadcast, both times from the database.
 */
function payoutOutputs(
  companyAddress: string | null,
  companySats: number,
  lines: { walletSnapshot: string | null; paidBtc: Prisma.Decimal | number }[],
): PayoutOutput[] {
  const outputs: PayoutOutput[] = [];
  if (companySats > 0) {
    if (!companyAddress) {
      throw new TrezorPayoutError("Set the company wallet in Payout settings");
    }
    outputs.push({ address: companyAddress, sats: companySats });
  }
  for (const l of lines) {
    const sats = toSats(Number(l.paidBtc));
    if (sats <= 0) continue;
    if (!l.walletSnapshot) {
      throw new TrezorPayoutError("A member being paid has no wallet");
    }
    outputs.push({ address: l.walletSnapshot, sats });
  }
  return outputs;
}

const LINE_ORDER: Prisma.GuildDistributionLineOrderByWithRelationInput[] = [
  { isGuildmaster: "desc" },
  { id: "asc" },
];

const asWalletCoin = (c: {
  txid: string;
  vout: number;
  sats: bigint;
  branch: number;
  addressIndex: number;
}): WalletCoin => ({
  txid: c.txid,
  vout: c.vout,
  sats: Number(c.sats),
  branch: c.branch,
  index: c.addressIndex,
});

const sealLines = (
  lines: {
    membershipId: string;
    walletSnapshot: string | null;
    nameSnapshot: string;
    paidBtc: Prisma.Decimal;
  }[],
) =>
  lines.map((l) => ({
    membershipId: l.membershipId,
    walletSnapshot: l.walletSnapshot,
    nameSnapshot: l.nameSnapshot,
    paid: toSats(Number(l.paidBtc)) > 0,
  }));

export async function prepareTrezorPayout(params: {
  distributionId: string;
  actorId: string;
}) {
  const { distributionId, actorId } = params;
  await requireApprover(actorId);
  const settings = await getPayoutSettings();

  const distribution = await prisma.guildDistribution.findUniqueOrThrow({
    where: { id: distributionId },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          payoutMethod: true,
          trezorAccount: true,
          accountXpub: true,
          nextChangeIndex: true,
        },
      },
      lines: true,
    },
  });
  const { guild } = distribution;
  if (guild.payoutMethod !== "TREZOR_BTC") {
    throw new TrezorPayoutError(
      `${guild.name} isn't paid from a Trezor wallet`,
    );
  }
  const acct = guildAccountOf(guild, settings);
  if (distribution.status !== "CALCULATED") {
    throw new TrezorPayoutError(
      distribution.status === "HELD"
        ? `It's on hold: ${distribution.holdReason ?? "recalculate it first"}`
        : "It isn't ready to send",
    );
  }
  const open = await prisma.guildPayoutBatch.findFirst({
    where: { guildId: guild.id, status: { in: [...OPEN_BATCH] } },
    select: { id: true },
  });
  if (open) {
    throw new TrezorPayoutError(
      "This guild already has a payout waiting to be signed or confirmed",
    );
  }

  // The coins it spends: this month's Luxor payout(s), plus the change
  // that holds what's carried from earlier months.
  // (Luxor pays reward month M early in month M+1.)
  await syncGuildCoins(guild.id);
  const month = distribution.rewardMonth;
  const coins = await prisma.guildWalletCoin.findMany({
    where: {
      guildId: guild.id,
      status: "AVAILABLE",
      OR: [
        { source: "CHANGE" },
        {
          source: "LUXOR",
          poolTransaction: {
            occurredAt: {
              gte: new Date(
                Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
              ),
              lt: new Date(
                Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 2, 1),
              ),
            },
          },
        },
      ],
    },
    orderBy: [{ blockHeight: "asc" }, { txid: "asc" }, { vout: "asc" }],
  });
  const luxorSats = coins
    .filter((c) => c.source === "LUXOR")
    .reduce((s, c) => s + Number(c.sats), 0);
  const changeInSats = coins
    .filter((c) => c.source === "CHANGE")
    .reduce((s, c) => s + Number(c.sats), 0);
  if (luxorSats !== toSats(Number(distribution.luxorPayoutBtc))) {
    throw new TrezorPayoutError(
      `The guild's Trezor account holds ${(luxorSats / 1e8).toFixed(8)} BTC from Luxor for this month, but Luxor reports ${Number(distribution.luxorPayoutBtc).toFixed(8)} BTC`,
    );
  }
  const carriedInSats = distribution.lines.reduce(
    (s, l) => s + toSats(Number(l.carriedInBtc)),
    0,
  );
  if (changeInSats < carriedInSats) {
    throw new TrezorPayoutError(
      `Members are owed ${(carriedInSats / 1e8).toFixed(8)} BTC carried from earlier months, but the guild's change holds ${(changeInSats / 1e8).toFixed(8)} BTC (unconfirmed change waits for 1 confirmation). Send the difference, ${((carriedInSats - changeInSats) / 1e8).toFixed(8)} BTC, to the guild's receiving address and record it, or wait and prepare again`,
    );
  }
  if (changeInSats > carriedInSats + DUST_SATS) {
    throw new TrezorPayoutError(
      `The guild's change holds ${(changeInSats / 1e8).toFixed(8)} BTC, more than the ${(carriedInSats / 1e8).toFixed(8)} BTC carried`,
    );
  }
  // At most the 546-sat dust top-up from an earlier payout is extra; it
  // goes back out with this one's change or to the company.
  const changeExtraSats = changeInSats - carriedInSats;

  const feeRate = Math.min(
    await halfHourFeeRate(acct.network),
    settings.maxFeeRateSatVb,
  );
  const btcUsdRate = Number(distribution.btcUsdRate);
  const inSats = luxorSats + changeInSats;

  // The fee depends on how many outputs there are, and who's paid depends
  // on the fee - so settle it in a few rounds.
  let feeSats = 0;
  let plan: {
    outputs: PayoutOutput[];
    companySats: number;
    changeSats: number;
    topUpSats: number;
  } | null = null;
  for (let round = 0; round < 4; round++) {
    const run = await runGuildDistribution({
      guildId: guild.id,
      rewardMonth: distribution.rewardMonth,
      actorId,
      btcUsdRate,
      networkFeeBtc: feeSats / 1e8,
    });
    if (run.outcome !== "saved") {
      throw new TrezorPayoutError("The month couldn't be recalculated");
    }
    const calc = run.calculation;
    if (calc.holdReasons.length > 0) {
      throw new TrezorPayoutError(
        `It's on hold: ${calc.holdReasons.join("; ")}`,
      );
    }
    // An earlier dust top-up comes back to the company.
    let companySats = toSats(calc.companyOutputBtc) + changeExtraSats;
    let change = toSats(calc.carriedOutBtc);
    // Rule: carried change under the dust limit is topped up by Higgs from
    // the company output, so members never lose sats.
    let topUpSats = 0;
    if (change > 0 && change < DUST_SATS) {
      topUpSats = DUST_SATS - change;
      companySats -= topUpSats;
      change = DUST_SATS;
    }
    if (companySats > 0 && companySats < DUST_SATS) {
      throw new TrezorPayoutError(
        `The company's output would be ${companySats} sats, below Bitcoin's ${DUST_SATS}-sat minimum`,
      );
    }
    if (companySats < 0) {
      throw new TrezorPayoutError("The company output can't cover the fee");
    }
    const lines = await prisma.guildDistributionLine.findMany({
      where: { distributionId },
      orderBy: LINE_ORDER,
    });
    const outputs = payoutOutputs(
      settings.companyWalletAddress,
      companySats,
      lines,
    );
    const needed = estimateFeeSats({
      network: acct.network,
      inputCount: coins.length,
      outputAddresses: outputs.map((o) => o.address),
      withChange: change > 0,
      feeRateSatVb: feeRate,
    });
    plan = { outputs, companySats, changeSats: change, topUpSats };
    if (needed <= feeSats) break;
    feeSats = needed;
    plan = null;
  }
  if (!plan) throw new TrezorPayoutError("Couldn't settle the fee");

  // Inputs - outputs - change must be exactly the fee the month was
  // recalculated with.
  const outSats =
    plan.outputs.reduce((s, o) => s + o.sats, 0) + plan.changeSats;
  if (inSats - outSats !== feeSats) {
    throw new TrezorPayoutError(
      `The amounts don't add up: ${inSats} sats in, ${outSats} out, fee ${feeSats}`,
    );
  }

  // Only sealed wallets are paid.
  const lines = await prisma.guildDistributionLine.findMany({
    where: { distributionId },
    orderBy: LINE_ORDER,
  });
  await assertPayeesSealed({
    guildName: guild.name,
    companyPaid: plan.companySats > 0,
    lines: sealLines(lines),
  });

  const changeIndex = guild.nextChangeIndex;
  const psbt = buildPayoutPsbt({
    acct,
    coins: coins.map(asWalletCoin),
    outputs: plan.outputs,
    changeSats: plan.changeSats,
    changeIndex,
    feeSats,
  });

  const paidSats =
    plan.outputs.reduce((s, o) => s + o.sats, 0) - plan.companySats;
  const batch = await prisma.$transaction(async (tx) => {
    if (plan.changeSats > 0) {
      // Take the change address, so no other payout uses it.
      const took = await tx.guild.updateMany({
        where: { id: guild.id, nextChangeIndex: changeIndex },
        data: { nextChangeIndex: changeIndex + 1 },
      });
      if (took.count !== 1) {
        throw new TrezorPayoutError("Another payout was prepared meanwhile");
      }
    }
    const batch = await tx.guildPayoutBatch.create({
      data: {
        method: "TREZOR_BTC",
        status: "AWAITING_SIGNATURE",
        guildId: guild.id,
        psbt: psbt.toBase64(),
        changeIndex: plan.changeSats > 0 ? changeIndex : null,
        companyBtc: btc(plan.companySats),
        paidBtc: btc(paidSats),
        feeBtc: btc(feeSats),
        feeRateSatVb: new Prisma.Decimal(feeRate.toFixed(2)),
        createdById: actorId,
      },
    });
    const claimed = await tx.guildDistribution.updateMany({
      where: { id: distributionId, status: "CALCULATED" },
      data: { status: "QUEUED", payoutBatchId: batch.id },
    });
    if (claimed.count !== 1) {
      throw new TrezorPayoutError("It was sent or changed meanwhile");
    }
    const reserved = await tx.guildWalletCoin.updateMany({
      where: { id: { in: coins.map((c) => c.id) }, status: "AVAILABLE" },
      data: { status: "RESERVED", reservedByBatchId: batch.id },
    });
    if (reserved.count !== coins.length) {
      throw new TrezorPayoutError("A coin was used meanwhile");
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_PREPARED,
        entityType: "GuildPayoutBatch",
        entityId: batch.id,
        userId: actorId,
        description: `Prepared ${guild.name}'s ${formatRewardMonth(distribution.rewardMonth)} Trezor payout: ${plan.outputs.length} payment(s), fee ${feeSats} sats at ${feeRate} sat/vB - waiting for the Trezor`,
        changes: JSON.stringify({
          distributionId,
          coins: coins.map((c) => `${c.txid}:${c.vout}`),
          outputs: plan.outputs,
          changeSats: plan.changeSats,
          changeIndex: plan.changeSats > 0 ? changeIndex : null,
          dustTopUpSats: plan.topUpSats,
          feeSats,
          feeRate,
        }),
      },
    });
    return batch;
  });
  return { batchId: batch.id };
}

/** What a prepared batch must look like, rebuilt from the database. */
async function expectedFor(batchId: string) {
  const batch = await prisma.guildPayoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          trezorAccount: true,
          accountXpub: true,
        },
      },
      coinsReserved: true,
      distributions: { include: { lines: { orderBy: LINE_ORDER } } },
    },
  });
  if (batch.method !== "TREZOR_BTC" || !batch.guild || !batch.psbt) {
    throw new TrezorPayoutError("Not a Trezor payout");
  }
  if (batch.distributions.length !== 1) {
    throw new TrezorPayoutError("A Trezor payout pays exactly one month");
  }
  const settings = await getPayoutSettings();
  const acct = guildAccountOf(batch.guild, settings);
  const distribution = batch.distributions[0];
  const companySats = toSats(Number(batch.companyBtc));
  const outputs = payoutOutputs(
    settings.companyWalletAddress,
    companySats,
    distribution.lines,
  );
  // Before broadcast the coins are reserved by this batch; after, spent.
  const coins = (
    batch.coinsReserved.length > 0
      ? batch.coinsReserved
      : await prisma.guildWalletCoin.findMany({
          where: { spentByBatchId: batchId },
        })
  ).map(asWalletCoin);
  const inSats = coins.reduce((s, c) => s + c.sats, 0);
  const changeSats =
    inSats -
    outputs.reduce((s, o) => s + o.sats, 0) -
    toSats(Number(batch.feeBtc));
  const carriedOut = distribution.lines.reduce(
    (s, l) => s + toSats(Number(l.carriedOutBtc)),
    0,
  );
  // Change is what's carried, or the 546-sat minimum when less is carried.
  if (
    changeSats < carriedOut ||
    (changeSats > carriedOut && changeSats !== DUST_SATS)
  ) {
    throw new TrezorPayoutError(
      `The change (${changeSats} sats) doesn't match what's carried (${carriedOut} sats)`,
    );
  }
  if (changeSats > 0 && batch.changeIndex === null) {
    throw new TrezorPayoutError("The payout has change but no change address");
  }
  return {
    batch,
    acct,
    settings,
    distribution,
    expected: {
      coins,
      outputs,
      changeSats,
      changeIndex: batch.changeIndex ?? 0,
    },
  };
}

/** The prepared transaction for the Review and sign dialog. */
export async function loadPayoutForSigning(batchId: string) {
  const { batch, acct, settings, distribution, expected } =
    await expectedFor(batchId);
  const psbt = psbtFromBase64(batch.psbt!, acct.network);
  assertMatches(psbt, acct, expected);
  // When each paid wallet was approved and sealed, so a new one stands out.
  const memberships = await prisma.guildMembership.findMany({
    where: { id: { in: distribution.lines.map((l) => l.membershipId) } },
    select: {
      id: true,
      walletAddress: true,
      walletUpdatedAt: true,
      walletSealedAt: true,
    },
  });
  // Outputs follow payoutOutputs' order: company first, then paid members.
  const owners = [
    ...(toSats(Number(batch.companyBtc)) > 0 ? [null] : []),
    ...distribution.lines.filter((l) => toSats(Number(l.paidBtc)) > 0),
  ];
  // Addresses this guild's account has paid before (Suite shows them too).
  const earlier = await prisma.guildDistributionLine.findMany({
    where: {
      distribution: {
        guildId: batch.guild!.id,
        status: "SETTLED",
        payoutBatch: { method: "TREZOR_BTC" },
      },
      paidBtc: { gt: 0 },
    },
    select: { walletSnapshot: true },
  });
  const paidBefore = new Set(earlier.map((l) => l.walletSnapshot));
  return {
    batchId: batch.id,
    status: batch.status,
    txid: batch.txid,
    guildName: batch.guild!.name,
    trezorAccount: acct.account,
    rewardMonth: distribution.rewardMonth,
    psbt: batch.psbt!,
    network: acct.network.name,
    fingerprint: acct.fingerprint,
    deviceLabel: settings.deviceLabel,
    feeSats: toSats(Number(batch.feeBtc)),
    feeRateSatVb: Number(batch.feeRateSatVb),
    changeSats: expected.changeSats,
    changeAddress:
      expected.changeSats > 0
        ? changeAddress(acct, expected.changeIndex)
        : null,
    outputs: expected.outputs.map((o, i) => {
      const line = owners[i];
      const m = line && memberships.find((x) => x.id === line.membershipId);
      return {
        ...o,
        label: line ? line.nameSnapshot : "Company wallet (hosting)",
        walletApprovedAt:
          m && m.walletAddress === o.address ? m.walletUpdatedAt : null,
        sealedAt: line
          ? m && m.walletAddress === o.address
            ? m.walletSealedAt
            : null
          : settings.companyWalletSealedAt,
        paidBefore: paidBefore.has(o.address),
      };
    }),
    // The Trezor checks input amounts against these.
    prevTxs:
      batch.status === "AWAITING_SIGNATURE" && !batch.txid
        ? Object.fromEntries(
            await Promise.all(
              [...new Set(expected.coins.map((c) => c.txid))].map(
                async (txid) =>
                  [txid, await rawTransaction(acct.network, txid)] as const,
              ),
            ),
          )
        : {},
  };
}

/**
 * Takes the Trezor's signatures, puts them into the server's own copy of
 * the prepared transaction, checks it all against the database once more,
 * and broadcasts it. Anything that doesn't match: nothing is sent, the
 * payout stays waiting, and admins are alerted.
 */
export async function submitTrezorSignatures(params: {
  batchId: string;
  signatures: string[];
  /** The master fingerprint read from the device that signed. */
  fingerprint: string;
  signerDevice: string;
  actorId: string;
}) {
  const { batchId, signatures, fingerprint, signerDevice, actorId } = params;
  await requireApprover(actorId);
  const { batch, acct, distribution, expected } = await expectedFor(batchId);
  if (batch.status !== "AWAITING_SIGNATURE") {
    throw new TrezorPayoutError("This payout isn't waiting for a signature");
  }
  if (batch.txid) {
    throw new TrezorPayoutError(
      "It's already signed - check its confirmations",
    );
  }
  if (fingerprint !== acct.fingerprint) {
    throw new TrezorPayoutError(
      `This Trezor (${fingerprint}) isn't the payout Trezor (${acct.fingerprint})`,
    );
  }

  const month = formatRewardMonth(distribution.rewardMonth);
  let hex: string;
  let txid: string;
  try {
    const ours = psbtFromBase64(batch.psbt!, acct.network);
    applySignatures(ours, acct, signatures);
    // Never trust the browser: the transaction must still be exactly what
    // the database says, to sealed wallets only.
    assertMatches(ours, acct, expected);
    await assertPayeesSealed({
      guildName: batch.guild!.name,
      companyPaid: toSats(Number(batch.companyBtc)) > 0,
      lines: sealLines(distribution.lines),
    });
    ({ hex, txid } = finalizePayout(ours));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await prisma.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_SIGNED,
        entityType: "GuildPayoutBatch",
        entityId: batchId,
        userId: actorId,
        description: `REFUSED ${batch.guild!.name}'s ${month} signed payout - nothing was sent: ${reason}`,
        changes: JSON.stringify({ refused: true, reason, signerDevice }),
      },
    });
    await sendGuildPayoutAlertEmail({
      title: `Signed payout refused for ${batch.guild!.name}`,
      details: [
        `${month} payout, signed on ${signerDevice}.`,
        `The server refused it and sent nothing: ${reason}`,
        "Cancel the payout on the guild page and prepare it again. If it happens again, stop and investigate.",
      ],
    }).catch(() => {});
    throw new TrezorPayoutError(
      `The signed payout doesn't match what was prepared - nothing was sent. ${reason}`,
    );
  }

  // Record it before broadcasting, so a broadcast that succeeds but whose
  // reply is lost is still found by the confirmation check.
  await prisma.$transaction(async (tx) => {
    const saved = await tx.guildPayoutBatch.updateMany({
      where: { id: batchId, status: "AWAITING_SIGNATURE", txid: null },
      data: {
        txid,
        signedById: actorId,
        signedAt: new Date(),
        signerDevice: signerDevice.slice(0, 200),
      },
    });
    if (saved.count !== 1)
      throw new TrezorPayoutError("It was signed meanwhile");
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_SIGNED,
        entityType: "GuildPayoutBatch",
        entityId: batchId,
        userId: actorId,
        description: `Signed ${batch.guild!.name}'s ${month} payout on ${signerDevice} (Trezor ${fingerprint})`,
        changes: JSON.stringify({ txid, fingerprint, signerDevice }),
      },
    });
  });

  return broadcastSigned(batchId, hex, txid, actorId);
}

async function broadcastSigned(
  batchId: string,
  hex: string,
  txid: string,
  actorId: string,
) {
  const network = payoutNetwork();
  let sentTxid: string;
  try {
    sentTxid = await broadcast(network, hex);
  } catch (error) {
    // Already in the mempool or a block counts as sent.
    const known = await txConfirmations(network, txid).catch(() => null);
    if (known === null) {
      throw new TrezorPayoutError(
        `Broadcast failed, nothing was sent yet: ${error instanceof Error ? error.message : String(error)}. Check now tries again`,
      );
    }
    sentTxid = txid;
  }
  if (sentTxid !== txid) {
    throw new TrezorPayoutError(
      `mempool.space answered with another txid (${sentTxid})`,
    );
  }
  await markBroadcast(batchId, actorId);
  return { batchId, txid: sentTxid };
}

/** Signed and accepted by the network: it's out. */
async function markBroadcast(batchId: string, actorId: string | null) {
  const settings = await getPayoutSettings();
  const batch = await prisma.guildPayoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          trezorAccount: true,
          accountXpub: true,
        },
      },
      distributions: { include: { lines: { orderBy: LINE_ORDER } } },
    },
  });
  const acct = guildAccountOf(batch.guild!, settings);
  const psbt = psbtFromBase64(batch.psbt!, acct.network);
  const outs = psbt.txOutputs;
  const change =
    batch.changeIndex === null ? null : changeAddress(acct, batch.changeIndex);
  const d = batch.distributions[0];
  // Which output paid each member: the outputs follow payoutOutputs' order.
  const paidLines = d.lines.filter((l) => toSats(Number(l.paidBtc)) > 0);
  const firstMemberVout = toSats(Number(batch.companyBtc)) > 0 ? 1 : 0;

  await prisma.$transaction(async (tx) => {
    const moved = await tx.guildPayoutBatch.updateMany({
      where: { id: batchId, status: "AWAITING_SIGNATURE" },
      data: { status: "BROADCAST", broadcastAt: new Date() },
    });
    if (moved.count !== 1) return;
    await tx.guildDistribution.updateMany({
      where: { payoutBatchId: batchId },
      data: { status: "BROADCAST" },
    });
    for (const [i, line] of paidLines.entries()) {
      await tx.guildDistributionLine.update({
        where: { id: line.id },
        data: { payoutVout: firstMemberVout + i },
      });
    }
    await tx.guildWalletCoin.updateMany({
      where: { reservedByBatchId: batchId, status: "RESERVED" },
      data: { status: "SPENT", spentByBatchId: batchId },
    });
    // The change is always the last output, with its key path.
    const last = outs.length - 1;
    const changeVout =
      change && psbt.data.outputs[last]?.bip32Derivation?.length ? last : -1;
    if (change && changeVout >= 0) {
      await tx.guildWalletCoin.upsert({
        where: { txid_vout: { txid: batch.txid!, vout: changeVout } },
        create: {
          guildId: batch.guild!.id,
          txid: batch.txid!,
          vout: changeVout,
          sats: outs[changeVout].value,
          address: change,
          branch: CHANGE,
          addressIndex: batch.changeIndex!,
          source: "CHANGE",
          status: "UNCONFIRMED",
        },
        update: {},
      });
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_BROADCAST,
        entityType: "GuildPayoutBatch",
        entityId: batchId,
        userId: actorId ?? batch.signedById ?? batch.createdById!,
        description: `Broadcast ${batch.guild!.name}'s ${formatRewardMonth(d.rewardMonth)} payout: ${batch.txid}`,
        changes: JSON.stringify({ txid: batch.txid }),
      },
    });
  });
}

/** Cancels a prepared payout that isn't signed yet. */
export async function cancelTrezorPayout(batchId: string, actorId: string) {
  await requireApprover(actorId);
  await prisma.$transaction(async (tx) => {
    const batch = await tx.guildPayoutBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { guild: { select: { id: true, name: true } } },
    });
    const cancelled = await tx.guildPayoutBatch.updateMany({
      where: { id: batchId, status: "AWAITING_SIGNATURE", txid: null },
      data: {
        status: "CANCELLED",
        cancelledById: actorId,
        cancelledAt: new Date(),
      },
    });
    if (cancelled.count !== 1) {
      throw new TrezorPayoutError(
        "Only a payout that isn't signed yet can be cancelled",
      );
    }
    await tx.guildDistribution.updateMany({
      where: { payoutBatchId: batchId, status: "QUEUED" },
      data: { status: "CALCULATED", payoutBatchId: null },
    });
    await tx.guildWalletCoin.updateMany({
      where: { reservedByBatchId: batchId, status: "RESERVED" },
      data: { status: "AVAILABLE", reservedByBatchId: null },
    });
    // Give back its change address if nothing took a later one, so unused
    // change addresses don't pile up (Trezor Suite looks 20 ahead).
    if (batch.guild && batch.changeIndex !== null) {
      await tx.guild.updateMany({
        where: { id: batch.guild.id, nextChangeIndex: batch.changeIndex + 1 },
        data: { nextChangeIndex: batch.changeIndex },
      });
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_CANCELLED,
        entityType: "GuildPayoutBatch",
        entityId: batchId,
        userId: actorId,
        description: `Cancelled ${batch.guild?.name ?? "a guild"}'s prepared payout before signing`,
      },
    });
  });
}

/**
 * Hourly job and the "Check now" button: finds signed payouts the network
 * has accepted, and settles those with enough confirmations.
 */
export async function checkTrezorConfirmations(actorId?: string) {
  const network = payoutNetwork();
  const provider = trezorSettlement();
  const results: {
    batchId: string;
    status: string;
    confirmations: number | null;
  }[] = [];

  // Signed, but the broadcast's reply was lost (or the broadcast failed):
  // it's out once the network knows it.
  const signed = await prisma.guildPayoutBatch.findMany({
    where: {
      method: "TREZOR_BTC",
      status: "AWAITING_SIGNATURE",
      txid: { not: null },
    },
    select: { id: true, txid: true },
  });
  for (const b of signed) {
    const n = await txConfirmations(network, b.txid!);
    if (n !== null) await markBroadcast(b.id, actorId ?? null);
  }

  const sent = await prisma.guildPayoutBatch.findMany({
    where: { method: "TREZOR_BTC", status: "BROADCAST" },
    select: { id: true, guildId: true, createdById: true },
  });
  for (const b of sent) {
    const settled = await confirmPayoutBatch({
      batchId: b.id,
      provider,
      actorId: actorId ?? b.createdById!,
    });
    const after = await prisma.guildPayoutBatch.findUniqueOrThrow({
      where: { id: b.id },
      select: { status: true, confirmations: true },
    });
    results.push({
      batchId: b.id,
      status: after.status,
      confirmations: after.confirmations,
    });
    // The change becomes spendable once confirmed.
    if (settled && b.guildId) await syncGuildCoins(b.guildId).catch(() => {});
  }
  return results;
}

export { PayoutTxError };
