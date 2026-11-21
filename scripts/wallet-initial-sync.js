require("dotenv").config();
const { Client } = require("pg");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const wc = require("./lib/walletCryptoNode");

// Starts our own record of every Luxor subaccount's payout address
// (client_wallets) and its history (client_wallet_history):
//
//  1. History from past payouts: each run of consecutive Luxor "Payment"
//     rows in pool_transactions paid to the same address becomes one
//     PAYOUT_HISTORY row, dated from its first payout until the next
//     address's first payout.
//  2. The current address read live from Luxor (GET
//     /pool/payment-settings/BTC/{subaccount}, primary = highest
//     revenue_allocation). If it's the address of the last payout run, that
//     row simply stays open; otherwise the run is closed now and an
//     INITIAL_SYNC row is opened.
//  3. client_wallets gets the current address, plus one CLIENT_WALLET_SYNCED
//     audit row per subaccount (addresses masked).
//
// Addresses are written encrypted (scripts/lib/walletCryptoNode.js - same
// format as src/lib/walletCrypto.ts). Only new tables are written, so this
// is safe to run before the code that reads them is deployed.
//
// Skips subaccounts that already have a client_wallets row, so it can be
// re-run for any that failed (e.g. Luxor unreachable). Luxor is read first;
// all DB writes happen in one transaction. Production only; dry run (writes
// then rollback) unless --apply.
//
//   node scripts/wallet-initial-sync.js
//   node scripts/wallet-initial-sync.js --apply
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");
// Same list as src/lib/services/cronRetry.ts EXCLUDED_SUBACCOUNTS.
const EXCLUDED_SUBACCOUNTS = ["higgs_test", "higgs_test2", "higgs_test3"];

const http = axios.create({
  baseURL: "https://app.luxor.tech/api/v2",
  headers: { Authorization: `Bearer ${process.env.LUXOR_API_KEY}` },
  timeout: 30000,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => "c" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);

async function luxorPrimaryAddress(subaccountName) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await http.get(
        `/pool/payment-settings/BTC/${encodeURIComponent(subaccountName)}`,
      );
      await sleep(500);
      const addresses = res.data?.addresses || [];
      if (!addresses.length) return null;
      const primary = addresses.reduce((p, c) =>
        c.revenue_allocation > p.revenue_allocation ? c : p,
      );
      return primary.external_address || null;
    } catch (e) {
      if (e.response?.status === 429 && attempt < 5) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(
        e.response ? `Luxor ${e.response.status}` : `Luxor: ${e.message}`,
      );
    }
  }
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

/** Consecutive payouts to the same address, oldest first. */
function payoutRuns(payments) {
  const runs = [];
  for (const p of payments) {
    const plain = wc.decrypt(p.addressName);
    const hash = wc.hash(plain);
    const last = runs[runs.length - 1];
    if (last && last.hash === hash) {
      last.count++;
      continue;
    }
    runs.push({ plain, hash, from: p.occurredAt, count: 1 });
  }
  return runs;
}

