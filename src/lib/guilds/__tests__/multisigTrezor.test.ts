import { describe, expect, it } from "vitest";
import { BIP32Factory } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { Transaction, payments } from "bitcoinjs-lib";
import {
  CHANGE,
  RECEIVE,
  deriveAddress,
  formatDescriptor,
  multisigKeyPath,
  parseDescriptor,
} from "@/lib/guilds/multisig/descriptor";
import { multisigNetworkByName } from "@/lib/guilds/multisig/network";
import {
  buildPayoutPsbt,
  finalizePayout,
  hasValidSignatures,
  psbtFromBase64,
  signWithAccountKey,
  type WalletCoin,
} from "@/lib/guilds/multisig/psbt";
import {
  applyTrezorSignatures,
  buildTrezorSignRequest,
  pathToAddressN,
  prevTxids,
} from "@/lib/guilds/multisig/trezor";

const bip32 = BIP32Factory(ecc);
const network = multisigNetworkByName("testnet");
const path = multisigKeyPath(network);
const signers = [7, 8, 9].map((n) => {
  const root = bip32.fromSeed(new Uint8Array(32).fill(n), network.bitcoin);
  const account = root.derivePath(path);
  return {
    fingerprint: Buffer.from(root.fingerprint).toString("hex"),
    account,
    key: {
      fingerprint: Buffer.from(root.fingerprint).toString("hex"),
      originPath: path,
      xpub: account.neutered().toBase58(),
    },
  };
});
const [A, B] = signers;
const keys = signers.map((s) => s.key);
const wallet = parseDescriptor(formatDescriptor(keys), network);
const GUILD = 2;

/** A real previous transaction paying `sats` to a guild address. */
function prevTx(branch: 0 | 1, sats: number, salt: number) {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(new Uint8Array(32).fill(salt), 0);
  tx.addOutput(deriveAddress(wallet, branch, GUILD).outputScript, BigInt(sats));
  return tx;
}

