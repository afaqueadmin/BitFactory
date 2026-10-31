/**
 * The guild payout wallet: a 2-of-3 P2WSH multisig, written as a standard
 * output descriptor so Sparrow, Caravan or Bitcoin Core can rebuild it
 * without us:
 *
 *   wsh(sortedmulti(2,[fp/48'/1'/0'/2']tpub…/<0;1>/*,[…]…,[…]…))#checksum
 *
 * Only public keys - it can watch, never spend. Each key carries its origin
 * (master fingerprint + path) because signers (the Trezor, a PSBT) need it
 * to find their own key.
 *
 * Addresses: guild i receives at branch 0, index i, and gets its change at
 * branch 1, index i - so every coin in the wallet belongs to exactly one
 * guild.
 */

import { BIP32Factory, type BIP32Interface } from "bip32";
import { payments } from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import type { MultisigNetwork } from "./network";

const bip32 = BIP32Factory(ecc);

export const THRESHOLD = 2;
export const KEY_COUNT = 3;

export type Branch = 0 | 1;
export const RECEIVE: Branch = 0;
export const CHANGE: Branch = 1;

export class DescriptorError extends Error {}

export interface DescriptorKey {
  /** Master key fingerprint, 8 lowercase hex characters. */
  fingerprint: string;
  /** Path from the master key to `xpub`, e.g. "m/48'/1'/0'/2'". */
  originPath: string;
  xpub: string;
  node: BIP32Interface;
}

export interface MultisigWallet {
  network: MultisigNetwork;
  keys: DescriptorKey[];
  /** Canonical form, with checksum. */
  descriptor: string;
}

export interface DerivedAddress {
  address: string;
  branch: Branch;
  index: number;
  /** scriptPubKey of the address. */
  outputScript: Uint8Array;
  /** The 2-of-3 script the address commits to. */
  witnessScript: Uint8Array;
  /** Every key's child public key and full path, in descriptor key order. */
  derivations: {
    fingerprint: string;
    pubkey: Uint8Array;
    path: string;
  }[];
}

// ---- BIP 380 descriptor checksum ----

const INPUT_CHARSET =
  "0123456789()[],'/*abcdefgh@:$%{}" +
  "IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~" +
  'ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';
const CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATORS = [
  BigInt("0xf5dee51989"),
  BigInt("0xa9fdca3312"),
  BigInt("0x1bab10e32d"),
  BigInt("0x3706b1677a"),
  BigInt("0x644d626ffd"),
];

function polymod(c: bigint, value: number): bigint {
  const c0 = c >> BigInt(35);
  let next = ((c & BigInt("0x7ffffffff")) << BigInt(5)) ^ BigInt(value);
  GENERATORS.forEach((g, i) => {
    if ((c0 >> BigInt(i)) & BigInt(1)) next ^= g;
  });
  return next;
}

export function descriptorChecksum(body: string): string {
  let c = BigInt(1);
  let cls = 0;
  let clsCount = 0;
  for (const ch of body) {
    const pos = INPUT_CHARSET.indexOf(ch);
    if (pos < 0) throw new DescriptorError(`Unexpected character "${ch}"`);
    c = polymod(c, pos & 31);
    cls = cls * 3 + (pos >> 5);
    if (++clsCount === 3) {
      c = polymod(c, cls);
      cls = 0;
      clsCount = 0;
    }
  }
  if (clsCount > 0) c = polymod(c, cls);
  for (let j = 0; j < 8; j++) c = polymod(c, 0);
  c ^= BigInt(1);
  let out = "";
  for (let j = 0; j < 8; j++) {
    out += CHECKSUM_CHARSET[Number((c >> BigInt(5 * (7 - j))) & BigInt(31))];
  }
  return out;
}

// ---- parsing ----

