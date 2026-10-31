/**
 * Building and checking a guild's payout transaction. Pure - no database,
 * no network - so it's tested end to end with throwaway keys.
 *
 * One transaction per guild: it spends every available coin at the guild's
 * addresses, pays the company wallet and each member being paid, and sends
 * what's carried back to the guild's change address. It's a PSBT so each
 * signer (the app's key A, then the approver's Trezor) adds its signature
 * in turn.
 */

import { BIP32Factory, type BIP32Interface } from "bip32";
import { Psbt, address as btcAddress, initEccLib } from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { CHANGE, deriveAddress, type MultisigWallet } from "./descriptor";
import type { Branch } from "./descriptor";

// Needed to read taproot (bc1p…) member addresses.
initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

/** Replace-by-fee signalled, so a later fee bump is possible. */
export const RBF_SEQUENCE = 0xfffffffd;
/** Smallest output Bitcoin relays for any address type. */
export const DUST_SATS = 546;

export class PayoutTxError extends Error {}

export interface WalletCoin {
  txid: string;
  vout: number;
  sats: number;
  branch: Branch;
  index: number;
}

export interface PayoutOutput {
  address: string;
  sats: number;
}

// ---- size and fee ----

// A 2-of-3 P2WSH input: 41 bytes outside the witness, plus a witness of
// [empty, sig, sig, 105-byte script] with signatures counted at their
// 73-byte maximum, so the estimate never comes out short.
const INPUT_VBYTES = 41 + (1 + 1 + (1 + 73) * 2 + (1 + 105)) / 4;
// Version, locktime, input/output counts, segwit marker and flag.
const OVERHEAD_VBYTES = 4 + 4 + 1 + 1 + 0.5;

export function estimateVsize(
  inputCount: number,
  outputScriptLengths: number[],
): number {
  const outputs = outputScriptLengths.reduce((s, len) => s + 8 + 1 + len, 0);
  return Math.ceil(OVERHEAD_VBYTES + inputCount * INPUT_VBYTES + outputs);
}

export function outputScriptLength(address: string, wallet: MultisigWallet) {
  try {
    return btcAddress.toOutputScript(address, wallet.network.bitcoin).length;
  } catch {
    throw new PayoutTxError(
      `${address} isn't a valid ${wallet.network.name} address`,
    );
  }
}

/** Fee for a transaction with these inputs and outputs (change included). */
export function estimateFeeSats(params: {
  wallet: MultisigWallet;
  inputCount: number;
  outputAddresses: string[];
  withChange: boolean;
  feeRateSatVb: number;
}): number {
  const lengths = params.outputAddresses.map((a) =>
    outputScriptLength(a, params.wallet),
  );
  if (params.withChange) lengths.push(34); // P2WSH change
  return Math.ceil(
    estimateVsize(params.inputCount, lengths) * params.feeRateSatVb,
  );
}

// ---- building ----

const fingerprintBytes = (fp: string) =>
  Uint8Array.from(Buffer.from(fp, "hex"));

export function buildPayoutPsbt(params: {
  wallet: MultisigWallet;
  /** The guild's payoutAddressIndex. */
  guildIndex: number;
  coins: WalletCoin[];
  outputs: PayoutOutput[];
  changeSats: number;
  feeSats: number;
}): Psbt {
  const { wallet, guildIndex, coins, outputs, changeSats, feeSats } = params;
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

  const psbt = new Psbt({ network: wallet.network.bitcoin });
  psbt.setVersion(2);
  for (const coin of coins) {
    if (coin.index !== guildIndex) {
      throw new PayoutTxError("A coin from another guild's address");
    }
    const derived = deriveAddress(wallet, coin.branch, coin.index);
    psbt.addInput({
      hash: coin.txid,
      index: coin.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: derived.outputScript, value: BigInt(coin.sats) },
      witnessScript: derived.witnessScript,
      bip32Derivation: derived.derivations.map((d) => ({
        masterFingerprint: fingerprintBytes(d.fingerprint),
        pubkey: d.pubkey,
        path: d.path,
      })),
    });
  }
  for (const o of outputs) {
    psbt.addOutput({ address: o.address, value: BigInt(o.sats) });
  }
  if (changeSats > 0) {
    // With the change's script and key paths, so signers can see it comes
    // back to this wallet.
    const change = deriveAddress(wallet, CHANGE, guildIndex);
    psbt.addOutput({
      script: change.outputScript,
      value: BigInt(changeSats),
      witnessScript: change.witnessScript,
      bip32Derivation: change.derivations.map((d) => ({
        masterFingerprint: fingerprintBytes(d.fingerprint),
        pubkey: d.pubkey,
        path: d.path,
      })),
    });
  }
  return psbt;
}

// ---- signing and checking ----