const prev = [prevTx(RECEIVE, 350_000, 1), prevTx(CHANGE, 20_000, 2)];
const coins: WalletCoin[] = [
  {
    txid: prev[0].getId(),
    vout: 0,
    sats: 350_000,
    branch: RECEIVE,
    index: GUILD,
  },
  {
    txid: prev[1].getId(),
    vout: 0,
    sats: 20_000,
    branch: CHANGE,
    index: GUILD,
  },
];
const prevTxs = Object.fromEntries(prev.map((t) => [t.getId(), t.toHex()]));
const outputs = [
  { address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", sats: 247_000 },
  {
    address: "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
    sats: 80_000,
  },
];

function preparedByA() {
  const psbt = buildPayoutPsbt({
    wallet,
    guildIndex: GUILD,
    coins,
    outputs,
    changeSats: 42_000,
    feeSats: 1_000,
  });
  signWithAccountKey(psbt, A.account, A.fingerprint);
  return psbt.toBase64();
}

describe("Trezor sign request", () => {
  it("describes each input as a 2-of-3 spend with key A's signature in its slot", () => {
    const req = buildTrezorSignRequest({
      psbtBase64: preparedByA(),
      network: "testnet",
      keys,
      approverFingerprint: B.fingerprint,
      prevTxs,
    });
    expect(req.coin).toBe("test");
    expect(req.push).toBe(false);
    expect(req.inputs).toHaveLength(2);
    const [i0, i1] = req.inputs;
    expect(i0.address_n).toEqual(pathToAddressN(`${path}/0/${GUILD}`));
    expect(i1.address_n).toEqual(pathToAddressN(`${path}/1/${GUILD}`));
    expect(i0.sequence).toBe(0xfffffffd);
    expect(i0.amount).toBe("350000");
    for (const input of req.inputs) {
      // Keys in the script's (sorted) order, A's signature filled in only.
      expect(input.multisig.pubkeys).toHaveLength(3);
      expect(input.multisig.signatures.filter((s) => s !== "")).toHaveLength(1);
      const aSlot = input.multisig.pubkeys.findIndex(
        (p) => p.node === A.key.xpub,
      );
      expect(input.multisig.signatures[aSlot]).toMatch(/^30[0-9a-f]+$/);
      // Rebuilding the script from what we told the Trezor gives our address.
      const pubs = input.multisig.pubkeys.map(
        (p) =>
          bip32
            .fromBase58(p.node, network.bitcoin)
            .derive(p.address_n[0])
            .derive(p.address_n[1]).publicKey,
      );
      const p2wsh = payments.p2wsh({
        redeem: payments.p2ms({
          m: 2,
          pubkeys: pubs,
          network: network.bitcoin,
        }),
        network: network.bitcoin,
      });
      expect([
        deriveAddress(wallet, RECEIVE, GUILD).address,
        deriveAddress(wallet, CHANGE, GUILD).address,
      ]).toContain(p2wsh.address);
    }
  });

  it("marks the change as this wallet's, and the rest as payments", () => {
    const req = buildTrezorSignRequest({
      psbtBase64: preparedByA(),
      network: "testnet",
      keys,
      approverFingerprint: B.fingerprint,
      prevTxs,
    });
    expect(req.outputs.map((o) => o.script_type)).toEqual([
      "PAYTOADDRESS",
      "PAYTOADDRESS",
      "PAYTOWITNESS",
    ]);
    const change = req.outputs[2];
    if (change.script_type !== "PAYTOWITNESS") throw new Error("no change");
    expect(change.address_n).toEqual(pathToAddressN(`${path}/1/${GUILD}`));
    expect(change.amount).toBe("42000");
    expect(change.multisig.signatures).toEqual(["", "", ""]);
  });

  it("passes the previous transactions and refuses a missing or wrong one", () => {
    const psbtBase64 = preparedByA();
    expect(prevTxids(psbtBase64).sort()).toEqual(Object.keys(prevTxs).sort());
    const req = buildTrezorSignRequest({
      psbtBase64,
      network: "testnet",
      keys,
      approverFingerprint: B.fingerprint,
      prevTxs,
    });
    expect(req.refTxs.map((r) => r.hash).sort()).toEqual(
      Object.keys(prevTxs).sort(),
    );
    expect(req.refTxs[0].bin_outputs[0].amount).toMatch(/^\d+$/);
    expect(() =>
      buildTrezorSignRequest({
        psbtBase64,
        network: "testnet",
        keys,
        approverFingerprint: B.fingerprint,
        prevTxs: {},
      }),
    ).toThrow(/wasn't fetched/);
    const swapped = {
      [coins[0].txid]: prev[1].toHex(),
      [coins[1].txid]: prev[1].toHex(),
    };
    expect(() =>
      buildTrezorSignRequest({
        psbtBase64,
        network: "testnet",
        keys,
        approverFingerprint: B.fingerprint,
        prevTxs: swapped,
      }),
    ).toThrow(/doesn't match/);
  });
});

describe("applyTrezorSignatures", () => {
  it("adds the device's DER signatures so the payout verifies and finalises", () => {
    const psbtBase64 = preparedByA();
    // Stand in for the Trezor: sign with key B and keep only what Connect
    // returns - the DER signature without the sighash byte, per input.
    const device = psbtFromBase64(psbtBase64, wallet);
    signWithAccountKey(device, B.account, B.fingerprint);
    const signatures = device.data.inputs.map((input, i) => {
      const bPub = B.account.derive(coins[i].branch).derive(GUILD).publicKey;
      const sig = input.partialSig!.find(
        (s) => Buffer.compare(Buffer.from(s.pubkey), Buffer.from(bPub)) === 0,
      )!;
      return Buffer.from(sig.signature.slice(0, -1)).toString("hex");
    });

    const signed = applyTrezorSignatures({
      psbtBase64,
      approverFingerprint: B.fingerprint,
      signatures,
    });
    const psbt = psbtFromBase64(signed, wallet);
    expect(hasValidSignatures(psbt, wallet, A.fingerprint)).toBe(true);
    expect(hasValidSignatures(psbt, wallet, B.fingerprint)).toBe(true);
    expect(finalizePayout(psbt).txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses the wrong number of signatures", () => {
    expect(() =>
      applyTrezorSignatures({
        psbtBase64: preparedByA(),
        approverFingerprint: B.fingerprint,
        signatures: ["30"],
      }),
    ).toThrow(/wrong number/);
  });
});

describe("pathToAddressN", () => {
  it("hardens the steps marked ' or h", () => {
    expect(pathToAddressN("m/48'/1h/0'/2'/1/5")).toEqual([
      0x80000030, 0x80000001, 0x80000000, 0x80000002, 1, 5,
    ]);
  });
});
