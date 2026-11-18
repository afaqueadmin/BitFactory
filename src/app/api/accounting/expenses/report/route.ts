import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { buildExpenseReport, ReportCell } from "@/lib/accounting/expense";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const cellJson = (c: ReportCell) => ({
  dueUsd: c.dueUsd.toFixed(2),
  paidUsd: c.paidUsd.toFixed(2),
  balanceUsd: c.balanceUsd.toFixed(2),
  feesUsd: c.feesUsd.toFixed(2),
});

const recordJson = (r: Record<string, ReportCell>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellJson(v)]));

/**
 * Expenses by head and month. `from` / `to` (YYYY-MM-DD, inclusive) bound
 * the expense date for Due / Paid / Balance and the payment date for fees.
 * `head` limits it to one head.
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
    const headFilter = headId ? { headId } : {};

    const [expenses, payments] = await Promise.all([
      prisma.accountingExpense.findMany({
        where: { ...headFilter, ...(range ? { date: range } : {}) },
        select: {
          date: true,
          amountDueUsd: true,
          head: { select: { name: true } },
          payments: { select: { amountUsd: true } },
        },
      }),
      prisma.accountingExpensePayment.findMany({
        where: {
          feeUsd: { gt: 0 },
          ...(range ? { date: range } : {}),
          ...(headId ? { expense: { headId } } : {}),
        },
        select: {
          date: true,
          feeUsd: true,
          expense: { select: { head: { select: { name: true } } } },
        },
      }),
    ]);

    const report = buildExpenseReport(
      expenses.map((e) => ({
        date: e.date,
        head: e.head.name,
        dueUsd: e.amountDueUsd,
        paidUsd: e.payments.reduce(
          (s, p) => s.plus(p.amountUsd),
          new Decimal(0),
        ),
      })),
      payments.map((p) => ({
        date: p.date,
        head: p.expense.head.name,
        feeUsd: p.feeUsd,
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
    console.error("Error building expense report:", error);
    return NextResponse.json(
      { error: "Failed to build the report" },
      { status: 500 },
    );
  }
}