const KEY_RE =
  /^\[([0-9a-fA-F]{8})((?:\/\d+['h]?)*)\]([1-9A-HJ-NP-Za-km-z]{100,120})(\/<0;1>\/\*|\/[01]\/\*)?$/;

/** The standard key path for a 2-of-3 P2WSH multisig (BIP 48, script 2). */
export const multisigKeyPath = (network: MultisigNetwork, account = 0) =>
  `m/48'/${network.coinType}'/${account}'/2'`;

function parseKey(text: string, network: MultisigNetwork): DescriptorKey {
  const m = KEY_RE.exec(text.trim());
  if (!m) {
    throw new DescriptorError(
      `Each key must look like [fingerprint/48'/…]${network.name === "mainnet" ? "xpub" : "tpub"}…/<0;1>/*`,
    );
  }
  const [, fp, path, xpub] = m;
  let node: BIP32Interface;
  try {
    node = bip32.fromBase58(xpub, network.bitcoin);
  } catch {
    throw new DescriptorError(
      `${xpub.slice(0, 8)}… isn't a ${network.name} extended public key (use the standard ${network.name === "mainnet" ? "xpub" : "tpub"} form)`,
    );
  }
  if (!node.isNeutered()) {
    throw new DescriptorError("The descriptor must hold public keys only");
  }
  const originPath = `m${path.replace(/h/g, "'")}`;
  const depth = path ? path.split("/").length - 1 : 0;
  if (node.depth !== depth) {
    throw new DescriptorError(
      `${xpub.slice(0, 8)}… is at depth ${node.depth} but its path ${originPath} has ${depth} steps`,
    );
  }
  return {
    fingerprint: fp.toLowerCase(),
    originPath,
    xpub: node.toBase58(),
    node,
  };
}

/** Parses and checks a wsh(sortedmulti(2, …3 keys)) descriptor. */
export function parseDescriptor(
  text: string,
  network: MultisigNetwork,
): MultisigWallet {
  const trimmed = text.trim().replace(/\s+/g, "");
  const [body, checksum] = trimmed.split("#");
  if (checksum !== undefined && descriptorChecksum(body) !== checksum) {
    throw new DescriptorError("The descriptor's checksum doesn't match");
  }
  const m = /^wsh\(sortedmulti\((\d+),(.+)\)\)$/.exec(body);
  if (!m) {
    throw new DescriptorError(
      "Expected a wsh(sortedmulti(2, key, key, key)) descriptor",
    );
  }
  if (Number(m[1]) !== THRESHOLD) {
    throw new DescriptorError(`The wallet must need ${THRESHOLD} signatures`);
  }
  const keys = m[2].split(",").map((k) => parseKey(k, network));
  if (keys.length !== KEY_COUNT) {
    throw new DescriptorError(`The wallet must have ${KEY_COUNT} keys`);
  }
  if (new Set(keys.map((k) => k.xpub)).size !== keys.length) {
    throw new DescriptorError("The same key is listed twice");
  }
  return { network, keys, descriptor: formatDescriptor(keys) };
}

export function formatDescriptor(
  keys: Pick<DescriptorKey, "fingerprint" | "originPath" | "xpub">[],
): string {
  const body = `wsh(sortedmulti(${THRESHOLD},${keys
    .map((k) => `[${k.fingerprint}${k.originPath.slice(1)}]${k.xpub}/<0;1>/*`)
    .join(",")}))`;
  return `${body}#${descriptorChecksum(body)}`;
}

const compare = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
};

export function deriveAddress(
  wallet: MultisigWallet,
  branch: Branch,
  index: number,
): DerivedAddress {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new DescriptorError("Address index out of range");
  }
  const derivations = wallet.keys.map((k) => ({
    fingerprint: k.fingerprint,
    pubkey: k.node.derive(branch).derive(index).publicKey,
    path: `${k.originPath}/${branch}/${index}`,
  }));
  const sorted = derivations.map((d) => d.pubkey).sort(compare);
  const redeem = payments.p2ms({
    m: THRESHOLD,
    pubkeys: sorted,
    network: wallet.network.bitcoin,
  });
  const p2wsh = payments.p2wsh({ redeem, network: wallet.network.bitcoin });
  return {
    address: p2wsh.address!,
    branch,
    index,
    outputScript: p2wsh.output!,
    witnessScript: redeem.output!,
    derivations,
  };
}

/**
 * The wallet's keys in the order an address's script lists them (sorted by
 * child public key), as a Trezor needs them to show that address.
 */
export function scriptKeyOrder(
  wallet: MultisigWallet,
  branch: Branch,
  index: number,
): { xpub: string; branch: Branch; index: number }[] {
  return wallet.keys
    .map((k) => ({
      xpub: k.xpub,
      pubkey: k.node.derive(branch).derive(index).publicKey,
    }))
    .sort((a, b) => compare(a.pubkey, b.pubkey))
    .map((k) => ({ xpub: k.xpub, branch, index }));
}
