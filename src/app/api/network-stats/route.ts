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

interface BinanceTickerResponse {
  symbol: string;
  price: string;
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
 * Binance is the price source already used elsewhere in the app
 * (useBitcoinLivePrice), so the figure here matches what users see on other
 * pages. Market cap is derived from this same price for internal consistency.
 */
async function fetchBtcPrice(): Promise<number> {
  const response = await fetch(
    "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    {
      next: { revalidate: PRICE_CACHE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Binance responded with status ${response.status}`);
  }

  const data: BinanceTickerResponse = await response.json();
  const price = Number(data?.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Binance returned an unexpected price payload");
  }

  return price;
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
    const btcPriceUsd = pick("btcPrice", priceResult);

    const marketCapUsd =
      height !== null && btcPriceUsd !== null
        ? getCirculatingSupply(height) * btcPriceUsd
        : null;

    return NextResponse.json({
      success: true,
      data: {
        btcPriceUsd,
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
