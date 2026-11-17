require("dotenv").config();
const { Client } = require("pg");
const {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} = require("crypto");
const fs = require("fs");
const path = require("path");

// Re-encrypts every stored wallet address from the OLD keys to the NEW keys
// and recomputes every lookup hash. Same format as src/lib/walletCrypto.ts.
//
//   OLD keys: WALLET_ENCRYPTION_KEY / WALLET_HASH_KEY in .env
//   NEW keys: WALLET_ENCRYPTION_KEY_NEW / WALLET_HASH_KEY_NEW in .env
//             (the values now set on Vercel)
//
// One transaction; every value is decrypted with the old key and
// round-trip-checked with the new key before commit. Dry run by default.
// After --apply: put the NEW values into WALLET_ENCRYPTION_KEY /
// WALLET_HASH_KEY in .env, delete the *_NEW lines, update the offline backup,
// and make sure Vercel is redeployed with the new values.
//
//   node scripts/rotate-wallet-keys.js
//   node scripts/rotate-wallet-keys.js --apply
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");
const PREFIX = "enc:v1:";
const AAD = Buffer.from("bitfactory-wallet-address");

// [table, address column, hash column]
const COLUMNS = [
  ["wallet_change_requests", "currentAddress", "currentAddressHash"],
  ["wallet_change_requests", "requestedAddress", "requestedAddressHash"],
  ["guilds", "payoutAddress", "payoutAddressHash"],
  ["guild_memberships", "walletAddress", "walletAddressHash"],
  ["guild_wallet_change_requests", "currentAddress", "currentAddressHash"],
  ["guild_wallet_change_requests", "requestedAddress", "requestedAddressHash"],
  ["guild_member_change_requests", "newWalletAddress", "newWalletAddressHash"],
  ["guild_distribution_lines", "walletSnapshot", "walletSnapshotHash"],
  ["pool_transactions", "addressName", "addressHash"],
  ["client_wallets", "address", "addressHash"],
  ["client_wallet_history", "address", "addressHash"],
  ["client_wallet_mismatches", "expectedAddress", "expectedAddressHash"],
  ["client_wallet_mismatches", "luxorAddress", "luxorAddressHash"],
];

function key(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set in .env`);
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes, base64`);
  return k;
}

const normalize = (a) => {
  const t = a.trim();
  return /^(bc1|tb1|bcrt1)/i.test(t) ? t.toLowerCase() : t;
};
const hash = (hk, plain) =>
  createHmac("sha256", hk).update(normalize(plain)).digest("hex");
function encrypt(ek, plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", ek, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(plain.trim(), "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function decrypt(ek, stored) {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const d = Buffer.from(stored.slice(PREFIX.length), "base64");
  const dc = createDecipheriv("aes-256-gcm", ek, d.subarray(0, 12));
  dc.setAAD(AAD);
  dc.setAuthTag(d.subarray(12, 28));
  return Buffer.concat([dc.update(d.subarray(28)), dc.final()]).toString(
    "utf8",
  );
}

function productionUrl() {
  if (process.env.DATABASE_URL?.includes(PRODUCTION_HOST)) {
    return process.env.DATABASE_URL;
  }
  const line = fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l) && l.includes(PRODUCTION_HOST));
  if (!line) throw new Error("Prod DATABASE_URL not found");
  return line.replace(/^#\s*DATABASE_URL=/, "").replace(/^"|"$/g, "");
}

(async () => {
  const oldEnc = key("WALLET_ENCRYPTION_KEY");
  const oldHash = key("WALLET_HASH_KEY");
  const newEnc = key("WALLET_ENCRYPTION_KEY_NEW");
  const newHash = key("WALLET_HASH_KEY_NEW");
  if (oldEnc.equals(newEnc) && oldHash.equals(newHash)) {
    throw new Error("NEW keys equal the OLD keys - nothing to rotate");
  }

  const url = productionUrl();
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(PRODUCTION_HOST)) {
    throw new Error(`Refusing to run: not production (${PRODUCTION_HOST})`);
  }
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 60000,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    for (const [table, col, hashCol] of COLUMNS) {
      const rows = (
        await client.query(
          `SELECT id, "${col}" AS v FROM "${table}" WHERE "${col}" IS NOT NULL AND "${col}" <> ''`,
        )
      ).rows;
      for (const r of rows) {
        let plain;
        try {
          plain = decrypt(oldEnc, r.v);
        } catch {
          throw new Error(
            `${table}.${col} row ${r.id} doesn't decrypt with the OLD key - rolling back`,
          );
        }
        const stored = encrypt(newEnc, plain);
        if (decrypt(newEnc, stored) !== plain.trim()) {
          throw new Error(
            `Round-trip failed on ${table}.${col} - rolling back`,
          );
        }
        await client.query(
          `UPDATE "${table}" SET "${col}" = $1, "${hashCol}" = $2 WHERE id = $3`,
          [stored, hash(newHash, plain), r.id],
        );
      }
      console.log(`${table}.${col}: ${rows.length} re-encrypted`);
    }
    if (APPLY) {
      await client.query("COMMIT");
      console.log("Applied. Now replace the keys in .env with the NEW values.");
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run OK - rolled back.");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
