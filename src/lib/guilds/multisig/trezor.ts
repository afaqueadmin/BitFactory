/**
 * Turning a prepared payout PSBT into Trezor Connect's signTransaction call,
 * and putting the Trezor's signatures back into the PSBT. Pure and
 * browser-safe (no Buffer, no Connect import), so it's unit-tested with a
 * software key standing in for the device.
 *
 * Trezor Connect doesn't take a PSBT. Each input is described as a 2-of-3
 * multisig spend: the three xpubs with the child path, in the order the
 * witness script lists the keys (sortedmulti), plus key A's signature
 * already in its slot. The change output gets the same multisig details,
 * so the device recognises it as coming back to this wallet rather than
 * showing it as a payment. The previous transactions are passed in
 * (refTxs) instead of letting Connect look them up.
 */

import { Psbt, Transaction, payments } from "bitcoinjs-lib";

const HARDENED = 0x80000000;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new TrezorRequestError("Bad hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export class TrezorRequestError extends Error {}

/** "m/48'/1'/0'/2'/0/3" → [48', 1', 0', 2', 0, 3] as Trezor wants it. */
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

export interface WalletKeyInfo {
  fingerprint: string;
  originPath: string;
  xpub: string;
}

interface TrezorMultisig {
  pubkeys: { node: string; address_n: number[] }[];
  signatures: string[];
  m: number;
}

export interface TrezorInput {
  address_n: number[];
  prev_hash: string;
  prev_index: number;
  amount: string;
  sequence: number;
  script_type: "SPENDWITNESS";
  multisig: TrezorMultisig;
}

export type TrezorOutput =
  | { address: string; amount: string; script_type: "PAYTOADDRESS" }
  | {
      address_n: number[];
      amount: string;
      script_type: "PAYTOWITNESS";
      multisig: TrezorMultisig;
    };

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

interface Derivation {
  masterFingerprint: Uint8Array;
  pubkey: Uint8Array;
  path: string;
}

/**
 * The multisig description for one input or change output: the keys in
 * the order the witness script has them, each as its account xpub plus the
 * last two path steps.
 */
function multisigFor(
  witnessScript: Uint8Array,
  derivations: Derivation[],
  keys: WalletKeyInfo[],
  signatureFor: (pubkey: Uint8Array) => string,
): TrezorMultisig {
  const p2ms = payments.p2ms({ output: witnessScript });
  if (p2ms.m !== 2 || p2ms.pubkeys?.length !== 3) {
    throw new TrezorRequestError("Not a 2-of-3 multisig script");
  }
  const pubkeys = p2ms.pubkeys.map((pub) => {
    const d = derivations.find((x) => sameBytes(x.pubkey, pub));
    if (!d) throw new TrezorRequestError("A key in the script has no path");
    const key = keys.find((k) => k.fingerprint === toHex(d.masterFingerprint));
    if (!key)
      throw new TrezorRequestError("A key in the script isn't in the wallet");
    if (!d.path.startsWith(`${key.originPath}/`)) {
      throw new TrezorRequestError(`Unexpected path ${d.path}`);
    }
    return {
      node: key.xpub,
      address_n: pathToAddressN(`m/${d.path.slice(key.originPath.length + 1)}`),
      pubkey: pub,
    };
  });
  return {
    pubkeys: pubkeys.map(({ node, address_n }) => ({ node, address_n })),
    signatures: pubkeys.map((p) => signatureFor(p.pubkey)),
    m: 2,
  };
}

function approverDerivation(
  derivations: Derivation[] | undefined,
  fingerprint: string,
) {
  const d = derivations?.find(
    (x) => toHex(x.masterFingerprint) === fingerprint,
  );
  if (!d) throw new TrezorRequestError(`No path for key ${fingerprint}`);
  return d;
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
  return [
    ...new Set(
      psbt.txInputs.map((i) => toHex(Uint8Array.from(i.hash).reverse())),
    ),
  ];
}

export function buildTrezorSignRequest(params: {
  psbtBase64: string;
  network: "mainnet" | "testnet";
  keys: WalletKeyInfo[];
  /** The key the Trezor holds. */
  approverFingerprint: string;
  /** Raw hex of each input's previous transaction, by txid. */
  prevTxs: Record<string, string>;
}): TrezorSignRequest {
  const { keys, approverFingerprint } = params;
  const psbt = Psbt.fromBase64(params.psbtBase64);

  const inputs: TrezorInput[] = psbt.data.inputs.map((input, i) => {
    const tx = psbt.txInputs[i];
    if (!input.witnessUtxo || !input.witnessScript || !input.bip32Derivation) {
      throw new TrezorRequestError(
        `Input ${i} is missing its multisig details`,
      );
    }
    const mine = approverDerivation(input.bip32Derivation, approverFingerprint);
    return {
      address_n: pathToAddressN(mine.path),
      prev_hash: toHex(Uint8Array.from(tx.hash).reverse()),
      prev_index: tx.index,
      amount: input.witnessUtxo.value.toString(),
      sequence: tx.sequence ?? 0xffffffff,
      script_type: "SPENDWITNESS",
      multisig: multisigFor(
        input.witnessScript,
        input.bip32Derivation,
        keys,
        (pub) => {
          const sig = input.partialSig?.find((s) => sameBytes(s.pubkey, pub));
          // Trezor wants the DER signature without the sighash byte.
          return sig ? toHex(sig.signature.slice(0, -1)) : "";
        },
      ),
    };
  });

  const outputs: TrezorOutput[] = psbt.txOutputs.map((o, j) => {
    const meta = psbt.data.outputs[j];
    if (meta.witnessScript && meta.bip32Derivation) {
      const mine = approverDerivation(
        meta.bip32Derivation,
        approverFingerprint,
      );
      return {
        address_n: pathToAddressN(mine.path),
        amount: o.value.toString(),
        script_type: "PAYTOWITNESS",
        multisig: multisigFor(
          meta.witnessScript,
          meta.bip32Derivation,
          keys,
          () => "",
        ),
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
    if (!hex)
      throw new TrezorRequestError(
        `Previous transaction ${txid} wasn't fetched`,
      );
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

/**
 * Adds the Trezor's signatures (one DER hex per input, as Connect returns
 * them) to the PSBT. The server checks them again before broadcasting.
 */
export function applyTrezorSignatures(params: {
  psbtBase64: string;
  approverFingerprint: string;
  signatures: string[];
}): string {
  const psbt = Psbt.fromBase64(params.psbtBase64);
  if (params.signatures.length !== psbt.data.inputs.length) {
    throw new TrezorRequestError(
      "The Trezor returned the wrong number of signatures",
    );
  }
  psbt.data.inputs.forEach((input, i) => {
    const mine = approverDerivation(
      input.bip32Derivation,
      params.approverFingerprint,
    );
    const der = fromHex(params.signatures[i]);
    const signature = new Uint8Array(der.length + 1);
    signature.set(der);
    signature[der.length] = Transaction.SIGHASH_ALL;
    if (!input.partialSig?.some((s) => sameBytes(s.pubkey, mine.pubkey))) {
      psbt.updateInput(i, { partialSig: [{ pubkey: mine.pubkey, signature }] });
    }
  });
  return psbt.toBase64();
}
