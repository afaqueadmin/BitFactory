import { NextResponse } from "next/server";
import {
  addDays,
  parseDateParam,
  resolveExportTimeZone,
  zonedDayStart,
} from "@/lib/helpers/admin/tableExport";

/**
 * ?from=&to=&tz= of a bank statement (single bank or consolidated):
 * inclusive calendar days in the viewer's time zone, both optional.
 * Returns the instants the statement uses, or a 400 response.
 */
export function parseStatementRange(searchParams: URLSearchParams):
  | { error: NextResponse }
  | {
      tz: string;
      /** The picked days as given (YYYY-MM-DD), for labels. */
      from: string | null;
      to: string | null;
      range: { from: Date | null; toExclusive: Date | null; tz: string };
    } {
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
  return {
    tz,
    from,
    to,
    range: {
      from: from ? zonedDayStart(from, tz) : null,
      toExclusive: to ? zonedDayStart(addDays(to, 1), tz) : null,
      tz,
    },
  };
}
