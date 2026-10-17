import { createHmac } from "crypto";
import { Pay } from "@binance/pay";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

// Signed /sapi endpoints must hit the main API from a region Binance doesn't
// geo-block (US requests fail with HTTP 451).
const BINANCE_API_URL =
  process.env.BINANCE_API_URL || "https://api.binance.com";
const BINANCE_API_KEY = process.env.BINANCE_API_KEY!;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET!;

const RECV_WINDOW_MS = 5000;
const CACHE_TTL_MS = 8000;
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const BINANCE_USDT_NETWORKS = [
  {
    network: "TRX",
    label: "TRON (TRC20)",
    address: process.env.BINANCE_USDT_TRC20_ADDRESS || "",
  },
  {
    network: "ETH",
    label: "Ethereum (ERC20)",
    address: process.env.BINANCE_USDT_ERC20_ADDRESS || "",
  },
];

export interface BinanceIncomingPayment {
  txId: string;
  amount: Decimal;
  time: Date;
  source: "DEPOSIT" | "PAY";
  network?: string;
}

interface BinanceDeposit {
  id: string;
  amount: string;
  coin: string;
  network: string;
  status: number;
  address: string;
  txId: string;
  insertTime: number;
}

// Deposit status 1 = success, 6 = credited but not yet withdrawable.
const CREDITED_DEPOSIT_STATUSES = [1, 6];

function signQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.append(key, String(value));
  }
  query.append("recvWindow", String(RECV_WINDOW_MS));
  query.append("timestamp", String(Date.now()));

  const signature = createHmac("sha256", BINANCE_API_SECRET)
    .update(query.toString())
    .digest("hex");
  query.append("signature", signature);

  return query.toString();
}

const payClient = new Pay({
  configurationRestAPI: {
    apiKey: BINANCE_API_KEY,
    apiSecret: BINANCE_API_SECRET,
  },
});

/** On-chain (or Binance-internal) USDT deposits to our configured addresses. */
export async function getUsdtDeposits(
  startTime: number,
): Promise<BinanceIncomingPayment[]> {
  const query = signQuery({ coin: "USDT", startTime });
  const res = await fetch(
    `${BINANCE_API_URL}/sapi/v1/capital/deposit/hisrec?${query}`,
    {
      headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Binance deposit history failed: ${await res.text()}`);
  }

  const deposits = (await res.json()) as BinanceDeposit[];
  const addresses = new Map(
    BINANCE_USDT_NETWORKS.filter((n) => n.address).map((n) => [
      n.network,
      n.address.toLowerCase(),
    ]),
  );

  return deposits
    .filter(
      (d) =>
        CREDITED_DEPOSIT_STATUSES.includes(d.status) &&
        addresses.get(d.network) === d.address.toLowerCase(),
    )
    .map((d) => ({
      txId: `DEPOSIT:${d.id}`,
      amount: new Decimal(d.amount),
      time: new Date(d.insertTime),
      source: "DEPOSIT" as const,
      network: d.network,
    }));
}

/** Incoming USDT Binance Pay transfers (Pay ID / internal transfers). */
export async function getIncomingPayTransactions(
  startTime: number,
): Promise<BinanceIncomingPayment[]> {
  const response = await payClient.restAPI.getPayTradeHistory({
    startTime,
    limit: 100,
  });
  const body = await response.data();

  return (body.data ?? [])
    .filter(
      (t) =>
        t.transactionId &&
        t.currency === "USDT" &&
        t.amount &&
        new Decimal(t.amount).greaterThan(0),
    )
    .map((t) => ({
      txId: `PAY:${t.transactionId}`,
      amount: new Decimal(t.amount!),
      time: new Date(Number(t.transactionTime)),
      source: "PAY" as const,
    }));
}

// One Binance fetch shared across concurrent pollers; always covers the
// full lookback window so every caller can filter by its own start time.
let cache: { at: number; payments: BinanceIncomingPayment[] } | null = null;
let inflight: Promise<BinanceIncomingPayment[]> | null = null;

async function getRecentIncomingPayments(): Promise<BinanceIncomingPayment[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payments;
  if (inflight) return inflight;

  const since = Date.now() - MAX_LOOKBACK_MS;
  inflight = Promise.all([
    getUsdtDeposits(since),
    getIncomingPayTransactions(since),
  ])
    .then(([deposits, pays]) => {
      const payments = [...deposits, ...pays].sort(
        (a, b) => a.time.getTime() - b.time.getTime(),
      );
      cache = { at: Date.now(), payments };
      return payments;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Earliest unused incoming USDT payment on or after `since` whose amount
 * equals the invoice total (to the cent).
 */
export async function findMatchingBinancePayment(
  invoiceTotal: Decimal,
  since: Date,
): Promise<BinanceIncomingPayment | null> {
  const target = invoiceTotal.toFixed(2);
  const candidates = (await getRecentIncomingPayments()).filter(
    (p) => p.time >= since && p.amount.toFixed(2) === target,
  );
  if (candidates.length === 0) return null;

  const used = await prisma.invoice.findMany({
    where: { binanceTxId: { in: candidates.map((c) => c.txId) } },
    select: { binanceTxId: true },
  });
  const usedIds = new Set(used.map((u) => u.binanceTxId));
  return candidates.find((c) => !usedIds.has(c.txId)) ?? null;
}
