/**
 * Chains a guild member's reward wallet can be on. Only native Bitcoin
 * today. GuildMembership.walletNetwork is a plain string, so adding a chain
 * (e.g. a smart-contract chain later) means adding an entry here - no
 * schema change.
 */

import { validate, Network } from "bitcoin-address-validation";

export interface WalletNetwork {
  label: string;
  /** Normalised address, or null if it isn't valid on this network. */
  parse(address: string): string | null;
  /** Explorer link for a transaction, when there's one to show. */
  txUrl(txid: string): string | null;
}

const TXID = /^[0-9a-f]{64}$/i;

export const WALLET_NETWORKS: Record<string, WalletNetwork> = {
  BTC: {
    label: "Bitcoin",
    parse: (address) => (validate(address, Network.mainnet) ? address : null),
    txUrl: (txid) =>
      TXID.test(txid) ? `https://mempool.space/tx/${txid}` : null,
  },
  // Testnet4, for trying multisig payouts with worthless coins.
  BTC_TESTNET: {
    label: "Bitcoin testnet",
    parse: (address) => (validate(address, Network.testnet) ? address : null),
    txUrl: (txid) =>
      TXID.test(txid) ? `https://mempool.space/testnet4/tx/${txid}` : null,
  },
};

/**
 * The network new wallets are on: Bitcoin, or testnet4 where guild payouts
 * are being tried on testnet (GUILD_PAYOUT_NETWORK=testnet, never set on
 * production).
 */
export function defaultWalletNetwork(): string {
  return process.env.GUILD_PAYOUT_NETWORK === "testnet" ? "BTC_TESTNET" : "BTC";
}

export function isWalletNetwork(value: unknown): value is string {
  return typeof value === "string" && value in WALLET_NETWORKS;
}

/** Explorer link for a payout transaction, or null (e.g. a manual reference). */
export function payoutTxUrl(
  txid: string | null | undefined,
  network: string = defaultWalletNetwork(),
): string | null {
  if (!txid) return null;
  return WALLET_NETWORKS[network]?.txUrl(txid) ?? null;
}
