import type { Permission } from "@/lib/auth/permissions";

/**
 * Which response fields of GET /api/admin/dashboard each card permission
 * unlocks. An allowlist: a field missing here is never sent, so a new figure
 * stays hidden until it's mapped to its card. No database access.
 */
const POOLS = ["luxor", "braiins", "combined"] as const;
const inPools = (field: string) => POOLS.map((p) => `${p}.${field}`);

export const DASHBOARD_FIELDS: Partial<Record<Permission, string[]>> = {
  "dashboard_operations.miners": ["miners"],
  "dashboard_operations.spaces": ["spaces"],
  "dashboard_operations.power": inPools("power"),
  "dashboard_operations.uptime": inPools("uptime_24h"),
  "dashboard_operations.hashrate_five_min": inPools("hashrate_5m"),
  "dashboard_operations.hashrate_one_day": inPools("hashrate_24h"),
  "dashboard_operations.total_workers": inPools("workers.totalWorkers"),
  "dashboard_operations.active_workers": inPools("workers.activeWorkers"),
  "dashboard_operations.inactive_workers": inPools("workers.inactiveWorkers"),
  "dashboard_customers.customers": ["customers.active", "customers.inactive"],
  "dashboard_customers.total_customers": ["customers.total"],
  "dashboard_customers.total_pool_accounts": ["luxor.poolAccounts.total"],
  "dashboard_customers.active_pool_accounts": ["luxor.poolAccounts.active"],
  "dashboard_customers.inactive_pool_accounts": ["luxor.poolAccounts.inactive"],
  "dashboard_mining.customer_mined_revenue": ["financial.customerMinedRevenue"],
  "dashboard_mining.self_mining_revenue_btc": [
    "financial.selfMiningRevenueBtc",
  ],
  "dashboard_mining.self_mining_revenue_usd": [
    "financial.selfMiningRevenueUsd",
  ],
  "dashboard_mining.self_mining_hosting_cost": [
    "financial.selfMiningHostingCost",
  ],
  "dashboard_mining.self_mining_profit": ["financial.selfMiningProfitUsd"],
  "dashboard_balances.monthly_billing": ["financial.monthlyRevenue"],
  "dashboard_balances.total_balance": ["financial.totalCustomerBalance"],
  "dashboard_balances.positive_balance": ["balances.totalPositiveBalance"],
  "dashboard_balances.negative_balance": ["balances.totalNegativeBalance"],
  "dashboard_balances.positive_balance_customers": [
    "balances.positiveCustomerCount",
  ],
  "dashboard_balances.negative_balance_customers": [
    "balances.negativeCustomerCount",
  ],
  "dashboard_finance.hosting_revenue": ["finance.hostingRevenue"],
  "dashboard_finance.hosting_cost": ["finance.hostingCost"],
  "dashboard_finance.hosting_profit": ["finance.hostingProfit"],
  "dashboard_finance.hardware_revenue": ["finance.hardwareRevenue"],
  "dashboard_finance.hardware_revenue_pending": [
    "finance.hardwareRevenuePending",
  ],
  "dashboard_finance.hardware_cost": ["finance.hardwareCost"],
  "dashboard_finance.security_deposit": ["finance.securityDeposit"],
  "dashboard_finance.hardware_profit": ["finance.hardwareProfit"],
};

type Obj = Record<string, unknown>;

/** A copy of `stats` holding only the fields the caller's cards allow, plus warnings. */
export function pickDashboardFields(
  stats: Obj,
  permissions: ReadonlySet<string>,
): Obj {
  const out: Obj = { warnings: stats.warnings ?? [] };
  for (const [permission, paths] of Object.entries(DASHBOARD_FIELDS)) {
    if (!permissions.has(permission)) continue;
    for (const path of paths!) {
      const keys = path.split(".");
      let src: unknown = stats;
      for (const k of keys) src = (src as Obj | undefined)?.[k];
      if (src === undefined) continue;
      let dst = out;
      for (const k of keys.slice(0, -1)) dst = (dst[k] ??= {}) as Obj;
      dst[keys[keys.length - 1]] = src;
    }
  }
  return out;
}
