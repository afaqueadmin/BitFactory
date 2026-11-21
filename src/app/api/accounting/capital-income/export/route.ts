import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML } from "@/lib/email";
import {
  incomeListRows,
  parseIncomeListQuery,
} from "@/lib/accounting/capitalIncomeLists";
import { formatOriginal } from "@/lib/accounting/bankStatementRows";
import { Decimal } from "@prisma/client/runtime/library";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { incomeInclude, incomeJson } from "../shared";

const COLUMNS = [
  { header: "Entry #", nowrap: true },
  { header: "Date", nowrap: true },
  { header: "Head" },
  { header: "Received From" },
  { header: "Narration" },
  { header: "Entity / Bank" },
  { header: "Original Amount", align: "right" as const, nowrap: true },
  { header: "Received (USD)", align: "right" as const, nowrap: true },
  { header: "Fee (USD)", align: "right" as const, nowrap: true },
  { header: "Net Added (USD)", align: "right" as const, nowrap: true },
];

/**
 * GET /api/accounting/capital-income/export?format=csv|pdf&head&bank&from&to&sort&dir&tz
 * The Capital & Income list as shown: same filters, same order, plus a
 * total row.
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
    const { filter, sort } = parseIncomeListQuery(searchParams);

    const entries = await prisma.accountingIncome.findMany({
      include: incomeInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const rows = incomeListRows(entries.map(incomeJson), filter, sort);

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    // Entry dates are calendar days: format them as-is (UTC).
    const day = (ymd: string) =>
      csv ? ymd : formatTableDate(utcDayStart(ymd), "UTC");
    const centsOf = (v: string) => Math.round(Number(v) * 100);
    const total = (key: "amountUsd" | "feeUsd") =>
      rows.reduce((s, e) => s + centsOf(e[key]), 0) / 100;

    const body: string[][] = rows.map((e) => [
      e.entryLabel,
      day(e.date),
      e.head.name,
      e.receivedFrom ?? "",
      e.narration ?? "",
      `${e.bankName} (${e.entityName})`,
      formatOriginal(
        new Decimal(e.amount),
        e.currencyCode,
        new Decimal(e.exchangeRate),
      ) ?? "",
      money(e.amountUsd),
      money(e.feeUsd),
      money((centsOf(e.amountUsd) - centsOf(e.feeUsd)) / 100),
    ]);
    if (rows.length > 0) {
      body.push([
        `Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})`,
        "",
        "",
        "",
        "",
        "",
        "",
        money(total("amountUsd")),
        money(total("feeUsd")),
        money(total("amountUsd") - total("feeUsd")),
      ]);
    }

    const now = new Date();
    const filename = `capital-income-${formatIsoDate(now, tz)}.${format}`;
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

    const [head, bank] = await Promise.all([
      filter.headId
        ? prisma.accountingIncomeHead.findUnique({
            where: { id: filter.headId },
            select: { name: true },
          })
        : null,
      filter.bankId
        ? prisma.accountingBank.findUnique({
            where: { id: filter.bankId },
            select: { name: true },
          })
        : null,
    ]);
    const html = buildTablePdfHtml({
      title: "Capital & Income",
      subtitle: [
        `Period: ${formatIssuedRange(filter.from || null, filter.to || null)}`,
        `Head: ${head?.name ?? "All"}`,
        `Bank: ${bank?.name ?? "All"}`,
        `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
        "Received is a Debit on the bank; the fee is a Credit",
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
    console.error("[Capital & Income Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export Capital & Income" },
      { status: 500 },
    );
  }
}
