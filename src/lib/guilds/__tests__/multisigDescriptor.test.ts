import { describe, expect, it } from "vitest";
import { BIP32Factory } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";
import {
  CHANGE,
  RECEIVE,
  DescriptorError,
  deriveAddress,
  descriptorChecksum,
  formatDescriptor,
  multisigKeyPath,
  parseDescriptor,
} from "@/lib/guilds/multisig/descriptor";
import { multisigNetworkByName } from "@/lib/guilds/multisig/network";

const bip32 = BIP32Factory(ecc);
const testnet = multisigNetworkByName("testnet");
const mainnet = multisigNetworkByName("mainnet");

/** Three throwaway keys from fixed seeds. */
function testKeys(network = testnet) {
  const path = multisigKeyPath(network);
  return [1, 2, 3].map((n) => {
    const root = bip32.fromSeed(new Uint8Array(32).fill(n), network.bitcoin);
    return {
      fingerprint: Buffer.from(root.fingerprint).toString("hex"),
      originPath: path,
      xpub: root.derivePath(path).neutered().toBase58(),
    };
  });
}

describe("descriptorChecksum", () => {
  // Examples from Bitcoin Core's doc/descriptors.md.
  it("matches Bitcoin Core's examples", () => {
    expect(
      descriptorChecksum(
        "sh(multi(2,[00000000/111'/222]xprvA1RpRA33e1JQ7ifknakTFpgNXPmW2YvmhqLQYMmrj4xJXXWYpDPS3xz7iAxn8L39njGVyuoseXzU6rcxFLJ8HFsTjSyQbLYnMpCqE2VbFWc,xprv9uPDJpEQgRQfDcW7BkF7eTya6RPxXeJCqCJGHuCJ4GiRVLzkTXBAJMu2qaMWPrS7AANYqdq6vcBcBUdJCVVFceUvJFjaPdGZ2y9WACViL4L/0))",
      ),
    ).toBe("ggrsrxfy");
    expect(
      descriptorChecksum(
        "sh(multi(2,[00000000/111'/222]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL,xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y/0))",
      ),
    ).toBe("tjg09x5t");
  });
});

describe("parseDescriptor", () => {
  it("round-trips a formatted descriptor", () => {
    const text = formatDescriptor(testKeys());
    const wallet = parseDescriptor(text, testnet);
    expect(wallet.descriptor).toBe(text);
    expect(wallet.keys).toHaveLength(3);
    expect(wallet.keys[0].originPath).toBe("m/48'/1'/0'/2'");
  });

  it("accepts h for hardened steps and no checksum", () => {
    const text = formatDescriptor(testKeys()).split("#")[0].replace(/'/g, "h");
    expect(parseDescriptor(text, testnet).descriptor).toBe(
      formatDescriptor(testKeys()),
    );
  });

  it("rejects a bad checksum", () => {
    const text = formatDescriptor(testKeys()).replace(/#.*/, "#qqqqqqqq");
    expect(() => parseDescriptor(text, testnet)).toThrow(/checksum/);
  });

  it("rejects keys from the other network", () => {
    const text = formatDescriptor(testKeys(mainnet));
    expect(() => parseDescriptor(text, testnet)).toThrow(DescriptorError);
  });

  it("rejects the wrong threshold, key count or a repeated key", () => {
    const [a, b, c] = testKeys();
    const body = (m: number, ks: (typeof a)[]) =>
      `wsh(sortedmulti(${m},${ks.map((k) => `[${k.fingerprint}${k.originPath.slice(1)}]${k.xpub}/<0;1>/*`).join(",")}))`;
    expect(() => parseDescriptor(body(1, [a, b, c]), testnet)).toThrow(
      /2 signatures/,
    );
    expect(() => parseDescriptor(body(2, [a, b]), testnet)).toThrow(/3 keys/);
    expect(() => parseDescriptor(body(2, [a, b, b]), testnet)).toThrow(/twice/);
  });

  it("rejects a path that doesn't match the key's depth", () => {
    const [a, b, c] = testKeys();
    const text = formatDescriptor([{ ...a, originPath: "m/48'/1'/0'" }, b, c]);
    expect(() => parseDescriptor(text, testnet)).toThrow(/depth/);
  });
});

describe("deriveAddress", () => {
  const wallet = parseDescriptor(formatDescriptor(testKeys()), testnet);

  it("gives testnet P2WSH addresses, different per guild and branch", () => {
    const a0 = deriveAddress(wallet, RECEIVE, 0);
    const a1 = deriveAddress(wallet, RECEIVE, 1);
    const c0 = deriveAddress(wallet, CHANGE, 0);
    expect(a0.address).toMatch(/^tb1q[a-z0-9]{58}$/);
    expect(new Set([a0.address, a1.address, c0.address]).size).toBe(3);
    expect(a0.derivations[0].path).toBe("m/48'/1'/0'/2'/0/0");
    expect(c0.derivations[2].path).toBe("m/48'/1'/0'/2'/1/0");
  });

  it("doesn't depend on the order the keys are listed in", () => {
    const [a, b, c] = testKeys();
    const other = parseDescriptor(formatDescriptor([c, a, b]), testnet);
    expect(deriveAddress(other, RECEIVE, 5).address).toBe(
      deriveAddress(wallet, RECEIVE, 5).address,
    );
  });

  it("is stable (regression value, to be checked against Sparrow)", () => {
    expect(deriveAddress(wallet, RECEIVE, 0).address).toMatchInlineSnapshot(
      `"tb1qkpad42v3wkkt9hfww7vs7udr72pm32vyz5kgphkjm5m3z57pgz0srtay9a"`,
    );
  });
});
