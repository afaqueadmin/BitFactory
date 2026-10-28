/**
 * How one monthly Luxor payout to a guild is split. Pure - no database - so
 * every payout method (manual now, multisig BTC next, perhaps a contract
 * later) runs the exact same numbers.
 *
 *   1. The company takes what pays the guild's unpaid hosting invoices,
 *      oldest first, converted to BTC at the snapshot rate. If the payout
 *      doesn't cover them, the company takes all of it and the rest stays
 *      owing (it's just the invoices' unpaid balance next month).
 *   2. The network fee is charged to whoever GuildPayoutSettings.feePayer
 *      names (see FeePayer).
 *   3. The rest is split by each active member's percentage (the
 *      Guildmaster included), rounded down to the satoshi; leftover
 *      satoshis go to the Guildmaster.
 *   4. Each member is sent their share plus anything carried from earlier
 *      months - unless that's below the minimum payout, or their wallet is
 *      missing or in its 24h freeze, in which case it's carried forward.
 *      A former member's carried balance is sent whatever its size.
 *
 * Amounts are worked in integer satoshis and cents to avoid float drift.
 */

export const SATS_PER_BTC = 100_000_000;
/** Percentages are stored with 4 decimals: 100% = 1,000,000 units. */
const PERCENT_UNITS = 10_000;
const FULL_SPLIT_UNITS = 100 * PERCENT_UNITS;
export const GUILD_FREEZE_MS = 24 * 60 * 60 * 1000;
/** Smallest output Bitcoin relays for any address type (P2PKH). */
export const DUST_SATS = 546;

/**
 *   HIGGS          out of the company output; invoices credited in full
 *   HOSTING_SHARE  out of the company output; invoice credit reduced by it
 *   GUILD_REWARD   out of the members' part before the split (any excess
 *                  falls back to the company output, as HOSTING_SHARE)
 */
export type FeePayer = "HIGGS" | "HOSTING_SHARE" | "GUILD_REWARD";

export interface DistributionMember {
  membershipId: string;
  userId: string;
  name: string;
  isGuildmaster: boolean;
  /** 0-100, up to 4 decimals; 0 for a former member. */
  percent: number;
  /** False for a former member still owed a carried balance. */
  active: boolean;
  walletAddress: string | null;
  walletUpdatedAt: Date | null;
  carriedInBtc: number;
}

export interface UnpaidHostingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  /** Still owed on it, USD. */
  outstandingUsd: number;
}

export interface DistributionInput {
  payoutBtc: number;
  btcUsdRate: number;
  /** Oldest first. */
  unpaidInvoices: UnpaidHostingInvoice[];
  members: DistributionMember[];
  splitUpdatedAt: Date | null;
  now: Date;
  minPayoutSats: number;
  feePayer: FeePayer;
  /** This guild's part of the payout transaction fee; 0 when sent by hand. */
  networkFeeBtc?: number;
  /** What actually arrived at the guild's address, when it's watched. */
  receivedBtc?: number | null;
  /** Reasons from outside the numbers (e.g. an earlier month not sent yet). */
  externalHolds?: string[];
}

export interface HostingAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amountUsd: number;
}

export interface DistributionShare {
  membershipId: string;
  userId: string;
  name: string;
  isGuildmaster: boolean;
  percent: number;
  walletAddress: string | null;
  /** This month's share. */
  btcAmount: number;
  carriedInBtc: number;
  paidBtc: number;
  carriedOutBtc: number;
  carryReason: string | null;
}

export interface DistributionResult {
  hostingDueUsd: number;
  /** BTC that pays hosting (before any fee comes off it). */
  companyBtc: number;
  /** USD credited to the hosting invoices. */
  companyUsd: number;
  /** What the company wallet actually receives. */
  companyOutputBtc: number;
  /** Fee Higgs must add from elsewhere when the company output can't cover it. */
  feeTopUpBtc: number;
  networkFeeBtc: number;
  /** The members' part, after any fee charged to it. */
  netBtc: number;
  shortfallUsd: number;
  allocations: HostingAllocation[];
  shares: DistributionShare[];
  paidBtc: number;
  carriedOutBtc: number;
  /** Why it can't be sent as it stands; empty = ready. */
  holdReasons: string[];
}

export const toSats = (btc: number) => Math.round(btc * SATS_PER_BTC);
export const fromSats = (sats: number | bigint) => Number(sats) / SATS_PER_BTC;
const toCents = (usd: number) => Math.round(usd * 100);
const fromCents = (cents: number) => cents / 100;
export const percentToUnits = (percent: number) =>
  Math.round(percent * PERCENT_UNITS);

/** True when the percentages add up to exactly 100 (at 4 decimals). */
export function isFullSplit(percents: number[]): boolean {
  return (
    percents.length > 0 &&
    percents.reduce((sum, p) => sum + percentToUnits(p), 0) === FULL_SPLIT_UNITS
  );
}

/** Splits `netSats` by percentage; leftover satoshis go to the Guildmaster. */
function splitSats(netSats: number, members: DistributionMember[]): bigint[] {
  const net = BigInt(netSats);
  const shares = members.map((m) =>
    m.active
      ? (net * BigInt(percentToUnits(m.percent))) / BigInt(FULL_SPLIT_UNITS)
      : BigInt(0),
  );
  const leftover = net - shares.reduce((sum, s) => sum + s, BigInt(0));
  const masterIndex = members.findIndex((m) => m.active && m.isGuildmaster);
  if (leftover > BigInt(0) && masterIndex >= 0) {
    shares[masterIndex] += leftover;
  }
  return shares;
}

