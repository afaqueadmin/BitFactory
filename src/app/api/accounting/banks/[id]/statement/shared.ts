import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBankStatement } from "@/lib/accounting/bankStatement";
import {
  addDays,
  parseDateParam,
  resolveExportTimeZone,
  zonedDayStart,
} from "@/lib/helpers/admin/tableExport";

/**
 * Shared by the statement JSON and export routes: reads ?from=&to=&tz=
 * (inclusive calendar days in the viewer's time zone, both optional),
 * loads the bank and its statement.
 */
export async function loadBankStatement(
  bankId: string,
  searchParams: URLSearchParams,
) {
  const tz = resolveExportTimeZone(searchParams.get("tz"));
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const from = parseDateParam(rawFrom);
  const to = parseDateParam(rawTo);
  if ((rawFrom && !from) || (rawTo && !to)) {
    return {
      error: NextResponse.json(
        { error: "Dates must be YYYY-MM-DD" },
        { status: 400 },
      ),
    };
  }
  if (from && to && from > to) {
    return {
      error: NextResponse.json(
        { error: "The From date must be on or before the To date" },
        { status: 400 },
      ),
    };
  }

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

  const statement = await getBankStatement(bankId, {
    from: from ? zonedDayStart(from, tz) : null,
    toExclusive: to ? zonedDayStart(addDays(to, 1), tz) : null,
    tz,
  });
  return { bank, statement, tz, from, to };
}
