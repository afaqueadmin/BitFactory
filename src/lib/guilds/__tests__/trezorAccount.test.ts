import { describe, expect, it } from "vitest";
import { BIP32Factory } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import { payments } from "bitcoinjs-lib";
import {
  SEAL_ACCOUNT,
  TrezorAccountError,
  accountPath,
  deriveAddress,
  messageHash,
  parseAccountXpub,
  receivingAddress,
  sealMessage,
  sealPath,
  sealedAddress,
  verifySeal,
} from "../trezor/account";
import { payoutNetworkByName } from "../trezor/network";

const bip32 = BIP32Factory(ecc);
const mainnet = payoutNetworkByName("mainnet");
const testnet = payoutNetworkByName("testnet");

// BIP84 test vector: "abandon abandon … about", no passphrase.
// https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
const SEED = Buffer.from(
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
  "hex",
);

const accountXpub = (network = mainnet, account = 0) =>
  bip32
    .fromSeed(SEED, network.bitcoin)
    .derivePath(accountPath(network, account))
    .neutered()
    .toBase58();

describe("guild account addresses", () => {
  it("matches the BIP84 vector", () => {
    const xpub = accountXpub();
    expect(receivingAddress(xpub, mainnet)).toBe(
      "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    );
    expect(deriveAddress(xpub, mainnet, 0, 1)).toBe(
      "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
    );
    expect(deriveAddress(xpub, mainnet, 1, 0)).toBe(
      "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
    );
  });

  it("uses coin type 1 and tb1 addresses on testnet", () => {
    expect(accountPath(testnet, 7)).toBe("m/84'/1'/7'");
    expect(receivingAddress(accountXpub(testnet, 7), testnet)).toMatch(/^tb1q/);
  });

  it("keeps account 100 for the seal key", () => {
    expect(sealPath(testnet)).toBe(`m/84'/1'/${SEAL_ACCOUNT}'/0/0`);
    expect(() => accountPath(mainnet, 101)).toThrow(TrezorAccountError);
  });

  it("refuses a wrong-network, private or non-account key", () => {
    expect(() => parseAccountXpub(accountXpub(mainnet), testnet)).toThrow(
      TrezorAccountError,
    );
    const root = bip32.fromSeed(SEED, mainnet.bitcoin);
    expect(() =>
      parseAccountXpub(root.derivePath("m/84'/0'/0'").toBase58(), mainnet),
    ).toThrow(/private key/);
    expect(() =>
      parseAccountXpub(
        root.derivePath("m/84'/0'").neutered().toBase58(),
        mainnet,
      ),
    ).toThrow(/depth 3/);
  });
});

describe("wallet seals", () => {
  const root = bip32.fromSeed(SEED, testnet.bitcoin);
  const sealKey = root.derivePath(sealPath(testnet));
  const sealAddress = payments.p2wpkh({
    pubkey: sealKey.publicKey,
    network: testnet.bitcoin,
  }).address!;

  // Signs like Trezor signMessage does for a Native SegWit key: header
  // 39 + recovery id, then r and s.
  const sign = (message: string, key = sealKey) => {
    const { signature, recoveryId } = ecc.signRecoverable(
      messageHash(message),
      key.privateKey!,
    );
    const out = new Uint8Array(65);
    out[0] = 39 + recoveryId;
    out.set(signature, 1);
    return Buffer.from(out).toString("base64");
  };

  const message = sealMessage({
    guildName: "Testing Guild 2",
    holder: "Sheheryar GM Client",
    address: "tb1q7vpfczlm7fr0qq3gvw4c6vgtvwfrjqfv67lzjm",
    approvedOn: "2026-11-05",
  });

  it("builds a readable message with the address on its own line", () => {
    expect(message.split("\n")).toEqual([
      "BitFactory payout address",
      "Guild: Testing Guild 2",
      "For: Sheheryar GM Client",
      "tb1q7vpfczlm7fr0qq3gvw4c6vgtvwfrjqfv67lzjm",
      "Approved: 2026-11-05",
    ]);
    expect(sealedAddress(message)).toBe(
      "tb1q7vpfczlm7fr0qq3gvw4c6vgtvwfrjqfv67lzjm",
    );
    expect(sealedAddress("hello")).toBeNull();
  });

  it("accepts the seal key's signature", () => {
    expect(
      verifySeal({
        message,
        signatureB64: sign(message),
        sealAddress,
        network: testnet,
      }),
    ).toBe(true);
  });

  it("refuses a changed message, another key or junk", () => {
    const signature = sign(message);
    expect(
      verifySeal({
        message: message.replace("lzjm", "lzjn"),
        signatureB64: signature,
        sealAddress,
        network: testnet,
      }),
    ).toBe(false);
    const other = root.derivePath(`m/84'/1'/0'/0/0`);
    expect(
      verifySeal({
        message,
        signatureB64: sign(message, other),
        sealAddress,
        network: testnet,
      }),
    ).toBe(false);
    expect(
      verifySeal({
        message,
        signatureB64: "not base64!",
        sealAddress,
        network: testnet,
      }),
    ).toBe(false);
  });
});
