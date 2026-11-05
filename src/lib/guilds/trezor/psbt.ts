/**
 * Building and checking a guild's payout transaction. Pure - no database,
 * no network - so it's tested end to end with a software key standing in
 * for the Trezor.
 *
 * One transaction per guild, from the guild's own Trezor account: it spends
 * the guild's available coins, pays the company wallet and each member
 * being paid, and sends what's carried to the guild's next change address
 * (1/k). The app never signs: the PSBT goes to the Trezor, which returns one
 * signature per input; the server puts them into its own copy, checks them
 * and the outputs against the database, then finalises it.
 */

import { BIP32Factory } from "bip32";
import {
  Psbt,
  Transaction,
  address as btcAddress,
  initEccLib,
  payments,
} from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { DUST_SATS } from "../distribution";
import { CHANGE, addressPath, parseAccountXpub } from "./account";
import type { PayoutNetwork } from "./network";

export { DUST_SATS };

// Needed to read taproot (bc1p…) member addresses.
initEccLib(ecc);
BIP32Factory(ecc);

/** Replace-by-fee signalled, so a later fee bump is possible. */
export const RBF_SEQUENCE = 0xfffffffd;

export class PayoutTxError extends Error {}

/** A guild's Trezor account, as the app knows it. */
export interface GuildAccount {
  network: PayoutNetwork;
  /** The account number n in m/84'/coin'/n'. */
  account: number;
  xpub: string;
  /** The payout Trezor's master fingerprint (8 hex). */
  fingerprint: string;
}

export interface WalletCoin {
  txid: string;
  vout: number;
  sats: number;
  branch: number;
  index: number;
}

export interface PayoutOutput {
  address: string;
  sats: number;
}

// ---- keys ----

function childKey(acct: GuildAccount, branch: number, index: number) {
  const node = parseAccountXpub(acct.xpub, acct.network)
    .derive(branch)
    .derive(index);
  const script = payments.p2wpkh({
    pubkey: node.publicKey,
    network: acct.network.bitcoin,
  });
  return {
    pubkey: node.publicKey,
    outputScript: script.output!,
    address: script.address!,
    path: addressPath(acct.network, acct.account, branch, index),
  };
}

export function changeAddress(acct: GuildAccount, index: number): string {
  return childKey(acct, CHANGE, index).address;
}

const fingerprintBytes = (fp: string) =>
  Uint8Array.from(Buffer.from(fp, "hex"));

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// ---- size and fee ----

// A P2WPKH input: 41 bytes outside the witness, plus a witness of
// [sig, 33-byte key] with the signature at its 73-byte maximum, so the
// estimate never comes out short.
const INPUT_VBYTES = 41 + (1 + (1 + 73) + (1 + 33)) / 4;
// Version, locktime, input/output counts, segwit marker and flag.
const OVERHEAD_VBYTES = 4 + 4 + 1 + 1 + 0.5;
/** A P2WPKH change output's script. */
const CHANGE_SCRIPT_LENGTH = 22;

export function estimateVsize(
  inputCount: number,
  outputScriptLengths: number[],
): number {
  const outputs = outputScriptLengths.reduce((s, len) => s + 8 + 1 + len, 0);
  return Math.ceil(OVERHEAD_VBYTES + inputCount * INPUT_VBYTES + outputs);
}

export function outputScriptLength(address: string, network: PayoutNetwork) {
  try {
    return btcAddress.toOutputScript(address, network.bitcoin).length;
  } catch {
    throw new PayoutTxError(`${address} isn't a valid ${network.name} address`);
  }
}

/** Fee for a transaction with these inputs and outputs (change included). */
export function estimateFeeSats(params: {
  network: PayoutNetwork;
  inputCount: number;
  outputAddresses: string[];
  withChange: boolean;
  feeRateSatVb: number;
}): number {
  const lengths = params.outputAddresses.map((a) =>
    outputScriptLength(a, params.network),
  );
  if (params.withChange) lengths.push(CHANGE_SCRIPT_LENGTH);
  return Math.ceil(
    estimateVsize(params.inputCount, lengths) * params.feeRateSatVb,
  );
}

