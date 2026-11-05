import { describe, expect, it } from "vitest";
import { BIP32Factory } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { Psbt, Transaction, payments } from "bitcoinjs-lib";
import {
  accountPath,
  messageHash,
  receivingAddress,
  sealMessage,
  sealPath,
} from "../trezor/account";
import { payoutNetworkByName } from "../trezor/network";
import {
  PayoutTxError,
  applySignatures,
  assertMatches,
  buildPayoutPsbt,
  changeAddress,
  estimateFeeSats,
  finalizePayout,
  hasValidSignatures,
  type GuildAccount,
} from "../trezor/psbt";
import {
  buildTrezorSignRequest,
  pathToAddressN,
} from "../trezor/trezorRequest";
import { isSealValid } from "../trezor/seals";

const bip32 = BIP32Factory(ecc);
const testnet = payoutNetworkByName("testnet");
const root = bip32.fromSeed(Buffer.alloc(32, 7), testnet.bitcoin);
const fingerprint = Buffer.from(root.fingerprint).toString("hex");
const ACCOUNT = 3;
const accountNode = root.derivePath(accountPath(testnet, ACCOUNT));
const acct: GuildAccount = {
  network: testnet,
  account: ACCOUNT,
  xpub: accountNode.neutered().toBase58(),
  fingerprint,
};

// Two members' and the company's wallets: other keys on testnet.
const other = bip32.fromSeed(Buffer.alloc(32, 9), testnet.bitcoin);
const wallet = (i: number) =>
  payments.p2wpkh({
    pubkey: other.derive(i).publicKey,
    network: testnet.bitcoin,
  }).address!;
const COMPANY = wallet(0);
const GM = wallet(1);

/** A fake previous transaction paying `sats` to the guild's 0/0. */
function fundingTx(sats: number, salt: number) {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, salt), 0);
  tx.addOutput(
    payments.p2wpkh({
      pubkey: accountNode.derive(0).derive(0).publicKey,
      network: testnet.bitcoin,
    }).output!,
    BigInt(sats),
  );
  return tx;
}

const luxor = fundingTx(424_858, 1);
const coins = [
  { txid: luxor.getId(), vout: 0, sats: 424_858, branch: 0, index: 0 },
];
const outputs = [
  { address: COMPANY, sats: 248_000 },
  { address: GM, sats: 106_700 },
];
const FEE = 300;
const CHANGE_SATS = 424_858 - 248_000 - 106_700 - FEE;

/** Signs like the Trezor: one DER signature (no sighash byte) per input. */
function trezorSignatures(psbtB64: string, node = accountNode) {
  const psbt = Psbt.fromBase64(psbtB64, { network: testnet.bitcoin });
  psbt.data.inputs.forEach((input, i) => {
    const [branch, index] = input
      .bip32Derivation![0].path.split("/")
      .slice(-2)
      .map(Number);
    psbt.signInput(i, node.derive(branch).derive(index));
  });
  return psbt.data.inputs.map((input) =>
    Buffer.from(input.partialSig![0].signature.slice(0, -1)).toString("hex"),
  );
}

const build = () =>
  buildPayoutPsbt({
    acct,
    coins,
    outputs,
    changeSats: CHANGE_SATS,
    changeIndex: 2,
    feeSats: FEE,
  });
const expected = {
  coins,
  outputs,
  changeSats: CHANGE_SATS,
  changeIndex: 2,
};

describe("building a guild payout", () => {
  it("pays the company, the members and change back to 1/k of the account", () => {
    const psbt = build();
    expect(psbt.txOutputs.map((o) => o.address)).toEqual([
      COMPANY,
      GM,
      changeAddress(acct, 2),
    ]);
    expect(psbt.data.outputs[2].bip32Derivation?.[0].path).toBe(
      "m/84'/1'/3'/1/2",
    );
    expect(psbt.data.inputs[0].bip32Derivation?.[0].path).toBe(
      "m/84'/1'/3'/0/0",
    );
    expect(() => assertMatches(psbt, acct, expected)).not.toThrow();
  });

  it("refuses sums that don't leave exactly the fee, and dust outputs", () => {
    expect(() =>
      buildPayoutPsbt({
        acct,
        coins,
        outputs,
        changeSats: CHANGE_SATS + 1,
        changeIndex: 2,
        feeSats: FEE,
      }),
    ).toThrow(PayoutTxError);
    expect(() =>
      buildPayoutPsbt({
        acct,
        coins,
        outputs: [{ address: GM, sats: 100 }],
        changeSats: 0,
        changeIndex: 0,
        feeSats: 424_758,
      }),
    ).toThrow(/below 546/);
  });

  it("estimates a fee that covers the real signed size", () => {
    const psbt = build();
    applySignatures(psbt, acct, trezorSignatures(psbt.toBase64()));
    const { vsize } = finalizePayout(psbt);
    const fee = estimateFeeSats({
      network: testnet,
      inputCount: 1,
      outputAddresses: [COMPANY, GM],
      withChange: true,
      feeRateSatVb: 1,
    });
    expect(fee).toBeGreaterThanOrEqual(vsize);
    expect(fee - vsize).toBeLessThan(5);
  });
});

