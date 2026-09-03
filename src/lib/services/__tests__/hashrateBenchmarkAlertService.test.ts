import { describe, it, expect, vi, beforeEach } from "vitest";

const minerFindManyMock = vi.fn();
const poolSubaccountFindManyMock = vi.fn();
const workerMetricFindManyMock = vi.fn();
const alertLogFindManyMock = vi.fn();
const alertLogCreateManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    miner: {
      findMany: (...args: unknown[]) => minerFindManyMock(...args),
    },
    poolSubaccount: {
      findMany: (...args: unknown[]) => poolSubaccountFindManyMock(...args),
    },
    poolWorkerDailyMetric: {
      findMany: (...args: unknown[]) => workerMetricFindManyMock(...args),
    },
    minerHashrateAlertLog: {
      findMany: (...args: unknown[]) => alertLogFindManyMock(...args),
      createMany: (...args: unknown[]) => alertLogCreateManyMock(...args),
    },
  },
}));

// vi.mock above is hoisted above this import by Vitest, so the service picks
// up the mocked @/lib/prisma. paybackSnapshotService's date helpers are pure
// and imported for real, same as its own test suite does.
import { checkHashrateBenchmarks } from "@/lib/services/hashrateBenchmarkAlertService";

const NOW = new Date("2026-09-01T05:00:00.000Z");
const DAY_0 = new Date("2026-08-31T00:00:00.000Z"); // yesterday - the freshest day checked
const DAY_1 = new Date("2026-08-30T00:00:00.000Z");
const DAY_2 = new Date("2026-08-29T00:00:00.000Z");

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

const MINER_A = {
  id: "miner-a",
  name: "WorkerA",
  userId: "user-1",
  user: { name: "Alice", companyName: null },
  hashrateBenchmarks: [{ benchmarkHashrate: 200 }],
};

const MINER_B = {
  id: "miner-b",
  name: "WorkerB",
  userId: "user-1",
  user: { name: "Alice", companyName: null },
  hashrateBenchmarks: [{ benchmarkHashrate: 100 }],
};

const SUBACCOUNT_1 = { id: "sub-1", userId: "user-1" };

/** Wires up findMany mocks to return per-day fixtures keyed by date. */
function setupDayFixtures(
  metricsByDay: Record<
    string,
    Array<{
      workerName: string;
      hashrate: number | null;
      status?: string | null;
    }>
  >,
  alertedMinerIdsByDay: Record<string, string[]> = {},
) {
  workerMetricFindManyMock.mockImplementation(
    async ({ where }: { where: { date: Date } }) => {
      const rows = metricsByDay[dateKey(where.date)] || [];
      return rows.map((r) => ({
        poolSubaccountId: SUBACCOUNT_1.id,
        workerName: r.workerName,
        hashrate: r.hashrate,
        status: r.status ?? null,
      }));
    },
  );

  alertLogFindManyMock.mockImplementation(
    async ({ where }: { where: { date: Date } }) => {
      const minerIds = alertedMinerIdsByDay[dateKey(where.date)] || [];
      return minerIds.map((minerId) => ({ minerId }));
    },
  );
}

beforeEach(() => {
  minerFindManyMock.mockReset();
  poolSubaccountFindManyMock.mockReset();
  workerMetricFindManyMock.mockReset();
  alertLogFindManyMock.mockReset();
  alertLogCreateManyMock.mockReset();

  poolSubaccountFindManyMock.mockResolvedValue([SUBACCOUNT_1]);
  alertLogCreateManyMock.mockResolvedValue({ count: 0 });
  setupDayFixtures({});
});

