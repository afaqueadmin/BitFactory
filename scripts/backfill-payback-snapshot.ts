/**
 * One-off manual backfill for specific UTC dates.
 * Usage: npx ts-node --compiler-options {\"module\":\"CommonJS\"} scripts/backfill-payback-snapshot.ts 2026-08-06 2026-08-07
 */
import { upsertSnapshotForDate } from "../src/lib/services/paybackSnapshotService";

const dateArgs = process.argv.slice(2);

if (dateArgs.length === 0) {
  console.error(
    "Usage: ts-node scripts/backfill-payback-snapshot.ts YYYY-MM-DD [YYYY-MM-DD ...]",
  );
  process.exit(1);
}

const run = async () => {
  for (const dateStr of dateArgs) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      console.error(`Skipping invalid date: ${dateStr}`);
      continue;
    }
    try {
      const result = await upsertSnapshotForDate(date);
      console.log(`${result.date}: ${result.status}`);
    } catch (error) {
      console.error(
        `${dateStr}: error -`,
        error instanceof Error ? error.message : error,
      );
    }
  }
};

run().then(() => process.exit(0));
