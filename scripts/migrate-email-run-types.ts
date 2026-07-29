/**
 * Data Migration Script: Split EmailSendRun.type into per-invoice-type values
 *
 * Historically every bulk invoice email send (regardless of which dashboard
 * triggered it) was recorded with the hardcoded type "INVOICE". Now that
 * bulk-send-email derives `type` from the actual invoiceType of the invoices
 * being sent (ELECTRICITY_CHARGES / HARDWARE_SALES / HARDWARE_PURCHASE),
 * existing rows need to be backfilled.
 *
 * Before this feature existed, the bulk-send-email endpoint was only ever
 * reachable from the /accounting dashboard (ELECTRICITY_CHARGES invoices),
 * so every legacy "INVOICE" row is safe to reclassify as ELECTRICITY_CHARGES.
 *
 * SAFE: Only updates the `type` column on existing email_send_runs rows
 * where type = 'INVOICE'. No rows deleted, no other columns touched.
 *
 * Run with: npx tsx scripts/migrate-email-run-types.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.emailSendRun.groupBy({
    by: ["type"],
    _count: { type: true },
  });
  console.log("Before migration:", before);

  const result = await prisma.emailSendRun.updateMany({
    where: { type: "INVOICE" },
    data: { type: "ELECTRICITY_CHARGES" },
  });
  console.log(
    `Updated ${result.count} row(s) from "INVOICE" to "ELECTRICITY_CHARGES"`,
  );

  const after = await prisma.emailSendRun.groupBy({
    by: ["type"],
    _count: { type: true },
  });
  console.log("After migration:", after);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
