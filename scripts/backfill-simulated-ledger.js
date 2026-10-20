// pg reads and writes "timestamp without time zone" columns in the process's
// local zone; the database holds UTC.
process.env.TZ = "UTC";
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");

// One-off: gives every active simulated account the stored ledger it would
// have had since its simulation started - the welcome bonus, then one
// electricity charge per completed UTC day (mirrored miner's power x the
// simulation_settings rate x 24), the same as cron_simulated_daily_cost
// writes from now on. Safe to rerun (e.g. right after the deploy, to cover
// the days before the cron's first run): the bonus is only written to an
// account with no ledger yet, and a day already charged - or charged and
// voided by an admin - is never charged again. --dry-run rolls back.
const DRY_RUN = process.argv.includes("--dry-run");

// Must match SIM_CONVERSION_NOTE / _LEGACY / SIM_REREGISTER_NOTE in
// src/lib/simulation/config.ts (see loadSimStart in context.ts).
const RESTART_NOTES = [
  "converted to a simulated account",
  "converted to a demo account",
  "re-registered as a simulated account",
];
const DAY_MS = 24 * 60 * 60 * 1000;

const utcDayStart = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayKey = (d) => utcDayStart(d).toISOString().slice(0, 10);

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const settings = (
      await client.query(
        `SELECT s."sourceMinerId", s."welcomeBonusUsd", s."ratePerKwh",
                m.status, h."powerUsage"
           FROM "simulation_settings" s
           JOIN "miners" m ON m.id = s."sourceMinerId"
           JOIN "hardware" h ON h.id = m."hardwareId"
          WHERE s.id = 1`,
      )
    ).rows[0];
    if (!settings) throw new Error("simulation_settings row is missing");

    const bonus = Number(settings.welcomeBonusUsd);
    const rate = Number(settings.ratePerKwh);
    const power = Number(settings.powerUsage);
    const charge = Math.round(power * rate * 24 * 100) / 100;
    const chargeOn = settings.status === "AUTO" && charge > 0;
    console.log(
      `Settings: bonus ${bonus}, rate ${rate}, power ${power} kW -> ${charge}/day; miner ${settings.status}${chargeOn ? "" : " (no charges)"}`,
    );

    const users = (
      await client.query(
        `SELECT id, email, "createdAt" FROM "users"
          WHERE role = 'SIMULATED' AND "isDeleted" = false
          ORDER BY "createdAt"`,
      )
    ).rows;

    const today = utcDayStart(new Date());
    let written = 0;

    for (const user of users) {
      const existing = await client.query(
        `SELECT count(*)::int AS n FROM "simulated_cost_payments" WHERE "userId" = $1`,
        [user.id],
      );
      const hasLedger = existing.rows[0].n > 0;

      const restart = await client.query(
        `SELECT max("createdAt") AS at FROM "audit_logs"
          WHERE "entityType" = 'User' AND "entityId" = $1
            AND action = 'USER_UPDATED'
            AND (${RESTART_NOTES.map((_, i) => `description LIKE $${i + 2}`).join(" OR ")})`,
        [user.id, ...RESTART_NOTES.map((n) => `%${n}`)],
      );
      const restartAt = restart.rows[0].at;
      const since =
        restartAt && restartAt > user.createdAt ? restartAt : user.createdAt;

      const rows = [];
      if (bonus > 0 && !hasLedger) {
        rows.push({
          amount: bonus,
          consumption: 0,
          type: "PAYMENT",
          narration: "Welcome bonus",
          chargeDate: null,
          createdAt: since,
        });
      }
      if (chargeOn) {
        for (
          let day = utcDayStart(since);
          day.getTime() < today.getTime();
          day = new Date(day.getTime() + DAY_MS)
        ) {
          rows.push({
            amount: -charge,
            consumption: power * 24,
            type: "ELECTRICITY_CHARGES",
            narration: null,
            chargeDate: dayKey(day),
            createdAt: new Date(day.getTime() + DAY_MS),
          });
        }
      }

      const inserted = [];
      for (const r of rows) {
        const result = await client.query(
          `INSERT INTO "simulated_cost_payments"
             (id, "userId", amount, consumption, type, narration, "chargeDate", "createdAt")
           VALUES ($1, $2, $3, $4, $5::"PaymentType", $6, $7, $8)
           ON CONFLICT ("userId", "chargeDate") DO NOTHING`,
          [
            crypto.randomUUID(),
            user.id,
            r.amount,
            r.consumption,
            r.type,
            r.narration,
            r.chargeDate,
            r.createdAt,
          ],
        );
        if (result.rowCount > 0) inserted.push(r);
      }
      written += inserted.length;
      const balance = (
        await client.query(
          `SELECT coalesce(sum(amount), 0) AS b FROM "simulated_cost_payments"
            WHERE "userId" = $1 AND "isDeleted" = false`,
          [user.id],
        )
      ).rows[0].b;
      console.log(
        `${user.email}: since ${since.toISOString()}, ${inserted.length} new row(s) -> balance ${Number(balance).toFixed(2)}`,
      );
      for (const r of inserted) {
        console.log(
          `    ${r.createdAt.toISOString()}  ${r.type.padEnd(19)} ${r.amount.toFixed(2).padStart(9)}  ${r.chargeDate ?? ""}`,
        );
      }
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log(`Dry run OK - ${written} row(s) rolled back`);
    } else {
      await client.query("COMMIT");
      console.log(`Backfill committed - ${written} row(s) written`);
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
