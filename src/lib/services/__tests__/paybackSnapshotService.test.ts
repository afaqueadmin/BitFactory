import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paybackDailySnapshot: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
}));

const getSummaryMock = vi.fn();

vi.mock("@/lib/luxor", () => ({
  createLuxorClient: () => ({
    getSummary: (...args: unknown[]) => getSummaryMock(...args),
  }),
}));

const getOrCreatePaybackConfigMock = vi.fn();

vi.mock("@/lib/paybackConfigHelpers", () => ({
  getOrCreatePaybackConfig: (...args: unknown[]) =>
    getOrCreatePaybackConfigMock(...args),
  // Identity mock: our fixture configs are already in "serialized" shape.
  serializePaybackConfig: (config: unknown) => config,
}));

// vi.mock calls above are hoisted above this import by Vitest, so the
// service picks up the mocked @/lib/prisma, @/lib/luxor, and
// @/lib/paybackConfigHelpers modules.
import { upsertSnapshotForDate } from "@/lib/services/paybackSnapshotService";

const DATE = new Date("2026-08-04T00:00:00Z");

const SAMPLE_CONFIG = {
  monthlyInvoicingAmount: 199.05,
  poolCommissionStockOs: 2.5,
  poolCommissionLuxos: 2.5,
  s21proHashrateStockOs: 236,
  s21proHashrateLuxos: 252,
  s21xpHashrateStockOs: 240,
  s21xpHashrateLuxos: 260,
  breakevenBtcPrice: 63500,
};

const VALID_SNAPSHOT_ROW = {
  date: DATE,
  btcCloseUsd: 68000,
  hashpriceBtcPerPhDay: 0.00044827,
  clientS21ProStockBreakeven: 61000,
  clientS21ProCustomBreakeven: 59000,
  clientS21XpStockBreakeven: 60000,
  clientS21XpCustomBreakeven: 58000,
  companyS21ProStockBreakeven: 62000,
  companyS21ProCustomBreakeven: 60000,
  companyS21XpStockBreakeven: 61000,
  companyS21XpCustomBreakeven: 59000,
};

const mockBinanceClose = (close: string) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [[0, "0", "0", "0", close, "0", 0]],
  }) as unknown as typeof fetch;
};

const mockLuxorHashprice = (hashprice = 0.001) => {
  getSummaryMock.mockResolvedValue({
    hashprice: [{ value: hashprice }],
  });
};

beforeEach(() => {
  findUniqueMock.mockReset();
  upsertMock.mockReset();
  getSummaryMock.mockReset();
  getOrCreatePaybackConfigMock.mockReset();
  getOrCreatePaybackConfigMock.mockResolvedValue(SAMPLE_CONFIG);
});

describe("upsertSnapshotForDate", () => {
  it("writes a new snapshot when none exists for the date", async () => {
    findUniqueMock.mockResolvedValue(null);
    mockBinanceClose("68000.12");
    mockLuxorHashprice();
    upsertMock.mockResolvedValue({});

    const result = await upsertSnapshotForDate(DATE);

    expect(result).toEqual({ status: "written", date: "2026-08-04" });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.create.btcCloseUsd).toBeCloseTo(68000.12, 5);
    expect(call.create.date.toISOString()).toBe(DATE.toISOString());
  });

  it("skips a date that already has a valid snapshot without hitting external APIs", async () => {
    findUniqueMock.mockResolvedValue(VALID_SNAPSHOT_ROW);

    const result = await upsertSnapshotForDate(DATE);

    expect(result).toEqual({ status: "skipped", date: "2026-08-04" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(getSummaryMock).not.toHaveBeenCalled();
    expect(getOrCreatePaybackConfigMock).not.toHaveBeenCalled();
  });

  it("overwrites a snapshot that has a null/invalid field", async () => {
    findUniqueMock.mockResolvedValue({
      ...VALID_SNAPSHOT_ROW,
      clientS21ProStockBreakeven: null,
    });
    mockBinanceClose("68000");
    mockLuxorHashprice();
    upsertMock.mockResolvedValue({});

    const result = await upsertSnapshotForDate(DATE);

    expect(result.status).toBe("written");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: rerunning after a successful write does not overwrite it again", async () => {
    // First run: nothing exists yet.
    findUniqueMock.mockResolvedValueOnce(null);
    mockBinanceClose("68000");
    mockLuxorHashprice();
    upsertMock.mockResolvedValue({});

    const first = await upsertSnapshotForDate(DATE);
    expect(first.status).toBe("written");

    // Second run (e.g. backfill rerun): the row now exists and is valid.
    findUniqueMock.mockResolvedValueOnce(VALID_SNAPSHOT_ROW);
    const second = await upsertSnapshotForDate(DATE);

    expect(second.status).toBe("skipped");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
