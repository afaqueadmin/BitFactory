/**
 * src/lib/poolAggregation.ts
 * Pool Aggregation and Grouping Utilities
 *
 * Implements intelligent grouping of miners to minimize API calls when querying
 * multiple pools and multiple users.
 *
 * Architecture:
 * - Each miner has: poolAuth (token/subaccount), space.name (pool identifier)
 * - Miners sharing same poolAuth need: 1 API call
 * - Miners with different poolAuth need: separate API calls
 *
 * Example:
 * Input:  10 miners (5 Luxor + 5 Braiins)
 * Without grouping:  10 API calls (1 per miner)
 * With grouping:     2 API calls (1 per pool group)
 *
 * Grouping Strategy:
 * 1. Group by (pool, poolAuth) tuple
 * 2. Return grouped results with miner list per group
 * 3. Callers iterate groups (not miners) to minimize API calls
 *
 * Usage in Phase 2:
 * ```typescript
 * const miners = await fetchAllUserMiners(userId);
 * const grouped = groupMinersByPool(miners);
 *
 * for (const group of grouped) {
 *   if (group.pool === 'Luxor') {
 *     const data = await luxorClient.getWorkers(group.poolAuth);
 *   } else if (group.pool === 'Braiins') {
 *     const data = await braiinsClient.getWorkers(); // poolAuth already in client
 *   }
 *   // Associate returned data with all miners in group
 * }
 * ```
 */

import type { Miner } from "@/generated/prisma";

/**
 * Represents a grouped set of miners sharing the same pool and poolAuth
 * All miners in this group will be queried with a single API call
 */
export interface MinerGroup {
  /**
   * The pool name (e.g., "Luxor", "Braiins")
   * Determines which client/API to use
   */
  pool: string;

  /**
   * The authentication credential (Luxor subaccount name or Braiins API token)
   * Used to authenticate API requests for this group
   */
  poolAuth: string;

  /**
   * Unique identifier for this group
   * Format: "{pool}|{poolAuth}"
   * Can be used as a Map key for deduplication
   */
  groupId: string;

  /**
   * All miners that share this pool and poolAuth combination
   * When data is retrieved via API call, it applies to all these miners
   */
  miners: Miner[];

  /**
   * Count of miners in this group
   * For quick reference (don't need to count array)
   */
  minerCount: number;
}

/**
 * Comprehensive pool aggregation result
 * Separates miners into clearly identified pools with grouping
 */
export interface PoolAggregation {
  /**
   * All grouped miners (organized by pool+auth)
   */
  groups: MinerGroup[];

  /**
   * Summary statistics for quick reference
   */
  summary: {
    totalMiners: number;
    totalGroups: number;
    luxorGroups: number;
    braiinsGroups: number;
    luxorMiners: number;
    braiinsMiners: number;
    ungroupedMiners: number;
  };
}

/**
 * Invalid miner details with reason
 * Used to track miners that couldn't be grouped
 */
export interface FailedMiner {
  minerId: string;
  minerName: string;
  reason: "missing_pool" | "missing_auth" | "invalid_pool";
}

/**
 * Group miners by (pool, poolAuth) to enable efficient batch API calls
 *
 * This function:
 * 1. Groups miners by their pool name and poolAuth credential
 * 2. Validates each group has required fields
 * 3. Returns miners organized for minimal API calls
 * 4. Tracks invalid miners separately for error handling
 *
 * Why grouping matters:
 * - Luxor API: Can query 1 poolAuth with multiple miners in few extra fields
 * - Braiins API: 1 poolAuth = 1 user = 1 API call, but covers all workers for that user
 * - Without grouping: 10 miners = 10 API calls
 * - With grouping: 10 miners on 2 pools = 2 API calls max
 *
 * Validation:
 * - Miners without pool are skipped (need pool identifier)
 * - Miners without poolAuth are skipped (need auth credential)
 * - Invalid/missing fields are logged and excluded
 *
 * @param miners - Array of Miner objects (should include pool relation)
 * @returns Object with:
 *   - groups: grouped miners ready for API calls
 *   - summary: statistics
 *   - invalidMiners: list of miners that couldn't be grouped
 */