describe("the Trezor request", () => {
  it("describes inputs and change by path, payments by address", () => {
    const req = buildTrezorSignRequest({
      psbtBase64: build().toBase64(),
      network: "testnet",
      fingerprint,
      prevTxs: { [luxor.getId()]: luxor.toHex() },
    });
    expect(req.coin).toBe("test");
    expect(req.push).toBe(false);
    expect(req.inputs[0]).toMatchObject({
      address_n: pathToAddressN("m/84'/1'/3'/0/0"),
      amount: "424858",
      script_type: "SPENDWITNESS",
      prev_index: 0,
    });
    expect(req.outputs[0]).toEqual({
      address: COMPANY,
      amount: "248000",
      script_type: "PAYTOADDRESS",
    });
    expect(req.outputs[2]).toEqual({
      address_n: pathToAddressN("m/84'/1'/3'/1/2"),
      amount: String(CHANGE_SATS),
      script_type: "PAYTOWITNESS",
    });
    expect(req.refTxs[0].hash).toBe(luxor.getId());
  });

  it("refuses another Trezor's PSBT and a missing previous transaction", () => {
    const b64 = build().toBase64();
    expect(() =>
      buildTrezorSignRequest({
        psbtBase64: b64,
        network: "testnet",
        fingerprint: "00000000",
        prevTxs: { [luxor.getId()]: luxor.toHex() },
      }),
    ).toThrow(/another Trezor/);
    expect(() =>
      buildTrezorSignRequest({
        psbtBase64: b64,
        network: "testnet",
        fingerprint,
        prevTxs: {},
      }),
    ).toThrow(/wasn't fetched/);
  });
});

describe("checking the Trezor's signatures", () => {
  it("accepts the account key's signatures and finalises", () => {
    const psbt = build();
    applySignatures(psbt, acct, trezorSignatures(psbt.toBase64()));
    expect(hasValidSignatures(psbt, acct)).toBe(true);
    assertMatches(psbt, acct, expected);
    const { hex, txid } = finalizePayout(psbt);
    const tx = Transaction.fromHex(hex);
    expect(tx.getId()).toBe(txid);
    expect(tx.outs).toHaveLength(3);
  });

  it("refuses signatures made for another transaction", () => {
    const otherTx = buildPayoutPsbt({
      acct,
      coins,
      outputs,
      changeSats: CHANGE_SATS - 10,
      changeIndex: 2,
      feeSats: FEE + 10,
    });
    expect(() =>
      applySignatures(build(), acct, trezorSignatures(otherTx.toBase64())),
    ).toThrow(/don't verify/);
  });

  it("refuses the wrong number of signatures", () => {
    expect(() => applySignatures(build(), acct, [])).toThrow(/wrong number/);
  });

  it("catches a payment or the change swapped after preparing", () => {
    const swapped = buildPayoutPsbt({
      acct,
      coins,
      outputs: [outputs[0], { address: wallet(5), sats: 106_700 }],
      changeSats: CHANGE_SATS,
      changeIndex: 2,
      feeSats: FEE,
    });
    expect(() => assertMatches(swapped, acct, expected)).toThrow(
      /Output 1 pays/,
    );
    const changeElsewhere = buildPayoutPsbt({
      acct: {
        ...acct,
        xpub: root.derivePath(accountPath(testnet, 9)).neutered().toBase58(),
      },
      coins,
      outputs,
      changeSats: CHANGE_SATS,
      changeIndex: 2,
      feeSats: FEE,
    });
    expect(() => assertMatches(changeElsewhere, acct, expected)).toThrow();
  });

  it("catches different coins", () => {
    const other = fundingTx(424_858, 2);
    expect(() =>
      assertMatches(build(), acct, {
        ...expected,
        coins: [{ txid: other.getId(), vout: 0, sats: 424_858 }],
      }),
    ).toThrow(/different coins/);
  });
});

describe("seals as the server checks them", () => {
  const sealKey = root.derivePath(sealPath(testnet));
  const sealAddress = payments.p2wpkh({
    pubkey: sealKey.publicKey,
    network: testnet.bitcoin,
  }).address!;
  const message = sealMessage({
    guildName: "Testing Guild 2",
    holder: "GM",
    address: GM,
    approvedOn: "2026-11-05",
  });
  const sig = (() => {
    const { signature, recoveryId } = ecc.signRecoverable(
      messageHash(message),
      sealKey.privateKey!,
    );
    const out = new Uint8Array(65);
    out[0] = 39 + recoveryId;
    out.set(signature, 1);
    return Buffer.from(out).toString("base64");
  })();
  const base = {
    message,
    signature: sig,
    address: GM,
    guildName: "Testing Guild 2",
    sealAddress,
    network: testnet,
  };

  it("is valid for the sealed wallet in that guild", () => {
    expect(isSealValid(base)).toBe(true);
  });

  it("isn't once the wallet, the guild or the seal key differ", () => {
    expect(isSealValid({ ...base, address: wallet(7) })).toBe(false);
    expect(isSealValid({ ...base, guildName: "Another guild" })).toBe(false);
    expect(isSealValid({ ...base, sealAddress: wallet(8) })).toBe(false);
    expect(isSealValid({ ...base, signature: null })).toBe(false);
  });

  it("the guild account's receiving address is its 0/0", () => {
    expect(receivingAddress(acct.xpub, testnet)).toBe(
      payments.p2wpkh({
        pubkey: accountNode.derive(0).derive(0).publicKey,
        network: testnet.bitcoin,
      }).address,
    );
  });
});
