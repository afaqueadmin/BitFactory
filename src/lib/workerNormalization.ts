/**
 * src/lib/workerNormalization.ts
 * API Response Normalization for Luxor and Braiins
 *
 * This module normalizes worker data from different mining pools to a consistent format:
 * - Status: "ACTIVE" or "INACTIVE" (normalized from Luxor "ACTIVE"/"INACTIVE" or Braiins "ok"/"dis"/"low"/"off")
 * - Hashrate: Always in H/s (raw hashes per second)
 * - Hashrate display: Always in TH/s (terahash per second, 6 decimal places)
 * - Firmware: String or "N/A"
 *
 * Unit Conversion:
 * - H/s = raw value (no conversion)
 * - TH/s = H/s / 1,000,000,000,000 (divide by 10^12)
 * - PH/s = H/s / 1,000,000,000,000,000 (divide by 10^15)
 *
 * This normalization happens at the API response layer, not in components,
 * making data aggregation and calculations clean and simple.
 */

// ============================================================================
// NORMALIZED WORKER TYPES
// ============================================================================

export interface NormalizedWorker {
  name: string;
  status: "ACTIVE" | "INACTIVE"; // Normalized status (always uppercase, two states)
  hashrate: number; // Raw hashrate in H/s (not converted to TH/s, used for calculations)
  firmware: string; // Firmware version or "N/A"
  timeframe: "5m" | "60m" | "24h"; // Which timeframe hashrate is from
}

// ============================================================================
// HANDLERS FOR EACH API
// ============================================================================

/** 
 * Handle Luxor API worker response
 * Luxor returns: Worker[] with status (ACTIVE/INACTIVE) and hashrate in H/s
 */
export function normalizeLuxorWorker(luxorWorker: {
  name: string;
  status: string;
  hashrate: number;
  firmware?: string;
}): NormalizedWorker {
  return {
    name: luxorWorker.name,
    status: luxorWorker.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    hashrate: luxorWorker.hashrate || 0, // Already in H/s
    firmware: luxorWorker.firmware || "N/A",
    timeframe: "5m", // Luxor doesn't specify, assume 5m
  };
}

/**
 * Handle Braiins API worker response
 * Braiins returns: { name, state: "ok"|"dis"|"low"|"off", hash_rate_5m, hash_rate_60m, hash_rate_24h, ... }
 * We use hash_rate_5m for immediate status, but could use 24h for averaging
 */
export function normalizeBraiinsWorker(braiinsWorker: {
  name?: string;
  state: "ok" | "dis" | "low" | "off";
  hash_rate_5m: number;
  hash_rate_60m: number;
  hash_rate_24h: number;
  hash_rate_unit?: string;
}): NormalizedWorker {
  // Map Braiins state to ACTIVE/INACTIVE
  const status =
    braiinsWorker.state === "ok" ? "ACTIVE" : "INACTIVE";

  return {
    name: braiinsWorker.name || "unknown",
    status,
    // For immediate hashrate use 5m, but consider 24h for averaging
    hashrate: braiinsWorker.hash_rate_5m || 0, // In H/s
    firmware: "N/A", // Braiins doesn't provide firmware
    timeframe: "5m",
  };
}

// ============================================================================
// UTILITY: FORMAT HASHRATE FOR DISPLAY
// ============================================================================

/**
 * Convert raw hashrate (H/s) to display format (TH/s with 6 decimal places)
 * @param hashrateInHS Raw hashrate in H/s
 * @returns Formatted string like "283.25 TH/s" or "0.474 PH/s"
 */
export function formatHashrate(hashrateInHS: number): string {
  if (!hashrateInHS || hashrateInHS === 0) return "0.00 TH/s";

  // Convert H/s to TH/s (divide by 10^12)
  const thValue = hashrateInHS / 1000000000000;

  // If >= 1000 TH/s, show as PH/s
  if (thValue >= 1000) {
    const phValue = thValue / 1000;
    return `${phValue.toFixed(3)} PH/s`;
  }

  // Otherwise show as TH/s
  return `${thValue.toFixed(2)} TH/s`;
}

/**
 * Get raw value for calculations - always returns H/s
 * This is for aggregations and math operations, not display
 */
export function hashrateInHS(hashrateInHS: number): number {
  return hashrateInHS || 0;
}