export function groupMinersByPool(
  miners: (Miner & { pool?: { id: string; name: string } | null })[],
): PoolAggregation & { invalidMiners: FailedMiner[] } {
  const groupMap = new Map<string, MinerGroup>();
  const invalidMiners: FailedMiner[] = [];

  console.log(
    `[Pool Aggregation] Grouping ${miners.length} miners by pool and auth...`,
  );

  for (const miner of miners) {
    // Validate: Pool is linked
    if (!miner.pool?.name) {
      invalidMiners.push({
        minerId: miner.id,
        minerName: miner.name,
        reason: "missing_pool",
      });
      console.warn(
        `[Pool Aggregation] Skipping miner "${miner.name}" (${miner.id}): missing pool information`,
      );
      continue;
    }

    // Validate: poolAuth exists
    if (!miner.poolAuth) {
      invalidMiners.push({
        minerId: miner.id,
        minerName: miner.name,
        reason: "missing_auth",
      });
      console.warn(
        `[Pool Aggregation] Skipping miner "${miner.name}" (${miner.id}): missing poolAuth credential`,
      );
      continue;
    }

    const poolName = miner.pool.name;
    const poolAuth = miner.poolAuth;

    // Create group key: "{pool}|{auth}"
    // This uniquely identifies a group (same pool + same auth = same API call)
    const groupId = `${poolName}|${poolAuth}`;

    // Add to existing group or create new one
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        pool: poolName,
        poolAuth: poolAuth,
        groupId: groupId,
        miners: [],
        minerCount: 0,
      });
    }

    const group = groupMap.get(groupId)!;
    group.miners.push(miner);
    group.minerCount = group.miners.length;

    console.debug(
      `[Pool Aggregation] Added miner "${miner.name}" to group "${groupId}" (total in group: ${group.minerCount})`,
    );
  }

  // Convert map to array
  const groups = Array.from(groupMap.values());

  // Calculate summary statistics
  const luxorGroups = groups.filter((g) =>
    g.pool.toLowerCase().includes("luxor"),
  );
  const braiinsGroups = groups.filter((g) =>
    g.pool.toLowerCase().includes("braiins"),
  );

  const luxorMiners = luxorGroups.reduce((sum, g) => sum + g.minerCount, 0);
  const braiinsMiners = braiinsGroups.reduce((sum, g) => sum + g.minerCount, 0);

  const summary = {
    totalMiners: miners.length,
    totalGroups: groups.length,
    luxorGroups: luxorGroups.length,
    braiinsGroups: braiinsGroups.length,
    luxorMiners: luxorMiners,
    braiinsMiners: braiinsMiners,
    ungroupedMiners: invalidMiners.length,
  };

  console.log(`[Pool Aggregation] Grouping complete:`);
  console.log(`  Total miners: ${summary.totalMiners}`);
  console.log(`  Successfully grouped: ${miners.length - invalidMiners.length}`);
  console.log(`  Total groups: ${summary.totalGroups}`);
  console.log(`    Luxor groups: ${summary.luxorGroups} (${summary.luxorMiners} miners)`);
  console.log(
    `    Braiins groups: ${summary.braiinsGroups} (${summary.braiinsMiners} miners)`,
  );
  console.log(`  Invalid/skipped: ${invalidMiners.length}`);

  return {
    groups,
    summary,
    invalidMiners,
  };
}

/**
 * Get only Luxor miners from grouped data
 *
 * Convenience function to filter for Luxor pool only.
 * Useful when an endpoint only needs to handle Luxor data.
 *
 * @param aggregation - Result from groupMinersByPool()
 * @returns Groups containing only Luxor miners
 */
export function getLuxorGroups(aggregation: PoolAggregation): MinerGroup[] {
  return aggregation.groups.filter((g) =>
    g.pool.toLowerCase().includes("luxor"),
  );
}

/**
 * Get only Braiins miners from grouped data
 *
 * Convenience function to filter for Braiins pool only.
 * Useful when an endpoint needs to handle Braiins data.
 *
 * @param aggregation - Result from groupMinersByPool()
 * @returns Groups containing only Braiins miners
 */
export function getBraiinsGroups(aggregation: PoolAggregation): MinerGroup[] {
  return aggregation.groups.filter((g) =>
    g.pool.toLowerCase().includes("braiins"),
  );
}

