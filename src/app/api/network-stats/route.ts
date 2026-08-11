import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import {
  fetchFromMempool,
  getBlockReward,
  getCirculatingSupply,
  getNextHalving,
} from "@/lib/bitcoinNetwork";

/**
 * Network data moves on Bitcoin's ~10 minute block cadence, so a five minute
 * cache costs nothing in freshness while keeping this server to a handful of
 * upstream requests regardless of how many users load the page.
 */
const NETWORK_CACHE_SECONDS = 300;

/** Price is the one figure users expect to tick, so it is cached briefly. */
const PRICE_CACHE_SECONDS = 60;

interface MiningHashrateResponse {
  currentDifficulty: number;
  currentHashrate: number;
}

interface DifficultyAdjustmentResponse {
  timeAvg: number;
  previousRetarget: number;
}

interface MempoolPricesResponse {
  USD: number;
}

interface CoinGeckoPriceResponse {
  bitcoin?: { usd?: number };
}

interface BtcPrice {
  price: number;
  source: string;
}

async function fetchBlockHeight(): Promise<number> {
  const { data } = await fetchFromMempool<number>(
    "/api/blocks/tip/height",
    (value) => Number.isFinite(value) && value > 0,
    NETWORK_CACHE_SECONDS,
  );
  return data;
}

async function fetchDifficulty(): Promise<number> {
  const { data } = await fetchFromMempool<MiningHashrateResponse>(
    "/api/v1/mining/hashrate/3d",
    (value) => Number.isFinite(value?.currentDifficulty),
    NETWORK_CACHE_SECONDS,
  );
  return data.currentDifficulty;
}

async function fetchAdjustment(): Promise<DifficultyAdjustmentResponse> {
  const { data } = await fetchFromMempool<DifficultyAdjustmentResponse>(
    "/api/v1/difficulty-adjustment",
    (value) =>
      Number.isFinite(value?.timeAvg) &&
      Number.isFinite(value?.previousRetarget),
    NETWORK_CACHE_SECONDS,
  );
  return data;
}

/**
 * Binance is deliberately not used here, despite being the price source in
 * useBitcoinLivePrice. That hook runs in the browser, on the user's own IP;
 * this route runs on the server, which vercel.json pins to iad1 (US), and
 * api.binance.com answers US requests with HTTP 451 restricted-location. The
 * sources below are not geo-restricted.
 *
 * Market cap is derived from whichever price wins, so the two cards agree.
 */
async function fetchPriceFromMempool(): Promise<BtcPrice> {
  const { data, source } = await fetchFromMempool<MempoolPricesResponse>(
    "/api/v1/prices",
    (value) => Number.isFinite(value?.USD) && value.USD > 0,
    PRICE_CACHE_SECONDS,
  );

  return { price: data.USD, source };
}

async function fetchPriceFromCoinGecko(): Promise<BtcPrice> {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    {
      next: { revalidate: PRICE_CACHE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`CoinGecko responded with status ${response.status}`);
  }

  const data: CoinGeckoPriceResponse = await response.json();
  const price = data?.bitcoin?.usd;

  if (!Number.isFinite(price) || (price as number) <= 0) {
    throw new Error("CoinGecko returned an unexpected price payload");
  }

  return { price: price as number, source: "coingecko.com" };
}

async function fetchBtcPrice(): Promise<BtcPrice> {
  const providers = [fetchPriceFromMempool, fetchPriceFromCoinGecko];

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      console.warn(
        "[Network Stats API] Price source failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw new Error("All BTC price sources failed");
}

/**
 * GET /api/network-stats
 *
 * Bitcoin network figures for the hashprice page: BTC price, market cap, block
 * reward, network difficulty, average block time, next halving estimate and the
 * previous difficulty retarget.
 *
 * Sources degrade independently — a failure of one upstream leaves the other
 * cards populated rather than emptying the whole row.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await verifyJwtToken(token);
    } catch (error) {
      console.error("[Network Stats API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [heightResult, difficultyResult, adjustmentResult, priceResult] =
      await Promise.allSettled([
        fetchBlockHeight(),
        fetchDifficulty(),
        fetchAdjustment(),
        fetchBtcPrice(),
      ]);

    const errors: Record<string, string> = {};

    const pick = <T>(
      key: string,
      result: PromiseSettledResult<T>,
    ): T | null => {
      if (result.status === "fulfilled") return result.value;
      errors[key] =
        result.reason instanceof Error
          ? result.reason.message
          : "Unknown error";
      return null;
    };

    const height = pick("blockHeight", heightResult);
    const difficulty = pick("difficulty", difficultyResult);
    const adjustment = pick("difficultyAdjustment", adjustmentResult);
    const btcPrice = pick("btcPrice", priceResult);

    const btcPriceUsd = btcPrice?.price ?? null;
    const marketCapUsd =
      height !== null && btcPriceUsd !== null
        ? getCirculatingSupply(height) * btcPriceUsd
        : null;

    return NextResponse.json({
      success: true,
      data: {
        btcPriceUsd,
        // Which provider answered, so the card can name its actual source
        // rather than a hardcoded guess.
        priceSource: btcPrice?.source ?? null,
        marketCapUsd,
        circulatingSupply:
          height !== null ? getCirculatingSupply(height) : null,
        blockHeight: height,
        blockReward: height !== null ? getBlockReward(height) : null,
        networkDifficulty: difficulty,
        avgBlockTimeMs: adjustment?.timeAvg ?? null,
        previousRetargetPercent: adjustment?.previousRetarget ?? null,
        halving: height !== null ? getNextHalving(height) : null,
      },
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Network Stats API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch network stats",
      },
      { status: 500 },
    );
  }
}
