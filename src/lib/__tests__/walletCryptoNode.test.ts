import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { createRequire } from "module";
import path from "path";
import {
  decryptWalletAddress,
  encryptWalletAddress,
  maskAddressesInText,
  maskWalletAddress,
  walletAddressHash,
} from "@/lib/walletCrypto";

// The pg scripts use a plain-Node copy of the crypto; it must stay
// byte-compatible with the app's, or encrypted rows become unreadable.
const node = createRequire(import.meta.url)(
  path.resolve(__dirname, "../../../scripts/lib/walletCryptoNode.js"),
) as {
  encrypt: (s: string) => string;
  decrypt: (s: string) => string;
  hash: (s: string) => string;
  mask: (s: string) => string;
  maskText: (s: string) => string;
};

const ORIGINAL = {
  enc: process.env.WALLET_ENCRYPTION_KEY,
  hash: process.env.WALLET_HASH_KEY,
};
const A = "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ";
const B = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";

beforeEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.WALLET_HASH_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = ORIGINAL.enc;
  process.env.WALLET_HASH_KEY = ORIGINAL.hash;
});

describe("scripts/lib/walletCryptoNode.js matches src/lib/walletCrypto.ts", () => {
  it("each side decrypts what the other encrypts", () => {
    expect(decryptWalletAddress(node.encrypt(B))).toBe(B);
    expect(node.decrypt(encryptWalletAddress(B))).toBe(B);
  });

  it("hashes the same (including bech32 case folding)", () => {
    expect(node.hash(A)).toBe(walletAddressHash(A));
    expect(node.hash(node.encrypt(A))).toBe(walletAddressHash(A));
  });

  it("masks the same", () => {
    expect(node.mask(B)).toBe(maskWalletAddress(B));
    const text = `from ${B} to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq`;
    expect(node.maskText(text)).toBe(maskAddressesInText(text));
  });
});
