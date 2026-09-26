/**
 * Payback daily snapshot gap fill (Sep 2026 Luxor API-key outage).
 *
 * Fills PaybackDailySnapshot rows the 00:10 UTC cron could not write, using a
 * Luxor dashboard "dailystats" CSV for the day's hashprice instead of the live
 * hashprice the cron/admin backfill would stamp (Luxor's summary endpoint has no
 * date parameter, so a late backfill through the app can only ever record the
 * CURRENT hashprice for a past day).
 *
 * Every other input mirrors src/lib/services/paybackSnapshotService.ts:
 *   btcCloseUsd  <- Binance daily kline close (same URL as fetchBtcDailyCloseUsd)
 *   breakevens   <- calculateBreakevenBtcPrice via computeProfileBreakevens, using
 *                   the CURRENT CLIENT/COMPANY rows of payback_config (the cron
 *                   also uses current config, not the config of the past day)
 *
 * Only days that are missing, or whose stored row is not valid
 * (isValidSnapshot), are written; a valid row is never overwritten.
 *
 * Safety: before writing, the script recomputes the most recent stored valid
 * rows from their own stored hashprice + the current config and compares all 8
 * breakeven columns, and compares Binance's close for the latest stored day with
 * the stored btcCloseUsd. If either disagrees (config changed, wrong data
 * source) it refuses to write unless --ignore-canary is given.
 *
 * DEFAULT IS A DRY RUN. Pass --apply to write. Idempotent.
 *
 *   node scripts/backfill-payback-from-csv-20260921.js --csv-dailystats=FILE
 *        [--apply] [--lookback-days=14] [--ignore-canary]
 */

const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const fs = require("fs");

const prisma = new PrismaClient();

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const APPLY = flag("apply");
const IGNORE_CANARY = flag("ignore-canary");
const LOOKBACK_DAYS = parseInt(opt("lookback-days", "14"), 10);
const CSV_FILE = opt("csv-dailystats", null);

// Same list as src/lib/services/cronRetry.ts EXCLUDED_SUBACCOUNTS.
const EXCLUDED_SUBACCOUNTS = ["higgs_test", "higgs_test2", "higgs_test3"];
const SNAPSHOT_NUMERIC_FIELDS = [
  "btcCloseUsd",
  "hashpriceBtcPerPhDay",
  "clientS21ProStockBreakeven",
  "clientS21ProCustomBreakeven",
  "clientS21XpStockBreakeven",
  "clientS21XpCustomBreakeven",
  "companyS21ProStockBreakeven",
  "companyS21ProCustomBreakeven",
  "companyS21XpStockBreakeven",
  "companyS21XpCustomBreakeven",
];

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utcDay = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const dk = (d) => d.toISOString().slice(0, 10);
const parseDay = (s) => new Date(`${s}T00:00:00.000Z`);

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

/** dailystats CSV -> Map(YYYY-MM-DD -> hashprice). One pool-wide value per day, or refuse. */
function loadHashpriceByDate(file) {
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  for (const h of ["Date", "Subaccount", "Price (BTC/PH/s/Day)"]) {
    if (!headers.includes(h))
      throw new Error(`dailystats CSV is missing column: ${h}`);
  }
  const perDate = {};
  for (const l of lines.slice(1)) {
    const row = Object.fromEntries(
      parseCsvLine(l).map((v, i) => [headers[i], v]),
    );
    if (EXCLUDED_SUBACCOUNTS.includes(row.Subaccount)) continue;
    const v = row["Price (BTC/PH/s/Day)"];
    if (v === "" || !Number.isFinite(Number(v))) continue;
    (perDate[row.Date] ||= new Set()).add(v);
  }
  const out = new Map();
  for (const [date, set] of Object.entries(perDate)) {
    if (set.size !== 1)
      throw new Error(
        `dailystats CSV has ${set.size} different hashprice values on ${date}`,
      );
    out.set(date, Number([...set][0]));
  }
  return out;
}

/** Same request as fetchBtcDailyCloseUsd in paybackSnapshotService.ts. */
async function fetchBtcDailyCloseUsd(date) {
  const dayStartMs = date.getTime();
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${dayStartMs}&limit=1`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Binance klines failed with status ${res.status}`);
  const candle = (await res.json())[0];
  const close = candle ? Number(candle[4]) : NaN;
  if (!Number.isFinite(close) || candle[0] !== dayStartMs)
    throw new Error(`Binance returned no matching candle for ${dk(date)}`);
  return close;
}

