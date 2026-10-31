/**
 * Paying a guild's month from the 2-of-3 wallet, one transaction per guild:
 *
 *   1. prepareMultisigPayout - recalculate the month with the transaction's
 *      real fee (keeping the rate it was calculated at), build the
 *      transaction from the guild's coins, sign it with key A and park it as
 *      AWAITING_SIGNATURE. The month is QUEUED and its coins RESERVED.
 *   2. submitApproverSignature - the approver's signature (the Trezor in the
 *      browser, or the testnet stand-in) is merged in, the transaction is
 *      checked again against the database, then finalised and broadcast.
 *   3. checkMultisigConfirmations - once it has enough confirmations, the
 *      unchanged confirmPayoutBatch settles it (invoices, carried balances,
 *      emails).
 *
 * cancelMultisigPayout undoes step 1 while nothing is signed.
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatRewardMonth, runGuildDistribution } from "../runDistribution";
import { confirmPayoutBatch, type SettlementProvider } from "../settlement";
import { toSats } from "../distribution";
import { openAppKey } from "./appKey";
import { syncGuildCoins } from "./coins";
import { CHANGE, deriveAddress } from "./descriptor";
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
  accountFromXprv,
  assertMatches,
  buildPayoutPsbt,
  estimateFeeSats,
  finalizePayout,
  hasValidSignatures,
  mergeSignatures,
  psbtFromBase64,
  signWithAccountKey,
  type PayoutOutput,
  type WalletCoin,
} from "./psbt";
import { appKeyFingerprint, isApprover, requireWallet } from "./wallet";

export class MultisigPayoutError extends Error {}

const btc = (sats: number) => new Prisma.Decimal((sats / 1e8).toFixed(8));
const OPEN_BATCH = ["AWAITING_SIGNATURE", "BROADCAST"] as const;

export function multisigSettlement(): SettlementProvider {
  const network = payoutNetwork();
  return {
    method: "MULTISIG_BTC",
    submit: async () => {
      throw new MultisigPayoutError("Multisig payouts are sent by signing");
    },
    confirmations: async (txid) => (await txConfirmations(network, txid)) ?? 0,
  };
}

async function requireApprover(userId: string) {
  if (!(await isApprover(userId))) {
    throw new MultisigPayoutError(
      "Only the named payout approvers can prepare or sign payouts",
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
      throw new MultisigPayoutError(
        "Set the company wallet in Payout settings",
      );
    }
    outputs.push({ address: companyAddress, sats: companySats });
  }
  for (const l of lines) {
    const sats = toSats(Number(l.paidBtc));
    if (sats <= 0) continue;
    if (!l.walletSnapshot) {
      throw new MultisigPayoutError("A member being paid has no wallet");
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
  branch: c.branch === CHANGE ? CHANGE : 0,
  index: c.addressIndex,
});

export async function prepareMultisigPayout(params: {
  distributionId: string;
  actorId: string;
}) {
  const { distributionId, actorId } = params;
  await requireApprover(actorId);
  const { settings, wallet } = await requireWallet();

  const distribution = await prisma.guildDistribution.findUniqueOrThrow({
    where: { id: distributionId },
    include: {
      guild: {
        select: {
          id: true,
          name: true,
          payoutMethod: true,
          payoutAddressIndex: true,
        },
      },
      lines: true,
    },
  });
  const { guild } = distribution;
  if (
    guild.payoutMethod !== "MULTISIG_BTC" ||
    guild.payoutAddressIndex === null
  ) {
    throw new MultisigPayoutError(`${guild.name} isn't paid by multisig`);
  }
  if (distribution.status !== "CALCULATED") {
    throw new MultisigPayoutError(
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
    throw new MultisigPayoutError(
      "This guild already has a payout waiting to be signed or confirmed",
    );
  }
  const guildIndex = guild.payoutAddressIndex;

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
  const changeSats = coins
    .filter((c) => c.source === "CHANGE")
    .reduce((s, c) => s + Number(c.sats), 0);
  if (luxorSats !== toSats(Number(distribution.luxorPayoutBtc))) {
    throw new MultisigPayoutError(
      `The guild's address holds ${(luxorSats / 1e8).toFixed(8)} BTC from Luxor for this month, but Luxor reports ${Number(distribution.luxorPayoutBtc).toFixed(8)} BTC`,
    );
  }
  const carriedInSats = distribution.lines.reduce(
    (s, l) => s + toSats(Number(l.carriedInBtc)),
    0,
  );
  if (changeSats !== carriedInSats) {
    const changeAddress = deriveAddress(wallet, CHANGE, guildIndex).address;
    throw new MultisigPayoutError(
      changeSats < carriedInSats
        ? `Members are owed ${(carriedInSats / 1e8).toFixed(8)} BTC carried from earlier months, but the guild's change address holds ${(changeSats / 1e8).toFixed(8)} BTC. Send the difference, ${((carriedInSats - changeSats) / 1e8).toFixed(8)} BTC, to ${changeAddress} first`
        : `The guild's change address holds ${(changeSats / 1e8).toFixed(8)} BTC, more than the ${(carriedInSats / 1e8).toFixed(8)} BTC carried`,
    );
  }

  const feeRate = Math.min(
    await halfHourFeeRate(wallet.network),
    settings.maxFeeRateSatVb,
  );
  const btcUsdRate = Number(distribution.btcUsdRate);
  const inSats = luxorSats + changeSats;

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
      throw new MultisigPayoutError("The month couldn't be recalculated");
    }
    const calc = run.calculation;
    if (calc.holdReasons.length > 0) {
      throw new MultisigPayoutError(
        `It's on hold: ${calc.holdReasons.join("; ")}`,
      );
    }
    let companySats = toSats(calc.companyOutputBtc);
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
      throw new MultisigPayoutError(
        `The company's output would be ${companySats} sats, below Bitcoin's ${DUST_SATS}-sat minimum`,
      );
    }
    if (companySats < 0) {
      throw new MultisigPayoutError("The company output can't cover the fee");
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
      wallet,
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
  if (!plan) throw new MultisigPayoutError("Couldn't settle the fee");

  // Inputs - outputs - change must be exactly the fee the month was
  // recalculated with.
  const outSats =
    plan.outputs.reduce((s, o) => s + o.sats, 0) + plan.changeSats;
  if (inSats - outSats !== feeSats) {
    throw new MultisigPayoutError(
      `The amounts don't add up: ${inSats} sats in, ${outSats} out, fee ${feeSats}`,
    );
  }

  const psbt = buildPayoutPsbt({
    wallet,
    guildIndex,
    coins: coins.map(asWalletCoin),
    outputs: plan.outputs,
    changeSats: plan.changeSats,
    feeSats,
  });
  const fingerprintA = appKeyFingerprint(settings)!;
  signWithAccountKey(
    psbt,
    openAppKey(settings.appKeyEncrypted!, wallet.network),
    fingerprintA,
  );

  const paidSats =
    plan.outputs.reduce((s, o) => s + o.sats, 0) - plan.companySats;
  const batch = await prisma.$transaction(async (tx) => {
    const batch = await tx.guildPayoutBatch.create({
      data: {
        method: "MULTISIG_BTC",
        status: "AWAITING_SIGNATURE",
        guildId: guild.id,
        psbt: psbt.toBase64(),
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
      throw new MultisigPayoutError("It was sent or changed meanwhile");
    }
    const reserved = await tx.guildWalletCoin.updateMany({
      where: { id: { in: coins.map((c) => c.id) }, status: "AVAILABLE" },
      data: { status: "RESERVED", reservedByBatchId: batch.id },
    });
    if (reserved.count !== coins.length) {
      throw new MultisigPayoutError("A coin was used meanwhile");
    }
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_PREPARED,
        entityType: "GuildPayoutBatch",
        entityId: batch.id,
        userId: actorId,
        description: `Prepared ${guild.name}'s ${formatRewardMonth(distribution.rewardMonth)} multisig payout: ${plan.outputs.length} output(s), fee ${feeSats} sats at ${feeRate} sat/vB, signed with the app key`,
        changes: JSON.stringify({
          distributionId,
          coins: coins.map((c) => `${c.txid}:${c.vout}`),
          outputs: plan.outputs,
          changeSats: plan.changeSats,
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
      guild: { select: { name: true, payoutAddressIndex: true } },
      coinsReserved: true,
      distributions: { include: { lines: { orderBy: LINE_ORDER } } },
    },
  });
  if (!batch.guild || batch.guild.payoutAddressIndex === null || !batch.psbt) {
    throw new MultisigPayoutError("Not a multisig payout");
  }
  if (batch.distributions.length !== 1) {
    throw new MultisigPayoutError("A multisig payout pays exactly one month");
  }
  const settings = await prisma.guildPayoutSettings.findUniqueOrThrow({
    where: { id: 1 },
  });
  const distribution = batch.distributions[0];
  const companySats = toSats(Number(batch.companyBtc));
  const outputs = payoutOutputs(
    settings.companyWalletAddress,
    companySats,
    distribution.lines,
  );
  const coins = batch.coinsReserved.map(asWalletCoin);
  const inSats = coins.reduce((s, c) => s + c.sats, 0);
  const changeSats =
    inSats -
    outputs.reduce((s, o) => s + o.sats, 0) -
    toSats(Number(batch.feeBtc));
  const carriedOut = distribution.lines.reduce(
    (s, l) => s + toSats(Number(l.carriedOutBtc)),
    0,
  );
  // Change is what's carried, plus at most the dust top-up.
  if (
    changeSats < carriedOut ||
    (changeSats > carriedOut && changeSats !== DUST_SATS)
  ) {
    throw new MultisigPayoutError(
      `The change (${changeSats} sats) doesn't match what's carried (${carriedOut} sats)`,
    );
  }
  return {
    batch,
    distribution,
    expected: {
      coins,
      outputs,
      changeSats,
      guildIndex: batch.guild.payoutAddressIndex,
    },
  };
}

/** The prepared transaction for the Sign screen. */
export async function loadPayoutForSigning(batchId: string) {
  const { wallet, settings } = await requireWallet();
  const { batch, distribution, expected } = await expectedFor(batchId);
  const psbt = psbtFromBase64(batch.psbt!, wallet);
  assertMatches(psbt, wallet, expected);
  const fingerprintA = appKeyFingerprint(settings);
  // When each paid wallet was last approved, so a brand-new one stands out.
  const memberships = await prisma.guildMembership.findMany({
    where: { id: { in: distribution.lines.map((l) => l.membershipId) } },
    select: { id: true, walletAddress: true, walletUpdatedAt: true },
  });
  // Outputs follow payoutOutputs' order: company first, then paid members.
  const owners = [
    ...(toSats(Number(batch.companyBtc)) > 0 ? [null] : []),
    ...distribution.lines.filter((l) => toSats(Number(l.paidBtc)) > 0),
  ];
  return {
    batchId: batch.id,
    status: batch.status,
    guildName: batch.guild!.name,
    rewardMonth: distribution.rewardMonth,
    psbt: batch.psbt!,
    network: wallet.network.name,
    feeSats: toSats(Number(batch.feeBtc)),
    feeRateSatVb: Number(batch.feeRateSatVb),
    changeSats: expected.changeSats,
    changeAddress:
      expected.changeSats > 0
        ? deriveAddress(wallet, CHANGE, expected.guildIndex).address
        : null,
    outputs: expected.outputs.map((o, i) => {
      const line = owners[i];
      const m = line && memberships.find((x) => x.id === line.membershipId);
      return {
        ...o,
        label: line ? line.nameSnapshot : "Company wallet (hosting)",
        walletApprovedAt:
          m && m.walletAddress === o.address ? m.walletUpdatedAt : null,
      };
    }),
    keys: wallet.keys.map((k) => ({
      fingerprint: k.fingerprint,
      originPath: k.originPath,
      xpub: k.xpub,
      isAppKey: k.fingerprint === fingerprintA,
    })),
    signedByAppKey:
      !!fingerprintA && hasValidSignatures(psbt, wallet, fingerprintA),
    // The Trezor checks input amounts against these.
    prevTxs:
      batch.status === "AWAITING_SIGNATURE" && !batch.txid
        ? Object.fromEntries(
            await Promise.all(
              [...new Set(expected.coins.map((c) => c.txid))].map(
                async (txid) =>
                  [txid, await rawTransaction(wallet.network, txid)] as const,
              ),
            ),
          )
        : {},
    testSignerAvailable:
      wallet.network.name === "testnet" && !!process.env.GUILD_TEST_SIGNER,
  };
}

