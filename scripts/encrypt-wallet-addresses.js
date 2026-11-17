require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const wc = require("./lib/walletCryptoNode");

// Encrypts every stored wallet address that's still plaintext and fills its
// lookup-hash column (src/lib/walletCrypto.ts). Idempotent: already-encrypted
// values are only hashed if their hash is missing.
//
// ORDER MATTERS: run --apply only AFTER the code with
// src/lib/walletFieldEncryption.ts is deployed and live. Code from before it
// reads these columns as plaintext - it would show "enc:v1:…" to users and
// could hand ciphertext to a guild payout as a destination address. Hence
// the extra --new-code-is-live flag.
//
// Production only; dry run (all updates, checks, then rollback) by default.
//
//   node scripts/encrypt-wallet-addresses.js
//   node scripts/encrypt-wallet-addresses.js --apply --new-code-is-live
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");
const LIVE = process.argv.includes("--new-code-is-live");

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
];

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

async function run(client) {
  // Fail fast on a missing/bad key, before touching anything.
  const probe = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
  if (wc.decrypt(wc.encrypt(probe)) !== probe)
    throw new Error("Key self-test failed");
  wc.hash(probe);

  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");

  for (const [table, col, hashCol] of COLUMNS) {
    const rows = (
      await client.query(
        `SELECT id, "${col}" AS v, "${hashCol}" AS h FROM "${table}"
         WHERE "${col}" IS NOT NULL AND "${col}" <> ''
           AND ("${col}" NOT LIKE 'enc:v1:%' OR "${hashCol}" IS NULL)`,
      )
    ).rows;
    let encrypted = 0;
    for (const r of rows) {
      const plain = wc.decrypt(r.v);
      const stored = wc.isEncrypted(r.v) ? r.v : wc.encrypt(plain);
      if (stored !== r.v) encrypted++;
      await client.query(
        `UPDATE "${table}" SET "${col}" = $1, "${hashCol}" = $2 WHERE id = $3`,
        [stored, wc.hash(plain), r.id],
      );
    }
    const left = (
      await client.query(
        `SELECT count(*)::int AS n FROM "${table}"
         WHERE "${col}" IS NOT NULL AND "${col}" <> ''
           AND ("${col}" NOT LIKE 'enc:v1:%' OR "${hashCol}" IS NULL)`,
      )
    ).rows[0].n;
    // Spot-check: every value in this column decrypts.
    const sample = (
      await client.query(
        `SELECT "${col}" AS v FROM "${table}" WHERE "${col}" LIKE 'enc:v1:%' LIMIT 25`,
      )
    ).rows;
    for (const s of sample) wc.decrypt(s.v);
    console.log(
      `${table}.${col}: ${rows.length} touched, ${encrypted} encrypted, ${left} left, ${sample.length} decrypt-checked`,
    );
    if (left !== 0)
      throw new Error(`${table}.${col} still has plaintext - rolling back`);
  }

  if (APPLY) {
    await client.query("COMMIT");
    console.log("Applied.");
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run OK - rolled back.");
  }
}

(async () => {
  if (APPLY && !LIVE) {
    throw new Error(
      "Refusing --apply without --new-code-is-live: deploy the encryption-aware code first.",
    );
  }
  const url = productionUrl();
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(PRODUCTION_HOST)) {
    throw new Error(
      `Refusing to run: the database isn't production (${PRODUCTION_HOST})`,
    );
  }
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 60000,
  });
  await client.connect();
  try {
    await run(client);
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
