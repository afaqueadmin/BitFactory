/**
 * One-off data correction: fix the daily electricity charge amount for
 * "Higgs self mining" for January 2026.
 *
 * The daily cron (src/app/api/cron_deduct_daily_cost/route.ts) created
 * cost_payments rows with amount = -13.31 (170.64 kWh * old rate) for every
 * day from 2026-01-01 to 2026-01-31. The rate was wrong; the correct amount
 * for those rows is -9.68. This script finds those exact rows for the
 * "Higgs" customer and updates `amount` only (consumption/date/narration
 * untouched).
 *
 * SAFE BY DEFAULT: runs as a dry run and only prints what it would change.
 * Pass --apply to actually write to the database.
 *
 * Usage:
 *   npx tsx scripts/fix-higgs-electricity-jan2026.ts            # dry run
 *   npx tsx scripts/fix-higgs-electricity-jan2026.ts --apply    # writes changes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_AMOUNT = -13.31;
const NEW_AMOUNT = -9.68;
const RANGE_START = new Date("2026-01-01T00:00:00.000Z");
const RANGE_END = new Date("2026-02-01T00:00:00.000Z"); // exclusive
// Exact match on `name` only — "Higgs" also matches "Higgs Computing Limited"
// (a different customer, companyName), so we don't want a loose contains search.
const CUSTOMER_NAME = "Higgs Self Mining";

const APPLY = process.argv.includes("--apply");

async function main() {
  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      name: { equals: CUSTOMER_NAME, mode: "insensitive" },
    },
    select: { id: true, name: true, companyName: true, email: true },
  });

  if (users.length === 0) {
    console.error(`No user found with name "${CUSTOMER_NAME}". Aborting.`);
    process.exitCode = 1;
    return;
  }
  if (users.length > 1) {
    console.error(
      `Multiple users match "${CUSTOMER_NAME}" — narrow the search before running:`,
    );
    console.table(users);
    process.exitCode = 1;
    return;
  }

  const user = users[0];
  console.log("Target customer:", user);

  const rows = await prisma.costPayment.findMany({
    where: {
      userId: user.id,
      type: "ELECTRICITY_CHARGES",
      isDeleted: false,
      createdAt: { gte: RANGE_START, lt: RANGE_END },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      amount: true,
      consumption: true,
      invoiceId: true,
      narration: true,
    },
  });

  console.log(`Found ${rows.length} ELECTRICITY_CHARGES row(s) in Jan 2026.`);

  const unexpected = rows.filter((r) => r.amount !== OLD_AMOUNT);
  if (unexpected.length > 0) {
    console.warn(
      `${unexpected.length} row(s) do NOT currently have amount === ${OLD_AMOUNT} — they will be skipped:`,
    );
    console.table(
      unexpected.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    );
  }

  const invoiced = rows.filter((r) => r.invoiceId);
  if (invoiced.length > 0) {
    console.warn(
      `${invoiced.length} row(s) are already linked to an Invoice (invoiceId set). ` +
        `Updating cost_payments.amount here does NOT change that invoice's totalAmount ` +
        `or line items. If those invoices were already issued to the customer, review/` +
        `correct them separately.`,
    );
    console.table(
      invoiced.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        invoiceId: r.invoiceId,
      })),
    );
  }

  const toUpdate = rows.filter((r) => r.amount === OLD_AMOUNT);
  console.log(
    `${toUpdate.length} row(s) will be updated: amount ${OLD_AMOUNT} -> ${NEW_AMOUNT}`,
  );
  console.table(
    toUpdate.map((r) => ({
      id: r.id,
      date: r.createdAt.toISOString().slice(0, 10),
      consumption: r.consumption,
      oldAmount: r.amount,
      newAmount: NEW_AMOUNT,
    })),
  );

  if (!APPLY) {
    console.log(
      "\nDry run only — no rows were changed. Re-run with --apply to write these changes.",
    );
    return;
  }

  let updated = 0;
  for (const row of toUpdate) {
    await prisma.costPayment.update({
      where: { id: row.id },
      data: { amount: NEW_AMOUNT },
    });
    updated++;
  }
  console.log(`\nApplied: updated ${updated} row(s).`);
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
