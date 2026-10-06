// Seeds the starting Entity / Bank / Currency data signed off on 2026-10-06
// (plan §2). Idempotent: existing rows are matched by currency code, entity
// name and (entity, bank name) and left as they are.
//
//   node scripts/seed-accounting-payment-accounts.js            # dry run
//   node scripts/seed-accounting-payment-accounts.js --apply
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");

// Audit rows and createdBy point at this admin.
const CREATED_BY_EMAIL = "admin@bitfactory.ae";

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "AED", name: "UAE Dirham" },
  { code: "USDT", name: "Tether (USDT)" },
];

const BANKS = [
  {
    entity: "Higgs Computing (Private) Limited",
    bank: "Faysal Bank",
    currencies: ["PKR", "USD"],
  },
  { entity: "Higgs Computing Inc", bank: "Mercury", currencies: ["USD"] },
  { entity: "Higgs Computing Inc", bank: "Wise", currencies: ["USD"] },
  {
    entity: "Higgs Computing Limited",
    bank: "Ruya Islamic Bank",
    currencies: ["AED"],
  },
  {
    entity: "Higgs Computing Limited",
    bank: "Binance FZE UAE",
    currencies: ["USDT"],
  },
  { entity: "Higgs Computing RAK UAE", bank: "Binance", currencies: ["USDT"] },
  { entity: "Higgs Computing RAK UAE", bank: "GATE.IO", currencies: ["USDT"] },
];

// 25-character text id, the same length and "c" prefix as Prisma's cuid().
const newId = () => `c${crypto.randomBytes(12).toString("hex")}`;

(async () => {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: users } = await client.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND role IN ('ADMIN','SUPER_ADMIN')`,
      [CREATED_BY_EMAIL],
    );
    if (users.length !== 1)
      throw new Error(`Admin ${CREATED_BY_EMAIL} not found`);
    const userId = users[0].id;

    await client.query("BEGIN");
    const audit = (action, entityType, entityId, description) =>
      client.query(
        `INSERT INTO audit_logs (id, action, "entityType", "entityId", "userId", description, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [
          newId(),
          action,
          entityType,
          entityId,
          userId,
          `${description} (seed)`,
        ],
      );

    const currencyIds = {};
    for (const c of CURRENCIES) {
      const found = await client.query(
        `SELECT id FROM accounting_currencies WHERE code = $1`,
        [c.code],
      );
      if (found.rows.length) {
        currencyIds[c.code] = found.rows[0].id;
        console.log(`currency ${c.code}: exists`);
        continue;
      }
      const id = newId();
      await client.query(
        `INSERT INTO accounting_currencies (id, code, name, "updatedAt") VALUES ($1, $2, $3, now())`,
        [id, c.code, c.name],
      );
      await audit(
        "ACCOUNTING_CURRENCY_CREATED",
        "AccountingCurrency",
        id,
        `Accounting currency ${c.code} created`,
      );
      currencyIds[c.code] = id;
      console.log(`currency ${c.code}: created`);
    }

    const entityIds = {};
    for (const name of [...new Set(BANKS.map((b) => b.entity))]) {
      const found = await client.query(
        `SELECT id FROM accounting_entities WHERE name = $1`,
        [name],
      );
      if (found.rows.length) {
        entityIds[name] = found.rows[0].id;
        console.log(`entity ${name}: exists`);
        continue;
      }
      const id = newId();
      await client.query(
        `INSERT INTO accounting_entities (id, name, "createdBy", "updatedAt") VALUES ($1, $2, $3, now())`,
        [id, name, userId],
      );
      await audit(
        "ACCOUNTING_ENTITY_CREATED",
        "AccountingEntity",
        id,
        `Accounting entity ${name} created`,
      );
      entityIds[name] = id;
      console.log(`entity ${name}: created`);
    }

    for (const b of BANKS) {
      const entityId = entityIds[b.entity];
      const found = await client.query(
        `SELECT id FROM accounting_banks WHERE "entityId" = $1 AND name = $2`,
        [entityId, b.bank],
      );
      let bankId = found.rows[0]?.id;
      if (bankId) {
        console.log(`bank ${b.bank} (${b.entity}): exists`);
      } else {
        bankId = newId();
        await client.query(
          `INSERT INTO accounting_banks (id, "entityId", name, "createdBy", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
          [bankId, entityId, b.bank, userId],
        );
        await audit(
          "ACCOUNTING_BANK_CREATED",
          "AccountingBank",
          bankId,
          `Accounting bank ${b.bank} (${b.entity}) created`,
        );
        console.log(`bank ${b.bank} (${b.entity}): created`);
      }
      for (const code of b.currencies) {
        await client.query(
          `INSERT INTO accounting_bank_currencies ("bankId", "currencyId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [bankId, currencyIds[code]],
        );
      }
    }

    if (apply) {
      await client.query("COMMIT");
      console.log("Committed.");
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run: rolled back. Re-run with --apply to commit.");
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
