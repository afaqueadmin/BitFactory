-- Expense entry number (Entry #, shown as EXP-0001): a running number, never reused.
-- AlterTable
ALTER TABLE "accounting_expenses" ADD COLUMN "entryNumber" SERIAL NOT NULL;

-- Existing expenses: number them in the order they were recorded, then
-- continue the sequence after the highest.
UPDATE "accounting_expenses" AS e SET "entryNumber" = r.n
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "accounting_expenses") AS r
WHERE e."id" = r."id";
SELECT setval(pg_get_serial_sequence('"accounting_expenses"', 'entryNumber'), COALESCE((SELECT max("entryNumber") FROM "accounting_expenses"), 0) + 1, false);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_expenses_entryNumber_key" ON "accounting_expenses"("entryNumber");
