/**
 * Turning a prepared payout PSBT into Trezor Connect's signTransaction call.
 * Pure and browser-safe (no Buffer, no Connect import), so it's unit-tested.
 *
 * Trezor Connect doesn't take a PSBT. Each input is described by its key
 * path in the guild's account (SPENDWITNESS, Native SegWit) and its amount;
 * payments by address; the change output by its key path (PAYTOWITNESS), so
 * the device checks it belongs to the same account and doesn't show it as a
 * payment. The previous transactions are passed in (refTxs) rather than
 * looked up by Connect. push is false: the app checks and broadcasts.
 */

import { Psbt, Transaction, networks } from "bitcoinjs-lib";

const HARDENED = 0x80000000;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export class TrezorRequestError extends Error {}

/** "m/84'/1'/3'/0/0" → [84', 1', 3', 0, 0] as Trezor wants it. */
export function pathToAddressN(path: string): number[] {
  const parts = path.replace(/^m\//, "").split("/");
  return parts.map((p) => {
    const hardened = /['h]$/.test(p);
    const n = Number(p.replace(/['h]$/, ""));
    if (!Number.isInteger(n) || n < 0 || n >= HARDENED) {
      throw new TrezorRequestError(`Bad path step "${p}" in ${path}`);
    }
    return hardened ? (n | HARDENED) >>> 0 : n;
  });
}

export interface TrezorInput {
  address_n: number[];
  prev_hash: string;
  prev_index: number;
  amount: string;
  sequence: number;
  script_type: "SPENDWITNESS";
}

export type TrezorOutput =
  | { address: string; amount: string; script_type: "PAYTOADDRESS" }
  | { address_n: number[]; amount: string; script_type: "PAYTOWITNESS" };

export interface TrezorRefTx {
  hash: string;
  version: number;
  inputs: {
    prev_hash: string;
    prev_index: number;
    script_sig: string;
    sequence: number;
  }[];
  bin_outputs: { amount: string; script_pubkey: string }[];
  lock_time: number;
}

export interface TrezorSignRequest {
  coin: "btc" | "test";
  inputs: TrezorInput[];
  outputs: TrezorOutput[];
  refTxs: TrezorRefTx[];
  push: false;
}

function refTx(txid: string, hex: string): TrezorRefTx {
  const tx = Transaction.fromHex(hex);
  if (tx.getId() !== txid) {
    throw new TrezorRequestError(
      `The previous transaction ${txid} doesn't match`,
    );
  }
  return {
    hash: txid,
    version: tx.version,
    inputs: tx.ins.map((i) => ({
      prev_hash: toHex(Uint8Array.from(i.hash).reverse()),
      prev_index: i.index,
      script_sig: toHex(i.script),
      sequence: i.sequence,
    })),
    bin_outputs: tx.outs.map((o) => ({
      amount: o.value.toString(),
      script_pubkey: toHex(o.script),
    })),
    lock_time: tx.locktime,
  };
}

/** The inputs' previous transactions, by txid - the caller fetches them. */
export function prevTxids(psbtBase64: string): string[] {
  const psbt = Psbt.fromBase64(psbtBase64);
  // (Only txids are read, so the network doesn't matter here.)
  return [
    ...new Set(
      psbt.txInputs.map((i) => toHex(Uint8Array.from(i.hash).reverse())),
    ),
  ];
}

export function buildTrezorSignRequest(params: {
  psbtBase64: string;
  network: "mainnet" | "testnet";
  /** The payout Trezor's master fingerprint; every key path must be its. */
  fingerprint: string;
  /** Raw hex of each input's previous transaction, by txid. */
  prevTxs: Record<string, string>;
}): TrezorSignRequest {
  // The network decides how addresses are written (bc1… / tb1…).
  const psbt = Psbt.fromBase64(params.psbtBase64, {
    network: params.network === "mainnet" ? networks.bitcoin : networks.testnet,
  });
  const pathOf = (
    derivations: { masterFingerprint: Uint8Array; path: string }[] | undefined,
    what: string,
  ) => {
    const d = derivations?.[0];
    if (!d) throw new TrezorRequestError(`${what} has no key path`);
    if (toHex(d.masterFingerprint) !== params.fingerprint) {
      throw new TrezorRequestError(`${what} is from another Trezor`);
    }
    return pathToAddressN(d.path);
  };

  const inputs: TrezorInput[] = psbt.data.inputs.map((input, i) => {
    const tx = psbt.txInputs[i];
    if (!input.witnessUtxo) {
      throw new TrezorRequestError(`Input ${i} has no amount`);
    }
    return {
      address_n: pathOf(input.bip32Derivation, `Input ${i}`),
      prev_hash: toHex(Uint8Array.from(tx.hash).reverse()),
      prev_index: tx.index,
      amount: input.witnessUtxo.value.toString(),
      sequence: tx.sequence ?? 0xffffffff,
      script_type: "SPENDWITNESS",
    };
  });

  const outputs: TrezorOutput[] = psbt.txOutputs.map((o, j) => {
    const meta = psbt.data.outputs[j];
    if (meta.bip32Derivation?.length) {
      return {
        address_n: pathOf(meta.bip32Derivation, `Output ${j}`),
        amount: o.value.toString(),
        script_type: "PAYTOWITNESS",
      };
    }
    if (!o.address) throw new TrezorRequestError(`Output ${j} has no address`);
    return {
      address: o.address,
      amount: o.value.toString(),
      script_type: "PAYTOADDRESS",
    };
  });

  const refTxs = prevTxids(params.psbtBase64).map((txid) => {
    const hex = params.prevTxs[txid];
    if (!hex) {
      throw new TrezorRequestError(
        `Previous transaction ${txid} wasn't fetched`,
      );
    }
    return refTx(txid, hex);
  });

  return {
    coin: params.network === "mainnet" ? "btc" : "test",
    inputs,
    outputs,
    refTxs,
    push: false,
  };
}
