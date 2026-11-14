import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { generatePDFFromHTML } from "@/lib/email";
import { expenseStatusLabel } from "@/lib/accounting/expense";
import {
  expenseListRows,
  parseExpenseListQuery,
} from "@/lib/accounting/expenseLists";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { expenseInclude, expenseJson } from "../shared";

const COLUMNS = [
  { header: "Date", nowrap: true },
  { header: "Head" },
  { header: "Narration" },
  { header: "Amount Due (USD)", align: "right" as const, nowrap: true },
  { header: "Amount Paid (USD)", align: "right" as const, nowrap: true },
  { header: "Fees (USD)", align: "right" as const, nowrap: true },
  { header: "Balance (USD)", align: "right" as const, nowrap: true },
  { header: "Entity / Bank" },
  { header: "Status", nowrap: true },
];

/**
 * GET /api/accounting/expenses/export?format=csv|pdf&head&status&from&to&sort&dir&tz
 * The Expenses list as shown: same filters, same order, plus a total row.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    if (format !== "csv" && format !== "pdf") {
      return NextResponse.json(
        { error: "format must be csv or pdf" },
        { status: 400 },
      );
    }
    const tz = searchParams.get("tz") || "UTC";
    const { filter, sort } = parseExpenseListQuery(searchParams);

    const expenses = await prisma.accountingExpense.findMany({
      include: expenseInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const rows = expenseListRows(expenses.map(expenseJson), filter, sort);

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    // Expense dates are calendar days: format them as-is (UTC).
    const day = (ymd: string) =>
      csv ? ymd : formatTableDate(utcDayStart(ymd), "UTC");
    const total = (
      key: "amountDueUsd" | "paidUsd" | "feesUsd" | "balanceUsd",
    ) => rows.reduce((s, e) => s + Math.round(Number(e[key]) * 100), 0) / 100;

    const body: string[][] = rows.map((e) => [
      day(e.date),
      e.head.name,
      e.narration ?? "",
      money(e.amountDueUsd),
      money(e.paidUsd),
      money(e.feesUsd),
      money(e.balanceUsd),
      e.banks.map((b) => `${b.name} (${b.entityName})`).join(", "),
      expenseStatusLabel(e.status),
    ]);
    if (rows.length > 0) {
      body.push([
        `Total (${rows.length} expense${rows.length === 1 ? "" : "s"})`,
        "",
        "",
        money(total("amountDueUsd")),
        money(total("paidUsd")),
        money(total("feesUsd")),
        money(total("balanceUsd")),
        "",
        "",
      ]);
    }

    const now = new Date();
    const filename = `expenses-${formatIsoDate(now, tz)}.${format}`;
    if (csv) {
      return new NextResponse(
        buildCsv(
          COLUMNS.map((c) => c.header),
          body,
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        },
      );
    }

    const head = filter.headId
      ? await prisma.accountingExpenseHead.findUnique({
          where: { id: filter.headId },
          select: { name: true },
        })
      : null;
    const html = buildTablePdfHtml({
      title: "Expenses",
      subtitle: [
        `Period: ${formatIssuedRange(filter.from || null, filter.to || null)}`,
        `Head: ${head?.name ?? "All heads"}`,
        `Status: ${filter.status ? expenseStatusLabel(filter.status) : "All"}`,
        `${rows.length} expense${rows.length === 1 ? "" : "s"}`,
        "Balance = Amount Due − Amount Paid; fees don't reduce the balance",
      ].join(" · "),
      columns: COLUMNS,
      rows: body,
      generatedAt: now,
      tz,
    });
    const pdfBuffer = await generatePDFFromHTML(html);
    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Expenses Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export expenses" },
      { status: 500 },
    );
  }
}
