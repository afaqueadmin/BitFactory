import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { generatePDFFromHTML } from "@/lib/email";
import {
  incomeHeadListRows,
  parseIncomeHeadListQuery,
} from "@/lib/accounting/capitalIncomeLists";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatTableCurrency,
} from "@/lib/helpers/admin/tableExport";
import { incomeHeadsWithTotals } from "../shared";

const COLUMNS = [
  { header: "Name" },
  { header: "Entries", align: "right" as const, nowrap: true },
  { header: "Received (USD)", align: "right" as const, nowrap: true },
  { header: "Fees (USD)", align: "right" as const, nowrap: true },
  { header: "Status", nowrap: true },
];

/**
 * GET /api/accounting/capital-income-heads/export?format=csv|pdf&status&sort&dir&tz
 * The heads list as shown: same status filter, same order, plus a total
 * row.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.view"]);
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
    const { status, sort } = parseIncomeHeadListQuery(searchParams);
    const heads = incomeHeadListRows(
      await incomeHeadsWithTotals(),
      status,
      sort,
    );

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    const cents = (key: "receivedUsd" | "feesUsd") =>
      heads.reduce((s, h) => s + Math.round(Number(h[key]) * 100), 0) / 100;

    const body: string[][] = heads.map((h) => [
      h.name,
      String(h._count.entries),
      money(h.receivedUsd),
      money(h.feesUsd),
      h.isActive ? "Active" : "Inactive",
    ]);
    if (heads.length > 0) {
      body.push([
        `Total (${heads.length} head${heads.length === 1 ? "" : "s"})`,
        String(heads.reduce((s, h) => s + h._count.entries, 0)),
        money(cents("receivedUsd")),
        money(cents("feesUsd")),
        "",
      ]);
    }

    const now = new Date();
    const filename = `capital-income-heads-${formatIsoDate(now, tz)}.${format}`;
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
      title: "Capital & Income Heads",
      subtitle: [
        `Status: ${status === "active" ? "Active" : status === "inactive" ? "Inactive" : "All"}`,
        `${heads.length} head${heads.length === 1 ? "" : "s"}`,
        "Received and bank fees in USD",
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
    console.error("[Capital & Income Heads Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export Capital & Income heads" },
      { status: 500 },
    );
  }
}
