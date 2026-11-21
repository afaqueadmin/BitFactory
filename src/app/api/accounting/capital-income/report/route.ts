import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  buildIncomeReport,
  IncomeReportCell,
} from "@/lib/accounting/capitalIncome";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const cellJson = (c: IncomeReportCell) => ({
  receivedUsd: c.receivedUsd.toFixed(2),
  feesUsd: c.feesUsd.toFixed(2),
  netUsd: c.receivedUsd.minus(c.feesUsd).toFixed(2),
});

const recordJson = (r: Record<string, IncomeReportCell>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellJson(v)]));

/**
 * Capital & Income by head and month of the entry date. `from` / `to`
 * (YYYY-MM-DD, inclusive) bound the entry date; `head` limits it to one
 * head.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const headId = params.get("head") ?? "";
    if ((from && !DAY.test(from)) || (to && !DAY.test(to))) {
      return NextResponse.json(
        { error: "Dates must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (from && to && from > to) {
      return NextResponse.json(
        { error: "From must be on or before To" },
        { status: 400 },
      );
    }
    const range =
      from || to
        ? {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
          }
        : undefined;

    const entries = await prisma.accountingIncome.findMany({
      where: {
        ...(headId ? { headId } : {}),
        ...(range ? { date: range } : {}),
      },
      select: {
        date: true,
        amountUsd: true,
        feeUsd: true,
        head: { select: { name: true } },
      },
    });
    const report = buildIncomeReport(
      entries.map((e) => ({
        date: e.date,
        head: e.head.name,
        amountUsd: e.amountUsd,
        feeUsd: e.feeUsd,
      })),
    );

    return NextResponse.json({
      success: true,
      data: {
        range: { from: from || null, to: to || null },
        months: report.months,
        rows: report.rows.map((r) => ({
          head: r.head,
          cells: recordJson(r.cells),
          total: cellJson(r.total),
        })),
        totals: recordJson(report.totals),
        grandTotal: cellJson(report.grandTotal),
      },
    });
  } catch (error) {
    console.error("Error building Capital & Income report:", error);
    return NextResponse.json(
      { error: "Failed to build the report" },
      { status: 500 },
    );
  }
}
