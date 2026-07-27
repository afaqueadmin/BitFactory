import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FearGreedResult {
  value: number;
  classification: string;
  timestamp: number;
}

interface CoinGeckoResult {
  marketCapRank: number | null;
  ath: number;
  athChangePercentage: number;
  atl: number;
  atlChangePercentage: number;
  priceChangePercentage1h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  sentimentVotesUpPercentage: number | null;
  sentimentVotesDownPercentage: number | null;
}

async function fetchFearGreed(): Promise<FearGreedResult> {
  const res = await fetch(
    "https://api.alternative.me/fng/?limit=1&format=json",
    {
      next: { revalidate: 300 },
    },
  );
  if (!res.ok) throw new Error(`Fear & Greed API error: ${res.status}`);
  const json = await res.json();
  const entry = json?.data?.[0];
  if (!entry) throw new Error("Fear & Greed API returned no data");
  return {
    value: parseInt(entry.value, 10),
    classification: entry.value_classification,
    timestamp: parseInt(entry.timestamp, 10) * 1000,
  };
}

async function fetchCoinGecko(): Promise<CoinGeckoResult> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false",
    { next: { revalidate: 120 } },
  );
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  const json = await res.json();
  const md = json?.market_data;
  if (!md) throw new Error("CoinGecko API returned no market data");
  return {
    marketCapRank: json.market_cap_rank ?? null,
    ath: md.ath?.usd ?? 0,
    athChangePercentage: md.ath_change_percentage?.usd ?? 0,
    atl: md.atl?.usd ?? 0,
    atlChangePercentage: md.atl_change_percentage?.usd ?? 0,
    priceChangePercentage1h:
      md.price_change_percentage_1h_in_currency?.usd ?? null,
    priceChangePercentage24h: md.price_change_percentage_24h ?? null,
    priceChangePercentage7d: md.price_change_percentage_7d ?? null,
    priceChangePercentage30d: md.price_change_percentage_30d ?? null,
    sentimentVotesUpPercentage: json.sentiment_votes_up_percentage ?? null,
    sentimentVotesDownPercentage: json.sentiment_votes_down_percentage ?? null,
  };
}

export async function GET() {
  const [fearGreed, coingecko] = await Promise.allSettled([
    fetchFearGreed(),
    fetchCoinGecko(),
  ]);

  const errors: Record<string, string> = {};

  const pick = <T>(key: string, result: PromiseSettledResult<T>): T | null => {
    if (result.status === "fulfilled") return result.value;
    errors[key] =
      result.reason instanceof Error ? result.reason.message : "Unknown error";
    return null;
  };

  return NextResponse.json({
    fearGreed: pick("fearGreed", fearGreed),
    coingecko: pick("coingecko", coingecko),
    errors,
    timestamp: Date.now(),
  });
}
