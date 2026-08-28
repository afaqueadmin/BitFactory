/**
 * Bitcoin Live Price Service with Multi-Provider Fallback
 *
 * In the USA and certain regions, direct calls to api.binance.com fail with HTTP 451
 * (geo-blocked by Binance) or network errors.
 *
 * This service implements a multi-provider fallback strategy:
 * 1. Binance Vision Mirror (https://data-api.binance.vision) - Official public data mirror, works worldwide including US
 * 2. Binance Global (https://api.binance.com)
 * 3. Binance US (https://api.binance.us)
 * 4. Coinbase (https://api.coinbase.com)
 * 5. Kraken (https://api.kraken.com)
 * 6. CoinGecko (https://api.coingecko.com)
 * 7. Mempool.space (https://mempool.space)
 * 8. Internal API Route (/api/btcprice) as an automatic local fallback
 */

import { BtcPrice } from "@/types/types";

export interface Btc24hStats {
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  source: string;
}

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch live Bitcoin price with resilient fallbacks
 */
export async function fetchLiveBtcPrice(): Promise<BtcPrice> {
  // Provider 1: Binance Vision Public Mirror (Not geo-blocked in US)
  try {
    const res = await fetchWithTimeout(
      "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.price);
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSDT", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Binance Vision failed:", err);
  }

  // Provider 2: Binance Global
  try {
    const res = await fetchWithTimeout(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.price);
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSDT", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Binance Global failed:", err);
  }

  // Provider 3: Binance US
  try {
    const res = await fetchWithTimeout(
      "https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT",
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.price);
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSDT", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Binance US failed:", err);
  }

  // Provider 4: Coinbase Spot Price
  try {
    const res = await fetchWithTimeout(
      "https://api.coinbase.com/v2/prices/spot?currency=USD",
    );
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.amount);
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSD", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Coinbase failed:", err);
  }

  // Provider 5: Kraken Ticker
  try {
    const res = await fetchWithTimeout(
      "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    );
    if (res.ok) {
      const data = await res.json();
      const pairData = data?.result?.XXBTZUSD || data?.result?.XBTUSD;
      const price = parseFloat(pairData?.c?.[0]);
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSD", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Kraken failed:", err);
  }

  // Provider 6: CoinGecko
  try {
    const res = await fetchWithTimeout(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    );
    if (res.ok) {
      const data = await res.json();
      const price = data?.bitcoin?.usd;
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSD", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] CoinGecko failed:", err);
  }

  // Provider 7: Mempool.space
  try {
    const res = await fetchWithTimeout("https://mempool.space/api/v1/prices");
    if (res.ok) {
      const data = await res.json();
      const price = data?.USD;
      if (Number.isFinite(price) && price > 0) {
        return { symbol: "BTCUSD", price };
      }
    }
  } catch (err) {
    console.warn("[BTC Price] Mempool failed:", err);
  }

  // Provider 8: Internal server proxy (Next.js route)
  if (typeof window !== "undefined") {
    try {
      const res = await fetchWithTimeout("/api/btcprice");
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data?.price);
        if (Number.isFinite(price) && price > 0) {
          return { symbol: data.symbol || "BTCUSD", price };
        }
      }
    } catch (err) {
      console.warn("[BTC Price] Internal /api/btcprice failed:", err);
    }
  }

  throw new Error(
    "All Bitcoin price providers failed. Please check your internet connection.",
  );
}

/**
 * Fetch 24-hour Bitcoin ticker stats with fallbacks
 */
export async function fetchLiveBtc24hStats(): Promise<Btc24hStats> {
  const endpoints = [
    {
      url: "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT",
      source: "binance-vision",
    },
    {
      url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      source: "binance-global",
    },
    {
      url: "https://api.binance.us/api/v3/ticker/24hr?symbol=BTCUSDT",
      source: "binance-us",
    },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep.url);
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data.lastPrice || data.price);
        const priceChange = parseFloat(data.priceChange);
        const priceChangePercent = parseFloat(data.priceChangePercent);
        const highPrice = parseFloat(data.highPrice);
        const lowPrice = parseFloat(data.lowPrice);

        if (Number.isFinite(price)) {
          return {
            price,
            priceChange: Number.isFinite(priceChange) ? priceChange : 0,
            priceChangePercent: Number.isFinite(priceChangePercent)
              ? priceChangePercent
              : 0,
            highPrice: Number.isFinite(highPrice) ? highPrice : price,
            lowPrice: Number.isFinite(lowPrice) ? lowPrice : price,
            source: ep.source,
          };
        }
      }
    } catch (err) {
      console.warn(`[BTC 24h Stats] ${ep.source} failed:`, err);
    }
  }

  // Fallback: Fetch spot price and synthesize neutral 24h stats
  const spot = await fetchLiveBtcPrice();
  return {
    price: spot.price,
    priceChange: 0,
    priceChangePercent: 0,
    highPrice: spot.price,
    lowPrice: spot.price,
    source: "fallback-spot",
  };
}

/**
 * Fetch Bitcoin Kline / Candlestick data with fallbacks
 */
export async function fetchLiveBtcKlines(interval: string, limit: number) {
  const endpoints = [
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn(`[BTC Klines] ${url} failed:`, err);
    }
  }

  throw new Error("Failed to fetch candlestick data from all providers");
}