describe("checkHashrateBenchmarks", () => {
  it("returns no alerts and skips all DB work when no miner has a benchmark configured", async () => {
    minerFindManyMock.mockResolvedValue([]);

    const result = await checkHashrateBenchmarks(NOW);

    expect(result).toEqual({
      checkedMiners: 0,
      daysChecked: [dateKey(DAY_0), dateKey(DAY_1), dateKey(DAY_2)],
      alerts: [],
    });
    expect(poolSubaccountFindManyMock).not.toHaveBeenCalled();
    expect(workerMetricFindManyMock).not.toHaveBeenCalled();
  });

  it("flags a miner whose stored hashrate is below its benchmark and logs it", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures({
      [dateKey(DAY_0)]: [{ workerName: "WorkerA", hashrate: 150e12 }], // 150 TH/s vs 200 TH/s benchmark
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      minerId: "miner-a",
      date: dateKey(DAY_0),
      actualHashrateThs: 150,
      benchmarkHashrateThs: 200,
    });
    expect(result.alerts[0].shortfallPct).toBeCloseTo(25, 5);

    expect(alertLogCreateManyMock).toHaveBeenCalledTimes(1);
    const written = alertLogCreateManyMock.mock.calls[0][0];
    expect(written.data).toEqual([
      {
        minerId: "miner-a",
        date: DAY_0,
        actualHashrate: 150,
        benchmarkHashrate: 200,
      },
    ]);
    expect(written.skipDuplicates).toBe(true);
  });

  it("does not flag a miner whose hashrate is at or above its benchmark", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures({
      [dateKey(DAY_0)]: [{ workerName: "WorkerA", hashrate: 200e12 }], // exactly at benchmark
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toEqual([]);
    expect(alertLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("does not flag a miner with no metric row for a day yet (not a false positive)", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures({}); // no PoolWorkerDailyMetric rows at all - cron hasn't written it yet

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toEqual([]);
    expect(alertLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("treats a null hashrate with status INACTIVE as a real 0 and alerts", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures({
      [dateKey(DAY_0)]: [
        { workerName: "WorkerA", hashrate: null, status: "INACTIVE" },
      ],
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      minerId: "miner-a",
      actualHashrateThs: 0,
      benchmarkHashrateThs: 200,
      shortfallPct: 100,
    });
    expect(alertLogCreateManyMock).toHaveBeenCalledTimes(1);
    expect(alertLogCreateManyMock.mock.calls[0][0].data).toEqual([
      {
        minerId: "miner-a",
        date: DAY_0,
        actualHashrate: 0,
        benchmarkHashrate: 200,
      },
    ]);
  });

  it("does not flag a null hashrate with no INACTIVE confirmation (still treated as missing data)", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures({
      [dateKey(DAY_0)]: [
        { workerName: "WorkerA", hashrate: null, status: null },
      ],
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toEqual([]);
    expect(alertLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("skips a miner whose owner has no Luxor pool subaccount", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    poolSubaccountFindManyMock.mockResolvedValue([]); // owner has no Luxor subaccount
    setupDayFixtures({
      [dateKey(DAY_0)]: [{ workerName: "WorkerA", hashrate: 1e12 }],
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toEqual([]);
    expect(workerMetricFindManyMock).not.toHaveBeenCalled();
  });

  it("does not re-alert a (miner, date) pair that was already logged on a previous run", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    setupDayFixtures(
      { [dateKey(DAY_0)]: [{ workerName: "WorkerA", hashrate: 150e12 }] },
      { [dateKey(DAY_0)]: ["miner-a"] }, // already alerted for this day
    );

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toEqual([]);
    expect(alertLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("picks up a day that was missing data on an earlier run once the write cron backfills it", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A]);
    // DAY_0 (yesterday) has no data yet; DAY_1 was backfilled since the last run.
    setupDayFixtures({
      [dateKey(DAY_1)]: [{ workerName: "WorkerA", hashrate: 150e12 }],
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].date).toBe(dateKey(DAY_1));
  });

  it("evaluates each qualifying miner independently within the same day", async () => {
    minerFindManyMock.mockResolvedValue([MINER_A, MINER_B]);
    setupDayFixtures({
      [dateKey(DAY_0)]: [
        { workerName: "WorkerA", hashrate: 150e12 }, // below its 200 TH/s benchmark
        { workerName: "WorkerB", hashrate: 120e12 }, // above its 100 TH/s benchmark
      ],
    });

    const result = await checkHashrateBenchmarks(NOW);

    expect(result.alerts.map((a) => a.minerId)).toEqual(["miner-a"]);
  });
});
