import { Prisma } from "@prisma/client";
import {
  decryptWalletAddress,
  encryptWalletAddress,
  isEncryptedWalletAddress,
  maskAddressesInText,
  walletAddressHash,
} from "@/lib/walletCrypto";

/**
 * Encrypts wallet addresses on the way into the database and decrypts them
 * on the way out, for every query made through `prisma` (src/lib/prisma.ts).
 * Doing it here rather than at each call site means a forgotten call site
 * can't store a plaintext address - or, worse, hand ciphertext to the guild
 * payout code as a destination.
 *
 * - Writes (`data`, upsert `create`/`update`, nested writes, createMany
 *   arrays): each wallet field is encrypted and its lookup-hash sibling is
 *   filled from the same value. A null clears both.
 * - Reads: any wallet field holding "enc:v1:…" is decrypted, at any depth
 *   (includes/selects across relations). Plaintext from before
 *   scripts/encrypt-wallet-addresses.js ran passes through unchanged.
 * - Audit log writes: every BTC address in `description` / `changes` is
 *   masked to its first 6 and last 6 characters.
 *
 * `where` clauses are never touched: nothing filters on an address column.
 * Look addresses up by their *Hash column (walletAddressHash()).
 */

/** Field -> hash sibling. These names exist only on wallet columns. */
const WALLET_FIELDS: Record<string, string> = {
  walletAddress: "walletAddressHash",
  currentAddress: "currentAddressHash",
  requestedAddress: "requestedAddressHash",
  newWalletAddress: "newWalletAddressHash",
  walletSnapshot: "walletSnapshotHash",
  payoutAddress: "payoutAddressHash",
  addressName: "addressHash",
  expectedAddress: "expectedAddressHash",
  luxorAddress: "luxorAddressHash",
};

/**
 * "address" is also a street address on Franchise and Space, so it's only
 * treated as a wallet field on these models (written top-level).
 */
const ADDRESS_FIELD_MODELS = new Set(["ClientWallet", "ClientWalletHistory"]);

/** Models whose wallet-named columns have no hash sibling. */
const NO_HASH_MODELS = new Set(["PoolSubaccount"]);
/** Models whose wallet-named columns aren't wallet data at all. */
const SKIP_WRITE_MODELS = new Set(["PoolSubaccount"]);

/** Read side: every name a stored wallet value can sit under. */
const READ_FIELDS = new Set([...Object.keys(WALLET_FIELDS), "address"]);

const WRITE_KEYS = new Set(["data", "create", "update"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sealValue(value: string): { stored: string; hash: string | null } {
  const plain = decryptWalletAddress(value).trim();
  if (!plain) return { stored: plain, hash: null };
  return {
    stored: encryptWalletAddress(plain),
    hash: walletAddressHash(plain),
  };
}

/**
 * Encrypts wallet fields in one write payload object (and anything nested
 * under it). `topModel` is set only for the object written to that model
 * directly, so "address" is recognised there and nowhere else.
 */
export function encryptWriteData(
  data: unknown,
  topModel: string | null,
): unknown {
  if (Array.isArray(data))
    return data.map((d) => encryptWriteData(d, topModel));
  if (!isPlainObject(data)) return data;

  const out: Record<string, unknown> = { ...data };
  const fields: Record<string, string> = { ...WALLET_FIELDS };
  if (topModel && ADDRESS_FIELD_MODELS.has(topModel))
    fields.address = "addressHash";
  const withHash = !(topModel && NO_HASH_MODELS.has(topModel));

  for (const [key, value] of Object.entries(data)) {
    const hashKey = fields[key];
    if (hashKey) {
      if (value === null) {
        if (withHash && !(hashKey in data)) out[hashKey] = null;
        continue;
      }
      // Prisma's { set: value } update form.
      const raw =
        typeof value === "string"
          ? value
          : isPlainObject(value) && typeof value.set === "string"
            ? value.set
            : isPlainObject(value) && value.set === null
              ? null
              : undefined;
      if (raw === undefined) continue;
      if (raw === null) {
        out[key] = { set: null };
        if (withHash && !(hashKey in data)) out[hashKey] = null;
        continue;
      }
      const sealed = sealValue(raw);
      out[key] =
        typeof value === "string" ? sealed.stored : { set: sealed.stored };
      if (withHash && !(hashKey in data)) out[hashKey] = sealed.hash;
      continue;
    }
    // Nested writes: relation payloads ({ create: … }, { upsert: … }, arrays).
    if (isPlainObject(value) || Array.isArray(value)) {
      out[key] = encryptWriteData(value, null);
    }
  }
  return out;
}

/** Applies encryptWriteData to the write parts of an operation's args. */
export function encryptWriteArgs(
  model: string | undefined,
  args: unknown,
): unknown {
  if (!model || SKIP_WRITE_MODELS.has(model) || !isPlainObject(args))
    return args;
  let changed = false;
  const out: Record<string, unknown> = { ...args };
  for (const key of WRITE_KEYS) {
    if (key in args) {
      out[key] = encryptWriteData(args[key], model);
      changed = true;
    }
  }
  return changed ? out : args;
}

/** Decrypts wallet fields anywhere in a query result. */
export function decryptResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decryptResult(value[i]);
    return value;
  }
  if (!isPlainObject(value)) return value;
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string") {
      if (READ_FIELDS.has(key) && isEncryptedWalletAddress(v)) {
        value[key] = decryptWalletAddress(v);
      }
    } else if (v !== null && typeof v === "object") {
      decryptResult(v);
    }
  }
  return value;
}

function maskDeep(value: unknown): unknown {
  if (typeof value === "string") return maskAddressesInText(value);
  if (Array.isArray(value)) return value.map(maskDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, maskDeep(v)]),
    );
  }
  return value;
}

/** Masks addresses in an AuditLog write payload (one row or an array). */
export function maskAuditData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(maskAuditData);
  if (!isPlainObject(data)) return data;
  const out = { ...data };
  if (typeof out.description === "string") {
    out.description = maskAddressesInText(out.description);
  }
  if (out.changes !== undefined && out.changes !== null) {
    out.changes = maskDeep(out.changes);
  }
  return out;
}

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

export const walletFieldEncryption = Prisma.defineExtension({
  name: "walletFieldEncryption",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        let nextArgs: unknown = args;
        if (WRITE_OPERATIONS.has(operation)) {
          if (model === "AuditLog" && isPlainObject(args) && "data" in args) {
            nextArgs = { ...args, data: maskAuditData(args.data) };
          } else {
            nextArgs = encryptWriteArgs(model, args);
          }
        }
        const result = await query(nextArgs as typeof args);
        return decryptResult(result) as typeof result;
      },
    },
  },
});
