import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";

/**
 * Client wallet addresses at rest.
 *
 * - Stored encrypted (AES-256-GCM) with WALLET_ENCRYPTION_KEY, so a copy of
 *   the database alone doesn't reveal where anyone is paid. Stored form:
 *   "enc:v1:" + base64(iv | auth tag | ciphertext) - same shape as
 *   src/lib/auth/totpSecret.ts.
 * - Every encrypted column has a sibling "…Hash" column holding
 *   walletAddressHash(): an HMAC with WALLET_HASH_KEY. Encryption uses a
 *   random IV, so two encryptions of one address differ; the hash is what
 *   equality checks, unique constraints and GROUP BY use instead.
 * - Rows written before encryption existed are plaintext. They're read as-is
 *   until scripts/encrypt-wallet-addresses.js converts them, so nothing
 *   breaks in between.
 *
 * Both keys are 32 random bytes, base64. Losing WALLET_ENCRYPTION_KEY makes
 * every stored address unreadable - keep a copy outside Vercel. Node only.
 */
const PREFIX = "enc:v1:";
const AAD = Buffer.from("bitfactory-wallet-address");

function loadKey(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} environment variable is not set`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must be 32 bytes, base64-encoded`);
  }
  return key;
}

export function isEncryptedWalletAddress(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * The form an address is hashed and compared in. Bech32 (bc1…/tb1…/bcrt1…)
 * is case-insensitive, so it's lowercased; base58 addresses are
 * case-sensitive and kept as typed. Whitespace is trimmed.
 */
export function normalizeWalletAddress(address: string): string {
  const trimmed = address.trim();
  return /^(bc1|tb1|bcrt1)/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/** Encrypts an address for storage. Throws if the key isn't configured. */
export function encryptWalletAddress(address: string): string {
  if (isEncryptedWalletAddress(address)) return address;
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    loadKey("WALLET_ENCRYPTION_KEY"),
    iv,
  );
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(address.trim(), "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  );
}

/** The address from its stored form (legacy plaintext passes through). */
export function decryptWalletAddress(stored: string): string {
  if (!isEncryptedWalletAddress(stored)) return stored;
  const data = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    loadKey("WALLET_ENCRYPTION_KEY"),
    data.subarray(0, 12),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

/** Lookup hash of an address (hex HMAC-SHA256 of its normalized form). */
export function walletAddressHash(address: string): string {
  return createHmac("sha256", loadKey("WALLET_HASH_KEY"))
    .update(normalizeWalletAddress(address))
    .digest("hex");
}

/** Null-safe encrypt: null/blank stays null. */
export function encryptOptional(
  address: string | null | undefined,
): string | null {
  if (address == null || !address.trim()) return null;
  return encryptWalletAddress(address);
}

/** Null-safe decrypt. */
export function decryptOptional(
  stored: string | null | undefined,
): string | null {
  if (stored == null) return null;
  return decryptWalletAddress(stored);
}

/** Null-safe hash: null/blank stays null. Accepts a stored (encrypted) value. */
export function hashOptional(
  addressOrStored: string | null | undefined,
): string | null {
  if (addressOrStored == null || !addressOrStored.trim()) return null;
  return walletAddressHash(decryptWalletAddress(addressOrStored));
}

/** { value, hash } pair for writing an address column and its hash column. */
export function sealWalletAddress(address: string): {
  value: string;
  hash: string;
} {
  const plain = decryptWalletAddress(address);
  return { value: encryptWalletAddress(plain), hash: walletAddressHash(plain) };
}

/**
 * Bank-style display: first 6 and last 6 characters ("bc1qxy…k7f2ms").
 * Anything 14 characters or shorter can't be meaningfully shortened, so it's
 * reduced to its last 4 instead of being shown in full. Never pass a stored
 * (encrypted) value - decrypt first.
 */
export function maskWalletAddress(address: string): string;
export function maskWalletAddress(
  address: string | null | undefined,
): string | null;
export function maskWalletAddress(
  address: string | null | undefined,
): string | null {
  if (address == null) return null;
  const a = address.trim();
  if (!a) return a;
  if (isEncryptedWalletAddress(a)) {
    // Never leak ciphertext into a UI; this is a caller bug.
    return "••••••";
  }
  if (a.length <= 14) return `…${a.slice(-4)}`;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

/** Decrypts a stored value and masks it in one step. */
export function maskStoredWalletAddress(
  stored: string | null | undefined,
): string | null {
  return maskWalletAddress(decryptOptional(stored));
}

/**
 * Replaces every BTC-looking address in free text with its masked form -
 * for audit log descriptions/changes, which must not hold full addresses.
 */
const ADDRESS_IN_TEXT =
  /\b(?:bc1|tb1|bcrt1)[02-9ac-hj-np-z]{8,87}\b|\b(?:BC1|TB1)[02-9AC-HJ-NP-Z]{8,87}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

export function maskAddressesInText(text: string): string;
export function maskAddressesInText(
  text: string | null | undefined,
): string | null;
export function maskAddressesInText(
  text: string | null | undefined,
): string | null {
  if (text == null) return null;
  return text.replace(ADDRESS_IN_TEXT, (m) => maskWalletAddress(m));
}