/** Child key of `account` for an input, found by fingerprint + path. */
function childFor(
  psbt: Psbt,
  inputIndex: number,
  account: BIP32Interface,
  fingerprint: string,
) {
  const derivation = psbt.data.inputs[inputIndex].bip32Derivation?.find(
    (d) => Buffer.from(d.masterFingerprint).toString("hex") === fingerprint,
  );
  if (!derivation) {
    throw new PayoutTxError(`Input ${inputIndex} has no key ${fingerprint}`);
  }
  const [branch, index] = derivation.path.split("/").slice(-2).map(Number);
  const child = account.derive(branch).derive(index);
  if (
    Buffer.compare(
      Buffer.from(child.publicKey),
      Buffer.from(derivation.pubkey),
    ) !== 0
  ) {
    throw new PayoutTxError(
      `Input ${inputIndex}: key ${fingerprint} doesn't match`,
    );
  }
  return child;
}

/**
 * Signs every input with an account-level key (key A, or the testnet
 * stand-in for the Trezor).
 */
export function signWithAccountKey(
  psbt: Psbt,
  account: BIP32Interface,
  fingerprint: string,
) {
  psbt.data.inputs.forEach((_, i) => {
    psbt.signInput(i, childFor(psbt, i, account, fingerprint));
  });
}

const validator = (pubkey: Uint8Array, hash: Uint8Array, sig: Uint8Array) =>
  ecc.verify(hash, pubkey, sig);

/** True when every input has a valid signature from this key. */
export function hasValidSignatures(
  psbt: Psbt,
  wallet: MultisigWallet,
  fingerprint: string,
): boolean {
  const key = wallet.keys.find((k) => k.fingerprint === fingerprint);
  if (!key) return false;
  return psbt.data.inputs.every((input, i) => {
    const d = input.bip32Derivation?.find(
      (x) => Buffer.from(x.masterFingerprint).toString("hex") === fingerprint,
    );
    if (!d) return false;
    const has = input.partialSig?.some(
      (s) => Buffer.compare(Buffer.from(s.pubkey), Buffer.from(d.pubkey)) === 0,
    );
    return !!has && psbt.validateSignaturesOfInput(i, validator, d.pubkey);
  });
}

/**
 * Adds another signer's signatures (e.g. from the browser) to our PSBT -
 * only partial signatures, for keys in our wallet, that verify. Nothing
 * else from the other copy is trusted.
 */
export function mergeSignatures(
  ours: Psbt,
  theirs: Psbt,
  wallet: MultisigWallet,
  fingerprint: string,
) {
  if (ours.txInputs.length !== theirs.txInputs.length) {
    throw new PayoutTxError("The signed transaction has different inputs");
  }
  const key = wallet.keys.find((k) => k.fingerprint === fingerprint);
  if (!key) throw new PayoutTxError("That key isn't in the wallet");
  ours.data.inputs.forEach((input, i) => {
    const d = input.bip32Derivation?.find(
      (x) => Buffer.from(x.masterFingerprint).toString("hex") === fingerprint,
    );
    const sig = theirs.data.inputs[i].partialSig?.find(
      (s) =>
        d && Buffer.compare(Buffer.from(s.pubkey), Buffer.from(d.pubkey)) === 0,
    );
    if (!d || !sig) {
      throw new PayoutTxError(`Input ${i} isn't signed by the approver's key`);
    }
    if (
      !input.partialSig?.some(
        (s) =>
          Buffer.compare(Buffer.from(s.pubkey), Buffer.from(d.pubkey)) === 0,
      )
    ) {
      ours.updateInput(i, { partialSig: [sig] });
    }
  });
  if (!hasValidSignatures(ours, wallet, fingerprint)) {
    throw new PayoutTxError("The approver's signature doesn't verify");
  }
}

export interface ExpectedTransaction {
  coins: Pick<WalletCoin, "txid" | "vout" | "sats">[];
  outputs: PayoutOutput[];
  changeSats: number;
  guildIndex: number;
}

/**
 * Checks a PSBT against what the database says it must be: exactly these
 * inputs, these outputs in this order, and the change at the guild's change
 * address. Run before every broadcast.
 */
export function assertMatches(
  psbt: Psbt,
  wallet: MultisigWallet,
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
  });

  const outs = psbt.txOutputs;
  const wantOuts: PayoutOutput[] = [...expected.outputs];
  const changeAddress =
    expected.changeSats > 0
      ? deriveAddress(wallet, CHANGE, expected.guildIndex).address
      : null;
  if (changeAddress) {
    wantOuts.push({ address: changeAddress, sats: expected.changeSats });
  }
  if (outs.length !== wantOuts.length) {
    throw new PayoutTxError(
      "The transaction has a different number of outputs",
    );
  }
  outs.forEach((o, i) => {
    const address = btcAddress.fromOutputScript(
      o.script,
      wallet.network.bitcoin,
    );
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

/** Both signatures in: finalise and return the raw transaction. */
export function finalizePayout(psbt: Psbt): {
  hex: string;
  txid: string;
  vsize: number;
} {
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId(), vsize: tx.virtualSize() };
}

export const psbtFromBase64 = (b64: string, wallet: MultisigWallet) => {
  try {
    return Psbt.fromBase64(b64, { network: wallet.network.bitcoin });
  } catch {
    throw new PayoutTxError("That isn't a valid PSBT");
  }
};

/** Account key from an extended private key (the testnet stand-in). */
export const accountFromXprv = (xprv: string, wallet: MultisigWallet) =>
  bip32.fromBase58(xprv, wallet.network.bitcoin);
