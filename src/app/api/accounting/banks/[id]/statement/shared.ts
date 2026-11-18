import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBankStatement } from "@/lib/accounting/bankStatement";
import { parseStatementRange } from "../../statementRange";

/**
 * Shared by the statement JSON and export routes: reads ?from=&to=&tz=
 * (inclusive calendar days in the viewer's time zone, both optional),
 * loads the bank and its statement.
 */
export async function loadBankStatement(
  bankId: string,
  searchParams: URLSearchParams,
) {
  const parsed = parseStatementRange(searchParams);
  if ("error" in parsed) return parsed;
  const { tz, from, to, range } = parsed;

  const bank = await prisma.accountingBank.findUnique({
    where: { id: bankId },
    select: {
      id: true,
      name: true,
      isActive: true,
      entity: { select: { id: true, name: true } },
      currencies: { select: { currency: { select: { code: true } } } },
    },
  });
  if (!bank) {
    return {
      error: NextResponse.json({ error: "Bank not found" }, { status: 404 }),
    };
  }

  const statement = await getBankStatement(bankId, range);
  return { bank, statement, tz, from, to };
}
