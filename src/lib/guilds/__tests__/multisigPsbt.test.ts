import { describe, expect, it } from "vitest";
import { BIP32Factory } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { Transaction } from "bitcoinjs-lib";
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
  assertMatches,
  buildPayoutPsbt,
  estimateFeeSats,
  finalizePayout,
  hasValidSignatures,
  mergeSignatures,
  psbtFromBase64,
  signWithAccountKey,
  type WalletCoin,
} from "@/lib/guilds/multisig/psbt";

const bip32 = BIP32Factory(ecc);
const network = multisigNetworkByName("testnet");
const path = multisigKeyPath(network);

const signers = [1, 2, 3].map((n) => {
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
const [A, B, C] = signers;
const wallet = parseDescriptor(
  formatDescriptor(signers.map((s) => s.key)),
  network,
);

const GUILD = 3;
const coins: WalletCoin[] = [
  {
    txid: "11".repeat(32),
    vout: 0,
    sats: 350_000,
    branch: RECEIVE,
    index: GUILD,
  },
  {
    txid: "22".repeat(32),
    vout: 1,
    sats: 20_000,
    branch: CHANGE,
    index: GUILD,
  },
];
const company = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const member1 =
  "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7";
const member2 =
  "tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c";

function prepared() {
  const outputs = [
    { address: company, sats: 247_000 },
    { address: member1, sats: 80_000 },
    { address: member2, sats: 30_000 },
  ];
  const feeSats = estimateFeeSats({
    wallet,
    inputCount: coins.length,
    outputAddresses: outputs.map((o) => o.address),
    withChange: true,
    feeRateSatVb: 2,
  });
  const inSats = coins.reduce((s, c) => s + c.sats, 0);
  const changeSats = inSats - outputs.reduce((s, o) => s + o.sats, 0) - feeSats;
  const psbt = buildPayoutPsbt({
    wallet,
    guildIndex: GUILD,
    coins,
    outputs,
    changeSats,
    feeSats,
  });
  return { psbt, outputs, changeSats, feeSats };
}

describe("guild payout PSBT", () => {
  it("is signed by A, then B on a separate copy, merged and finalised", () => {
    const { psbt, outputs, changeSats, feeSats } = prepared();
    signWithAccountKey(psbt, A.account, A.fingerprint);
    expect(hasValidSignatures(psbt, wallet, A.fingerprint)).toBe(true);
    expect(hasValidSignatures(psbt, wallet, B.fingerprint)).toBe(false);

    // The approver signs a copy, as the browser would.
    const copy = psbtFromBase64(psbt.toBase64(), wallet);
    signWithAccountKey(copy, B.account, B.fingerprint);
    mergeSignatures(
      psbt,
      psbtFromBase64(copy.toBase64(), wallet),
      wallet,
      B.fingerprint,
    );

    assertMatches(psbt, wallet, {
      coins,
      outputs,
      changeSats,
      guildIndex: GUILD,
    });
    const { hex, txid, vsize } = finalizePayout(psbt);
    const tx = Transaction.fromHex(hex);
    expect(tx.getId()).toBe(txid);
    expect(tx.ins.every((i) => i.sequence === 0xfffffffd)).toBe(true);
    expect(tx.outs).toHaveLength(4);
    // The estimate never comes out below the real size.
    expect(feeSats / 2).toBeGreaterThanOrEqual(vsize);
    expect(feeSats / 2 - vsize).toBeLessThan(5);
  });

  it("puts change at the guild's own change address", () => {
    const { psbt } = prepared();
    const last = psbt.txOutputs[psbt.txOutputs.length - 1];
    expect(last.address).toBe(deriveAddress(wallet, CHANGE, GUILD).address);
    expect(psbt.data.outputs[3].bip32Derivation).toHaveLength(3);
  });

  it("rejects a signature from the wrong key", () => {
    const { psbt } = prepared();
    signWithAccountKey(psbt, A.account, A.fingerprint);
    const copy = psbtFromBase64(psbt.toBase64(), wallet);
    signWithAccountKey(copy, C.account, C.fingerprint);
    expect(() => mergeSignatures(psbt, copy, wallet, B.fingerprint)).toThrow(
      /isn't signed by the approver/,
    );
  });

  it("rejects a tampered output or a swapped change address", () => {
    const { psbt, outputs, changeSats } = prepared();
    const wrong = [
      { ...outputs[0] },
      { ...outputs[1], address: member2 },
      outputs[2],
    ];
    expect(() =>
      assertMatches(psbt, wallet, {
        coins,
        outputs: wrong,
        changeSats,
        guildIndex: GUILD,
      }),
    ).toThrow(/Output 1/);
    expect(() =>
      assertMatches(psbt, wallet, {
        coins,
        outputs,
        changeSats,
        guildIndex: GUILD + 1,
      }),
    ).toThrow(/Output 3/);
    expect(() =>
      assertMatches(psbt, wallet, {
        coins: coins.slice(0, 1),
        outputs,
        changeSats,
        guildIndex: GUILD,
      }),
    ).toThrow(/different coins/);
  });

  it("refuses amounts that don't add up, dust, or another guild's coin", () => {
    const outputs = [{ address: company, sats: 300_000 }];
    expect(() =>
      buildPayoutPsbt({
        wallet,
        guildIndex: GUILD,
        coins,
        outputs,
        changeSats: 69_000,
        feeSats: 500,
      }),
    ).toThrow(/isn't the fee/);
    expect(() =>
      buildPayoutPsbt({
        wallet,
        guildIndex: GUILD,
        coins,
        outputs: [{ address: company, sats: 500 }],
        changeSats: 368_000,
        feeSats: 1500,
      }),
    ).toThrow(/below 546/);
    expect(() =>
      buildPayoutPsbt({
        wallet,
        guildIndex: GUILD + 1,
        coins,
        outputs,
        changeSats: 69_000,
        feeSats: 1000,
      }),
    ).toThrow(/another guild/);
  });
});
