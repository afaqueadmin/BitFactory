/**
 * Guild wallets on the payout Trezor - single-key Native SegWit (BIP84)
 * accounts, one per guild. Pure: no database, no network, no device.
 *
 *   guild account   m/84'/coin'/n'        n = 0 … MAX_GUILD_ACCOUNT
 *   receiving       m/84'/coin'/n'/0/0    the address set on Luxor
 *   change          m/84'/coin'/n'/1/k    a new one for each payout
 *   seal key        m/84'/coin'/100'/0/0  signs wallet seals, never holds funds
 *
 * The Trezor firmware only accepts account numbers 0-100 on BIP84 paths
 * (trezor-firmware core/src/apps/common/paths.py, "account": "0-100"), so
 * the last one is kept for the seal key and guilds get 0-99.
 *
 * The app only ever has the accounts' public keys: it works out their
 * addresses here, the Trezor signs.
 */

import { BIP32Factory, type BIP32Interface } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { crypto as bcrypto, payments, type Network } from "bitcoinjs-lib";
import type { PayoutNetwork } from "./network";

const bip32 = BIP32Factory(ecc);

export const SEAL_ACCOUNT = 100;
export const MAX_GUILD_ACCOUNT = SEAL_ACCOUNT - 1;
export const RECEIVE = 0;
export const CHANGE = 1;

export class TrezorAccountError extends Error {}

export function accountPath(network: PayoutNetwork, account: number): string {
  if (!Number.isInteger(account) || account < 0 || account > SEAL_ACCOUNT) {
    throw new TrezorAccountError(`Account ${account} is out of range`);
  }
  return `m/84'/${network.coinType}'/${account}'`;
}

export function addressPath(
  network: PayoutNetwork,
  account: number,
  branch: number,
  index: number,
): string {
  return `${accountPath(network, account)}/${branch}/${index}`;
}

/** The seal key's path: m/84'/coin'/100'/0/0. */
export function sealPath(network: PayoutNetwork): string {
  return addressPath(network, SEAL_ACCOUNT, RECEIVE, 0);
}

/**
 * An account's public key as Trezor Connect returns it (xpub on mainnet,
 * tpub on testnet), checked to be an account-level key for this network.
 */
export function parseAccountXpub(
  xpub: string,
  network: PayoutNetwork,
): BIP32Interface {
  let node: BIP32Interface;
  try {
    node = bip32.fromBase58(xpub.trim(), network.bitcoin);
  } catch {
    throw new TrezorAccountError(
      `Not a ${network.name === "mainnet" ? "mainnet xpub" : "testnet tpub"}`,
    );
  }
  if (!node.isNeutered()) {
    throw new TrezorAccountError("That's a private key - never send one");
  }
  if (node.depth !== 3) {
    throw new TrezorAccountError("Not an account-level key (depth 3)");
  }
  return node;
}

function p2wpkhAddress(pubkey: Uint8Array, network: Network): string {
  const address = payments.p2wpkh({ pubkey, network }).address;
  if (!address) throw new TrezorAccountError("Couldn't make an address");
  return address;
}

/** The Native SegWit address at branch/index of an account. */
export function deriveAddress(
  xpub: string,
  network: PayoutNetwork,
  branch: number,
  index: number,
): string {
  const child = parseAccountXpub(xpub, network).derive(branch).derive(index);
  return p2wpkhAddress(child.publicKey, network.bitcoin);
}

/** A guild account's receiving address (0/0) - the one set on Luxor. */
export function receivingAddress(xpub: string, network: PayoutNetwork) {
  return deriveAddress(xpub, network, RECEIVE, 0);
}

// ---------------------------------------------------------------------------
// Wallet seals: a message naming a guild, a member and their wallet, signed
// by the seal key on the Trezor after the approver checked it on the screen.
// ---------------------------------------------------------------------------

export interface SealSubject {
  guildName: string;
  /** The member's name, or "Company wallet (hosting)". */
  holder: string;
  address: string;
  /** YYYY-MM-DD, UTC. */
  approvedOn: string;
}

export function sealMessage(s: SealSubject): string {
  return [
    "BitFactory payout address",
    `Guild: ${s.guildName}`,
    `For: ${s.holder}`,
    s.address,
    `Approved: ${s.approvedOn}`,
  ].join("\n");
}

/** The address line of a seal message, or null if it isn't one. */
export function sealedAddress(message: string): string | null {
  const lines = message.split("\n");
  return lines[0] === "BitFactory payout address" && lines.length === 5
    ? lines[3]
    : null;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  throw new TrezorAccountError("Message too long");
}

/** Bitcoin's signed-message hash (what Trezor signMessage signs). */
export function messageHash(message: string): Uint8Array {
  const prefix = new TextEncoder().encode("\x18Bitcoin Signed Message:\n");
  const body = new TextEncoder().encode(message);
  const len = varint(body.length);
  const data = new Uint8Array(prefix.length + len.length + body.length);
  data.set(prefix, 0);
  data.set(len, prefix.length);
  data.set(body, prefix.length + len.length);
  return bcrypto.hash256(data);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Whether `signatureB64` is the seal key's signature of `message`: the
 * public key recovered from the signature must be the one behind
 * `sealAddress`. Accepts any BIP137 header (Trezor uses 39-42 for a
 * Native SegWit key); only the recovered key decides.
 */
export function verifySeal(params: {
  message: string;
  signatureB64: string;
  sealAddress: string;
  network: PayoutNetwork;
}): boolean {
  let sig: Uint8Array;
  try {
    sig = fromBase64(params.signatureB64);
  } catch {
    return false;
  }
  if (sig.length !== 65) return false;
  const header = sig[0];
  if (header < 27 || header > 42) return false;
  const recid = ((header - 27) & 3) as 0 | 1 | 2 | 3;
  let pubkey: Uint8Array | null;
  try {
    pubkey = ecc.recover(
      messageHash(params.message),
      sig.slice(1),
      recid,
      true,
    );
  } catch {
    return false;
  }
  if (!pubkey) return false;
  return p2wpkhAddress(pubkey, params.network.bitcoin) === params.sealAddress;
}
