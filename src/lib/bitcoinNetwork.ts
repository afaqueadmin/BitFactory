/**
 * src/lib/bitcoinNetwork.ts
 *
 * Bitcoin network constants, consensus-derived calculations, and a shared
 * fetch helper for the mempool.space public API.
 *
 * Luxor's pool API exposes only pool-scoped data (hashrate, hashprice, active
 * workers, payment threshold), so all network-wide figures are sourced here.
 */

/** Blocks between halvings. */
export const HALVING_INTERVAL = 210_000;

/** Blocks between difficulty retargets. */
export const RETARGET_INTERVAL = 2016;

/** The block time Bitcoin's difficulty adjustment targets, in milliseconds. */
export const TARGET_BLOCK_TIME_MS = 600_000;

/** Initial block subsidy in satoshis. */
const INITIAL_SUBSIDY_SATS = 50 * 1e8;

/**
 * After 33 halvings the subsidy rounds down to zero satoshis, so the schedule
 * terminates rather than continuing to halve indefinitely.
 */
const MAX_HALVINGS = 33;

const SATS_PER_BTC = 1e8;

/**
 * Hosts are tried in order. Both run the same mempool build, so they share a
 * schema, millisecond units, and — importantly — the same difficulty estimator,
 * meaning failover does not visibly shift the numbers shown on the page. Older
 * builds (e.g. mempool.bitaroo.net) return seconds and a materially different
 * difficultyChange, so do not add a host here without checking its version.
 */
export const MEMPOOL_HOSTS = [
  "https://mempool.space",
  "https://mempool.emzy.de",
] as const;

/**
 * Fetches a path from the first responsive mempool host.
 *
 * @param path - API path beginning with a slash, e.g. "/api/v1/prices"
 * @param isUsable - Validates the parsed payload; a host returning 200 with an
 *   unexpected body is treated as failed and the next host is tried.
 * @param revalidateSeconds - Server-side cache lifetime.
 */
export async function fetchFromMempool<T>(
  path: string,
  isUsable: (data: T) => boolean,
  revalidateSeconds: number,
): Promise<{ data: T; source: string }> {
  for (const host of MEMPOOL_HOSTS) {
    const url = `${host}${path}`;

    try {
      const response = await fetch(url, {
        next: { revalidate: revalidateSeconds },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`responded with status ${response.status}`);
      }

      const data: T = await response.json();

      if (!isUsable(data)) {
        throw new Error("returned an unexpected payload");
      }

      return { data, source: new URL(host).hostname };
    } catch (error) {
      console.warn(
        `[bitcoinNetwork] ${url} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw new Error(`All mempool sources failed for ${path}`);
}

/**
 * The block subsidy at a given height, in BTC.
 *
 * Excludes transaction fees — this is the newly issued portion only.
 */
export function getBlockReward(height: number): number {
  const halvings = Math.floor(height / HALVING_INTERVAL);

  if (halvings >= MAX_HALVINGS) {
    return 0;
  }

  // Integer satoshi math mirrors Bitcoin Core's right-shift, so the result is
  // exact rather than accumulating binary floating point error.
  return Math.floor(INITIAL_SUBSIDY_SATS / 2 ** halvings) / SATS_PER_BTC;
}

/**
 * Total issued supply at a given height, in BTC.
 *
 * This is the theoretical issuance implied by the emission schedule. It runs
 * ~29 BTC (0.0001%) above the true circulating supply, because a handful of
 * early coinbase outputs were never claimable — immaterial at market-cap scale,
 * and it avoids taking a dependency on a third-party supply figure.
 */
export function getCirculatingSupply(height: number): number {
  let remaining = height;
  let subsidy = INITIAL_SUBSIDY_SATS;
  let totalSats = 0;

  while (remaining > 0 && subsidy > 0) {
    const blocksInEpoch = Math.min(remaining, HALVING_INTERVAL);
    totalSats += blocksInEpoch * subsidy;
    remaining -= blocksInEpoch;
    subsidy = Math.floor(subsidy / 2);
  }

  return totalSats / SATS_PER_BTC;
}

export interface HalvingEstimate {
  height: number;
  blocksRemaining: number;
  estimatedDate: number;
}

/**
 * Estimates when the next halving occurs.
 *
 * Extrapolates at the 10 minute target rather than the current epoch's observed
 * average: the halving is tens of thousands of blocks out, and difficulty
 * retargets pull the average back toward the target long before then. Using a
 * single epoch's average would compound its deviation across years.
 */
export function getNextHalving(height: number): HalvingEstimate {
  const halvingHeight =
    (Math.floor(height / HALVING_INTERVAL) + 1) * HALVING_INTERVAL;
  const blocksRemaining = halvingHeight - height;

  return {
    height: halvingHeight,
    blocksRemaining,
    estimatedDate: Date.now() + blocksRemaining * TARGET_BLOCK_TIME_MS,
  };
}
