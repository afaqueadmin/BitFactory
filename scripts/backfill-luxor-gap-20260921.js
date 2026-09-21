/**
 * Luxor outage gap backfill (Sep 2026 API-key outage).
 *
 * Fills the pool-history rows the crons could not write while the Luxor API
 * key was faulty. Gaps are DETECTED from the DB (nothing hardcoded), and every
 * fetch/transform/write mirrors the cron code path it stands in for:
 *
 *   snapshots     <- poolDailySnapshotService.fetchLuxorDaySnapshot / upsert
 *                    (hashrate, efficiency, uptime, activeWorkers, revenues;
 *                     NEVER hashprice/balance - see NOT RECOVERABLE below)
 *   workers       <- poolWorkerAndTransactionService.upsertWorkerDailyMetricsForRange
 *                    (hashrate, efficiency, estRevenue; NEVER firmware/status/shares)
 *   transactions  <- poolWorkerAndTransactionService.upsertTransactionsForRange
 *
 *   csv           <- ONLY for what the API cannot give (live-only endpoints, no
 *                    date param): PoolSubaccountDailySnapshot.hashprice and
 *                    .balance, taken from a Luxor dashboard "dailystats" CSV
 *                    (Price (BTC/PH/s/Day) and End of Day Balance (BTC)).
 *                    Written only where the DB value is currently NULL, and
 *                    only for rows whose API-sourced values agree with the CSV
 *                    (hashrate, worker count, revenue) - a wrong/misdated file
 *                    is refused rather than trusted.
 *
 * DEFAULT IS A DRY RUN: reads DB + GETs Luxor + reads CSVs, prints what it
 * would write, writes nothing. Pass --apply to write. Idempotent either way.
 *
 *   node scripts/backfill-luxor-gap-20260921.js [--apply] [--lookback-days=14]
 *        [--to=YYYY-MM-DD] [--only=snapshots,workers,transactions,csv]
 *        [--sub=name] [--allow-early] [--ignore-canary]
 *        [--csv-dailystats=FILE] [--csv-transactions=FILE (verify only)]
 *
 * NOT RECOVERABLE from ANY source (not in the API, not in the CSVs):
 *   - PoolWorkerDailyMetric.firmware / staleShares / rejectedShares / status
 * These stay NULL for the outage days. This script reports them, never guesses.
 */

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

// ---------------------------------------------------------------- config
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const APPLY = flag("apply");
const LOOKBACK_DAYS = parseInt(opt("lookback-days", "14"), 10);
const ONLY = new Set(
  opt("only", "snapshots,workers,transactions,csv").split(","),
);
const CSV_DAILYSTATS = opt("csv-dailystats", null);
const CSV_TRANSACTIONS = opt("csv-transactions", null);
const ONLY_SUB = opt("sub", null);
const ALLOW_EARLY = flag("allow-early");
const IGNORE_CANARY = flag("ignore-canary");

// Same list as src/lib/services/cronRetry.ts EXCLUDED_SUBACCOUNTS.
const EXCLUDED_SUBACCOUNTS = ["higgs_test", "higgs_test2", "higgs_test3"];
// cron_pool_daily_snapshot is scheduled at 06:00 UTC because Luxor was seen
// not finalizing the just-ended day earlier than that. The cron never
// re-fetches a snapshot row whose hashrate is non-null, so writing yesterday
// too early would lock in non-final numbers. Same gate here.
const FINALIZE_HOUR_UTC = 6;
const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);
const REQUEST_SPACING_MS = 500;

const http = axios.create({
  baseURL: "https://app.luxor.tech/api/v2",
  headers: { Authorization: `Bearer ${process.env.LUXOR_API_KEY}` },
  timeout: 30000,
});

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utcDay = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const dk = (d) => d.toISOString().slice(0, 10);
const parseDay = (s) => new Date(`${s}T00:00:00.000Z`);
const eachDay = (a, b) => {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
};
const r8 = (n) => Number(n).toFixed(8);

async function luxorGet(pathname, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await http.get(pathname, { params });
      await sleep(REQUEST_SPACING_MS);
      return res.data;
    } catch (e) {
      if (e.response?.status === 429 && attempt < 5) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const detail = e.response
        ? `${e.response.status} ${JSON.stringify(e.response.data)}`
        : e.message;
      throw new Error(`GET ${pathname} failed: ${detail}`);
    }
  }
}

