import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import speakeasy from "speakeasy";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/totpSecret";

const ORIGINAL_KEY = process.env.TOTP_ENCRYPTION_KEY;
const SECRET = speakeasy.generateSecret({ length: 20 }).base32;
const codeFor = (secret: string) =>
  speakeasy.totp({ secret, encoding: "base32" });

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("encryptTotpSecret / decryptTotpSecret", () => {
  it("round-trips, and never stores the secret in readable form", () => {
    const stored = encryptTotpSecret(SECRET);
    expect(isEncryptedTotpSecret(stored)).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(decryptTotpSecret(stored)).toBe(SECRET);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptTotpSecret(SECRET)).not.toBe(encryptTotpSecret(SECRET));
  });

  it("passes legacy plaintext secrets through unchanged", () => {
    expect(decryptTotpSecret(SECRET)).toBe(SECRET);
  });

  it("refuses to decrypt with a different key", () => {
    const stored = encryptTotpSecret(SECRET);
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptTotpSecret(stored)).toThrow();
  });

  it("detects tampering", () => {
    const stored = encryptTotpSecret(SECRET);
    const raw = Buffer.from(stored.slice("enc:v1:".length), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() =>
      decryptTotpSecret("enc:v1:" + raw.toString("base64")),
    ).toThrow();
  });

  it("requires a configured 32-byte key to encrypt", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptTotpSecret(SECRET)).toThrow(/not set/);
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptTotpSecret(SECRET)).toThrow(/32 bytes/);
  });
});

describe("verifyTotpCode", () => {
  it("accepts a current code for an encrypted secret", () => {
    expect(verifyTotpCode(encryptTotpSecret(SECRET), codeFor(SECRET))).toBe(
      true,
    );
  });

  it("accepts a current code for a legacy plaintext secret", () => {
    expect(verifyTotpCode(SECRET, codeFor(SECRET))).toBe(true);
  });

  it("rejects a wrong code", () => {
    const wrong = codeFor(SECRET) === "000000" ? "111111" : "000000";
    expect(verifyTotpCode(encryptTotpSecret(SECRET), wrong)).toBe(false);
  });

  it("fails closed with the wrong key, a missing secret or a non-string code", () => {
    const stored = encryptTotpSecret(SECRET);
    const code = codeFor(SECRET);
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(verifyTotpCode(stored, code)).toBe(false);
    expect(verifyTotpCode(null, code)).toBe(false);
    expect(verifyTotpCode(SECRET, 123456)).toBe(false);
  });
});