export function calculateDistribution(
  input: DistributionInput,
): DistributionResult {
  const { payoutBtc, btcUsdRate, unpaidInvoices, members, now } = input;
  const active = members.filter((m) => m.active);
  const holdReasons: string[] = [...(input.externalHolds ?? [])];

  if (!(btcUsdRate > 0)) holdReasons.push("No BTC/USD rate");
  if (active.length === 0) {
    holdReasons.push("The guild has no members");
  } else {
    if (!isFullSplit(active.map((m) => m.percent))) {
      holdReasons.push("Reward percentages don't add up to 100%");
    }
    if (!active.some((m) => m.isGuildmaster)) {
      holdReasons.push("The guild has no Guildmaster");
    }
  }
  const frozenSince = now.getTime() - GUILD_FREEZE_MS;
  if (input.splitUpdatedAt && input.splitUpdatedAt.getTime() > frozenSince) {
    holdReasons.push("The reward split changed less than 24 hours ago");
  }
  if (
    input.receivedBtc !== undefined &&
    input.receivedBtc !== null &&
    toSats(input.receivedBtc) !== toSats(payoutBtc)
  ) {
    holdReasons.push(
      `Received ${input.receivedBtc.toFixed(8)} BTC at the guild's address but Luxor reports ${payoutBtc.toFixed(8)} BTC`,
    );
  }

  const payoutSats = Math.max(0, toSats(payoutBtc));
  const invoiceCents = unpaidInvoices.map((i) =>
    Math.max(0, toCents(i.outstandingUsd)),
  );
  const dueCents = invoiceCents.reduce((sum, c) => sum + c, 0);
  const centsFor = (sats: number) =>
    Math.min(dueCents, Math.floor(fromSats(sats) * btcUsdRate * 100));

  // Company share: the BTC that pays everything owed, capped at the payout.
  let companySats = 0;
  let companyCents = 0;
  if (btcUsdRate > 0 && dueCents > 0) {
    const dueSats = Math.round(
      (fromCents(dueCents) / btcUsdRate) * SATS_PER_BTC,
    );
    if (dueSats <= payoutSats) {
      companySats = dueSats;
      companyCents = dueCents;
    } else {
      companySats = payoutSats;
      companyCents = centsFor(payoutSats);
    }
  }
  let netSats = payoutSats - companySats;

  // Network fee.
  const feeSats = Math.max(0, toSats(input.networkFeeBtc ?? 0));
  let feeFromCompany = feeSats;
  if (input.feePayer === "GUILD_REWARD") {
    const fromNet = Math.min(feeSats, netSats);
    netSats -= fromNet;
    feeFromCompany = feeSats - fromNet;
  }
  const companyOutputSats = Math.max(0, companySats - feeFromCompany);
  const feeTopUpSats = Math.max(0, feeFromCompany - companySats);
  if (input.feePayer !== "HIGGS" && feeFromCompany > 0) {
    // The fee eats into what the hosting invoices are credited.
    companyCents = companySats === 0 ? 0 : centsFor(companyOutputSats);
  }

  // Which invoices the company share pays, oldest first.
  const allocations: HostingAllocation[] = [];
  let remainingCents = companyCents;
  unpaidInvoices.forEach((invoice, i) => {
    if (remainingCents <= 0) return;
    const paid = Math.min(remainingCents, invoiceCents[i]);
    if (paid <= 0) return;
    allocations.push({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amountUsd: fromCents(paid),
    });
    remainingCents -= paid;
  });

  const held = holdReasons.length > 0;
  const shareSats = held
    ? members.map(() => BigInt(0))
    : splitSats(netSats, members);

  const shares: DistributionShare[] = members.map((m, i) => {
    const share = Number(shareSats[i]);
    const carriedIn = Math.max(0, toSats(m.carriedInBtc));
    const payable = share + carriedIn;
    let carryReason: string | null = null;
    if (held) carryReason = null;
    else if (!m.walletAddress) carryReason = "No reward wallet yet";
    else if (m.walletUpdatedAt && m.walletUpdatedAt.getTime() > frozenSince) {
      carryReason = "Wallet changed less than 24 hours ago";
    } else if (m.active && payable < input.minPayoutSats) {
      carryReason = "Below the minimum payout";
    } else if (payable < DUST_SATS) {
      carryReason = "Below Bitcoin's smallest payable amount";
    }
    const paid = held || carryReason || payable === 0 ? 0 : payable;
    return {
      membershipId: m.membershipId,
      userId: m.userId,
      name: m.name,
      isGuildmaster: m.isGuildmaster,
      percent: m.percent,
      walletAddress: m.walletAddress,
      btcAmount: fromSats(share),
      carriedInBtc: fromSats(carriedIn),
      paidBtc: fromSats(paid),
      carriedOutBtc: fromSats(payable - paid),
      carryReason: payable - paid > 0 ? carryReason : null,
    };
  });

  return {
    hostingDueUsd: fromCents(dueCents),
    companyBtc: fromSats(companySats),
    companyUsd: fromCents(companyCents),
    companyOutputBtc: fromSats(companyOutputSats),
    feeTopUpBtc: fromSats(feeTopUpSats),
    networkFeeBtc: fromSats(feeSats),
    netBtc: fromSats(netSats),
    shortfallUsd: fromCents(dueCents - companyCents),
    allocations,
    shares,
    paidBtc: fromSats(shares.reduce((s, x) => s + toSats(x.paidBtc), 0)),
    carriedOutBtc: fromSats(
      shares.reduce((s, x) => s + toSats(x.carriedOutBtc), 0),
    ),
    holdReasons,
  };
}