/** Follows pagination.next_page_url when the API reports one. */
async function luxorGetAllPages(pathname, params, listKey) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await luxorGet(
      pathname,
      page === 1 ? params : { ...params, page_number: page },
    );
    items.push(...(data[listKey] || []));
    if (data.pagination?.next_page_url == null || page >= 20) break;
    page++;
  }
  return items;
}

async function withDbRetry(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      // Neon compute wakes slowly: first connection after idle can fail.
      if (
        i < 6 &&
        /Can't reach database server|Timed out|ECONN/i.test(e.message)
      ) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
}

// ---------------------------------------------------------------- csv helpers
function parseCsvLine(line) {
  const f = [];
  let cur = "",
    q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      f.push(cur);
      cur = "";
    } else cur += c;
  }
  f.push(cur);
  return f;
}
function parseCsv(file) {
  const lines = require("fs")
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const h = parseCsvLine(lines[0]);
  return {
    headers: h,
    rows: lines
      .slice(1)
      .map((l) => Object.fromEntries(parseCsvLine(l).map((v, i) => [h[i], v]))),
  };
}
const csvNum = (s) =>
  s === undefined || s === null || String(s).trim() === ""
    ? null
    : Number(String(s).replace(/[$,%]/g, ""));

/** dailystats CSV -> Map("sub|YYYY-MM-DD" -> row). Refuses a file it can't fully trust. */
function loadDailyStatsCsv(file) {
  const { headers, rows } = parseCsv(file);
  const need = [
    "Date",
    "Subaccount",
    "Hashrate (PH/s)",
    "Workers count",
    "Price (BTC/PH/s/Day)",
    "Miner Revenue (BTC)",
    "End of Day Balance (BTC)",
  ];
  const missing = need.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new Error(
      `dailystats CSV is missing expected column(s): ${missing.join(", ")}`,
    );
  const real = rows.filter((r) => !EXCLUDED_SUBACCOUNTS.includes(r.Subaccount));
  // hashprice is one pool-wide value per date (verified in the DB: 1 distinct value
  // across all subaccounts per date). Refuse a file that disagrees with itself.
  const perDate = {};
  for (const r of real)
    (perDate[r.Date] ||= new Set()).add(r["Price (BTC/PH/s/Day)"]);
  for (const [d, s] of Object.entries(perDate))
    if (s.size !== 1)
      throw new Error(
        `dailystats CSV has ${s.size} different hashprice values on ${d}`,
      );
  return new Map(real.map((r) => [`${r.Subaccount}|${r.Date}`, r]));
}

/**
 * Plans hashprice/balance fills for one subaccount from the CSV. Only rows that
 * (a) already exist with API-sourced data, or will be created by the API plan in
 * this same run, and (b) have NULL in the target column are touched.
 */
async function planCsvPatch(sub, csvMap, cand, eligibleEnd, snapPlan) {
  const existing = await prisma.poolSubaccountDailySnapshot.findMany({
    where: {
      poolSubaccountId: sub.id,
      date: { gte: cand[0], lte: cand[cand.length - 1] },
    },
    select: {
      date: true,
      hashrate: true,
      hashprice: true,
      balance: true,
      activeWorkers: true,
      totalRevenue: true,
    },
  });
  const byDay = new Map(existing.map((r) => [dk(r.date), r]));
  for (const w of snapPlan?.writes || []) {
    byDay.set(dk(w.date), {
      date: w.date,
      hashrate: w.hashrate,
      hashprice: null,
      balance: null,
      activeWorkers: w.activeWorkers,
      totalRevenue: w.totalRevenue,
    });
  }
  const patches = [];
  const skipped = [];
  const canaryDiffs = [];
  for (const d of cand) {
    if (d > eligibleEnd) continue;
    const c = csvMap.get(`${sub.subaccountName}|${dk(d)}`);
    if (!c) continue;
    const row = byDay.get(dk(d));
    const hp = csvNum(c["Price (BTC/PH/s/Day)"]);
    const bal = csvNum(c["End of Day Balance (BTC)"]);
    const data = {};
    if (row && row.hashprice === null && hp !== null) data.hashprice = hp;
    if (row && row.balance === null && bal !== null) data.balance = bal;
    if (!Object.keys(data).length) continue; // nothing NULL to fill on this day
    if (!row || row.hashrate === null) {
      skipped.push(`${dk(d)}: no API-sourced snapshot row to attach to`);
      continue;
    }
    // Canary: the CSV must describe the same sub-day the API data describes.
    const diffs = [];
    if (
      Math.abs(Number(row.hashrate) / 1e15 - csvNum(c["Hashrate (PH/s)"])) >
      0.0051
    )
      diffs.push("hashrate");
    if (row.activeWorkers !== csvNum(c["Workers count"])) diffs.push("workers");
    if (
      Math.abs(Number(row.totalRevenue) - csvNum(c["Miner Revenue (BTC)"])) >
      1e-8
    )
      diffs.push("revenue");
    if (diffs.length) canaryDiffs.push(`${dk(d)}: ${diffs.join("+")}`);
    patches.push({ date: d, ...data });
  }
  return { patches, skipped, canaryDiffs };
}

