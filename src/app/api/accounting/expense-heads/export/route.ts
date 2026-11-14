import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { generatePDFFromHTML } from "@/lib/email";
import {
  headListRows,
  parseHeadListQuery,
} from "@/lib/accounting/expenseLists";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatTableCurrency,
} from "@/lib/helpers/admin/tableExport";
import { headsWithTotals } from "../shared";

const COLUMNS = [
  { header: "Name" },
  { header: "Expenses", align: "right" as const, nowrap: true },
  { header: "Amount Due (USD)", align: "right" as const, nowrap: true },
  { header: "Amount Paid (USD)", align: "right" as const, nowrap: true },
  { header: "Status", nowrap: true },
];

/**
 * GET /api/accounting/expense-heads/export?format=csv|pdf&status&sort&dir&tz
 * The Expense Heads list as shown: same status filter, same order, plus a
 * total row.
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
    const { status, sort } = parseHeadListQuery(searchParams);
    const heads = headListRows(await headsWithTotals(), status, sort);

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    const cents = (key: "amountDueUsd" | "amountPaidUsd") =>
      heads.reduce((s, h) => s + Math.round(Number(h[key]) * 100), 0) / 100;

    const body: string[][] = heads.map((h) => [
      h.name,
      String(h._count.expenses),
      money(h.amountDueUsd),
      money(h.amountPaidUsd),
      h.isActive ? "Active" : "Inactive",
    ]);
    if (heads.length > 0) {
      body.push([
        `Total (${heads.length} head${heads.length === 1 ? "" : "s"})`,
        String(heads.reduce((s, h) => s + h._count.expenses, 0)),
        money(cents("amountDueUsd")),
        money(cents("amountPaidUsd")),
        "",
      ]);
    }

    const now = new Date();
    const filename = `expense-heads-${formatIsoDate(now, tz)}.${format}`;
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

    const html = buildTablePdfHtml({
      title: "Expense Heads",
      subtitle: [
        `Status: ${status === "active" ? "Active" : status === "inactive" ? "Inactive" : "All"}`,
        `${heads.length} head${heads.length === 1 ? "" : "s"}`,
        "Amount paid in USD, fees not included",
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
    console.error("[Expense Heads Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export expense heads" },
      { status: 500 },
    );
  }
}
