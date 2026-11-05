/**
 * Which Bitcoin network Trezor guild payouts run on, and whether they're
 * switched on at all. Both come from the environment, so production stays
 * manual until it's deliberately turned on there:
 *
 *   GUILD_TREZOR_ENABLED=true             Trezor payouts can be set up
 *   GUILD_PAYOUT_NETWORK=testnet|mainnet  (default mainnet)
 *
 * "testnet" is testnet4 - the explorer links and API calls go to
 * mempool.space/testnet4. Its addresses and extended keys use the same
 * prefixes as the old testnet (tb1…, tpub), so bitcoinjs's testnet params fit.
 */

import { networks, type Network } from "bitcoinjs-lib";

export type PayoutNetworkName = "mainnet" | "testnet";

export interface PayoutNetwork {
  name: PayoutNetworkName;
  bitcoin: Network;
  /** BIP44 coin type used in key paths: 0 mainnet, 1 testnet. */
  coinType: 0 | 1;
  /** The WALLET_NETWORKS key member wallets are validated against. */
  walletNetwork: "BTC" | "BTC_TESTNET";
  /** mempool.space REST API base, no trailing slash. */
  apiBase: string;
}

const NETWORKS: Record<PayoutNetworkName, PayoutNetwork> = {
  mainnet: {
    name: "mainnet",
    bitcoin: networks.bitcoin,
    coinType: 0,
    walletNetwork: "BTC",
    apiBase: "https://mempool.space/api",
  },
  testnet: {
    name: "testnet",
    bitcoin: networks.testnet,
    coinType: 1,
    walletNetwork: "BTC_TESTNET",
    apiBase: "https://mempool.space/testnet4/api",
  },
};

export function payoutNetwork(): PayoutNetwork {
  const name =
    process.env.GUILD_PAYOUT_NETWORK === "testnet" ? "testnet" : "mainnet";
  return NETWORKS[name];
}

export function payoutNetworkByName(name: string): PayoutNetwork {
  const network = NETWORKS[name as PayoutNetworkName];
  if (!network) throw new Error(`Unknown payout network "${name}"`);
  return network;
}

export function isTrezorPayoutEnabled(): boolean {
  return process.env.GUILD_TREZOR_ENABLED === "true";
}