// ---------------------------------------------------------------- snapshots
async function planSnapshots(sub, cand, eligibleEnd) {
  const existing = await prisma.poolSubaccountDailySnapshot.findMany({
    where: {
      poolSubaccountId: sub.id,
      date: { gte: cand[0], lte: cand[cand.length - 1] },
    },
  });
  const complete = new Map(
    existing.filter((r) => r.hashrate !== null).map((r) => [dk(r.date), r]),
  );
  const targets = cand.filter((d) => d <= eligibleEnd && !complete.has(dk(d)));
  if (!targets.length)
    return { targets: [], writes: [], noData: [], canary: null };

  const first = targets[0];
  const last = targets[targets.length - 1];
  const canaryDay = complete.get(dk(addDays(first, -1)))
    ? addDays(first, -1)
    : null;
  const start = canaryDay || first;
  const q = {
    subaccount_names: sub.poolAuth.authKey,
    start_date: dk(start),
    end_date: dk(last),
  };

  const he = await luxorGetAllPages(
    "/pool/hashrate-efficiency/BTC",
    { ...q, tick_size: "1d" },
    "hashrate_efficiency",
  );
  const rev = await luxorGetAllPages("/pool/revenue/BTC", q, "revenue");
  const up = await luxorGetAllPages(
    "/pool/uptime/BTC",
    { ...q, tick_size: "1d" },
    "uptime",
  );
  const aw = await luxorGetAllPages(
    "/pool/active-workers/BTC",
    { ...q, tick_size: "1d" },
    "active_workers",
  );

  const byDate = new Map();
  const row = (k) => {
    if (!byDate.has(k))
      byDate.set(k, {
        hashrate: null,
        efficiency: null,
        uptime: null,
        activeWorkers: null,
        miningRevenue: 0,
        referralRevenue: 0,
        otherRevenue: 0,
        totalRevenue: 0,
      });
    return byDate.get(k);
  };
  for (const p of he) {
    const v = row(p.date_time.slice(0, 10));
    v.hashrate = parseFloat(p.hashrate || "0") || 0;
    v.efficiency = typeof p.efficiency === "number" ? p.efficiency * 100 : null;
  }
  for (const p of up)
    row(p.date_time.slice(0, 10)).uptime =
      typeof p.uptime === "number" ? p.uptime * 100 : null;
  for (const p of aw)
    row(p.date_time.slice(0, 10)).activeWorkers = p.active_workers ?? null;
  for (const item of rev) {
    const v = row(item.date_time.slice(0, 10));
    const type = item.revenue?.revenue_type;
    const amount = item.revenue?.revenue || 0;
    if (type === "MINING") v.miningRevenue += amount;
    else if (type === "REFERRAL") v.referralRevenue += amount;
    else v.otherRevenue += amount;
    v.totalRevenue += amount;
  }

  let canary = null;
  if (canaryDay) {
    const db = complete.get(dk(canaryDay));
    const api = byDate.get(dk(canaryDay));
    const diffs = [];
    const chk = (f, eps) => {
      const a = db[f] === null ? null : Number(db[f]);
      const b = api?.[f] ?? null;
      if (
        (a === null) !== (b === null) ||
        (a !== null && Math.abs(a - b) > eps)
      )
        diffs.push(`${f}: db=${a} api=${b}`);
    };
    chk("hashrate", 1);
    chk("efficiency", 0.02);
    chk("uptime", 0.02);
    chk("activeWorkers", 0);
    chk("miningRevenue", 1e-7);
    chk("totalRevenue", 1e-7);
    canary = { day: dk(canaryDay), ok: diffs.length === 0, diffs };
  }

  const writes = [];
  const noData = [];
  for (const d of targets) {
    const v = byDate.get(dk(d));
    if (!v || v.hashrate === null) noData.push(dk(d));
    else writes.push({ date: d, ...v });
  }
  return { targets, writes, noData, canary };
}