// ---- building ----

export function buildPayoutPsbt(params: {
  acct: GuildAccount;
  coins: WalletCoin[];
  outputs: PayoutOutput[];
  changeSats: number;
  /** k in 1/k, when there's change. */
  changeIndex: number;
  feeSats: number;
}): Psbt {
  const { acct, coins, outputs, changeSats, changeIndex, feeSats } = params;
  if (coins.length === 0) throw new PayoutTxError("No coins to spend");
  if (outputs.length === 0 && changeSats === 0) {
    throw new PayoutTxError("Nothing to send");
  }
  for (const o of outputs) {
    if (!Number.isInteger(o.sats) || o.sats < DUST_SATS) {
      throw new PayoutTxError(
        `The output to ${o.address} is below ${DUST_SATS} sats`,
      );
    }
    outputScriptLength(o.address, acct.network);
  }
  if (
    changeSats !== 0 &&
    (!Number.isInteger(changeSats) || changeSats < DUST_SATS)
  ) {
    throw new PayoutTxError(`Change is below ${DUST_SATS} sats`);
  }
  const inSats = coins.reduce((s, c) => s + c.sats, 0);
  const outSats = outputs.reduce((s, o) => s + o.sats, 0) + changeSats;
  if (inSats - outSats !== feeSats) {
    throw new PayoutTxError(
      `Inputs ${inSats} - outputs ${outSats} sats isn't the fee of ${feeSats} sats`,
    );
  }
  if (feeSats <= 0) throw new PayoutTxError("The fee must be above 0");

  const psbt = new Psbt({ network: acct.network.bitcoin });
  psbt.setVersion(2);
  for (const coin of coins) {
    const key = childKey(acct, coin.branch, coin.index);
    psbt.addInput({
      hash: coin.txid,
      index: coin.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: key.outputScript, value: BigInt(coin.sats) },
      bip32Derivation: [
        {
          masterFingerprint: fingerprintBytes(acct.fingerprint),
          pubkey: key.pubkey,
          path: key.path,
        },
      ],
    });
  }
  for (const o of outputs) {
    psbt.addOutput({ address: o.address, value: BigInt(o.sats) });
  }
  if (changeSats > 0) {
    // With its key path, so the Trezor recognises it as this account's
    // change and doesn't show it as a payment.
    const change = childKey(acct, CHANGE, changeIndex);
    psbt.addOutput({
      script: change.outputScript,
      value: BigInt(changeSats),
      bip32Derivation: [
        {
          masterFingerprint: fingerprintBytes(acct.fingerprint),
          pubkey: change.pubkey,
          path: change.path,
        },
      ],
    });
  }
  return psbt;
}

// ---- signatures ----

const validator = (pubkey: Uint8Array, hash: Uint8Array, sig: Uint8Array) =>
  ecc.verify(hash, pubkey, sig);

/** The key each input must be signed with: the one in its derivation. */
function inputPubkey(psbt: Psbt, i: number, acct: GuildAccount): Uint8Array {
  const d = psbt.data.inputs[i].bip32Derivation?.[0];
  if (!d) throw new PayoutTxError(`Input ${i} has no key path`);
  const [branch, index] = d.path.split("/").slice(-2).map(Number);
  const key = childKey(acct, branch, index);
  if (
    !sameBytes(key.pubkey, d.pubkey) ||
    key.path !== d.path ||
    Buffer.from(d.masterFingerprint).toString("hex") !== acct.fingerprint
  ) {
    throw new PayoutTxError(`Input ${i} isn't from the guild's account`);
  }
  return key.pubkey;
}

/**
 * Puts the Trezor's signatures (one DER hex per input, as Trezor Connect
 * returns them) into the PSBT and checks every one verifies against the
 * guild account's key.
 */
