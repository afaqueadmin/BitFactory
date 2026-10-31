/**
 * Key A - the app's own key in the 2-of-3 payout wallet. On its own it can't
 * move anything; it signs every payout first, and the approver's Trezor adds
 * the second signature.
 *
 * It's generated on the server and stored encrypted in
 * GuildPayoutSettings.appKeyEncrypted (AES-256-GCM). The key that decrypts it
 * is GUILD_APP_KEY_SECRET (32 bytes, base64 or hex) in the environment, so
 * someone would need both the database and the Vercel settings to use it.
 * It's only decrypted while signing.
 */

import crypto from "crypto";
import { BIP32Factory, type BIP32Interface } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { multisigKeyPath, type DescriptorKey } from "./descriptor";
import type { MultisigNetwork } from "./network";

const bip32 = BIP32Factory(ecc);

export class AppKeyError extends Error {}

interface Sealed {
  v: 1;
  network: string;
  fingerprint: string;
  originPath: string;
  xpub: string;
  iv: string;
  tag: string;
  data: string;
}

function secret(): Buffer {
  const raw = process.env.GUILD_APP_KEY_SECRET?.trim();
  if (!raw) throw new AppKeyError("GUILD_APP_KEY_SECRET is not set");
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new AppKeyError("GUILD_APP_KEY_SECRET must be 32 bytes");
  }
  return key;
}

/** A fresh key A, sealed for storage, with its public part. */
export function generateAppKey(network: MultisigNetwork): {
  sealed: string;
  key: Omit<DescriptorKey, "node">;
} {
  const root = bip32.fromSeed(crypto.randomBytes(32), network.bitcoin);
  const originPath = multisigKeyPath(network);
  const account = root.derivePath(originPath);
  const fingerprint = Buffer.from(root.fingerprint).toString("hex");
  const xpub = account.neutered().toBase58();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([
    cipher.update(account.toBase58(), "utf8"),
    cipher.final(),
  ]);
  const sealed: Sealed = {
    v: 1,
    network: network.name,
    fingerprint,
    originPath,
    xpub,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return {
    sealed: JSON.stringify(sealed),
    key: { fingerprint, originPath, xpub },
  };
}

function parseSealed(sealed: string): Sealed {
  try {
    const s = JSON.parse(sealed) as Sealed;
    if (s.v === 1 && s.xpub && s.data) return s;
  } catch {}
  throw new AppKeyError("The stored app key is unreadable");
}

/** The public part of the stored key A - no secret needed. */
export function appKeyPublic(sealed: string): Omit<DescriptorKey, "node"> & {
  network: string;
} {
  const { network, fingerprint, originPath, xpub } = parseSealed(sealed);
  return { network, fingerprint, originPath, xpub };
}

/** Decrypts key A (the account-level private key). */
export function openAppKey(
  sealed: string,
  network: MultisigNetwork,
): BIP32Interface {
  const s = parseSealed(sealed);
  if (s.network !== network.name) {
    throw new AppKeyError(
      `The app key is for ${s.network}, but payouts run on ${network.name}`,
    );
  }
  let xprv: string;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      secret(),
      Buffer.from(s.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(s.tag, "base64"));
    xprv = Buffer.concat([
      decipher.update(Buffer.from(s.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppKeyError(
      "Couldn't decrypt the app key - is GUILD_APP_KEY_SECRET the one it was made with?",
    );
  }
  const node = bip32.fromBase58(xprv, network.bitcoin);
  if (node.neutered().toBase58() !== s.xpub) {
    throw new AppKeyError("The decrypted app key doesn't match its public key");
  }
  return node;
}
