import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import speakeasy from "speakeasy";

/**
 * Authenticator-app (TOTP) secrets are stored encrypted (AES-256-GCM) with
 * TOTP_ENCRYPTION_KEY, so a copy of the database alone can't generate anyone's
 * 2FA codes. Stored form: "enc:v1:" + base64(iv | auth tag | ciphertext).
 *
 * Secrets saved before encryption existed are plain base32; they're still
 * read as-is until scripts/encrypt-2fa-secrets.js converts them.
 *
 * The key is 32 random bytes, base64. Losing it breaks every user's 2FA
 * (backup codes still work), so keep a copy outside Vercel. Node runtime only.
 */
const PREFIX = "enc:v1:";
const AAD = Buffer.from("bitfactory-totp-secret");

function encryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw)
    throw new Error("TOTP_ENCRYPTION_KEY environment variable is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function isEncryptedTotpSecret(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Encrypts a base32 secret for storage. Throws if the key isn't configured. */
export function encryptTotpSecret(base32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(base32, "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  );
}

/** The base32 secret from its stored form (legacy plaintext passes through). */
export function decryptTotpSecret(stored: string): string {
  if (!isEncryptedTotpSecret(stored)) return stored;
  const data = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, 12),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Whether `code` is a current code for the stored secret (±1 time step for
 * clock drift). Fails closed: a missing secret, a non-string code, or a
 * secret that can't be decrypted (wrong/missing key) is "no".
 */
export function verifyTotpCode(
  storedSecret: string | null | undefined,
  code: unknown,
): boolean {
  if (!storedSecret || typeof code !== "string" || !code) return false;
  let secret: string;
  try {
    secret = decryptTotpSecret(storedSecret);
  } catch (error) {
    console.error("[totpSecret] Couldn't decrypt a stored 2FA secret:", error);
    return false;
  }
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: code,
    window: 1,
  });
}