// ---------------------------------------------------------------- workers
async function planWorkers(sub, cand, eligibleEnd) {
  const existing = await prisma.poolWorkerDailyMetric.findMany({
    where: {
      poolSubaccountId: sub.id,
      date: { gte: cand[0], lte: cand[cand.length - 1] },
    },
    select: { workerName: true, date: true, hashrate: true },
  });
  const haveDay = new Set(
    existing.filter((r) => r.hashrate !== null).map((r) => dk(r.date)),
  );
  const completeKey = new Set(
    existing
      .filter((r) => r.hashrate !== null)
      .map((r) => `${r.workerName}|${dk(r.date)}`),
  );
  const targets = cand.filter((d) => d <= eligibleEnd && !haveDay.has(dk(d)));
  if (!targets.length) return { targets: [], writes: [] };

  const first = targets[0];
  const last = targets[targets.length - 1];
  const authKey = sub.poolAuth.authKey;
  const byWorker = {};
  let pageNumber = 1;
  for (;;) {
    const page = await luxorGet(
      `/pool/workers-hashrate-efficiency/BTC/${authKey}`,
      {
        tick_size: "1d",
        start_date: dk(first),
        end_date: dk(last),
        page_number: pageNumber,
        page_size: 100,
      },
    );
    Object.assign(byWorker, page.hashrate_efficiency_revenue || {});
    const total =
      page.pagination?.item_count ??
      Object.keys(page.hashrate_efficiency_revenue || {}).length;
    if (pageNumber * 100 >= total || pageNumber >= 20) break;
    pageNumber++;
  }
  const writes = [];
  for (const [workerName, points] of Object.entries(byWorker)) {
    for (const p of points) {
      const date = parseDay(p.date_time.slice(0, 10));
      if (date < first || date > last || date > eligibleEnd) continue;
      if (completeKey.has(`${workerName}|${dk(date)}`)) continue;
      writes.push({
        poolSubaccountId: sub.id,
        workerName,
        date,
        hashrate: parseFloat(p.hashrate || "0") || 0,
        efficiency:
          typeof p.efficiency === "number" ? p.efficiency * 100 : null,
        estRevenue: typeof p.est_revenue === "number" ? p.est_revenue : null,
      });
    }
  }
  return { targets, writes };
}

