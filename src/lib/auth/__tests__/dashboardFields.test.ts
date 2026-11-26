import { describe, expect, it } from "vitest";
import { DASHBOARD_FIELDS, pickDashboardFields } from "../dashboardFields";
import { DASHBOARD_CARD_PERMISSIONS } from "../permissions";

const stats = {
  miners: { active: 5, inactive: 1, actionRequired: 0 },
  luxor: {
    hashrate_5m: 1,
    minedRevenue: 9,
    workers: { totalWorkers: 3, activeWorkers: 2, inactiveWorkers: 1 },
    poolAccounts: { total: 4, active: 3, inactive: 1 },
  },
  financial: { monthlyRevenue: 100, customerMinedRevenue: { total: 2 } },
  finance: { hostingRevenue: 50, hostingCost: 30, hostingProfit: 20 },
  balances: { totalPositiveBalance: 7 },
  warnings: ["w"],
};

describe("pickDashboardFields", () => {
  it("maps every dashboard card, and only dashboard cards", () => {
    expect(Object.keys(DASHBOARD_FIELDS).sort()).toEqual(
      [...DASHBOARD_CARD_PERMISSIONS].sort(),
    );
  });

  it("sends only the held cards' fields", () => {
    expect(
      pickDashboardFields(stats, new Set(["dashboard_operations.miners"])),
    ).toEqual({ warnings: ["w"], miners: stats.miners });
  });

  it("a profit card alone sends the profit, not revenue or cost", () => {
    expect(
      pickDashboardFields(stats, new Set(["dashboard_finance.hosting_profit"])),
    ).toEqual({ warnings: ["w"], finance: { hostingProfit: 20 } });
  });

  it("splits nested fields per card", () => {
    const out = pickDashboardFields(
      stats,
      new Set(["dashboard_operations.active_workers"]),
    );
    expect(out).toEqual({
      warnings: ["w"],
      luxor: { workers: { activeWorkers: 2 } },
    });
  });

  it("never sends unmapped fields like raw mined revenue", () => {
    const out = pickDashboardFields(stats, new Set(DASHBOARD_CARD_PERMISSIONS));
    expect((out.luxor as Record<string, unknown>).minedRevenue).toBeUndefined();
  });
});