// ---- ported 1:1 from src/lib/helpers/paybackCalculations.ts / paybackSnapshot.ts
const calculateBreakevenBtcPrice = (
  monthlyElectricityHosting,
  rewardBtcPerPhDay,
  hashrateTh,
  poolCommission,
  fallbackPrice,
) => {
  try {
    const hashratePh = hashrateTh / 1000;
    const denominator =
      rewardBtcPerPhDay * hashratePh * (1 - poolCommission / 100) * (365 / 12);
    if (denominator <= 0) return fallbackPrice;
    return monthlyElectricityHosting / denominator;
  } catch {
    return fallbackPrice;
  }
};

const serializeConfig = (c) => ({
  s21proMonthlyInvoicingAmount: Number(c.s21proMonthlyInvoicingAmount),
  s21xpMonthlyInvoicingAmount: Number(c.s21xpMonthlyInvoicingAmount),
  poolCommissionStockOs: Number(c.poolCommissionStockOs),
  poolCommissionLuxos: Number(c.poolCommissionLuxos),
  s21proHashrateStockOs: Number(c.s21proHashrateStockOs),
  s21proHashrateLuxos: Number(c.s21proHashrateLuxos),
  s21xpHashrateStockOs: Number(c.s21xpHashrateStockOs),
  s21xpHashrateLuxos: Number(c.s21xpHashrateLuxos),
  breakevenBtcPrice: Number(c.breakevenBtcPrice),
});

const profileBreakevens = (c, reward) => ({
  s21proStock: calculateBreakevenBtcPrice(
    c.s21proMonthlyInvoicingAmount,
    reward,
    c.s21proHashrateStockOs,
    c.poolCommissionStockOs,
    c.breakevenBtcPrice,
  ),
  s21proCustom: calculateBreakevenBtcPrice(
    c.s21proMonthlyInvoicingAmount,
    reward,
    c.s21proHashrateLuxos,
    c.poolCommissionLuxos,
    c.breakevenBtcPrice,
  ),
  s21xpStock: calculateBreakevenBtcPrice(
    c.s21xpMonthlyInvoicingAmount,
    reward,
    c.s21xpHashrateStockOs,
    c.poolCommissionStockOs,
    c.breakevenBtcPrice,
  ),
  s21xpCustom: calculateBreakevenBtcPrice(
    c.s21xpMonthlyInvoicingAmount,
    reward,
    c.s21xpHashrateLuxos,
    c.poolCommissionLuxos,
    c.breakevenBtcPrice,
  ),
});

const buildSnapshotValues = ({ btcCloseUsd, hashprice, client, company }) => {
  const c = profileBreakevens(client, hashprice);
  const o = profileBreakevens(company, hashprice);
  return {
    btcCloseUsd,
    hashpriceBtcPerPhDay: hashprice,
    clientS21ProStockBreakeven: c.s21proStock,
    clientS21ProCustomBreakeven: c.s21proCustom,
    clientS21XpStockBreakeven: c.s21xpStock,
    clientS21XpCustomBreakeven: c.s21xpCustom,
    companyS21ProStockBreakeven: o.s21proStock,
    companyS21ProCustomBreakeven: o.s21proCustom,
    companyS21XpStockBreakeven: o.s21xpStock,
    companyS21XpCustomBreakeven: o.s21xpCustom,
  };
};

const isValidSnapshot = (row) =>
  SNAPSHOT_NUMERIC_FIELDS.every(
    (f) =>
      row[f] !== null &&
      row[f] !== undefined &&
      Number.isFinite(Number(row[f])),
  );