/**
 * Flatten grouped miners back to a single array
 *
 * Useful when updating a response that needs all miners in order.
 * Preserves the grouping information if needed for associating with pool data.
 * This function is commonly used when transforming API responses back to miner-level data.
 *
 * Example usage in Phase 2:
 * ```typescript
 * const aggregation = groupMinersByPool(miners);
 * const allMiners = flattenGroups(aggregation.groups);
 * return allMiners.map(miner => ({
 *   ...miner,
 *   hashrate: dataByPoolAuth[miner.poolAuth].hashrate,
 * }));
 * ```
 *
 * @param groups - Array of MinerGroup objects
 * @returns Flattened array of all miners
 */
export function flattenGroups(groups: MinerGroup[]): Miner[] {
  return groups.flatMap((group) => group.miners);
}

/**
 * Associate API results back to miners by grouping
 *
 * When you call an API with poolAuth and get back worker data,
 * this function maps the result to all miners in that group.
 *
 * Type-safe helper for common Phase 2 pattern:
 * ```typescript
 * const groups = groupMinersByPool(miners).groups;
 * const resultsByPoolAuth = new Map();
 *
 * for (const group of groups) {
 *   try {
 *     const result = await poolClient.getWorkers(group.poolAuth);
 *     resultsByPoolAuth.set(group.poolAuth, result);
 *   } catch (e) {
 *     console.error(`Failed to get workers for ${group.pool}: ${e}`);
 *   }
 * }
 *
 * // Now associate results back to miners
 * const minersWithData = associateDataToMiners(
 *   groups,
 *   resultsByPoolAuth,
 *   'workerCount',
 *   (miner) => miner.poolAuth
 * );
 * ```
 *
 * @template T - Type of data being associated
 * @param groups - Grouped miners
 * @param dataMap - Map of poolAuth → API result
 * @param fieldName - Field name to add to miners
 * @param getKey - Function to extract poolAuth from miner
 * @returns Array of miners with attached data
 */
export function associateDataToMiners<T>(
  groups: MinerGroup[],
  dataMap: Map<string, T>,
  fieldName: string,
  getKey: (miner: Miner) => string | null,
): Array<Record<string, unknown>> {
  return flattenGroups(groups).map((miner) => {
    const key = getKey(miner);
    const data = key ? dataMap.get(key) : null;
    return {
      ...miner,
      [fieldName]: data || null,
    };
  });
}

/**
 * Create a summary of grouping efficiency
 *
 * Used for monitoring and optimization purposes.
 * Shows how much API call reduction was achieved through grouping.
 *
 * @param aggregation - Result from groupMinersByPool()
 * @returns Efficiency metrics
 */
export function calculateGroupingEfficiency(aggregation: PoolAggregation): {
  totalMiners: number;
  apiCallsNeeded: number;
  reductionPercent: number;
  callsPerMiner: number;
} {
  const { totalMiners, totalGroups } = aggregation.summary;

  return {
    totalMiners,
    apiCallsNeeded: totalGroups,
    reductionPercent:
      totalMiners > 0
        ? ((totalMiners - totalGroups) / totalMiners) * 100
        : 0,
    callsPerMiner: totalMiners > 0 ? totalGroups / totalMiners : 0,
  };
}

/**
 * Detailed efficiency report for debugging and optimization
 *
 * @param aggregation - Result from groupMinersByPool()
 * @returns Detailed report with breakdowns by pool
 */
export function generateEfficiencyReport(aggregation: PoolAggregation): string {
  const efficiency = calculateGroupingEfficiency(aggregation);
  const { summary } = aggregation;

  const lines = [
    "=== Pool Aggregation Efficiency Report ===",
    `Total Miners: ${summary.totalMiners}`,
    `Total Groups: ${summary.totalGroups}`,
    `API Calls Saved: ${summary.totalMiners - summary.totalGroups}`,
    `Reduction: ${efficiency.reductionPercent.toFixed(1)}%`,
    `Efficiency: ${efficiency.callsPerMiner.toFixed(2)} API calls per miner`,
    "",
    "By Pool:",
    `  Luxor: ${summary.luxorMiners} miners in ${summary.luxorGroups} groups`,
    `  Braiins: ${summary.braiinsMiners} miners in ${summary.braiinsGroups} groups`,
    `  Ungrouped: ${summary.ungroupedMiners} (missing pool/auth)`,
  ];

  return lines.join("\n");
}