/**
 * Adds the approver's signature (from the browser, as a signed PSBT), checks
 * the transaction against the database once more, and broadcasts it.
 */
export async function submitApproverSignature(params: {
  batchId: string;
  signedPsbt: string;
  signerDevice: string;
  actorId: string;
}) {
  const { batchId, signedPsbt, signerDevice, actorId } = params;
  await requireApprover(actorId);
  const { wallet, settings } = await requireWallet();
  const { batch, distribution, expected } = await expectedFor(batchId);
  if (batch.status !== "AWAITING_SIGNATURE") {
    throw new MultisigPayoutError("This payout isn't waiting for a signature");
  }
  if (batch.txid) {
    throw new MultisigPayoutError(
      "It's already signed - check its confirmations",
    );
  }

  const ours = psbtFromBase64(batch.psbt!, wallet);
  const theirs = psbtFromBase64(signedPsbt, wallet);
  const fingerprintA = appKeyFingerprint(settings)!;
  // The second signature may come from key B (the Trezor) or, standing in,
  // key C - never key A again.
  const signer = wallet.keys.find(
    (k) =>
      k.fingerprint !== fingerprintA &&
      hasValidSignatures(theirs, wallet, k.fingerprint),
  );
  if (!signer) {
    throw new MultisigPayoutError(
      "The transaction isn't signed by the approver's key",
    );
  }
  mergeSignatures(ours, theirs, wallet, signer.fingerprint);
  if (!hasValidSignatures(ours, wallet, fingerprintA)) {
    throw new MultisigPayoutError("The app key's signature is missing");
  }
  // Never trust the browser's copy: the outputs must still be exactly what
  // the database says.
  assertMatches(ours, wallet, expected);
  const { hex, txid } = finalizePayout(ours);

  // Record it before broadcasting, so a broadcast that succeeds but whose
  // reply is lost is still found by the confirmation check.
  await prisma.$transaction(async (tx) => {
    const saved = await tx.guildPayoutBatch.updateMany({
      where: { id: batchId, status: "AWAITING_SIGNATURE", txid: null },
      data: {
        psbt: ours.toBase64(),
        txid,
        signedById: actorId,
        signedAt: new Date(),
        signerDevice: signerDevice.slice(0, 200),
      },
    });
    if (saved.count !== 1)
      throw new MultisigPayoutError("It was signed meanwhile");
    await tx.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_SIGNED,
        entityType: "GuildPayoutBatch",
        entityId: batchId,
        userId: actorId,
        description: `Signed ${batch.guild!.name}'s ${formatRewardMonth(distribution.rewardMonth)} payout with key ${signer.fingerprint} (${signerDevice})`,
        changes: JSON.stringify({
          txid,
          signer: signer.fingerprint,
          signerDevice,
        }),
      },
    });
  });

  return broadcastSigned(batchId, hex, actorId);
}

