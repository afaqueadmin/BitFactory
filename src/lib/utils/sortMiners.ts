/**
 * Miner Sorting Utility
 *
 * Provides fully typed sorting functionality for miners data.
 * Supports sorting by all miner fields with ascending/descending direction.
 */

/**
 * Supported sort field keys for miners
 */
export type MinerSortField =
  | "name"
  | "user"
  | "subaccount"
  | "model"
  | "powerUsage"
  | "hashRate"
  | "status"
  | "ratePerKwh"
  | "createdAt";

/**
 * Sort direction type
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort configuration interface
 */
export interface SortConfig {
  field: MinerSortField;
  direction: SortDirection;
}

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  luxorSubaccountName?: string | null;
}

/**
 * Space object from API
 */
interface Space {
  id: string;
  name: string;
  location: string;
}

/**
 * Hardware object from API
 */
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  hashRate: number | string;
}

/**
 * Miner object from API
 */
interface Miner {
  id: string;
  name: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS";
  hardwareId: string;
  userId: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  rate_per_kwh?: number;
  user?: User;
  space?: Space;
  hardware?: Hardware;
  rateHistory?: Array<{
    rate_per_kwh: number;
    createdAt: string;
  }>;
}

/**
 * Extract sortable value from a miner by field name
 */
function getSortValue(miner: Miner, field: MinerSortField): string | number {
  switch (field) {
    case "name":
      return miner.name.toLowerCase();

    case "user":
      return (miner.user?.name || miner.user?.email || "").toLowerCase();

    case "subaccount":
      return (miner.user?.luxorSubaccountName || "").toLowerCase();

    case "model":
      return (miner.hardware?.model || "").toLowerCase();

    case "powerUsage":
      return Number(miner.hardware?.powerUsage || 0);

    case "hashRate":
      return Number(miner.hardware?.hashRate || 0);

    case "status":
      return miner.status.toLowerCase();

    case "ratePerKwh":
      return Number(miner.rate_per_kwh || 0);

    case "createdAt":
      return new Date(miner.createdAt).getTime();

    default:
      return "";
  }
}

/**
 * Compare two values for sorting
 */
function compareValues(a: string | number, b: string | number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Sort an array of miners by the specified field and direction
 *
 * @param miners - Array of miners to sort
 * @param config - Sort configuration (field and direction)
 * @returns Sorted array of miners
 *
 * @example
 * const sortedMiners = sortMiners(miners, { field: "name", direction: "asc" });
 */
export function sortMiners(miners: Miner[], config: SortConfig): Miner[] {
  const sorted = [...miners];

  sorted.sort((a, b) => {
    const aValue = getSortValue(a, config.field);
    const bValue = getSortValue(b, config.field);
    const comparison = compareValues(aValue, bValue);

    return config.direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Toggle sort direction
 *
 * @param current - Current sort direction
 * @returns Opposite sort direction
 *
 * @example
 * const newDirection = toggleSortDirection("asc"); // Returns "desc"
 */
export function toggleSortDirection(current: SortDirection): SortDirection {
  return current === "asc" ? "desc" : "asc";
}

/**
 * Get display label for a sort field
 *
 * @param field - Sort field
 * @returns User-friendly display label
 *
 * @example
 * const label = getSortFieldLabel("hashRate"); // Returns "Hash Rate"
 */
export function getSortFieldLabel(field: MinerSortField): string {
  const labels: Record<MinerSortField, string> = {
    name: "Miner Name",
    user: "Username",
    subaccount: "Subaccount",
    model: "Model",
    powerUsage: "Power Usage",
    hashRate: "Hash Rate",
    status: "Status",
    ratePerKwh: "Rate per kWh",
    createdAt: "Created Date",
  };

  return labels[field];
}

/**
 * Get all available sort fields
 *
 * @returns Array of all sortable fields
 */
export function getAllSortFields(): MinerSortField[] {
  return [
    "name",
    "user",
    "subaccount",
    "model",
    "powerUsage",
    "hashRate",
    "status",
    "ratePerKwh",
    "createdAt",
  ];
}