export function applySignatures(
  psbt: Psbt,
  acct: GuildAccount,
  signatures: string[],
) {
  if (signatures.length !== psbt.data.inputs.length) {
    throw new PayoutTxError(
      "The Trezor returned the wrong number of signatures",
    );
  }
  psbt.data.inputs.forEach((input, i) => {
    const pubkey = inputPubkey(psbt, i, acct);
    if (!/^(?:[0-9a-f]{2})+$/i.test(signatures[i])) {
      throw new PayoutTxError(`Signature ${i} isn't hex`);
    }
    const der = Uint8Array.from(Buffer.from(signatures[i], "hex"));
    const signature = new Uint8Array(der.length + 1);
    signature.set(der);
    signature[der.length] = Transaction.SIGHASH_ALL;
    if (input.partialSig?.length) {
      throw new PayoutTxError(`Input ${i} is already signed`);
    }
    psbt.updateInput(i, { partialSig: [{ pubkey, signature }] });
  });
  if (!hasValidSignatures(psbt, acct)) {
    throw new PayoutTxError("The Trezor's signatures don't verify");
  }
}

/** True when every input has a valid signature from the account's key. */
export function hasValidSignatures(psbt: Psbt, acct: GuildAccount): boolean {
  return psbt.data.inputs.every((input, i) => {
    let pubkey: Uint8Array;
    try {
      pubkey = inputPubkey(psbt, i, acct);
    } catch {
      return false;
    }
    const has = input.partialSig?.some((s) => sameBytes(s.pubkey, pubkey));
    try {
      return !!has && psbt.validateSignaturesOfInput(i, validator, pubkey);
    } catch {
      return false;
    }
  });
}

// ---- checking ----

export interface ExpectedTransaction {
  coins: Pick<WalletCoin, "txid" | "vout" | "sats">[];
  outputs: PayoutOutput[];
  changeSats: number;
  changeIndex: number;
}

/**
 * Checks a PSBT against what the database says it must be: exactly these
 * inputs and amounts, these outputs in this order, and the change at the
 * guild's own change address. Run before signing and before broadcasting.
 */
export function assertMatches(
  psbt: Psbt,
  acct: GuildAccount,
  expected: ExpectedTransaction,
) {
  const inputs = psbt.txInputs.map((x) => ({
    txid: Buffer.from(x.hash).reverse().toString("hex"),
    vout: x.index,
  }));
  const want = expected.coins.map((c) => `${c.txid}:${c.vout}`).sort();
  const got = inputs.map((c) => `${c.txid}:${c.vout}`).sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    throw new PayoutTxError(
      "The transaction spends different coins than prepared",
    );
  }
  psbt.data.inputs.forEach((input, i) => {
    const coin = expected.coins.find(
      (c) => c.txid === inputs[i].txid && c.vout === inputs[i].vout,
    )!;
    if (input.witnessUtxo?.value !== BigInt(coin.sats)) {
      throw new PayoutTxError(`Input ${i} has the wrong amount`);
    }
    inputPubkey(psbt, i, acct);
  });

  const wantOuts: PayoutOutput[] = [...expected.outputs];
  if (expected.changeSats > 0) {
    wantOuts.push({
      address: changeAddress(acct, expected.changeIndex),
      sats: expected.changeSats,
    });
  }
  const outs = psbt.txOutputs;
  if (outs.length !== wantOuts.length) {
    throw new PayoutTxError(
      "The transaction has a different number of outputs",
    );
  }
  outs.forEach((o, i) => {
    const address = btcAddress.fromOutputScript(o.script, acct.network.bitcoin);
    if (
      address !== wantOuts[i].address ||
      o.value !== BigInt(wantOuts[i].sats)
    ) {
      throw new PayoutTxError(
        `Output ${i} pays ${o.value} sats to ${address}, expected ${wantOuts[i].sats} to ${wantOuts[i].address}`,
      );
    }
  });
}

/** Signed: finalise and return the raw transaction. */
export function finalizePayout(psbt: Psbt): {
  hex: string;
  txid: string;
  vsize: number;
} {
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId(), vsize: tx.virtualSize() };
}

export const psbtFromBase64 = (b64: string, network: PayoutNetwork) => {
  try {
    return Psbt.fromBase64(b64, { network: network.bitcoin });
  } catch {
    throw new PayoutTxError("That isn't a valid PSBT");
  }
};