async function broadcastSigned(batchId: string, hex: string, actorId: string) {
  const network = payoutNetwork();
  const batch = await prisma.guildPayoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      guild: { select: { name: true, payoutAddressIndex: true } },
      distributions: { include: { lines: { orderBy: LINE_ORDER } } },
    },
  });
  let sentTxid: string;
  try {
    sentTxid = await broadcast(network, hex);
  } catch (error) {
    // Already in the mempool or a block counts as sent.
    const known = await txConfirmations(network, batch.txid!).catch(() => null);
    if (known === null) {
      throw new MultisigPayoutError(
        `Broadcast failed, nothing was sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    sentTxid = batch.txid!;
  }
  if (sentTxid !== batch.txid) {
    throw new MultisigPayoutError(
      `mempool.space answered with another txid (${sentTxid})`,
    );
  }
  await markBroadcast(batchId, actorId);
  return { batchId, txid: sentTxid };
}

/** Signed and accepted by the network: it's out. */
async function markBroadcast(batchId: string, actorId: string | null) {
  const { wallet } = await requireWallet();
  const batch = await prisma.guildPayoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      guild: { select: { id: true, name: true, payoutAddressIndex: true } },
      distributions: { include: { lines: { orderBy: LINE_ORDER } } },
    },
  });
  const psbt = psbtFromBase64(batch.psbt!, wallet);
  const outs = psbt.txOutputs;
  const changeAddress = deriveAddress(
    wallet,
    CHANGE,
    batch.guild!.payoutAddressIndex!,
  ).address;
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
    const changeVout = outs.findIndex((o) => o.address === changeAddress);
    if (changeVout >= 0) {
      await tx.guildWalletCoin.upsert({
        where: { txid_vout: { txid: batch.txid!, vout: changeVout } },
        create: {
          guildId: batch.guild!.id,
          txid: batch.txid!,
          vout: changeVout,
          sats: outs[changeVout].value,
          address: changeAddress,
          branch: CHANGE,
          addressIndex: batch.guild!.payoutAddressIndex!,
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
export async function cancelMultisigPayout(batchId: string, actorId: string) {
  await requireApprover(actorId);
  await prisma.$transaction(async (tx) => {
    const batch = await tx.guildPayoutBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { guild: { select: { name: true } } },
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
      throw new MultisigPayoutError(
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
 * The testnet stand-in for the Trezor: signs a prepared payout with a
 * throwaway key from GUILD_TEST_SIGNER ("[fingerprint/48'/1'/0'/2']tprv…").
 * Refused anywhere but testnet.
 */
export async function signWithTestSigner(batchId: string, actorId: string) {
  const { wallet } = await requireWallet();
  if (wallet.network.name !== "testnet") {
    throw new MultisigPayoutError("The software signer only works on testnet");
  }
  const raw = process.env.GUILD_TEST_SIGNER?.trim() ?? "";
  const m = /^\[([0-9a-f]{8})[^\]]*\](tprv[1-9A-HJ-NP-Za-km-z]+)$/.exec(raw);
  if (!m) throw new MultisigPayoutError("GUILD_TEST_SIGNER isn't set");
  const [, fingerprint, tprv] = m;
  const batch = await prisma.guildPayoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { psbt: true },
  });
  if (!batch.psbt) throw new MultisigPayoutError("Not a multisig payout");
  const psbt = psbtFromBase64(batch.psbt, wallet);
  try {
    signWithAccountKey(psbt, accountFromXprv(tprv, wallet), fingerprint);
  } catch (error) {
    if (error instanceof PayoutTxError) {
      throw new MultisigPayoutError(
        `The test signer's key isn't in this wallet (${error.message})`,
      );
    }
    throw error;
  }
  return submitApproverSignature({
    batchId,
    signedPsbt: psbt.toBase64(),
    signerDevice: "Testnet software signer",
    actorId,
  });
}

/**
 * Hourly job and the "Check now" button: finds signed payouts the network
 * has accepted, and settles those with enough confirmations.
 */
export async function checkMultisigConfirmations(actorId?: string) {
  const network = payoutNetwork();
  const provider = multisigSettlement();
  const results: {
    batchId: string;
    status: string;
    confirmations: number | null;
  }[] = [];

  // Signed, but the broadcast's reply was lost.
  const signed = await prisma.guildPayoutBatch.findMany({
    where: {
      method: "MULTISIG_BTC",
      status: "AWAITING_SIGNATURE",
      txid: { not: null },
    },
    select: { id: true, txid: true, createdById: true },
  });
  for (const b of signed) {
    const n = await txConfirmations(network, b.txid!);
    if (n !== null) await markBroadcast(b.id, actorId ?? null);
  }

  const sent = await prisma.guildPayoutBatch.findMany({
    where: { method: "MULTISIG_BTC", status: "BROADCAST" },
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