// ---------------------------------------------------------------- transactions
async function planTransactions(sub, winStart, winEnd) {
  const last = await prisma.poolTransaction.findFirst({
    where: { poolSubaccountId: sub.id },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  // Re-fetch 2 days of overlap: dedupe is by the composite unique key, so
  // overlap is free and doubles as a consistency check against existing rows.
  const start = last ? utcDay(addDays(last.occurredAt, -2)) : winStart;
  if (start > winEnd) return { start, records: [], fresh: [], dbOnly: 0 };

  const txs = await luxorGetAllPages(
    `/pool/transactions/BTC`,
    {
      subaccount_names: sub.poolAuth.authKey,
      start_date: dk(start),
      end_date: dk(winEnd),
      page_size: 250,
    },
    "transactions",
  );
  const records = txs.map((tx) => ({
    poolId: sub.poolId,
    poolSubaccountId: sub.id,
    externalTransactionId: tx.transaction_id || null,
    transactionType: CREDIT_CATEGORIES.has(tx.transaction_category)
      ? "credit"
      : tx.transaction_type,
    category: tx.transaction_category,
    amount: tx.currency_amount,
    usdEquivalent: tx.usd_equivalent,
    addressName: tx.address_name || null,
    occurredAt: new Date(tx.date_time),
  }));
  const dbRows = await prisma.poolTransaction.findMany({
    where: {
      poolSubaccountId: sub.id,
      occurredAt: { gte: start, lt: addDays(winEnd, 1) },
    },
    select: {
      occurredAt: true,
      category: true,
      transactionType: true,
      amount: true,
    },
  });
  const key = (r) =>
    `${r.occurredAt.toISOString()}|${r.category}|${r.transactionType}|${r8(r.amount)}`;
  const dbKeys = new Set(dbRows.map(key));
  const apiKeys = new Set(records.map(key));
  const fresh = records.filter((r) => !dbKeys.has(key(r)));
  const dbOnly = dbRows.filter((r) => !apiKeys.has(key(r))).length;
  return { start, records, fresh, dbOnly };
}

// ---------------------------------------------------------------- main
async function main() {
  console.log(APPLY ? "MODE: APPLY (will write)" : "MODE: DRY RUN (no writes)");
  if (!process.env.LUXOR_API_KEY) throw new Error("LUXOR_API_KEY not set");

  const [{ now }] = await withDbRetry(() =>
    prisma.$queryRawUnsafe("SELECT now() AS now"),
  );
  const today = utcDay(now);
  const yesterday = addDays(today, -1);
  const winEnd = opt("to", null) ? parseDay(opt("to")) : yesterday;
  if (winEnd > yesterday)
    throw new Error(
      "--to cannot be today or later: Luxor returns no complete data for it",
    );
  const winStart = addDays(winEnd, -(LOOKBACK_DAYS - 1));
  const cand = eachDay(winStart, winEnd);
  const finalized = ALLOW_EARLY || now.getUTCHours() >= FINALIZE_HOUR_UTC;
  const eligibleEnd =
    winEnd.getTime() === yesterday.getTime() && !finalized
      ? addDays(yesterday, -1)
      : winEnd;
  console.log(
    `DB time: ${now.toISOString()} | window ${dk(winStart)}..${dk(winEnd)} | snapshot/worker eligible through ${dk(eligibleEnd)}${eligibleEnd < winEnd ? ` (${dk(winEnd)} deferred: before ${FINALIZE_HOUR_UTC}:00 UTC, cron will handle it; --allow-early to override)` : ""}`,
  );

  const subs = await withDbRetry(() =>
    prisma.poolSubaccount.findMany({
      where: {
        pool: { name: "Luxor" },
        poolAuthId: { not: null },
        subaccountName: {
          notIn: EXCLUDED_SUBACCOUNTS,
          ...(ONLY_SUB ? { equals: ONLY_SUB } : {}),
        },
      },
      include: { poolAuth: true },
      orderBy: { subaccountName: "asc" },
    }),
  );
  console.log(`Luxor subaccounts in scope: ${subs.length}\n`);

  let csvMap = null;
  if (ONLY.has("csv")) {
    if (CSV_DAILYSTATS) {
      csvMap = loadDailyStatsCsv(CSV_DAILYSTATS);
      console.log(
        `dailystats CSV loaded: ${csvMap.size} subaccount-day rows (hashprice/balance source of last resort)`,
      );
    } else {
      console.log(
        "No --csv-dailystats given: hashprice/balance will NOT be filled.",
      );
    }
  }
  const csvTx = CSV_TRANSACTIONS ? parseCsv(CSV_TRANSACTIONS).rows : null;

  const plan = [];
  let canaryFailed = false;
  let csvCanaryFailed = false;
  for (const sub of subs) {
    const name = sub.subaccountName;
    const p = { sub, name };
    try {
      if (ONLY.has("snapshots"))
        p.snap = await planSnapshots(sub, cand, eligibleEnd);
      if (ONLY.has("workers"))
        p.work = await planWorkers(sub, cand, eligibleEnd);
      if (ONLY.has("transactions"))
        p.tx = await planTransactions(sub, winStart, winEnd);
      if (csvMap)
        p.csv = await planCsvPatch(sub, csvMap, cand, eligibleEnd, p.snap);
    } catch (e) {
      p.error = e.message;
    }
    plan.push(p);

    const s = p.snap,
      w = p.work,
      t = p.tx,
      c = p.csv;
    console.log(
      `${name.padEnd(12)} ` +
        (p.error
          ? `ERROR ${p.error}`
          : [
              s
                ? `snap: targets=${s.targets.length} write=${s.writes.length} noData=${s.noData.length}${s.canary ? ` canary(${s.canary.day})=${s.canary.ok ? "ok" : "MISMATCH " + s.canary.diffs.join("; ")}` : s.targets.length ? " canary=none" : ""}`
                : "",
              w
                ? `workers: targetDays=${w.targets.length} rows=${w.writes.length}`
                : "",
              t
                ? `tx: fetched=${t.records.length} new=${t.fresh.length} dbOnly=${t.dbOnly}`
                : "",
              c
                ? `csv: fill=${c.patches.length}${c.skipped.length ? ` skipped=${c.skipped.length}` : ""}${c.canaryDiffs.length ? ` CANARY-MISMATCH[${c.canaryDiffs.join("; ")}]` : ""}`
                : "",
            ]
              .filter(Boolean)
              .join(" | ")),
    );
    if (p.snap?.canary && !p.snap.canary.ok) canaryFailed = true;
    if (p.csv?.canaryDiffs.length) csvCanaryFailed = true;
  }

  // ---- optional verify-only cross-check of API transactions against the transaction CSV
  let txCheck = null;
  if (csvTx) {
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    const apiByKey = new Map();
    for (const p of plan)
      for (const r of p.tx?.records || [])
        apiByKey.set(`${p.name}|${fmt(r.occurredAt)}|${r.category}`, r);
    txCheck = {
      csvRows: 0,
      matched: 0,
      btcMismatch: 0,
      usdCentDiff: 0,
      csvOnly: 0,
      apiFreshNotInCsv: 0,
    };
    const seen = new Set();
    for (const c of csvTx) {
      const day = c["Date (UTC)"].slice(0, 10);
      if (
        day < dk(winStart) ||
        day > dk(winEnd) ||
        EXCLUDED_SUBACCOUNTS.includes(c.Subaccount)
      )
        continue;
      txCheck.csvRows++;
      const k = `${c.Subaccount}|${c["Date (UTC)"]}|${c.Description}`;
      const a = apiByKey.get(k);
      if (!a) {
        txCheck.csvOnly++;
        continue;
      }
      seen.add(k);
      txCheck.matched++;
      if (Math.abs(Number(c["Amount (BTC)"]) - a.amount) > 1e-9)
        txCheck.btcMismatch++;
      if (
        Math.abs(
          Math.round(Number(c["Amount (USD)"]) * 100) / 100 - a.usdEquivalent,
        ) > 0.0051
      )
        txCheck.usdCentDiff++;
    }
    for (const p of plan)
      for (const r of p.tx?.fresh || [])
        if (!seen.has(`${p.name}|${fmt(r.occurredAt)}|${r.category}`))
          txCheck.apiFreshNotInCsv++;
  }

  // ---- summary
  const sum = (f) => plan.reduce((a, p) => a + f(p), 0);
  const snapWrites = sum((p) => p.snap?.writes.length || 0);
  const workRows = sum((p) => p.work?.writes.length || 0);
  const txNew = sum((p) => p.tx?.fresh.length || 0);
  const errors = plan.filter((p) => p.error);
  const snapDates = [
    ...new Set(
      plan.flatMap((p) => (p.snap?.writes || []).map((w) => dk(w.date))),
    ),
  ].sort();
  const txDates = [
    ...new Set(
      plan.flatMap((p) => (p.tx?.fresh || []).map((r) => dk(r.occurredAt))),
    ),
  ].sort();
  console.log("\n=== SUMMARY ===");
  console.log(
    `snapshot rows to write:    ${snapWrites}  dates: ${snapDates.join(", ") || "-"}`,
  );
  console.log(`worker-day rows to write:  ${workRows}`);
  console.log(
    `transactions to insert:    ${txNew}  dates: ${txDates.join(", ") || "-"}`,
  );
  console.log(`subaccounts with errors:   ${errors.length}`);
  console.log(
    `days Luxor had no data for (snapshots): ${JSON.stringify(Object.fromEntries(plan.filter((p) => p.snap?.noData.length).map((p) => [p.name, p.snap.noData])))}`,
  );
  const csvHp = sum(
    (p) => p.csv?.patches.filter((x) => x.hashprice !== undefined).length || 0,
  );
  const csvBal = sum(
    (p) => p.csv?.patches.filter((x) => x.balance !== undefined).length || 0,
  );
  const csvDates = [
    ...new Set(
      plan.flatMap((p) => (p.csv?.patches || []).map((x) => dk(x.date))),
    ),
  ].sort();
  console.log(
    `hashprice from CSV:        ${csvHp} row(s)  balance from CSV: ${csvBal} row(s)  dates: ${csvDates.join(", ") || "-"}`,
  );
  const csvSkipped = plan.flatMap((p) =>
    (p.csv?.skipped || []).map((s) => `${p.name} ${s}`),
  );
  if (csvSkipped.length)
    console.log(`csv rows skipped: ${csvSkipped.join(" | ")}`);
  if (txCheck)
    console.log(
      `transaction CSV cross-check (verify only, never written from CSV): csvRows=${txCheck.csvRows} matchedToApi=${txCheck.matched} btcMismatch=${txCheck.btcMismatch} usdCentDiff=${txCheck.usdCentDiff} csvOnly=${txCheck.csvOnly} apiFreshNotInCsv=${txCheck.apiFreshNotInCsv}`,
    );
  console.log(
    `\nNOT RECOVERABLE from any source (left NULL): firmware/status/staleShares/rejectedShares for ${workRows} worker-day rows${csvMap ? "" : "; hashprice+balance too, since no --csv-dailystats was given"}.`,
  );

  if (!APPLY) {
    console.log(
      "\nDry run complete. Nothing was written. Re-run with --apply to write.",
    );
    return;
  }
  if (canaryFailed && !IGNORE_CANARY) {
    throw new Error(
      "Canary mismatch: API values for an already-stored day differ from the DB. Refusing to write (check the API key/workspace). Use --ignore-canary only if you understand why.",
    );
  }
  if (csvCanaryFailed && !IGNORE_CANARY) {
    throw new Error(
      "CSV canary mismatch: the dailystats CSV disagrees with the API-sourced hashrate/workers/revenue for a day it would fill. Wrong or misdated file - refusing to write hashprice/balance from it.",
    );
  }
  if (errors.length)
    console.warn(
      `WARNING: ${errors.length} subaccount(s) errored; only successfully-planned subaccounts are written.`,
    );

  // ---- apply (same write shapes as the crons)
  for (const p of plan) {
    if (p.error) continue;
    if (p.snap?.writes.length) {
      await prisma.$transaction(
        p.snap.writes.map((v) => {
          const { date, ...vals } = v;
          return prisma.poolSubaccountDailySnapshot.upsert({
            where: {
              poolSubaccountId_date: { poolSubaccountId: p.sub.id, date },
            },
            // hashprice/balance deliberately absent from update AND create (stay null).
            create: { poolSubaccountId: p.sub.id, date, ...vals },
            update: vals,
          });
        }),
      );
    }
    if (p.work?.writes.length) {
      for (let i = 0; i < p.work.writes.length; i += 200) {
        await prisma.$transaction(
          p.work.writes.slice(i, i + 200).map((r) =>
            prisma.poolWorkerDailyMetric.upsert({
              where: {
                poolSubaccountId_workerName_date: {
                  poolSubaccountId: r.poolSubaccountId,
                  workerName: r.workerName,
                  date: r.date,
                },
              },
              create: r,
              update: {
                hashrate: r.hashrate,
                efficiency: r.efficiency,
                estRevenue: r.estRevenue,
              },
            }),
          ),
        );
      }
    }
    if (p.tx?.fresh.length) {
      await prisma.poolTransaction.createMany({
        data: p.tx.fresh,
        skipDuplicates: true,
      });
    }
    // CSV fills run last, after the API-sourced rows exist. The `: null` in each
    // WHERE makes these atomic no-ops if anything filled the column meanwhile
    // (e.g. a cron) - a CSV value can never overwrite an existing one.
    for (const x of p.csv?.patches || []) {
      const where = { poolSubaccountId: p.sub.id, date: x.date };
      if (x.hashprice !== undefined) {
        await prisma.poolSubaccountDailySnapshot.updateMany({
          where: { ...where, hashprice: null },
          data: { hashprice: x.hashprice },
        });
      }
      if (x.balance !== undefined) {
        await prisma.poolSubaccountDailySnapshot.updateMany({
          where: { ...where, balance: null },
          data: { balance: x.balance },
        });
      }
    }
    console.log(`written: ${p.name}`);
  }
  console.log("Apply complete.");
}

main()
  .catch((e) => {
    console.error("Fatal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