(async () => {
  if (!process.env.LUXOR_API_KEY) throw new Error("LUXOR_API_KEY is not set");
  const probe = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
  if (wc.decrypt(wc.encrypt(probe)) !== probe)
    throw new Error("Key self-test failed");

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
    const subs = (
      await client.query(
        `SELECT s.id, s."subaccountName", s."userId"
         FROM pool_subaccounts s JOIN pools p ON p.id = s."poolId"
         LEFT JOIN client_wallets w ON w."poolSubaccountId" = s.id
         WHERE p.name = 'Luxor' AND s."poolAuthId" IS NOT NULL
           AND s."subaccountName" <> ALL($1) AND w.id IS NULL
         ORDER BY s."subaccountName"`,
        [EXCLUDED_SUBACCOUNTS],
      )
    ).rows;
    console.log(`${subs.length} subaccount(s) without a wallet record`);

    // 1. Read Luxor first, outside any transaction.
    const plans = [];
    const failed = [];
    for (const sub of subs) {
      try {
        const current = await luxorPrimaryAddress(sub.subaccountName);
        const payments = (
          await client.query(
            `SELECT "addressName", "occurredAt" FROM pool_transactions
             WHERE "poolSubaccountId" = $1 AND category = 'Payment'
               AND "addressName" IS NOT NULL AND "addressName" <> ''
             ORDER BY "occurredAt" ASC`,
            [sub.id],
          )
        ).rows;
        plans.push({ sub, current, runs: payoutRuns(payments) });
      } catch (e) {
        failed.push({ sub, error: e.message });
      }
    }

    // 2. Write everything in one transaction.
    const now = new Date();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    let historyRows = 0;
    for (const { sub, current, runs } of plans) {
      const currentHash = current ? wc.hash(current) : null;
      const lastRun = runs[runs.length - 1];
      const keepLastOpen =
        lastRun && currentHash && lastRun.hash === currentHash;

      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        const isLast = i === runs.length - 1;
        const validTo = !isLast ? runs[i + 1].from : keepLastOpen ? null : now;
        await client.query(
          `INSERT INTO client_wallet_history
             (id, "poolSubaccountId", address, "addressHash", source, "validFrom", "validTo", note)
           VALUES ($1, $2, $3, $4, 'PAYOUT_HISTORY', $5, $6, $7)`,
          [
            newId(),
            sub.id,
            wc.encrypt(r.plain),
            r.hash,
            r.from,
            validTo,
            `Seen on ${r.count} Luxor payment(s) before our record began`,
          ],
        );
        historyRows++;
      }
      let effectiveFrom = now;
      if (keepLastOpen) {
        effectiveFrom = lastRun.from;
      } else if (current) {
        await client.query(
          `INSERT INTO client_wallet_history
             (id, "poolSubaccountId", address, "addressHash", source, "validFrom", note)
           VALUES ($1, $2, $3, $4, 'INITIAL_SYNC', $5, $6)`,
          [
            newId(),
            sub.id,
            wc.encrypt(current),
            currentHash,
            now,
            "Read from Luxor by the initial sync",
          ],
        );
        historyRows++;
      }
      await client.query(
        `INSERT INTO client_wallets
           (id, "poolSubaccountId", address, "addressHash", source, "effectiveFrom",
            "lastCheckedAt", "lastCheckStatus", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'INITIAL_SYNC', $5, $6, $7, now(), now())`,
        [
          newId(),
          sub.id,
          current ? wc.encrypt(current) : null,
          currentHash,
          effectiveFrom,
          now,
          current ? "MATCH" : "LUXOR_EMPTY",
        ],
      );
      if (sub.userId) {
        await client.query(
          `INSERT INTO audit_logs (id, action, "entityType", "entityId", "userId", changes, description, "createdAt")
           VALUES ($1, 'CLIENT_WALLET_SYNCED', 'ClientWallet', $2, $3, $4, $5, now())`,
          [
            newId(),
            sub.id,
            sub.userId,
            JSON.stringify(
              JSON.stringify({
                subaccountName: sub.subaccountName,
                address: current ? wc.mask(current) : null,
                payoutAddressesSeen: runs.length,
              }),
            ),
            `Wallet record started for ${sub.subaccountName} (initial sync script): Luxor ${current ? wc.mask(current) : "(no address)"}; ${runs.length} earlier address run(s) from payouts`,
          ],
        );
      }
      console.log(
        `  ${sub.subaccountName}: Luxor ${current ? wc.mask(current) : "(none)"}; ${runs.length} payout run(s)${keepLastOpen ? ", current = last paid" : ""}`,
      );
    }

    // Sanity: every history value decrypts, one open row max per subaccount.
    const dup = (
      await client.query(
        `SELECT "poolSubaccountId", count(*)::int n FROM client_wallet_history
         WHERE "validTo" IS NULL GROUP BY 1 HAVING count(*) > 1`,
      )
    ).rows;
    if (dup.length)
      throw new Error("More than one open history row - rolling back");
    for (const r of (
      await client.query(
        `SELECT address FROM client_wallet_history WHERE address IS NOT NULL`,
      )
    ).rows) {
      wc.decrypt(r.address);
    }

    console.log(
      `Wallet records: ${plans.length}, history rows: ${historyRows}, failed: ${failed.length}`,
    );
    for (const f of failed)
      console.log(`  FAILED ${f.sub.subaccountName}: ${f.error}`);

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
