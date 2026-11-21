require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const wc = require("./lib/walletCryptoNode");

// Masks every BTC address in existing audit_logs rows (description and
// changes) to its first 6 and last 6 characters - new rows are already
// masked by src/lib/walletFieldEncryption.ts. CANNOT be undone: the full
// addresses in old audit text are gone afterwards (they remain, encrypted,
// in the wallet tables). Take a Neon branch/backup before --apply.
//
// Run after the encryption-aware code is deployed (same reason as
// scripts/encrypt-wallet-addresses.js: keep old and new behaviour apart).
// Production only; dry run by default.
//
//   node scripts/mask-audit-wallet-addresses.js
//   node scripts/mask-audit-wallet-addresses.js --apply --new-code-is-live
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");
const LIVE = process.argv.includes("--new-code-is-live");

// Postgres regex prefilter (rough); the JS regex in walletCryptoNode decides.
const PG_PREFILTER = `(bc1|tb1|BC1|TB1)[0-9a-zA-Z]{8,}|[13][1-9A-HJ-NP-Za-km-z]{25,34}`;

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

function maskDeep(v) {
  if (typeof v === "string") return wc.maskText(v);
  if (Array.isArray(v)) return v.map(maskDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, maskDeep(x)]),
    );
  }
  return v;
}

(async () => {
  if (APPLY && !LIVE) {
    throw new Error(
      "Refusing --apply without --new-code-is-live: deploy the new code first.",
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
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    const rows = (
      await client.query(
        `SELECT id, action, description, changes FROM audit_logs
         WHERE description ~ $1 OR changes::text ~ $1`,
        [PG_PREFILTER],
      )
    ).rows;
    const byAction = {};
    let changed = 0;
    for (const r of rows) {
      const description = wc.maskText(r.description);
      const changes = r.changes == null ? null : maskDeep(r.changes);
      const same =
        description === r.description &&
        JSON.stringify(changes) === JSON.stringify(r.changes);
      if (same) continue;
      await client.query(
        `UPDATE audit_logs SET description = $1, changes = $2 WHERE id = $3`,
        [description, changes == null ? null : JSON.stringify(changes), r.id],
      );
      changed++;
      byAction[r.action] = (byAction[r.action] || 0) + 1;
    }
    // Nothing that looks like a full address may remain.
    const left = (
      await client.query(
        `SELECT id, description, changes FROM audit_logs WHERE description ~ $1 OR changes::text ~ $1`,
        [PG_PREFILTER],
      )
    ).rows.filter(
      (r) =>
        wc.maskText(r.description) !== r.description ||
        JSON.stringify(maskDeep(r.changes)) !== JSON.stringify(r.changes),
    ).length;
    console.log(
      `Candidates: ${rows.length}, masked: ${changed}, still unmasked: ${left}`,
    );
    console.log("By action:", JSON.stringify(byAction));
    if (left) throw new Error("Unmasked addresses remain - rolling back");
    if (APPLY) {
      await client.query("COMMIT");
      console.log("Applied.");
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