// ---------------------------------------------------------------- main
async function main() {
  console.log(APPLY ? "MODE: APPLY (will write)" : "MODE: DRY RUN (no writes)");
  if (!CSV_FILE) throw new Error("--csv-dailystats=FILE is required");

  const [{ now }] = await withDbRetry(() =>
    prisma.$queryRawUnsafe("SELECT now() AS now"),
  );
  const yesterday = addDays(utcDay(now), -1);
  const winStart = addDays(yesterday, -(LOOKBACK_DAYS - 1));
  console.log(
    `DB time: ${now.toISOString()} | window ${dk(winStart)}..${dk(yesterday)}`,
  );

  // Configs: read only. Deliberately NOT getOrCreatePaybackConfig - a missing
  // config must abort the run, never be silently created with defaults.
  const [clientRow, companyRow] = await withDbRetry(() =>
    Promise.all([
      prisma.paybackConfig.findFirst({ where: { profileType: "CLIENT" } }),
      prisma.paybackConfig.findFirst({ where: { profileType: "COMPANY" } }),
    ]),
  );
  if (!clientRow || !companyRow)
    throw new Error(
      "payback_config CLIENT/COMPANY row missing - refusing to guess defaults",
    );
  const client = serializeConfig(clientRow);
  const company = serializeConfig(companyRow);
  console.log(
    `config rows: CLIENT updated ${clientRow.updatedAt.toISOString()} | COMPANY updated ${companyRow.updatedAt.toISOString()}`,
  );

  const hashpriceByDate = loadHashpriceByDate(CSV_FILE);
  console.log(
    `CSV hashprice by date: ${[...hashpriceByDate].map(([d, v]) => `${d}=${v}`).join(", ")}`,
  );

  const existing = await prisma.paybackDailySnapshot.findMany({
    where: { date: { gte: winStart, lte: yesterday } },
    orderBy: { date: "desc" },
  });
  const byDate = new Map(existing.map((r) => [dk(r.date), r]));

  // ---- canary 1: reproduce the newest stored valid rows from their own hashprice
  let canaryOk = true;
  const valid = existing.filter(isValidSnapshot).slice(0, 3);
  if (!valid.length) {
    console.log(
      "canary: no stored valid row in window to reproduce - cannot validate config/formula",
    );
    canaryOk = false;
  }
  for (const row of valid) {
    const v = buildSnapshotValues({
      btcCloseUsd: Number(row.btcCloseUsd),
      hashprice: Number(row.hashpriceBtcPerPhDay),
      client,
      company,
    });
    const maxDiff = Math.max(
      ...SNAPSHOT_NUMERIC_FIELDS.filter((f) => f.endsWith("Breakeven")).map(
        (f) => Math.abs(v[f] - Number(row[f])),
      ),
    );
    const ok = maxDiff <= 0.01;
    if (!ok) canaryOk = false;
    console.log(
      `canary formula/config on stored ${dk(row.date)}: max diff over 8 breakevens = ${maxDiff.toFixed(4)} -> ${ok ? "ok" : "MISMATCH"}`,
    );
  }
  // ---- canary 2: Binance close for the newest stored day equals what is stored
  if (valid.length) {
    const b = await fetchBtcDailyCloseUsd(valid[0].date);
    const ok = Math.abs(b - Number(valid[0].btcCloseUsd)) <= 0.01;
    if (!ok) canaryOk = false;
    console.log(
      `canary binance close ${dk(valid[0].date)}: binance=${b} stored=${Number(valid[0].btcCloseUsd)} -> ${ok ? "ok" : "MISMATCH"}`,
    );
  }

  // ---- plan: days in CSV, in window, missing or invalid
  const plan = [];
  for (const [date, hashprice] of [...hashpriceByDate].sort()) {
    const d = parseDay(date);
    if (d < winStart || d > yesterday) continue;
    const row = byDate.get(date);
    if (row && isValidSnapshot(row)) {
      console.log(`${date}: valid row already stored - skipped`);
      continue;
    }
    const btcCloseUsd = await fetchBtcDailyCloseUsd(d);
    const values = buildSnapshotValues({
      btcCloseUsd,
      hashprice,
      client,
      company,
    });
    plan.push({ date: d, existing: row || null, values });
  }
  console.log("\n=== PLAN ===");
  if (!plan.length) console.log("nothing to write");
  for (const p of plan) {
    console.log(
      `${dk(p.date)} ${p.existing ? "UPDATE (stored row invalid)" : "CREATE"} ` +
        JSON.stringify(
          Object.fromEntries(
            Object.entries(p.values).map(([k, v]) => [
              k,
              +v.toFixed(k === "hashpriceBtcPerPhDay" ? 8 : 2),
            ]),
          ),
        ),
    );
  }

  if (!APPLY) {
    console.log(
      "\nDry run complete. Nothing was written. Re-run with --apply to write.",
    );
    return;
  }
  if (!canaryOk && !IGNORE_CANARY)
    throw new Error(
      "Canary failed: refusing to write (config/formula/data source does not reproduce stored rows).",
    );

  for (const p of plan) {
    // Re-check right before writing: a cron may have filled the day meanwhile.
    const fresh = await prisma.paybackDailySnapshot.findUnique({
      where: { date: p.date },
    });
    if (fresh && isValidSnapshot(fresh)) {
      console.log(`${dk(p.date)}: became valid meanwhile - skipped`);
      continue;
    }
    await prisma.paybackDailySnapshot.upsert({
      where: { date: p.date },
      create: { date: p.date, ...p.values },
      update: { ...p.values },
    });
    console.log(`written: ${dk(p.date)}`);
  }
  console.log("Apply complete.");
}

main()
  .catch((e) => {
    console.error("Fatal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
