import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import {
  decryptOptional,
  decryptWalletAddress,
  encryptOptional,
  encryptWalletAddress,
  hashOptional,
  isEncryptedWalletAddress,
  maskAddressesInText,
  maskStoredWalletAddress,
  maskWalletAddress,
  normalizeWalletAddress,
  sealWalletAddress,
  walletAddressHash,
} from "@/lib/walletCrypto";

const ORIGINAL = {
  enc: process.env.WALLET_ENCRYPTION_KEY,
  hash: process.env.WALLET_HASH_KEY,
};
const BECH32 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const LEGACY = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const P2SH = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";

beforeEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.WALLET_HASH_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = ORIGINAL.enc;
  process.env.WALLET_HASH_KEY = ORIGINAL.hash;
});

describe("encrypt / decrypt", () => {
  it("round-trips and never stores the address readably", () => {
    const stored = encryptWalletAddress(BECH32);
    expect(isEncryptedWalletAddress(stored)).toBe(true);
    expect(stored).not.toContain(BECH32);
    expect(decryptWalletAddress(stored)).toBe(BECH32);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptWalletAddress(LEGACY)).not.toBe(encryptWalletAddress(LEGACY));
  });

  it("passes legacy plaintext through", () => {
    expect(decryptWalletAddress(LEGACY)).toBe(LEGACY);
  });

  it("doesn't double-encrypt", () => {
    const once = encryptWalletAddress(P2SH);
    expect(encryptWalletAddress(once)).toBe(once);
  });

  it("fails with the wrong key", () => {
    const stored = encryptWalletAddress(BECH32);
    process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptWalletAddress(stored)).toThrow();
  });

  it("throws when the key is missing or the wrong size", () => {
    delete process.env.WALLET_ENCRYPTION_KEY;
    expect(() => encryptWalletAddress(BECH32)).toThrow(/not set/);
    process.env.WALLET_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptWalletAddress(BECH32)).toThrow(/32 bytes/);
  });

  it("optional helpers keep null/blank as null", () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional("  ")).toBeNull();
    expect(decryptOptional(null)).toBeNull();
    expect(hashOptional(undefined)).toBeNull();
    expect(decryptOptional(encryptOptional(LEGACY))).toBe(LEGACY);
  });
});

describe("hash", () => {
  it("is stable and treats bech32 case-insensitively", () => {
    expect(walletAddressHash(BECH32)).toBe(walletAddressHash(BECH32));
    expect(walletAddressHash(BECH32.toUpperCase())).toBe(
      walletAddressHash(BECH32),
    );
    expect(walletAddressHash(` ${BECH32} `)).toBe(walletAddressHash(BECH32));
  });

  it("keeps base58 case-sensitive", () => {
    expect(normalizeWalletAddress(LEGACY)).toBe(LEGACY);
    expect(walletAddressHash(LEGACY)).not.toBe(
      walletAddressHash(LEGACY.toLowerCase()),
    );
  });

  it("hashes a stored value the same as its plaintext", () => {
    expect(hashOptional(encryptWalletAddress(P2SH))).toBe(
      walletAddressHash(P2SH),
    );
    const sealed = sealWalletAddress(P2SH);
    expect(decryptWalletAddress(sealed.value)).toBe(P2SH);
    expect(sealed.hash).toBe(walletAddressHash(P2SH));
  });

  it("depends on the hash key", () => {
    const before = walletAddressHash(P2SH);
    process.env.WALLET_HASH_KEY = randomBytes(32).toString("base64");
    expect(walletAddressHash(P2SH)).not.toBe(before);
  });
});

describe("mask", () => {
  it("shows the first 6 and last 6", () => {
    expect(maskWalletAddress(BECH32)).toBe("bc1qar…wf5mdq");
    expect(maskWalletAddress(LEGACY)).toBe("1BvBMS…JaNVN2");
  });

  it("handles null, blank and short values", () => {
    expect(maskWalletAddress(null)).toBeNull();
    expect(maskWalletAddress("")).toBe("");
    expect(maskWalletAddress("abcdefghijklmn")).toBe("…klmn");
  });

  it("never shows ciphertext", () => {
    expect(maskWalletAddress(encryptWalletAddress(BECH32))).toBe("••••••");
    expect(maskStoredWalletAddress(encryptWalletAddress(BECH32))).toBe(
      "bc1qar…wf5mdq",
    );
  });

  it("masks every address inside free text", () => {
    const text = `Wallet change: ${LEGACY} -> ${BECH32} (and ${P2SH})`;
    const masked = maskAddressesInText(text);
    expect(masked).toBe(
      "Wallet change: 1BvBMS…JaNVN2 -> bc1qar…wf5mdq (and 3J98t1…RhWNLy)",
    );
    expect(maskAddressesInText('{"to":"' + BECH32 + '"}')).toBe(
      '{"to":"bc1qar…wf5mdq"}',
    );
  });

  it("leaves ids and plain words alone", () => {
    const text = "Request cmh1abc2def3ghi4jkl5mno6 approved by admin";
    expect(maskAddressesInText(text)).toBe(text);
  });
});
